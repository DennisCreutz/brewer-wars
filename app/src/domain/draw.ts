/**
 * The card draw engine: shuffling, drawing with the exclusion/solo/redraw
 * rules, and draft-mode (draw 3, pick 1).
 *
 * Exclusion rule (from the original rules text): "Cards with the same
 * modifier and type cannot be active at the same time." Digitised as: two
 * cards conflict iff they share the same `modifier` AND the same
 * `category`, UNLESS that category is `'untyped'` (untyped cards never
 * conflict with anything, including each other — this is what allows all
 * three score cards, which are all untyped, to be drawn together).
 *
 * Solo rule: a `solo` card may only ever be the sole active modifier for a
 * draw session. If it is the first card drawn in a session, drawing stops
 * immediately. If drawn later, it is discarded and replaced. No card in the
 * current data set is tagged `solo`, so this is inert today but ready for
 * future cards.
 */
import type { ModifierCard, ModifierKind } from './cardTypes'

export class DrawEngineError extends Error {}

/** A single card slot in a deck: still in the draw pile, or discarded
 * (either because it lost a conflict/solo check, or — in draft mode —
 * because it wasn't the chosen card and was returned to the pile). */
export interface Deck {
  modifier: ModifierKind
  /** Cards not yet drawn, in shuffled draw order (draw from the end). */
  drawPile: ModifierCard[]
  /** Cards permanently removed once drawn and accepted by a player/session. */
  drawnCards: ModifierCard[]
}

export function createDeck(modifier: ModifierKind, cards: ModifierCard[], rand: () => number): Deck {
  const pool = cards.filter((c) => c.modifier === modifier)
  return { modifier, drawPile: shuffleDeck(pool, rand), drawnCards: [] }
}

function shuffleDeck(cards: ModifierCard[], rand: () => number): ModifierCard[] {
  const result = [...cards]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/** Two cards conflict if the exclusion rule forbids them being active
 * together (same modifier + same non-"untyped" category). */
export function cardsConflict(a: ModifierCard, b: ModifierCard): boolean {
  if (a.modifier !== b.modifier) return false
  if (a.category === 'untyped' || b.category === 'untyped') return false
  return a.category === b.category
}

/** Does `candidate` conflict with anything already in `active`? */
function conflictsWithAny(candidate: ModifierCard, active: readonly ModifierCard[]): boolean {
  return active.some((c) => cardsConflict(candidate, c))
}

export type DrawRejectionReason = 'conflict' | 'solo-not-first' | 'zero-commanders' | 'player-redraw-all'

export interface DrawLogEntry {
  card: ModifierCard
  accepted: boolean
  reason?: DrawRejectionReason
}

export interface DrawResult {
  deck: Deck
  /** Cards accepted into the active session, in draw order. */
  accepted: ModifierCard[]
  /** Every card looked at, including rejected ones, for UI/animation purposes. */
  log: DrawLogEntry[]
  /** True if a solo card was accepted as the very first card — the caller
   * must stop drawing further cards for this session. */
  soloLock: boolean
}

/**
 * Draws `count` accepted cards from `deck` into a session that already has
 * `existingActive` cards (e.g. a player's previously-drawn personal
 * modifiers, so a fresh draw round can still be blocked by earlier picks).
 * Automatically skips/redraws conflicting or wrongly-timed solo cards.
 *
 * Stops early (with fewer than `count` accepted cards) if the deck runs out
 * of cards, or if a solo card is legally accepted as the first card overall.
 */
export function drawCards(
  deck: Deck,
  count: number,
  existingActive: readonly ModifierCard[] = [],
): DrawResult {
  if (count < 0) throw new DrawEngineError(`count must be >= 0, got ${count}`)
  let drawPile = [...deck.drawPile]
  const drawnCards = [...deck.drawnCards]
  const accepted: ModifierCard[] = []
  const log: DrawLogEntry[] = []
  let soloLock = false
  const isFirstEver = existingActive.length === 0

  while (accepted.length < count && drawPile.length > 0) {
    const card = drawPile.pop()!
    drawnCards.push(card)

    const isFirstCardOfSession = isFirstEver && accepted.length === 0
    if (card.solo && !isFirstCardOfSession) {
      log.push({ card, accepted: false, reason: 'solo-not-first' })
      continue
    }
    if (conflictsWithAny(card, [...existingActive, ...accepted])) {
      log.push({ card, accepted: false, reason: 'conflict' })
      continue
    }

    accepted.push(card)
    log.push({ card, accepted: true })

    if (card.solo && isFirstCardOfSession) {
      soloLock = true
      break
    }
  }

  return {
    deck: { modifier: deck.modifier, drawPile, drawnCards },
    accepted,
    log,
    soloLock,
  }
}

export interface DraftRoundResult {
  deck: Deck
  /** The 3 (or fewer, if the deck ran low) candidate cards presented to the player. */
  candidates: ModifierCard[]
  log: DrawLogEntry[]
}

/**
 * Draft mode: draws up to `choices` candidates (default 3) that each
 * individually don't conflict with `existingActive`, for the player to pick
 * one from. Candidates MAY conflict with each other — only one will be kept.
 * Rejected/invalid candidates are discarded-and-redrawn same as normal draws.
 */
export function drawDraftRound(
  deck: Deck,
  existingActive: readonly ModifierCard[],
  choices = 3,
): DraftRoundResult {
  if (choices < 1) throw new DrawEngineError(`choices must be >= 1, got ${choices}`)
  let drawPile = [...deck.drawPile]
  const drawnCards = [...deck.drawnCards]
  const candidates: ModifierCard[] = []
  const log: DrawLogEntry[] = []

  while (candidates.length < choices && drawPile.length > 0) {
    const card = drawPile.pop()!
    drawnCards.push(card)

    // A solo card can never be offered as one of several simultaneous
    // draft options (that would contradict "solo is the only modifier").
    if (card.solo) {
      log.push({ card, accepted: false, reason: 'solo-not-first' })
      continue
    }
    if (conflictsWithAny(card, existingActive)) {
      log.push({ card, accepted: false, reason: 'conflict' })
      continue
    }

    candidates.push(card)
    log.push({ card, accepted: true })
  }

  return { deck: { modifier: deck.modifier, drawPile, drawnCards }, candidates, log }
}

/** Resolves a draft round: keeps `chosenCard` as drawn, returns the other
 * candidates to the (shuffled) draw pile so other players may still find them. */
export function resolveDraftPick(
  deck: Deck,
  candidates: readonly ModifierCard[],
  chosenCard: ModifierCard,
  rand: () => number,
): Deck {
  const returned = candidates.filter((c) => c.id !== chosenCard.id)
  const returnedIds = new Set(returned.map((c) => c.id))
  // `drawnCards` already contains every candidate (see drawDraftRound) —
  // put the unchosen ones back into the pile and drop them from "drawn".
  const drawnCards = deck.drawnCards.filter((c) => !returnedIds.has(c.id))
  const drawPile = shuffleDeck([...deck.drawPile, ...returned], rand)
  return { modifier: deck.modifier, drawPile, drawnCards }
}
