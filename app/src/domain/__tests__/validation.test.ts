import { describe, it, expect } from 'vitest'
import { maxDrawableFor, computeWizardLimits } from '../validation'
import cardsData from '../../data/generated/cards.json'
import type { ModifierCard } from '../cardTypes'

const cards = cardsData as ModifierCard[]

describe('maxDrawableFor (against the real imported card set)', () => {
  it('global caps at 3 (rarity, price, deckCount — no untyped global cards)', () => {
    expect(maxDrawableFor(cards, 'global')).toBe(3)
  })

  it('personal caps at 9 (8 categories: colour, tribal, theme, manaValue, salt, deckArt, commanderArt, deckComposition — + 1 untyped card)', () => {
    expect(maxDrawableFor(cards, 'personal')).toBe(9)
  })

  it('score is effectively unlimited (all untyped) up to the pool size', () => {
    const scoreCount = cards.filter((c) => c.modifier === 'score').length
    expect(maxDrawableFor(cards, 'score')).toBe(scoreCount)
  })

  it('never exceeds the physical pool size for a tiny synthetic card set', () => {
    const tiny: ModifierCard[] = [
      {
        id: 'a',
        name: 'a',
        description: '',
        artPrompt: '',
        modifier: 'global',
        category: 'rarity',
        target: 'deck',
        difficulty: 1,
        solo: false,
      },
    ]
    expect(maxDrawableFor(tiny, 'global')).toBe(1)
  })
})

describe('computeWizardLimits', () => {
  it('bundles all three ceilings', () => {
    expect(computeWizardLimits(cards)).toEqual({ global: 3, personal: 9, score: 26 })
  })
})
