/**
 * Generates MTG-style card art for the 233 modifier cards via Amazon
 * Bedrock's Stable Image Ultra (`stability.stable-image-ultra-v1:1`,
 * region `us-west-2` — the only region with this model on this account,
 * verified 2026-08-09), then downsizes/recompresses to WebP with `sharp`
 * before writing into `public/art/<id>.webp`.
 *
 * This is a one-off, PAID, external batch job — not part of any build
 * step. Three npm scripts drive it (see package.json):
 *
 *   npm run tools:generate-card-art:test     # one random card -> tools/card-art-test/
 *   npm run tools:generate-card-art          # all undone cards -> public/art/
 *   npm run tools:generate-card-art:prompt -- --prompt "..."
 *                                             # one ad-hoc image from a
 *                                             # prompt you write yourself,
 *                                             # for experimenting with the
 *                                             # style suffix/negative
 *                                             # prompt independent of any
 *                                             # card's artPrompt
 *
 * The render path needs no knowledge of this tool's success or failure:
 * `ui/PlaceholderArt.tsx` always tries `/art/<id>.webp` and falls back to
 * the existing gradient+icon on a 404, so a partial run (content-filter
 * misses, cards not yet generated) is harmless by construction.
 *
 * --- CLI flags ---
 *   --test              scratch mode: ignore the manifest, always
 *                        regenerate, write to tools/card-art-test/ instead
 *                        of public/art/
 *   --out <dir>         override the output directory
 *   --count <n>         process at most n cards this run
 *   --random            pick candidates at random instead of catalog order
 *   --id <cardId>       target one specific card (repeatable)
 *   --force             regenerate even if the manifest already has this
 *                        card recorded as "ok"
 *   --reroll            use a fresh random seed instead of the
 *                        deterministic per-card one
 *   --dry-run           print constructed prompts, call nothing, spend
 *                        nothing
 *   --model <id>        Bedrock model id (default: Stable Image Ultra —
 *                        override to the sd3.5 Large model id for a
 *                        side-by-side bake-off without a second script)
 *   --region <region>   Bedrock region (default: us-west-2)
 *   --max-width <px>    sharp resize target, long edge (default: 960)
 *   --quality <0-100>   sharp WebP quality (default: 82)
 *   --prompt <text>     ad-hoc mode: ignore the card catalog entirely and
 *                        generate exactly one image from this prompt,
 *                        written to the test folder (or --out) as
 *                        <slugified-prompt>-<timestamp>.webp. Not recorded
 *                        in the manifest — there's no card id to key it by.
 *   --raw               ad-hoc mode only: send --prompt verbatim, skipping
 *                        the style suffix and negative_prompt entirely
 *   --seed <n>          ad-hoc mode only: fix the seed for a reproducible
 *                        comparison across prompt wording (default: 0,
 *                        i.e. a random seed each run)
 *   --style-suffix <t>  override STYLE_SUFFIX for this run only, in both
 *                        catalog mode and ad-hoc mode (ignored under
 *                        --raw). Use this to trial a different overall
 *                        look — e.g. a playful chibi style instead of the
 *                        default painterly-fantasy one — without editing
 *                        the script.
 *   --style-first        put the style ahead of the subject instead of
 *                        after it (ignored under --raw). Diffusion models
 *                        weight earlier tokens more heavily, so a style
 *                        tag trailing a long, vivid base description can
 *                        get outweighed by it — this is the lever for
 *                        that failure mode, seen in practice with a
 *                        --style-suffix chibi request on a card whose own
 *                        artPrompt already read as strongly "epic".
 *
 * --- Determinism ---
 * The seed passed to the model is derived from `hashSeed(card.id)` (see
 * domain/rng.ts, already used by PlaceholderArt.tsx today) unless
 * `--reroll` is given, so re-running the same card without `--force`
 * reproduces the same image — matching AGENTS.md's "everything is
 * seeded/deterministic" convention.
 *
 * --- Pacing ---
 * This account's confirmed on-demand quota for Stable Image Ultra is 10
 * requests/minute in us-west-2 (`service-quotas`, checked 2026-08-09) —
 * that is the real constraint, not concurrency, so this script runs
 * strictly sequentially with a fixed delay between calls. A
 * ThrottlingException still gets an exponential backoff/retry on top of
 * that as a safety net. A soft content-filter rejection (a populated
 * `finish_reasons` in an otherwise-successful response) gets exactly one
 * verbatim retry — filters can be probabilistic — before that card is
 * recorded as failed and the run moves on; it never blocks the batch.
 *
 * --- Provenance ---
 * tools/card-art-manifest.json (committed) records { id, model, seedUsed,
 * finishReason, prompt, generatedAt, status } per card, and is what makes
 * re-running this script over the same catalog idempotent.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import sharp from 'sharp'
import { hashSeed } from '../src/domain/rng.ts'
import type { ModifierCard } from '../src/domain/cardTypes.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CARDS_JSON = resolve(__dirname, '../src/data/generated/cards.json')
const MANIFEST_JSON = resolve(__dirname, 'card-art-manifest.json')
const DEFAULT_OUT_DIR = resolve(__dirname, '../public/art')
const TEST_OUT_DIR = resolve(__dirname, 'card-art-test')

const DEFAULT_MODEL = 'stability.stable-image-ultra-v1:1'
const DEFAULT_REGION = 'us-west-2'

// Closest enum value to ModifierCardView.tsx's actual art window: the
// sm/md/lg art heights against their card widths work out to roughly a
// 1.7-1.9:1 landscape ratio.
const ASPECT_RATIO = '16:9'

const STYLE_SUFFIX =
  ', fantasy oil painting, Magic: The Gathering card art style, dramatic lighting, painterly, single focal subject'
const NEGATIVE_PROMPT =
  'text, words, letters, caption, border, frame, watermark, signature, card frame, UI elements, blurry, low quality, collage, grid, multiple panels'

// Verified on-account quota: 10 on-demand requests/minute for this model
// in us-west-2 -> 6s/request; a small buffer keeps us safely under it.
const QUOTA_DELAY_MS = 6_500
const THROTTLE_BACKOFFS_MS = [5_000, 15_000, 30_000]
const MAX_SEED = 4_294_967_295

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

interface Args {
  test: boolean
  out?: string
  count?: number
  random: boolean
  ids: string[]
  force: boolean
  reroll: boolean
  dryRun: boolean
  model: string
  region: string
  maxWidth: number
  quality: number
  prompt?: string
  raw: boolean
  seed?: number
  styleSuffix?: string
  styleFirst: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    test: false,
    random: false,
    ids: [],
    force: false,
    reroll: false,
    dryRun: false,
    model: DEFAULT_MODEL,
    region: DEFAULT_REGION,
    maxWidth: 960,
    quality: 82,
    raw: false,
    styleFirst: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '--test':
        args.test = true
        break
      case '--out':
        args.out = argv[++i]
        break
      case '--count':
        args.count = Number(argv[++i])
        break
      case '--random':
        args.random = true
        break
      case '--id':
        args.ids.push(argv[++i])
        break
      case '--force':
        args.force = true
        break
      case '--reroll':
        args.reroll = true
        break
      case '--dry-run':
        args.dryRun = true
        break
      case '--model':
        args.model = argv[++i]
        break
      case '--region':
        args.region = argv[++i]
        break
      case '--max-width':
        args.maxWidth = Number(argv[++i])
        break
      case '--quality':
        args.quality = Number(argv[++i])
        break
      case '--prompt':
        args.prompt = argv[++i]
        break
      case '--raw':
        args.raw = true
        break
      case '--seed':
        args.seed = Number(argv[++i])
        break
      case '--style-suffix':
        args.styleSuffix = argv[++i]
        break
      case '--style-first':
        args.styleFirst = true
        break
      default:
        throw new Error(`Unknown argument: "${arg}"`)
    }
  }
  return args
}

/** Filesystem-safe stand-in for a card id when there isn't one — ad-hoc
 * prompt mode has no catalog entry to key its output filename by. */
function slugify(text: string): string {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug.slice(0, 40) || 'prompt'
}

/** Diffusion models generally weight earlier tokens more heavily, so a
 * style tag trailing a long, vivid base description (e.g. a card whose
 * artPrompt already reads as "epic"/painterly) can get outweighed by it.
 * `--style-first` moves the style ahead of the subject instead of after
 * it, as a lever for exactly that failure mode. */
function composePrompt(base: string, styleSuffix: string, styleFirst: boolean): string {
  if (!styleFirst) return `${base}${styleSuffix}`
  const styleText = styleSuffix.replace(/^,\s*/, '')
  return `${styleText}, ${base}`
}

type ManifestStatus = 'ok' | 'failed'

interface ManifestEntry {
  id: string
  model: string
  seedUsed: number
  finishReason: string | null
  prompt: string
  generatedAt: string
  status: ManifestStatus
  error?: string
}

type Manifest = Record<string, ManifestEntry>

function loadManifest(): Manifest {
  if (!existsSync(MANIFEST_JSON)) return {}
  return JSON.parse(readFileSync(MANIFEST_JSON, 'utf-8')) as Manifest
}

function saveManifest(manifest: Manifest): void {
  writeFileSync(MANIFEST_JSON, JSON.stringify(manifest, null, 2) + '\n', 'utf-8')
}

function pickCandidates(allCards: ModifierCard[], manifest: Manifest, args: Args): ModifierCard[] {
  let pool = allCards

  if (args.ids.length > 0) {
    const idSet = new Set(args.ids)
    pool = allCards.filter((c) => idSet.has(c.id))
    const missing = args.ids.filter((id) => !allCards.some((c) => c.id === id))
    if (missing.length > 0) throw new Error(`Unknown card id(s): ${missing.join(', ')}`)
  } else if (!args.test && !args.force) {
    pool = allCards.filter((c) => manifest[c.id]?.status !== 'ok')
  }

  if (args.random) {
    pool = [...pool]
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
  }

  if (args.count !== undefined) pool = pool.slice(0, args.count)
  return pool
}

interface UltraResponseBody {
  seeds?: number[]
  finish_reasons?: (string | null)[]
  images?: (string | null)[]
}

type InvokeResult =
  | { ok: true; imageBase64: string; seedUsed: number }
  | { ok: false; kind: 'soft-filter'; reason: string }
  | { ok: false; kind: 'hard-error'; error: string }

/** One request/response cycle, with exactly one verbatim retry if the
 * response comes back soft-filtered (finish_reasons populated, or no
 * image at all) — content filters can be probabilistic, so a second try
 * sometimes succeeds. Throws on ThrottlingException so the caller's
 * backoff wrapper can handle it; everything else becomes a hard-error
 * result. */
async function invokeOnce(
  client: BedrockRuntimeClient,
  model: string,
  prompt: string,
  seed: number,
): Promise<InvokeResult> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    let parsed: UltraResponseBody
    try {
      const res = await client.send(
        new InvokeModelCommand({
          modelId: model,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify({
            prompt,
            aspect_ratio: ASPECT_RATIO,
            output_format: 'png',
            seed,
            negative_prompt: NEGATIVE_PROMPT,
          }),
        }),
      )
      if (!res.body) throw new Error('empty response body')
      parsed = JSON.parse(Buffer.from(res.body).toString('utf-8')) as UltraResponseBody
    } catch (err) {
      if (err instanceof Error && err.name === 'ThrottlingException') throw err
      return {
        ok: false,
        kind: 'hard-error',
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      }
    }

    const finishReason = parsed.finish_reasons?.[0] ?? null
    const image = parsed.images?.[0]
    if (finishReason || !image) {
      if (attempt === 1) {
        console.log(`    soft-filtered (${finishReason ?? 'no image returned'}), retrying once...`)
        continue
      }
      return { ok: false, kind: 'soft-filter', reason: finishReason ?? 'no image returned' }
    }
    return { ok: true, imageBase64: image, seedUsed: parsed.seeds?.[0] ?? seed }
  }
  return { ok: false, kind: 'soft-filter', reason: 'unreachable' }
}

async function generateWithBackoff(
  client: BedrockRuntimeClient,
  model: string,
  prompt: string,
  seed: number,
): Promise<InvokeResult> {
  for (let backoffAttempt = 0; ; backoffAttempt++) {
    try {
      return await invokeOnce(client, model, prompt, seed)
    } catch (err) {
      if (backoffAttempt < THROTTLE_BACKOFFS_MS.length) {
        const delay = THROTTLE_BACKOFFS_MS[backoffAttempt]
        console.log(`    throttled, backing off ${delay}ms...`)
        await sleep(delay)
        continue
      }
      return {
        ok: false,
        kind: 'hard-error',
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      }
    }
  }
}

async function toWebp(pngBase64: string, maxWidth: number, quality: number): Promise<Buffer> {
  const raw = Buffer.from(pngBase64, 'base64')
  return sharp(raw).resize({ width: maxWidth, withoutEnlargement: true }).webp({ quality }).toBuffer()
}

/** Ad-hoc mode: generate exactly one image from a prompt given on the
 * command line, bypassing the card catalog entirely. There's no card id
 * to key a manifest entry by, so this never touches card-art-manifest.json
 * — every run is independent, same as --test. */
async function runAdhocPrompt(args: Args): Promise<void> {
  const outDir = args.out ? resolve(process.cwd(), args.out) : TEST_OUT_DIR
  const rawPrompt = args.prompt!.trim()
  if (!rawPrompt) throw new Error('--prompt must not be empty')
  const prompt = args.raw
    ? rawPrompt
    : composePrompt(rawPrompt, args.styleSuffix ?? STYLE_SUFFIX, args.styleFirst)
  const seed = args.seed ?? 0

  console.log(`${args.dryRun ? '[dry run] ' : ''}Generating 1 ad-hoc image -> ${outDir}`)
  console.log(`Model: ${args.model}  Region: ${args.region}`)
  console.log(`prompt: ${prompt}`)

  if (args.dryRun) return

  mkdirSync(outDir, { recursive: true })
  const client = new BedrockRuntimeClient({ region: args.region })
  const result = await generateWithBackoff(client, args.model, prompt, seed)

  if (!result.ok) {
    const detail = result.kind === 'soft-filter' ? result.reason : result.error
    console.log(`  FAILED (${result.kind}): ${detail}`)
    process.exitCode = 1
    return
  }

  const webp = await toWebp(result.imageBase64, args.maxWidth, args.quality)
  const outPath = resolve(outDir, `${slugify(rawPrompt)}-${Date.now()}.webp`)
  writeFileSync(outPath, webp)
  console.log(`  OK (seed ${result.seedUsed}, ${(webp.length / 1024).toFixed(0)} KB) -> ${outPath}`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.prompt !== undefined) {
    await runAdhocPrompt(args)
    return
  }

  const allCards = JSON.parse(readFileSync(CARDS_JSON, 'utf-8')) as ModifierCard[]
  const manifest = args.test ? {} : loadManifest()
  const candidates = pickCandidates(allCards, manifest, args)
  const outDir = args.out
    ? resolve(process.cwd(), args.out)
    : args.test
      ? TEST_OUT_DIR
      : DEFAULT_OUT_DIR

  if (candidates.length === 0) {
    console.log('Nothing to do — every card already has art recorded as ok. Pass --force to regenerate.')
    return
  }

  console.log(
    `${args.dryRun ? '[dry run] ' : ''}Generating art for ${candidates.length} card(s) -> ${outDir}`,
  )
  console.log(`Model: ${args.model}  Region: ${args.region}`)

  if (!args.dryRun) mkdirSync(outDir, { recursive: true })
  const client = args.dryRun ? null : new BedrockRuntimeClient({ region: args.region })

  const succeeded: string[] = []
  const softFiltered: { id: string; reason: string }[] = []
  const hardErrored: { id: string; error: string }[] = []
  const startedAt = Date.now()

  for (let i = 0; i < candidates.length; i++) {
    const card = candidates[i]
    const prompt = composePrompt(card.artPrompt, args.styleSuffix ?? STYLE_SUFFIX, args.styleFirst)
    const seed = args.reroll ? Math.floor(Math.random() * MAX_SEED) : hashSeed(card.id) % (MAX_SEED + 1)

    console.log(`[${i + 1}/${candidates.length}] ${card.id}`)
    console.log(`    prompt: ${prompt}`)

    if (args.dryRun) continue

    const result = await generateWithBackoff(client!, args.model, prompt, seed)

    if (!result.ok) {
      if (result.kind === 'soft-filter') {
        console.log(`    SOFT-FILTERED: ${result.reason}`)
        softFiltered.push({ id: card.id, reason: result.reason })
      } else {
        console.log(`    ERROR: ${result.error}`)
        hardErrored.push({ id: card.id, error: result.error })
      }
      if (!args.test) {
        manifest[card.id] = {
          id: card.id,
          model: args.model,
          seedUsed: seed,
          finishReason: result.kind === 'soft-filter' ? result.reason : null,
          prompt,
          generatedAt: new Date().toISOString(),
          status: 'failed',
          error: result.kind === 'soft-filter' ? result.reason : result.error,
        }
      }
    } else {
      const webp = await toWebp(result.imageBase64, args.maxWidth, args.quality)
      writeFileSync(resolve(outDir, `${card.id}.webp`), webp)
      console.log(`    OK (seed ${result.seedUsed}, ${(webp.length / 1024).toFixed(0)} KB)`)
      succeeded.push(card.id)
      if (!args.test) {
        manifest[card.id] = {
          id: card.id,
          model: args.model,
          seedUsed: result.seedUsed,
          finishReason: null,
          prompt,
          generatedAt: new Date().toISOString(),
          status: 'ok',
        }
      }
    }

    if (i < candidates.length - 1) await sleep(QUOTA_DELAY_MS)
  }

  if (!args.test && !args.dryRun) saveManifest(manifest)

  const elapsedMin = ((Date.now() - startedAt) / 60000).toFixed(1)
  console.log(`\nDone in ${elapsedMin} min.`)
  console.log(`  succeeded:     ${succeeded.length}/${candidates.length}`)
  console.log(`  soft-filtered: ${softFiltered.length}`)
  console.log(`  errored:       ${hardErrored.length}`)

  if (softFiltered.length > 0) {
    console.log('  soft-filtered ids (content filter, after one retry):')
    for (const { id, reason } of softFiltered) console.log(`    ${id}: ${reason}`)
  }
  if (hardErrored.length > 0) {
    console.log('  errored ids:')
    for (const { id, error } of hardErrored) console.log(`    ${id}: ${error}`)
  }
  if (softFiltered.length > 0 || hardErrored.length > 0) {
    const failedIds = [...softFiltered.map((s) => s.id), ...hardErrored.map((h) => h.id)]
    console.log(
      '  These cards fall back to the existing gradient placeholder automatically. Retry with:\n' +
        `    npm run tools:generate-card-art -- --force --reroll ${failedIds.map((id) => `--id ${id}`).join(' ')}`,
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
