import { describe, it, expect } from 'vitest'
import { mulberry32 } from '../rng'
import {
  createDeck,
  drawCards,
  drawDraftRound,
  resolveDraftPick,
  cardsConflict,
  DrawEngineError,
  type Deck,
} from '../draw'
import type { ModifierCard } from '../cardTypes'

function card(overrides: Partial<ModifierCard> & Pick<ModifierCard, 'id' | 'category'>): ModifierCard {
  return {
    name: overrides.id,
    description: '',
    artPrompt: '',
    modifier: 'personal',
    target: 'deck',
    difficulty: 1,
    solo: false,
    ...overrides,
  }
}

describe('cardsConflict', () => {
  it('conflicts when same modifier and same category', () => {
    const a = card({ id: 'a', category: 'tribal' })
    const b = card({ id: 'b', category: 'tribal' })
    expect(cardsConflict(a, b)).toBe(true)
  })

  it('does not conflict across different modifiers even with same category name', () => {
    const a = card({ id: 'a', category: 'tribal', modifier: 'personal' })
    const b = card({ id: 'b', category: 'tribal', modifier: 'global' })
    expect(cardsConflict(a, b)).toBe(false)
  })

  it('does not conflict for different categories', () => {
    const a = card({ id: 'a', category: 'tribal' })
    const b = card({ id: 'b', category: 'theme' })
    expect(cardsConflict(a, b)).toBe(false)
  })

  it('untyped cards never conflict, even with each other', () => {
    const a = card({ id: 'a', category: 'untyped', modifier: 'score' })
    const b = card({ id: 'b', category: 'untyped', modifier: 'score' })
    expect(cardsConflict(a, b)).toBe(false)
  })
})

describe('drawCards', () => {
  it('draws the requested count when no conflicts exist', () => {
    const cards = [
      card({ id: 'a', category: 'tribal' }),
      card({ id: 'b', category: 'theme' }),
      card({ id: 'c', category: 'colour' }),
    ]
    const deck = createDeck('personal', cards, mulberry32(1))
    const result = drawCards(deck, 2)
    expect(result.accepted).toHaveLength(2)
    expect(result.deck.drawPile).toHaveLength(1)
  })

  it('skips and permanently discards a conflicting card, drawing the next instead', () => {
    // Force a known draw order by using a 1-card-then-conflict setup.
    const cards = [
      card({ id: 'tribal-1', category: 'tribal' }),
      card({ id: 'tribal-2', category: 'tribal' }),
      card({ id: 'theme-1', category: 'theme' }),
    ]
    const deck: Deck = { modifier: 'personal', drawPile: [...cards].reverse(), drawnCards: [] }
    // drawPile.pop() draws from the end, so with this array reversed,
    // draw order is: tribal-1, tribal-2, theme-1
    const result = drawCards(deck, 2)
    expect(result.accepted.map((c) => c.id)).toEqual(['tribal-1', 'theme-1'])
    expect(result.log).toEqual([
      { card: cards[0], accepted: true },
      { card: cards[1], accepted: false, reason: 'conflict' },
      { card: cards[2], accepted: true },
    ])
    // The rejected card is gone from the pile permanently (moved to drawnCards).
    expect(result.deck.drawPile).toHaveLength(0)
    expect(result.deck.drawnCards.map((c) => c.id)).toEqual(['tribal-1', 'tribal-2', 'theme-1'])
  })

  it('respects existingActive cards from a previous draw round', () => {
    const cards = [card({ id: 'tribal-2', category: 'tribal' })]
    const deck: Deck = { modifier: 'personal', drawPile: cards, drawnCards: [] }
    const existing = [card({ id: 'tribal-1', category: 'tribal' })]
    const result = drawCards(deck, 1, existing)
    expect(result.accepted).toHaveLength(0)
    expect(result.log[0]).toMatchObject({ accepted: false, reason: 'conflict' })
  })

  it('stops early (fewer than requested) when the deck runs out of cards', () => {
    const cards = [card({ id: 'a', category: 'tribal' })]
    const deck: Deck = { modifier: 'personal', drawPile: cards, drawnCards: [] }
    const result = drawCards(deck, 5)
    expect(result.accepted).toHaveLength(1)
    expect(result.deck.drawPile).toHaveLength(0)
  })

  it('untyped cards can be drawn alongside each other without limit', () => {
    const cards = [
      card({ id: 'u1', category: 'untyped' }),
      card({ id: 'u2', category: 'untyped' }),
      card({ id: 'u3', category: 'untyped' }),
    ]
    const deck: Deck = { modifier: 'score', drawPile: [...cards].reverse(), drawnCards: [] }
    const result = drawCards(deck, 3)
    expect(result.accepted).toHaveLength(3)
  })

  it('throws for a negative count', () => {
    const deck = createDeck('personal', [], mulberry32(1))
    expect(() => drawCards(deck, -1)).toThrow(DrawEngineError)
  })

  describe('solo cards', () => {
    it('locks the session when accepted as the very first card', () => {
      const cards = [
        card({ id: 'solo-1', category: 'tribal', solo: true }),
        card({ id: 'theme-1', category: 'theme' }),
      ]
      const deck: Deck = { modifier: 'personal', drawPile: [...cards].reverse(), drawnCards: [] }
      const result = drawCards(deck, 5)
      expect(result.soloLock).toBe(true)
      expect(result.accepted.map((c) => c.id)).toEqual(['solo-1'])
      // The second card was never even looked at because we stopped.
      expect(result.log).toHaveLength(1)
    })

    it('is discarded and redrawn if it appears after the first card', () => {
      const cards = [
        card({ id: 'theme-1', category: 'theme' }),
        card({ id: 'solo-1', category: 'tribal', solo: true }),
        card({ id: 'colour-1', category: 'colour' }),
      ]
      const deck: Deck = { modifier: 'personal', drawPile: [...cards].reverse(), drawnCards: [] }
      const result = drawCards(deck, 2)
      expect(result.accepted.map((c) => c.id)).toEqual(['theme-1', 'colour-1'])
      expect(result.log[1]).toMatchObject({ accepted: false, reason: 'solo-not-first' })
      expect(result.soloLock).toBe(false)
    })

    it('is discarded and redrawn if existingActive is already non-empty (not first overall)', () => {
      const cards = [card({ id: 'solo-1', category: 'tribal', solo: true })]
      const deck: Deck = { modifier: 'personal', drawPile: cards, drawnCards: [] }
      const existing = [card({ id: 'theme-1', category: 'theme' })]
      const result = drawCards(deck, 1, existing)
      expect(result.accepted).toHaveLength(0)
      expect(result.log[0]).toMatchObject({ accepted: false, reason: 'solo-not-first' })
    })
  })
})

describe('draft mode', () => {
  it('offers up to `choices` candidates that do not individually conflict with existingActive', () => {
    const cards = [
      card({ id: 'tribal-1', category: 'tribal' }),
      card({ id: 'theme-1', category: 'theme' }),
      card({ id: 'colour-1', category: 'colour' }),
    ]
    const deck: Deck = { modifier: 'personal', drawPile: [...cards].reverse(), drawnCards: [] }
    const round = drawDraftRound(deck, [], 3)
    expect(round.candidates).toHaveLength(3)
  })

  it('candidates may conflict with each other (only one will be kept)', () => {
    const cards = [
      card({ id: 'tribal-1', category: 'tribal' }),
      card({ id: 'tribal-2', category: 'tribal' }),
      card({ id: 'theme-1', category: 'theme' }),
    ]
    const deck: Deck = { modifier: 'personal', drawPile: [...cards].reverse(), drawnCards: [] }
    const round = drawDraftRound(deck, [], 3)
    expect(round.candidates.map((c) => c.id)).toEqual(['tribal-1', 'tribal-2', 'theme-1'])
  })

  it('skips candidates that conflict with existingActive', () => {
    const cards = [
      card({ id: 'tribal-2', category: 'tribal' }),
      card({ id: 'theme-1', category: 'theme' }),
    ]
    const deck: Deck = { modifier: 'personal', drawPile: [...cards].reverse(), drawnCards: [] }
    const existing = [card({ id: 'tribal-1', category: 'tribal' })]
    const round = drawDraftRound(deck, existing, 3)
    expect(round.candidates.map((c) => c.id)).toEqual(['theme-1'])
    expect(round.log[0]).toMatchObject({ accepted: false, reason: 'conflict' })
  })

  it('never offers a solo card as a simultaneous candidate', () => {
    const cards = [
      card({ id: 'solo-1', category: 'tribal', solo: true }),
      card({ id: 'theme-1', category: 'theme' }),
    ]
    const deck: Deck = { modifier: 'personal', drawPile: [...cards].reverse(), drawnCards: [] }
    const round = drawDraftRound(deck, [], 2)
    expect(round.candidates.map((c) => c.id)).toEqual(['theme-1'])
  })

  it('throws for choices < 1', () => {
    const deck = createDeck('personal', [], mulberry32(1))
    expect(() => drawDraftRound(deck, [], 0)).toThrow(DrawEngineError)
  })

  describe('resolveDraftPick', () => {
    it('keeps the chosen card in drawnCards and returns the rest to the pile', () => {
      const cards = [
        card({ id: 'tribal-1', category: 'tribal' }),
        card({ id: 'theme-1', category: 'theme' }),
        card({ id: 'colour-1', category: 'colour' }),
      ]
      const deck: Deck = { modifier: 'personal', drawPile: [...cards].reverse(), drawnCards: [] }
      const round = drawDraftRound(deck, [], 3)
      const resolved = resolveDraftPick(round.deck, round.candidates, cards[1], mulberry32(5))

      expect(resolved.drawnCards.map((c) => c.id)).toEqual(['theme-1'])
      expect(resolved.drawPile.map((c) => c.id).sort()).toEqual(['colour-1', 'tribal-1'])
    })

    it('total card count is conserved across a draft round', () => {
      const cards = [
        card({ id: 'a', category: 'tribal' }),
        card({ id: 'b', category: 'theme' }),
        card({ id: 'c', category: 'colour' }),
        card({ id: 'd', category: 'salt' }),
      ]
      const deck: Deck = { modifier: 'personal', drawPile: [...cards].reverse(), drawnCards: [] }
      const round = drawDraftRound(deck, [], 3)
      const resolved = resolveDraftPick(round.deck, round.candidates, round.candidates[0], mulberry32(2))
      const totalAfter = resolved.drawPile.length + resolved.drawnCards.length
      expect(totalAfter).toBe(cards.length)
    })
  })
})
