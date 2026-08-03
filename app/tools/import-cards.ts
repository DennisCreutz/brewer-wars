/**
 * Imports the 233 modifier cards from the original Google-Sheets HTML export
 * (`original/brewers-wars/Cards.html`) into a typed, categorised JSON file at
 * `src/data/generated/cards.json`.
 *
 * Re-run with `npm run tools:import-cards` whenever the source sheet changes.
 *
 * --- Column layout in the source sheet ---
 *   A Effect       -> name
 *   B Description  -> description
 *   C Prompt       -> artPrompt
 *   D Effects      -> target        ("Deck" | "Commander" | "Game")
 *   E Type         -> difficulty    (1-5, originally an *exclusion* type but
 *                                    that reading contradicts the rule "draw
 *                                    3 score cards" since all score cards
 *                                    share Type=5 — see project notes. Kept
 *                                    as a cosmetic difficulty/rarity ramp.)
 *   F Modifier     -> modifier      (1 Global | 2 Personal | 3 Score)
 *
 * --- Category classification ---
 * The exclusion rule ("same modifier + same category can't be active
 * together") is re-derived from the card *name*, not the old Type number,
 * because the raw numbers group unrelated cards together (e.g. "Tribal
 * Angel" and "Commander must wear a hat" shared Type=2) while splitting
 * related ones (Price was split across Type 1 and 4). See the classify()
 * function below for the exact, auditable rules.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  ModifierCard,
  ModifierKind,
  EffectTarget,
  Category,
  CommanderCheck,
} from '../src/domain/cardTypes.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SOURCE_HTML = resolve(__dirname, '../../original/brewers-wars/Cards.html')
const OUTPUT_JSON = resolve(__dirname, '../src/data/generated/cards.json')

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function stripTags(cellHtml: string): string {
  const withBreaks = cellHtml.replace(/<br\s*\/?>/gi, '\n')
  const noTags = withBreaks.replace(/<[^>]+>/g, '')
  return decodeEntities(noTags).trim()
}

interface RawRow {
  name: string
  description: string
  artPrompt: string
  targetRaw: string
  typeRaw: string
  modifierRaw: string
}

function parseRows(html: string): RawRow[] {
  const withoutStyle = html.replace(/<style[\s\S]*?<\/style>/g, '')
  const rowMatches = withoutStyle.match(/<tr[\s\S]*?<\/tr>/g) ?? []
  const rows: RawRow[] = []

  for (const row of rowMatches) {
    // Skip the spreadsheet's own "A B C D..." column-letter header row.
    if (row.includes('column-headers-background')) continue

    const cellMatches = row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g) ?? []
    const cells = cellMatches.map(stripTags)
    // Skip the field-label row and the row-number <th>. Data rows look like:
    // [rowNum, Effect, Description, Prompt, Effects, Type, Modifier]
    if (cells.length < 6) continue
    const [, name, description, artPrompt, targetRaw, typeRaw, modifierRaw] = cells
    if (!name || name === 'Effect') continue
    rows.push({ name, description, artPrompt, targetRaw, typeRaw, modifierRaw })
  }
  return rows
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/</g, ' lt ')
    .replace(/>/g, ' gt ')
    .replace(/=/g, ' eq ')
    .replace(/#/g, 'num ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseModifier(raw: string): ModifierKind {
  switch (raw) {
    case '1':
      return 'global'
    case '2':
      return 'personal'
    case '3':
      return 'score'
    default:
      throw new Error(`Unknown modifier value: ${raw}`)
  }
}

function parseTarget(raw: string): EffectTarget {
  switch (raw) {
    case 'Deck':
      return 'deck'
    case 'Commander':
      return 'commander'
    case 'Game':
      return 'game'
    default:
      throw new Error(`Unknown target value: ${raw}`)
  }
}

function parseDifficulty(raw: string): 1 | 2 | 3 | 4 | 5 {
  const n = Number(raw)
  if (n < 1 || n > 5 || !Number.isInteger(n)) {
    throw new Error(`Unexpected difficulty value: ${raw}`)
  }
  return n as 1 | 2 | 3 | 4 | 5
}

/**
 * Classifies a card into its exclusion-rule category. Throws on anything
 * unrecognised so data-drift is caught immediately when re-running the
 * importer, rather than silently mis-categorising a new card.
 */
function classify(name: string, modifier: ModifierKind): Category {
  if (modifier === 'score') return 'untyped'

  if (modifier === 'global') {
    if (/^Rarity /.test(name)) return 'rarity'
    if (/^Price /.test(name)) return 'price'
    if (/^#Decks/.test(name)) return 'deckCount'
    throw new Error(`Unclassified global card: "${name}"`)
  }

  // modifier === 'personal'
  if (name === 'Must have Flying') return 'untyped'
  if (name === 'Only Creatures') return 'deckComposition'
  if (/^Colour /.test(name)) return 'colour'
  if (/^Tribal /.test(name)) return 'tribal'
  if (/^Theme /.test(name)) return 'theme'
  if (/^Mana Value /.test(name)) return 'manaValue'
  if (/^Salt Score/.test(name)) return 'salt'
  if (/^Commander must/.test(name)) return 'commanderArt'
  if (/^(All (creatures|cards)|Only (creatures|cards|instants|artifacts))/.test(name)) {
    return 'deckArt'
  }
  throw new Error(`Unclassified personal card: "${name}"`)
}

const COLOUR_LETTER_TO_CODE: Record<string, string> = { W: 'W', U: 'U', B: 'B', R: 'R', G: 'G' }

/** Parses "20k" / "500" style thresholds from the #Decks cards. */
function parseDeckCountThreshold(name: string): number {
  const m = /^#Decks < ([\d,.]+)(k)?$/.exec(name)
  if (!m) throw new Error(`Could not parse deck-count threshold from: "${name}"`)
  const base = Number(m[1].replace(/,/g, ''))
  return m[2] ? base * 1000 : base
}

function deriveCommanderCheck(name: string, target: EffectTarget): CommanderCheck | undefined {
  if (target !== 'commander') return undefined

  const colourMatch = /^Colour ([WUBRG]+)$/.exec(name)
  if (colourMatch) {
    const colors = colourMatch[1].split('').map((letter) => {
      const code = COLOUR_LETTER_TO_CODE[letter]
      if (!code) throw new Error(`Unknown colour letter "${letter}" in "${name}"`)
      return code
    })
    return { kind: 'colorIdentityExact', colors }
  }

  if (/^#Decks < /.test(name)) {
    return { kind: 'edhrecDeckCountBelow', threshold: parseDeckCountThreshold(name) }
  }

  if (name === 'Must have Flying') return { kind: 'keyword', keyword: 'flying' }
  if (name === 'Commander must have flavor text') return { kind: 'hasFlavorText' }
  if (name === 'Commander must have more than one creature type') {
    return { kind: 'multipleCreatureTypes' }
  }

  // The remaining commander-target cards are visual/artwork rules
  // (hat, wings, beard, weapon, smiling, ...) that cannot be verified via
  // Scryfall data. They are surfaced as a manual "verify yourself"
  // checklist in the commander-selection screen instead.
  return undefined
}

/**
 * Explicit, reviewed repeatability for every Score card. Score cards are
 * always untyped (no exclusion), but the scoring screen needs to know
 * whether to render a numeric stepper (can trigger multiple times per game)
 * or a one-shot checkbox (a single whole-game condition).
 */
const SCORE_REPEATABLE: Record<string, boolean> = {
  '+1 Point for Every Opponent Eliminated': true,
  '+2 Points for Winning the Game': false,
  '+1 Point for Casting Your Commander 3+ Times': false,
  '+1 Point for Eliminating an Opponent with Commander Damage': true,
  '+1 Point for Using an Alternative Win Condition': false,
  '-1 Point for Taking More Than 5-Minutes for a Turn': true,
  '+1 Point for Casting a Spell with Mana Value 10 or Greater': true,
  '+1 Point for Winning Without Dealing Combat Damage': false,
  '+1 Point for Controlling a Permanent from Each Opponent': false,
  '+2 Point for Saving an Opponent from Elimination': true,
  '+1 Point for Eliminating an Opponent with a One-Drop': true,
  '+1 Point for Countering a Spell That Would Have Won the Game': true,
  '+2 Points for Eliminating Two Opponents in the Same Turn': true,
  '+1 Points for Eliminating the Last Opponent in a Noncombat Way': false,
  '+1 Points for Dealing 20+ Damage in a Single Combat Phase': true,
  '+2 Points for Winning With Less Than 5 Life Remaining': false,
  '+1 Points for Resolving an Ultimate Ability from a Planeswalker': true,
  '+1 Points for Ending the Game with 100+ Life': false,
  '-1 Point for Not Casting Your Commander in the Entire Game': false,
  '-1 Point for Missing a Trigger That Would Have Changed the Game': true,
  '-1 Point for Being Eliminated First': false,
  '-1 Point for Attacking the Same Player Three Times in a Row': true,
  '-2 Points for Using an Infinite Combo to Win the Game': false,
  '-2 Points for Eliminating an Opponent Before Turn 5': true,
  '-2 Points for Eliminating an Opponent Who Had No Non-Land-Permanents on Board': true,
  '-1 Point for Attacking Without Shouting the Name of the Player That Gets Attacked': true,
}

function main() {
  const html = readFileSync(SOURCE_HTML, 'utf-8')
  const rawRows = parseRows(html)

  // Data-quality note: the source sheet contains one exact-duplicate card
  // ("Colour WUB" appears twice, each with distinct artwork prompts) and,
  // more notably, only 1 of the 5 possible four-colour combinations
  // (missing WBRG/WURG/WUBG/WUBR) — those slots instead hold redundant
  // extra three-colour cards (e.g. two textually-different cards that both
  // resolve to the WUG colour-identity set). We import every row faithfully
  // (no card is silently dropped or invented) and only disambiguate the
  // *id* on collision; see the console summary for the full report.
  const idCounts = new Map<string, number>()
  const cards: ModifierCard[] = rawRows.map((row) => {
    const modifier = parseModifier(row.modifierRaw)
    const target = parseTarget(row.targetRaw)
    const difficulty = parseDifficulty(row.typeRaw)
    const category = classify(row.name, modifier)

    const baseId = slugify(row.name)
    const occurrence = idCounts.get(baseId) ?? 0
    idCounts.set(baseId, occurrence + 1)
    const id = occurrence === 0 ? baseId : `${baseId}-${occurrence + 1}`

    const card: ModifierCard = {
      id,
      name: row.name,
      description: row.description,
      artPrompt: row.artPrompt,
      modifier,
      category,
      target,
      difficulty,
      solo: false,
    }

    if (modifier === 'score') {
      if (!(row.name in SCORE_REPEATABLE)) {
        throw new Error(`Missing repeatable classification for score card "${row.name}"`)
      }
      card.repeatable = SCORE_REPEATABLE[row.name]
    }

    const commanderCheck = deriveCommanderCheck(row.name, target)
    if (commanderCheck) card.commanderCheck = commanderCheck

    return card
  })

  if (cards.length !== 233) {
    console.warn(`Warning: expected 233 cards, parsed ${cards.length}. Source sheet may have changed.`)
  }

  mkdirSync(dirname(OUTPUT_JSON), { recursive: true })
  writeFileSync(OUTPUT_JSON, JSON.stringify(cards, null, 2) + '\n', 'utf-8')

  // Summary for quick sanity-checking after each run.
  const byModifier = new Map<string, number>()
  const byCategory = new Map<string, number>()
  for (const c of cards) {
    byModifier.set(c.modifier, (byModifier.get(c.modifier) ?? 0) + 1)
    byCategory.set(`${c.modifier}/${c.category}`, (byCategory.get(`${c.modifier}/${c.category}`) ?? 0) + 1)
  }
  console.log(`Imported ${cards.length} cards -> ${OUTPUT_JSON}`)
  console.log('By modifier:', Object.fromEntries(byModifier))
  console.log('By category:')
  for (const [k, v] of [...byCategory.entries()].sort()) console.log(`  ${k}: ${v}`)
  const commanderCheckable = cards.filter((c) => c.commanderCheck).length
  const commanderTotal = cards.filter((c) => c.target === 'commander').length
  console.log(`Commander-target cards: ${commanderTotal} (${commanderCheckable} auto-checkable)`)

  const dupIds = [...idCounts.entries()].filter(([, n]) => n > 1)
  if (dupIds.length > 0) {
    console.log('\nData-quality note — duplicate card names in the source sheet:')
    for (const [id, n] of dupIds) console.log(`  "${id}" occurs ${n} times (ids disambiguated with -2, -3, ...)`)
  }

  const colourCanonical = new Map<string, string[]>()
  for (const c of cards) {
    if (c.category !== 'colour' || c.commanderCheck?.kind !== 'colorIdentityExact') continue
    const key = [...c.commanderCheck.colors].sort().join('')
    colourCanonical.set(key, [...(colourCanonical.get(key) ?? []), c.name])
  }
  const redundant = [...colourCanonical.entries()].filter(([, names]) => names.length > 1)
  if (redundant.length > 0) {
    console.log(
      '\nData-quality note — colour cards sharing the same effective colour-identity set\n' +
        '(mechanically redundant, kept as separate cards since their artwork differs):',
    )
    for (const [key, names] of redundant) console.log(`  {${key.split('').join(',')}}: ${names.join(', ')}`)
  }
  const allFourColourSets = ['WUBR', 'WUBG', 'WURG', 'WBRG', 'UBRG']
  const missingFourColour = allFourColourSets.filter((k) => !colourCanonical.has([...k].sort().join('')))
  if (missingFourColour.length > 0) {
    console.log(
      `\nData-quality note — ${missingFourColour.length}/5 four-colour combinations have no card at all: ` +
        missingFourColour.join(', '),
    )
  }
}

main()
