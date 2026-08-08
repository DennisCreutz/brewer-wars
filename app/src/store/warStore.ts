/**
 * Central application store: the single source of truth for "which war is
 * currently open" and the gateway every screen uses to read/mutate it.
 *
 * Persistence: `dispatch` applies the reducer optimistically (state updates
 * immediately) then persists in the background. This changed with the move
 * to a network-backed repository — awaiting every save before updating
 * state (the original local-only behaviour) would freeze the UI for the
 * full round-trip on every click. On a failed save the optimistic update
 * is rolled back and `saveError` is set so the UI can surface it; the
 * original `war` is preserved so a retry can re-dispatch from a known-good
 * state.
 *
 * Errors: `dispatch` does not catch WarStateError — illegal transitions are
 * a programming error in the calling screen (e.g. a button that should
 * have been disabled) and should surface loudly during development rather
 * than fail silently. Persistence errors (network/auth/conflict) are a
 * different, expected category and are caught and exposed via `saveError`.
 */
import { create } from 'zustand'
import { createWar, warReducer, type WarAction } from '../domain/war'
import type { War, WarConfig } from '../domain/warTypes'
import { LocalWarRepository } from '../repository/LocalWarRepository'
import type { WarRepository, WarSummary } from '../repository/WarRepository'
import {
  getOrFetchCommanderPool,
  type CommanderPoolLoadStatus,
} from '../data/commanderPoolCache'
import type { CommanderSummary } from '../domain/commanderCheck'
import { ALL_CARDS } from '../data/allCards'

export { ALL_CARDS }

let repository: WarRepository = new LocalWarRepository()

/** Swaps the repository implementation. Called once at app boot (see
 * src/repository/createRepository.ts) once the authenticated user and
 * runtime config are known — the repository can't be constructed at
 * module-eval time because ApiWarRepository needs an access token
 * provider. Tests may also call this to inject a fake. */
export function setWarRepository(next: WarRepository): void {
  repository = next
}

interface WarStoreState {
  war: War | null
  warList: WarSummary[]
  warListLoaded: boolean
  warListError: string | null
  /** Set when a background `dispatch` save fails; cleared on the next
   * successful dispatch or explicit `clearSaveError()`. The optimistic
   * update that triggered the failed save has already been rolled back by
   * the time this is set. */
  saveError: string | null
  commanderPool: CommanderSummary[] | null
  commanderPoolStatus: CommanderPoolLoadStatus

  refreshWarList: () => Promise<void>
  startNewWar: (config: WarConfig, seed?: number) => Promise<War>
  loadWar: (id: string) => Promise<War | null>
  dispatch: (action: WarAction) => Promise<War>
  clearSaveError: () => void
  deleteWar: (id: string) => Promise<void>
  /** Wipes every stored war (landing page's "Reset Games" button) — a
   * full DB reset, distinct from `deleteWar`'s single-war removal. */
  resetAllWars: () => Promise<void>
  exitToLanding: () => void
  ensureCommanderPool: (options?: { forceRefresh?: boolean }) => Promise<CommanderSummary[]>
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export const useWarStore = create<WarStoreState>((set, get) => ({
  war: null,
  warList: [],
  warListLoaded: false,
  warListError: null,
  saveError: null,
  commanderPool: null,
  commanderPoolStatus: { stage: 'reading-cache' },

  refreshWarList: async () => {
    try {
      const warList = await repository.list()
      set({ warList, warListLoaded: true, warListError: null })
    } catch (err) {
      set({ warListLoaded: true, warListError: errorMessage(err) })
    }
  },

  startNewWar: async (config, seed) => {
    const war = createWar(config, ALL_CARDS, seed)
    await repository.create(war)
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
    set({ war: next, saveError: null })
    try {
      await repository.save(next)
      return next
    } catch (err) {
      set({ war: current, saveError: errorMessage(err) })
      throw err
    }
  },

  clearSaveError: () => set({ saveError: null }),

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
