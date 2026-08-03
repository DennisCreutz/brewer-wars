/**
 * Card domain types for Brewer Wars.
 *
 * A "modifier" is a single card drawn from one of three decks. Two cards
 * with the same `modifier` (deck) AND the same non-"untyped" `category`
 * cannot be active at the same time (see domain/draw.ts) — this is the
 * digitisation of the original rule:
 *   "Karten mit dem gleichen Modifier und Type können nicht gleichzeitig
 *    aktiv sein."
 *
 * The original spreadsheet's numeric "Type" column has been re-derived into
 * named, semantically meaningful categories (see tools/import-cards.ts for
 * the full classification rationale). The original number is preserved as
 * `difficulty` (1-5) and drives purely cosmetic rarity theming.
 */

export type ModifierKind = 'global' | 'personal' | 'score'

export type GlobalCategory = 'rarity' | 'price' | 'deckCount'

export type PersonalCategory =
  | 'colour'
  | 'tribal'
  | 'theme'
  | 'manaValue'
  | 'salt'
  | 'deckArt'
  | 'commanderArt'
  | 'deckComposition'
  | 'untyped'

export type ScoreCategory = 'untyped'

export type Category = GlobalCategory | PersonalCategory | ScoreCategory

/** What part of the game the card's effect constrains. */
export type EffectTarget = 'deck' | 'commander' | 'game'

/**
 * Machine-checkable constraints for `target: 'commander'` cards. Only a
 * subset of commander modifiers can be verified automatically — the rest
 * (visual/artwork rules) are surfaced as an honour-system checklist instead.
 */
export type CommanderCheck =
  | { kind: 'colorIdentityExact'; colors: string[] }
  | { kind: 'edhrecDeckCountBelow'; threshold: number }
  | { kind: 'keyword'; keyword: string }
  | { kind: 'hasFlavorText' }
  | { kind: 'multipleCreatureTypes' }

export interface ModifierCard {
  /** Stable kebab-case slug derived from `name`. Used as the card's identity. */
  id: string
  /** Short effect name as printed on the card, e.g. "Tribal Angel". */
  name: string
  /** Full rules text. */
  description: string
  /** AI-artwork generation prompt from the original design sheet. */
  artPrompt: string
  modifier: ModifierKind
  category: Category
  target: EffectTarget
  /** Original 1-5 "Type" column, repurposed as a cosmetic difficulty/rarity ramp. */
  difficulty: 1 | 2 | 3 | 4 | 5
  /**
   * Solo cards may only ever be the *sole* active modifier for a given draw
   * session. No card in the current data set is tagged solo; the mechanic
   * exists so future cards can opt in (see domain/draw.ts).
   */
  solo: boolean
  /** Only meaningful for `modifier === 'score'`. Can this be scored more than once per game? */
  repeatable?: boolean
  /** Only present for some `target === 'commander'` cards. */
  commanderCheck?: CommanderCheck
}
