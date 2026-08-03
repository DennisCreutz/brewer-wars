/**
 * Pure predicate logic for evaluating `CommanderCheck`s against a commander
 * summary (see data/commanderPool.ts for where that summary comes from —
 * this module has zero network/IndexedDB dependencies, so it's fully unit
 * testable on its own).
 */
import type { ModifierCard, CommanderCheck } from './cardTypes'

export interface CommanderSummary {
  id: string
  name: string
  colorIdentity: string[]
  typeLine: string
  keywords: string[]
  hasFlavorText: boolean
  rarity: string
  cmc: number
  edhrecRank: number | null
  /** Deck count from the bundled EDHREC dataset; `null` if this commander
   * wasn't found (see data/edhrecDeckCounts.ts — the dataset is built from
   * an exact per-commander lookup, so `null` should be rare). */
  numDecks: number | null
  scryfallUri: string
  artCropUrl: string | null
  imageUrl: string | null
}

function countCreatureTypes(typeLine: string): number {
  if (!typeLine.includes('Creature')) return 0
  const afterDash = typeLine.split('—')[1]
  if (!afterDash) return 0
  return afterDash.trim().split(/\s+/).filter(Boolean).length
}

export function sameColorSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((c, i) => c === sortedB[i])
}

export function commanderSatisfies(commander: CommanderSummary, check: CommanderCheck): boolean {
  switch (check.kind) {
    case 'colorIdentityExact':
      return sameColorSet(commander.colorIdentity, check.colors)
    case 'edhrecDeckCountBelow':
      // A commander missing from the bundled dataset is treated
      // conservatively as *failing* a "#Decks < N" check rather than
      // passing it — see tools/build-edhrec-data.ts's module doc for why
      // an earlier "assume very few decks" fallback was actively wrong.
      return commander.numDecks !== null && commander.numDecks < check.threshold
    case 'keyword':
      return commander.keywords.some((k) => k.toLowerCase() === check.keyword.toLowerCase())
    case 'hasFlavorText':
      return commander.hasFlavorText
    case 'multipleCreatureTypes':
      return countCreatureTypes(commander.typeLine) > 1
    default: {
      const exhaustive: never = check
      throw new Error(`Unknown commander check: ${JSON.stringify(exhaustive)}`)
    }
  }
}

export function filterCommanders(
  pool: readonly CommanderSummary[],
  checks: readonly CommanderCheck[],
): CommanderSummary[] {
  return pool.filter((commander) => checks.every((check) => commanderSatisfies(commander, check)))
}

/** Splits a player's active Commander-target modifiers into the subset that
 * can drive the live counter/filter vs. the ones that need the manual
 * "verify yourself" honour-system checklist. */
export function splitCommanderModifiers(modifiers: readonly ModifierCard[]): {
  checkable: { card: ModifierCard; check: CommanderCheck }[]
  uncheckable: ModifierCard[]
} {
  const checkable: { card: ModifierCard; check: CommanderCheck }[] = []
  const uncheckable: ModifierCard[] = []
  for (const card of modifiers) {
    if (card.target !== 'commander') continue
    if (card.commanderCheck) checkable.push({ card, check: card.commanderCheck })
    else uncheckable.push(card)
  }
  return { checkable, uncheckable }
}

/** Same idea as `splitCommanderModifiers`, but for *display* on the
 * Commander Selection screen, where a player needs to see every modifier
 * they've drawn — deck- and game-target cards included — not just the
 * commander-target subset that actually drives the live filter/counter.
 * `checkable` is identical to `splitCommanderModifiers`'s (the only cards
 * that can be programmatically enforced); `uncheckable` is everything else
 * they still need to keep in mind while picking (deck-target, game-target,
 * and commander-target cards with no programmatic check). */
export function splitAllModifiersForDisplay(modifiers: readonly ModifierCard[]): {
  checkable: { card: ModifierCard; check: CommanderCheck }[]
  uncheckable: ModifierCard[]
} {
  const checkable: { card: ModifierCard; check: CommanderCheck }[] = []
  const uncheckable: ModifierCard[] = []
  for (const card of modifiers) {
    if (card.target === 'commander' && card.commanderCheck) {
      checkable.push({ card, check: card.commanderCheck })
    } else {
      uncheckable.push(card)
    }
  }
  return { checkable, uncheckable }
}

const COLOUR_ORDER = ['W', 'U', 'B', 'R', 'G']

function sortColours(colours: readonly string[]): string[] {
  return [...colours].sort((a, b) => COLOUR_ORDER.indexOf(a) - COLOUR_ORDER.indexOf(b))
}

/** Builds a scryfall.com search URL covering whichever active checks CAN be
 * expressed in Scryfall's query syntax (colour identity, keyword, flavor
 * text). EDHREC deck-count and "multiple creature types" have no Scryfall
 * equivalent and are simply omitted — the button is a starting point for
 * manual exploration, not a 1:1 mirror of the local filter. */
export function buildScryfallSearchUrl(checks: readonly CommanderCheck[]): string {
  const fragments = ['is:commander', 'legal:commander']
  for (const check of checks) {
    switch (check.kind) {
      case 'colorIdentityExact':
        fragments.push(`id=${sortColours(check.colors).join('')}`)
        break
      case 'keyword':
        fragments.push(`keyword:${check.keyword}`)
        break
      case 'hasFlavorText':
        fragments.push('has:flavor')
        break
      // edhrecDeckCountBelow / multipleCreatureTypes: no Scryfall equivalent.
    }
  }
  const query = encodeURIComponent(fragments.join(' '))
  return `https://scryfall.com/search?q=${query}&order=edhrec`
}
