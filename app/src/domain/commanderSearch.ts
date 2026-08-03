/**
 * Player-controlled browsing refinements for the commander-selection grid —
 * as distinct from domain/commanderCheck.ts's `CommanderCheck`s, which are
 * *mandatory* constraints derived from drawn modifier cards. These are
 * optional, exploratory filters/sorts a player applies on top of that
 * already-legal list purely to help them browse it (e.g. "show me only
 * green commanders, cheapest first") — narrowing further never makes an
 * illegal commander legal, and clearing them always returns to exactly the
 * modifier-filtered set.
 */
import type { CommanderSummary } from './commanderCheck'
import { sameColorSet } from './commanderCheck'

export type ColorFilterMode = 'atLeast' | 'exact'

export interface ColorFilter {
  mode: ColorFilterMode
  /** Empty array means "no colour filter applied". */
  colors: string[]
}

export type ManaValueOperator = 'eq' | 'lte' | 'gte'

export interface ManaValueFilter {
  operator: ManaValueOperator
  value: number
}

export interface CommanderSearchFilters {
  nameQuery?: string
  color?: ColorFilter
  manaValue?: ManaValueFilter
}

function matchesColorFilter(commander: CommanderSummary, filter: ColorFilter | undefined): boolean {
  if (!filter || filter.colors.length === 0) return true
  if (filter.mode === 'exact') return sameColorSet(commander.colorIdentity, filter.colors)
  // 'atLeast': every selected colour must be present; the commander may
  // also have additional colours beyond the ones selected.
  return filter.colors.every((c) => commander.colorIdentity.includes(c))
}

function matchesManaValueFilter(commander: CommanderSummary, filter: ManaValueFilter | undefined): boolean {
  if (!filter) return true
  switch (filter.operator) {
    case 'eq':
      return commander.cmc === filter.value
    case 'lte':
      return commander.cmc <= filter.value
    case 'gte':
      return commander.cmc >= filter.value
  }
}

function matchesNameQuery(commander: CommanderSummary, query: string | undefined): boolean {
  if (!query || query.trim().length === 0) return true
  return commander.name.toLowerCase().includes(query.trim().toLowerCase())
}

/** Applies all active optional filters as an AND. Any filter left
 * `undefined`/empty is a no-op, so calling this with `{}` returns the pool
 * unchanged. */
export function applyCommanderSearchFilters(
  pool: readonly CommanderSummary[],
  filters: CommanderSearchFilters,
): CommanderSummary[] {
  return pool.filter(
    (c) =>
      matchesNameQuery(c, filters.nameQuery) &&
      matchesColorFilter(c, filters.color) &&
      matchesManaValueFilter(c, filters.manaValue),
  )
}

export type CommanderSortKey = 'edhrec' | 'manaValueAsc' | 'manaValueDesc' | 'name'

const SORT_COMPARATORS: Record<CommanderSortKey, (a: CommanderSummary, b: CommanderSummary) => number> = {
  edhrec: (a, b) => {
    // Nulls (no EDHREC rank on file) sort last regardless of direction.
    if (a.edhrecRank === null && b.edhrecRank === null) return 0
    if (a.edhrecRank === null) return 1
    if (b.edhrecRank === null) return -1
    return a.edhrecRank - b.edhrecRank
  },
  manaValueAsc: (a, b) => a.cmc - b.cmc,
  manaValueDesc: (a, b) => b.cmc - a.cmc,
  name: (a, b) => a.name.localeCompare(b.name),
}

/** Sorts a (typically already filtered) commander list by the given key.
 * Stable and non-mutating. `'edhrec'` is the natural/default order the
 * cached pool already ships in, but re-sorting explicitly here makes the
 * ordering robust regardless of what upstream filtering may have done to
 * array order. */
export function sortCommanders(
  pool: readonly CommanderSummary[],
  sortKey: CommanderSortKey,
): CommanderSummary[] {
  return [...pool].sort(SORT_COMPARATORS[sortKey])
}
