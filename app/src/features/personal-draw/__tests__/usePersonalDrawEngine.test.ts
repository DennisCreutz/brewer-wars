import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { usePersonalDrawEngine } from '../usePersonalDrawEngine'
import { useWarStore } from '../../../store/warStore'
import {
  DEFAULT_CUSTOM_OPTIONS,
  DEFAULT_VOTE_POINTS,
  DEFAULT_WIN_POINTS,
  type WarConfig,
} from '../../../domain/warTypes'
import type { CommanderSummary } from '../../../domain/commanderCheck'

function config(overrides: Partial<WarConfig> = {}): WarConfig {
  return {
    players: [
      { id: 'alice', name: 'Alice', userId: 'user-alice' },
      { id: 'bob', name: 'Bob', userId: 'user-bob' },
    ],
    disabledCardIds: [],
    globalCount: 0,
    personalCount: 3,
    scoreCount: 0,
    gameMode: 'normal',
    customOptions: DEFAULT_CUSTOM_OPTIONS,
    winPoints: DEFAULT_WIN_POINTS,
    votePoints: DEFAULT_VOTE_POINTS,
    ...overrides,
  }
}

function commander(id: string, colorIdentity: string[]): CommanderSummary {
  return {
    id,
    name: `Commander ${id}`,
    colorIdentity,
    typeLine: 'Legendary Creature — Human',
    keywords: [],
    hasFlavorText: false,
    rarity: 'rare',
    cmc: 2,
    edhrecRank: null,
    numDecks: null,
    scryfallUri: '',
    artCropUrl: null,
    imageUrl: null,
  }
}

describe('usePersonalDrawEngine', () => {
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

  it('draws one card via drawOne and does nothing extra when the pool stays non-empty', async () => {
    // A generous pool (one white, one blue commander) so a single "Colour W"
    // or similar draw never zeroes it out.
    useWarStore.setState({
      commanderPool: [commander('1', ['W']), commander('2', ['U'])],
    })
    await useWarStore.getState().startNewWar(config(), 'test-host', 1)
    await useWarStore.getState().dispatch({ type: 'RUN_PREPARATION_DRAW' })
    await useWarStore.getState().dispatch({ type: 'ADVANCE_TO_PERSONAL_DRAW' })

    const { result } = renderHook(() => usePersonalDrawEngine())
    await act(async () => {
      await result.current.drawOne('alice')
    })

    const alice = useWarStore.getState().war!.players.find((p) => p.playerId === 'alice')!
    expect(alice.personalModifiers.length).toBeGreaterThanOrEqual(1)
  })

  it('auto-redraws when the drawn card would zero out the live commander pool', async () => {
    // Only a single white commander exists in the whole pool. We force a
    // deterministic seed and disabledCardIds so the very first personal
    // card alice draws is "Colour U" (blue) — which, against a pool that
    // only contains a white commander, immediately zeroes her count out.
    useWarStore.setState({ commanderPool: [commander('1', ['W'])] })

    const onlyColourU = config({
      personalCount: 1,
      disabledCardIds: [], // keep full personal pool; we instead pin the deck via a helper below
    })
    await useWarStore.getState().startNewWar(onlyColourU, 'test-host', 1)
    await useWarStore.getState().dispatch({ type: 'RUN_PREPARATION_DRAW' })
    await useWarStore.getState().dispatch({ type: 'ADVANCE_TO_PERSONAL_DRAW' })

    // Force the shared personal deck's next draw to be "Colour U" regardless
    // of shuffle, by moving that exact card to the top of the draw pile.
    const war = useWarStore.getState().war!
    if (war.personalDecks.mode === 'shared') {
      const deck = war.personalDecks.deck
      const colourU = deck.drawPile.find((c) => c.id === 'colour-u')!
      const rest = deck.drawPile.filter((c) => c.id !== 'colour-u')
      useWarStore.setState({
        war: {
          ...war,
          personalDecks: { mode: 'shared', deck: { ...deck, drawPile: [...rest, colourU] } },
        },
      })
    }

    const { result } = renderHook(() => usePersonalDrawEngine())
    await act(async () => {
      await result.current.drawOne('alice')
    })

    await waitFor(() => {
      const alice = useWarStore.getState().war!.players.find((p) => p.playerId === 'alice')!
      expect(alice.personalModifiers).toHaveLength(1)
    })

    const alice = useWarStore.getState().war!.players.find((p) => p.playerId === 'alice')!
    // Colour U must have been rejected for zero-commanders somewhere in the log...
    const rejection = alice.personalDrawLog.find((e) => e.card.id === 'colour-u' && !e.accepted)
    expect(rejection?.reason).toBe('zero-commanders')
    // ...and alice's final modifier must NOT be colour-u (it got replaced).
    expect(alice.personalModifiers[0].id).not.toBe('colour-u')
  })

  it('startDraft populates pendingDraft with 3 candidates', async () => {
    useWarStore.setState({ commanderPool: [] })
    await useWarStore
      .getState()
      .startNewWar(
        config({ gameMode: 'custom', customOptions: { ...DEFAULT_CUSTOM_OPTIONS, draft: true } }),
        'test-host',
        2,
      )
    await useWarStore.getState().dispatch({ type: 'RUN_PREPARATION_DRAW' })
    await useWarStore.getState().dispatch({ type: 'ADVANCE_TO_PERSONAL_DRAW' })

    const { result } = renderHook(() => usePersonalDrawEngine())
    await act(async () => {
      await result.current.startDraft('alice')
    })

    const alice = useWarStore.getState().war!.players.find((p) => p.playerId === 'alice')!
    expect(alice.pendingDraft).toHaveLength(3)
  })

  it('isProcessing reflects the async operation state', async () => {
    useWarStore.setState({ commanderPool: [] })
    await useWarStore.getState().startNewWar(config(), 'test-host', 3)
    await useWarStore.getState().dispatch({ type: 'RUN_PREPARATION_DRAW' })
    await useWarStore.getState().dispatch({ type: 'ADVANCE_TO_PERSONAL_DRAW' })

    const { result } = renderHook(() => usePersonalDrawEngine())
    expect(result.current.isProcessing).toBe(false)
    const drawPromise = act(async () => {
      await result.current.drawOne('alice')
    })
    await drawPromise
    expect(result.current.isProcessing).toBe(false)
  })
})
