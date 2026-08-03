/**
 * Wizard-time validation: how many modifiers of each deck can sensibly be
 * requested before the exclusion rule guarantees a deadlock?
 *
 * Because two cards of the same (modifier, category) can never both be
 * active, and "untyped" cards never conflict with anything, the ceiling on
 * how many *distinct, simultaneously satisfiable* cards a single draw
 * session (the whole game for Global/Score, one player's hand for
 * Personal) can hold is:
 *
 *   (number of distinct non-"untyped" categories present in that pool)
 *   + (number of "untyped" cards in that pool)
 *
 * This is computed from the actual card data rather than hardcoded, so it
 * stays correct if the card set changes.
 */
import type { ModifierCard, ModifierKind } from './cardTypes'

export function maxDrawableFor(cards: readonly ModifierCard[], modifier: ModifierKind): number {
  const pool = cards.filter((c) => c.modifier === modifier)
  const categories = new Set<string>()
  let untypedCount = 0
  for (const card of pool) {
    if (card.category === 'untyped') untypedCount++
    else categories.add(card.category)
  }
  const ceiling = categories.size + untypedCount
  // Never exceed the physical pool size either (relevant for tiny/edited card sets).
  return Math.min(ceiling, pool.length)
}

export interface WizardLimits {
  global: number
  personal: number
  score: number
}

export function computeWizardLimits(cards: readonly ModifierCard[]): WizardLimits {
  return {
    global: maxDrawableFor(cards, 'global'),
    personal: maxDrawableFor(cards, 'personal'),
    score: maxDrawableFor(cards, 'score'),
  }
}
