/**
 * Crawls EDHREC's public per-commander JSON pages for the deck count of
 * *every* card Scryfall currently considers commander-legal, and bundles
 * the result into a static JSON file used to evaluate the "#Decks < N"
 * global modifier cards in real time, fully offline.
 *
 * ## Why per-commander lookups, not the old per-colour-identity crawl
 *
 * An earlier version of this script crawled EDHREC's 32 per-colour-identity
 * "top commanders" list pages (e.g. `/pages/commanders/boros.json`), each
 * capped at ~100 entries. That covered only ~2,668 of the ~3,348 real
 * commanders — any colour identity with more than 100 popular commanders
 * silently dropped the rest, and commanders missing from the dataset fell
 * back to an "assume very few decks" default. That default was actively
 * *wrong* for a commander that's merely outside the top 100 for its colour
 * (as opposed to genuinely obscure): it made popular commanders incorrectly
 * pass restrictive "#Decks < N" filters.
 *
 * EDHREC also serves a dedicated page per commander,
 * `/pages/commanders/<slug>.json`, whose `container.json_dict.card.num_decks`
 * is the *exact* count for that one card — see `edhrecCommanderSlug()` in
 * domain/text.ts for how the slug is derived (front face only for
 * double-faced/split cards; diacritics transliterated to plain ASCII, e.g.
 * "Bartolomé" -> "bartolome", matching EDHREC's own slugs). Querying this
 * once per Scryfall commander gives exact, complete coverage instead of a
 * lossy top-N snapshot, at the cost of ~3,300 requests instead of 32 — run
 * with a small concurrency pool, this still finishes in a few minutes.
 *
 * A small number of cards (observed: "Background"-type legendary
 * enchantments, which are commander-legal in Scryfall's sense but aren't
 * tracked as commanders in their own right on EDHREC) 403 on this endpoint.
 * Those are recorded as "not found" rather than aborting the crawl; see
 * domain/commanderCheck.ts for how a "not found" commander is treated
 * conservatively (fails "#Decks < N" checks rather than passing them).
 *
 * Re-run with `npm run tools:build-edhrec-data`.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { edhrecCommanderSlug, frontFaceName, normalizeCardName } from '../src/domain/text.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_JSON = resolve(__dirname, '../src/data/generated/edhrec-deck-counts.json')

const USER_AGENT = 'BrewerWarsDataTool/0.2 (+local build tool; contact: n/a)'
const SCRYFALL_SEARCH_URL =
  'https://api.scryfall.com/cards/search?q=is%3Acommander+legal%3Acommander&unique=cards'
const EDHREC_BASE = 'https://json.edhrec.com/pages/commanders'
const CONCURRENCY = 8
const MAX_ATTEMPTS = 2

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

interface ScryfallSearchResponse {
  data: { name: string }[]
  has_more: boolean
  next_page?: string
}

async function fetchAllCommanderNames(): Promise<string[]> {
  const names: string[] = []
  let url: string | undefined = SCRYFALL_SEARCH_URL
  while (url) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    if (!res.ok) throw new Error(`Scryfall search failed: HTTP ${res.status}`)
    const page: ScryfallSearchResponse = await res.json()
    for (const card of page.data) names.push(card.name)
    url = page.has_more ? page.next_page : undefined
    if (url) await sleep(100)
  }
  return names
}

interface EdhrecCommanderPage {
  container?: {
    json_dict?: {
      card?: { name?: string; num_decks?: number }
    }
  }
}

type LookupOutcome =
  | { status: 'found'; name: string; numDecks: number }
  | { status: 'not-found'; name: string }
  | { status: 'error'; name: string; error: string }

async function lookupOne(name: string): Promise<LookupOutcome> {
  const slug = edhrecCommanderSlug(name)
  const url = `${EDHREC_BASE}/${slug}.json`

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
      if (res.status === 403 || res.status === 404) {
        return { status: 'not-found', name }
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const page = (await res.json()) as EdhrecCommanderPage
      const numDecks = page.container?.json_dict?.card?.num_decks
      if (typeof numDecks !== 'number') return { status: 'not-found', name }
      return { status: 'found', name, numDecks }
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) {
        return { status: 'error', name, error: err instanceof Error ? err.message : String(err) }
      }
      await sleep(300)
    }
  }
  // Unreachable, but keeps TypeScript happy about the loop always returning above.
  return { status: 'error', name, error: 'unreachable' }
}

/** Runs `tasks` through a fixed-size worker pool, calling `onResult` as each
 * one finishes (not necessarily in input order) so progress can be logged
 * incrementally across a multi-minute crawl. */
async function runPool<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  concurrency: number,
): Promise<void> {
  let nextIndex = 0
  async function runNext(): Promise<void> {
    const index = nextIndex++
    if (index >= items.length) return
    await worker(items[index])
    await runNext()
  }
  await Promise.all(Array.from({ length: concurrency }, () => runNext()))
}

async function main() {
  console.log('Fetching the full current commander pool from Scryfall...')
  const names = await fetchAllCommanderNames()
  console.log(`  -> ${names.length} commander-legal cards`)

  const commanders = new Map<string, { name: string; numDecks: number }>()
  const notFound: string[] = []
  const errors: { name: string; error: string }[] = []
  let completed = 0

  console.log(`Querying EDHREC's per-commander pages (${CONCURRENCY} at a time)...`)
  const startedAt = Date.now()

  await runPool(
    names,
    async (name) => {
      const result = await lookupOne(name)
      completed++
      if (result.status === 'found') {
        // Keyed (and displayed) by front face only, exactly matching how
        // the runtime lookup in data/edhrecDeckCounts.ts looks these up —
        // storing the full "A // B" Scryfall name here would silently
        // never match for any double-faced/split/MDFC commander.
        const front = frontFaceName(name)
        commanders.set(normalizeCardName(front), { name: front, numDecks: result.numDecks })
      } else if (result.status === 'not-found') {
        notFound.push(name)
      } else {
        errors.push({ name: result.name, error: result.error })
      }
      if (completed % 200 === 0 || completed === names.length) {
        const elapsedS = ((Date.now() - startedAt) / 1000).toFixed(0)
        console.log(`  ${completed}/${names.length} (${elapsedS}s elapsed)`)
      }
    },
    CONCURRENCY,
  )

  const output = {
    generatedAt: new Date().toISOString(),
    source: 'json.edhrec.com per-commander pages (container.json_dict.card.num_decks)',
    totalCommandersQueried: names.length,
    totalCommandersFound: commanders.size,
    commanders: Object.fromEntries(
      [...commanders.entries()].sort((a, b) => b[1].numDecks - a[1].numDecks),
    ),
  }

  mkdirSync(dirname(OUTPUT_JSON), { recursive: true })
  writeFileSync(OUTPUT_JSON, JSON.stringify(output, null, 2) + '\n', 'utf-8')

  const elapsedMin = ((Date.now() - startedAt) / 60000).toFixed(1)
  console.log(`\nDone in ${elapsedMin} min.`)
  console.log(`  found:     ${commanders.size} / ${names.length}`)
  console.log(`  not found: ${notFound.length} (expected: mostly "Background" cards)`)
  console.log(`  errors:    ${errors.length}`)
  if (notFound.length > 0 && notFound.length <= 40) {
    console.log(`  not-found names: ${notFound.join(', ')}`)
  }
  if (errors.length > 0) {
    console.log('  error details:')
    for (const e of errors.slice(0, 20)) console.log(`    ${e.name}: ${e.error}`)
  }
  console.log(`-> ${OUTPUT_JSON}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
