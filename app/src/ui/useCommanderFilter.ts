import { useMemo } from 'react'
import { useWarStore } from '../store/warStore'
import { filterCommanders, splitCommanderModifiers, buildScryfallSearchUrl } from '../domain/commanderCheck'
import type { ModifierCard, CommanderCheck } from '../domain/cardTypes'
import type { CommanderSummary } from '../domain/commanderCheck'

export interface CommanderFilterResult {
  /** null while the pool hasn't loaded yet. */
  filtered: CommanderSummary[] | null
  count: number | null
  checkableModifiers: { card: ModifierCard; check: CommanderCheck }[]
  uncheckableModifiers: ModifierCard[]
  scryfallUrl: string
}

/** Combines the cached Scryfall commander pool with a set of active
 * Commander-target modifiers to produce a real-time filtered list — no
 * network calls happen here, it's a pure in-memory recompute every time
 * `modifiers` changes (e.g. after each personal-draw card). */
export function useCommanderFilter(modifiers: readonly ModifierCard[]): CommanderFilterResult {
  const pool = useWarStore((s) => s.commanderPool)

  const { checkable, uncheckable } = useMemo(() => splitCommanderModifiers(modifiers), [modifiers])
  const checks = useMemo(() => checkable.map((c) => c.check), [checkable])

  const filtered = useMemo(() => {
    if (!pool) return null
    return filterCommanders(pool, checks)
  }, [pool, checks])

  const scryfallUrl = useMemo(() => buildScryfallSearchUrl(checks), [checks])

  return {
    filtered,
    count: filtered?.length ?? null,
    checkableModifiers: checkable,
    uncheckableModifiers: uncheckable,
    scryfallUrl,
  }
}
