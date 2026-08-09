import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useWarStore } from '../warStore'
import {
  DEFAULT_CUSTOM_OPTIONS,
  DEFAULT_VOTE_POINTS,
  DEFAULT_WIN_POINTS,
  type WarConfig,
} from '../../domain/warTypes'

function config(): WarConfig {
  return {
    players: [
      { id: 'alice', name: 'Alice', userId: 'user-alice' },
      { id: 'bob', name: 'Bob', userId: 'user-bob' },
    ],
    disabledCardIds: [],
    globalCount: 1,
    personalCount: 1,
    scoreCount: 1,
    gameMode: 'normal',
    customOptions: DEFAULT_CUSTOM_OPTIONS,
    winPoints: DEFAULT_WIN_POINTS,
    votePoints: DEFAULT_VOTE_POINTS,
  }
}

describe('useWarStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useWarStore.setState({
      war: null,
      warList: [],
      warListLoaded: false,
      commanderPool: null,
      commanderPoolStatus: { stage: 'reading-cache' },
    })
  })

  it('startNewWar creates, persists, and sets the current war', async () => {
    const war = await useWarStore.getState().startNewWar(config(), 'test-host', 1)
    expect(war.phase).toBe('preparation')
    expect(useWarStore.getState().war?.id).toBe(war.id)

    // Persisted: a fresh load by id should find it.
    const reloaded = await useWarStore.getState().loadWar(war.id)
    expect(reloaded?.id).toBe(war.id)
  })

  it('dispatch runs the reducer, persists the result, and updates state', async () => {
    await useWarStore.getState().startNewWar(config(), 'test-host', 2)
    const updated = await useWarStore.getState().dispatch({ type: 'RUN_PREPARATION_DRAW' })
    expect(updated.preparationDrawComplete).toBe(true)
    expect(useWarStore.getState().war?.preparationDrawComplete).toBe(true)

    const reloaded = await useWarStore.getState().loadWar(updated.id)
    expect(reloaded?.preparationDrawComplete).toBe(true)
  })

  it('dispatch throws if no war is loaded', async () => {
    await expect(
      useWarStore.getState().dispatch({ type: 'RUN_PREPARATION_DRAW' }),
    ).rejects.toThrow()
  })

  it('refreshWarList reflects saved wars', async () => {
    const war = await useWarStore.getState().startNewWar(config(), 'test-host', 3)
    await useWarStore.getState().refreshWarList()
    const list = useWarStore.getState().warList
    expect(list.some((w) => w.id === war.id)).toBe(true)
  })

  it('deleteWar removes it from storage and clears it if it was current', async () => {
    const war = await useWarStore.getState().startNewWar(config(), 'test-host', 4)
    await useWarStore.getState().deleteWar(war.id)
    expect(useWarStore.getState().war).toBeNull()
    expect(await useWarStore.getState().loadWar(war.id)).toBeNull()
  })

  it('exitToLanding clears the current war without deleting it from storage', async () => {
    const war = await useWarStore.getState().startNewWar(config(), 'test-host', 5)
    useWarStore.getState().exitToLanding()
    expect(useWarStore.getState().war).toBeNull()
    expect(await useWarStore.getState().loadWar(war.id)).not.toBeNull()
  })

  it('resetAllWars wipes every saved war and the current one, and clears warList', async () => {
    const warA = await useWarStore.getState().startNewWar(config(), 'test-host', 6)
    await useWarStore.getState().startNewWar(config(), 'test-host', 7)
    await useWarStore.getState().refreshWarList()
    expect(useWarStore.getState().warList.length).toBeGreaterThanOrEqual(2)

    await useWarStore.getState().resetAllWars()

    expect(useWarStore.getState().war).toBeNull()
    expect(useWarStore.getState().warList).toEqual([])
    expect(await useWarStore.getState().loadWar(warA.id)).toBeNull()
  })

  it('ensureCommanderPool fetches and stores the pool, updating status along the way', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [], has_more: false, total_cards: 0 }),
    }) as unknown as typeof fetch

    const pool = await useWarStore.getState().ensureCommanderPool()
    expect(pool).toEqual([])
    expect(useWarStore.getState().commanderPoolStatus.stage).toBe('ready')
    expect(useWarStore.getState().commanderPool).toEqual([])
  })
})
