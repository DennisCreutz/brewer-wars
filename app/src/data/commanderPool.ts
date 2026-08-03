/**
 * Fetches the full legal-commander pool from Scryfall (~3,300 cards across
 * ~19 pages), trims each card down to just the fields the app needs, and
 * joins in the bundled EDHREC deck-count dataset. The result is what gets
 * cached in IndexedDB (see commanderPoolCache.ts) and then filtered
 * entirely client-side in real time — no network calls happen during an
 * actual draw/selection, only once up front per war (or on manual refresh).
 */
import type { CommanderSummary } from '../domain/commanderCheck'
import { getEdhrecDeckCount, getEdhrecRank } from './edhrecDeckCounts'

const SEARCH_URL =
  'https://api.scryfall.com/cards/search?q=is%3Acommander+legal%3Acommander&order=edhrec&unique=cards'

interface ScryfallImageUris {
  art_crop?: string
  normal?: string
}

interface ScryfallCardFace {
  flavor_text?: string
  image_uris?: ScryfallImageUris
}

interface ScryfallCard {
  id: string
  name: string
  color_identity: string[]
  type_line: string
  keywords: string[]
  flavor_text?: string
  card_faces?: ScryfallCardFace[]
  rarity: string
  cmc: number
  scryfall_uri: string
  image_uris?: ScryfallImageUris
}

interface ScryfallSearchResponse {
  data: ScryfallCard[]
  has_more: boolean
  next_page?: string
  total_cards: number
}

function hasFlavorText(card: ScryfallCard): boolean {
  if (card.flavor_text && card.flavor_text.trim().length > 0) return true
  return (card.card_faces ?? []).some((f) => f.flavor_text && f.flavor_text.trim().length > 0)
}

/** Double-faced/modal-DFC/split cards have no top-level `image_uris` on
 * Scryfall — the art lives on each face instead. Falling back to the front
 * face's images means a DFC commander (e.g. "Kefka, Court Mage // Kefka,
 * Ruler of Ruin") still gets real artwork instead of silently having none
 * (which otherwise shows as a blank/placeholder tile and, via PlayerBadge's
 * `commanderImageUrl` fallback, a plain letter avatar instead of their
 * portrait once revealed on the scoring/podium screens). */
function pickImageUris(card: ScryfallCard): ScryfallImageUris | undefined {
  return card.image_uris ?? card.card_faces?.[0]?.image_uris
}

function toSummary(card: ScryfallCard): CommanderSummary {
  const images = pickImageUris(card)
  return {
    id: card.id,
    name: card.name,
    colorIdentity: card.color_identity,
    typeLine: card.type_line,
    keywords: card.keywords,
    hasFlavorText: hasFlavorText(card),
    rarity: card.rarity,
    cmc: card.cmc,
    edhrecRank: getEdhrecRank(card.name),
    numDecks: getEdhrecDeckCount(card.name),
    scryfallUri: card.scryfall_uri,
    artCropUrl: images?.art_crop ?? null,
    imageUrl: images?.normal ?? null,
  }
}

export interface FetchProgress {
  loaded: number
  total: number
}

const SCRYFALL_REQUEST_DELAY_MS = 100

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Fetches every commander page from Scryfall. Calls `onProgress` after each
 * page so the UI can show a "Summoning commanders... 1,400 / 3,348" style
 * loading screen. Throws on network/HTTP failure — callers should surface a
 * retry affordance rather than silently proceeding with a partial pool
 * (a partial pool would under-count valid commanders).
 */
export async function fetchCommanderPool(
  onProgress?: (progress: FetchProgress) => void,
  signal?: AbortSignal,
): Promise<CommanderSummary[]> {
  const results: CommanderSummary[] = []
  let url: string | undefined = SEARCH_URL
  let total = 0

  while (url) {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal,
    })
    if (!res.ok) {
      throw new Error(`Scryfall search failed: HTTP ${res.status} for ${url}`)
    }
    const page: ScryfallSearchResponse = await res.json()
    total = page.total_cards
    for (const card of page.data) results.push(toSummary(card))
    onProgress?.({ loaded: results.length, total })

    url = page.has_more ? page.next_page : undefined
    if (url) await sleep(SCRYFALL_REQUEST_DELAY_MS)
  }

  return results
}
