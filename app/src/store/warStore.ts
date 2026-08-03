/**
 * Central application store: the single source of truth for "which war is
 * currently open" and the gateway every screen uses to read/mutate it.
 *
 * Persistence: every successful dispatch saves the resulting War via the
 * repository (fire-and-forget from the caller's perspective is NOT used —
 * we await the save — since the spec requires state to always be
 * persisted before moving on to the next step).
 *
 * Errors: `dispatch` does not catch WarStateError — illegal transitions are
 * a programming error in the calling screen (e.g. a button that should
 * have been disabled) and should surface loudly during development rather
 * than fail silently.
 */
import { create } from 'zustand'
import cardsData from '../data/generated/cards.json'
import type { ModifierCard } from '../domain/cardTypes'
import { createWar, warReducer, type WarAction } from '../domain/war'
import type { War, WarConfig } from '../domain/warTypes'
import { LocalWarRepository } from '../repository/LocalWarRepository'
import type { WarRepository, WarSummary } from '../repository/WarRepository'
import {
  getOrFetchCommanderPool,
  type CommanderPoolLoadStatus,
} from '../data/commanderPoolCache'
import type { CommanderSummary } from '../domain/commanderCheck'

export const ALL_CARDS = cardsData as ModifierCard[]

const repository: WarRepository = new LocalWarRepository()

interface WarStoreState {
  war: War | null
  warList: WarSummary[]
  warListLoaded: boolean
  commanderPool: CommanderSummary[] | null
  commanderPoolStatus: CommanderPoolLoadStatus

  refreshWarList: () => Promise<void>
  startNewWar: (config: WarConfig, seed?: number) => Promise<War>
  loadWar: (id: string) => Promise<War | null>
  dispatch: (action: WarAction) => Promise<War>
  deleteWar: (id: string) => Promise<void>
  /** Wipes every stored war (landing page's "Reset Games" button) — a
   * full DB reset, distinct from `deleteWar`'s single-war removal. */
  resetAllWars: () => Promise<void>
  exitToLanding: () => void
  ensureCommanderPool: (options?: { forceRefresh?: boolean }) => Promise<CommanderSummary[]>
}

export const useWarStore = create<WarStoreState>((set, get) => ({
  war: null,
  warList: [],
  warListLoaded: false,
  commanderPool: null,
  commanderPoolStatus: { stage: 'reading-cache' },

  refreshWarList: async () => {
    const warList = await repository.list()
    set({ warList, warListLoaded: true })
  },

  startNewWar: async (config, seed) => {
    const war = createWar(config, ALL_CARDS, seed)
    await repository.save(war)
    set({ war })
    return war
  },

  loadWar: async (id) => {
    const war = await repository.load(id)
    set({ war })
    return war
  },

  dispatch: async (action) => {
    const current = get().war
    if (!current) throw new Error('Cannot dispatch: no war is currently loaded')
    const next = warReducer(current, action)
    await repository.save(next)
    set({ war: next })
    return next
  },

  deleteWar: async (id) => {
    await repository.remove(id)
    const current = get().war
    set({
      war: current?.id === id ? null : current,
      warList: get().warList.filter((w) => w.id !== id),
    })
  },

  resetAllWars: async () => {
    await repository.removeAll()
    set({ war: null, warList: [] })
  },

  exitToLanding: () => set({ war: null }),

  ensureCommanderPool: async (options) => {
    const pool = await getOrFetchCommanderPool(
      (status) => set({ commanderPoolStatus: status }),
      { forceRefresh: options?.forceRefresh },
    )
    set({ commanderPool: pool })
    return pool
  },
}))
