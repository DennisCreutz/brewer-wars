import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import '../../../i18n'
import { PersonalDrawPage } from '../PersonalDrawPage'
import { useWarStore } from '../../../store/warStore'
import { FakeAuthProvider } from '../../../test/FakeAuthProvider'
import {
  DEFAULT_CUSTOM_OPTIONS,
  DEFAULT_VOTE_POINTS,
  DEFAULT_WIN_POINTS,
  type WarConfig,
} from '../../../domain/warTypes'
import type { War } from '../../../domain/warTypes'
import type { CommanderSummary } from '../../../domain/commanderCheck'
import cardsData from '../../../data/generated/cards.json'
import type { ModifierCard } from '../../../domain/cardTypes'

const ALL_CARDS = cardsData as ModifierCard[]

function config(overrides: Partial<WarConfig> = {}): WarConfig {
  return {
    players: [
      { id: 'alice', name: 'Alice', userId: 'user-alice' },
      { id: 'bob', name: 'Bob', userId: 'user-bob' },
    ],
    disabledCardIds: [],
    globalCount: 0,
    personalCount: 1,
    scoreCount: 0,
    gameMode: 'normal',
    customOptions: DEFAULT_CUSTOM_OPTIONS,
    winPoints: DEFAULT_WIN_POINTS,
    votePoints: DEFAULT_VOTE_POINTS,
    ...overrides,
  }
}

function commander(
  id: string,
  colorIdentity: string[],
  overrides: Partial<CommanderSummary> = {},
): CommanderSummary {
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
    numDecks: 999,
    scryfallUri: '',
    artCropUrl: null,
    imageUrl: null,
    ...overrides,
  }
}

/**
 * A commander pool derived from the real card set so that ANY single
 * checkable commander-target personal modifier a player could possibly
 * draw is individually satisfiable by at least one commander in the pool.
 * Used for multi-draw/multi-player tests so the zero-commander auto-redraw
 * safety net never has a reason to loop — keeping those tests fast and
 * fully deterministic regardless of which card the shuffle happens to
 * produce. (The dedicated auto-redraw test below uses a deliberately
 * *restrictive* pool instead, to force and observe that exact mechanic.)
 */
function generousCommanderPool(): CommanderSummary[] {
  const pool: CommanderSummary[] = []
  let n = 0
  for (const card of ALL_CARDS) {
    const check = card.commanderCheck
    if (!check) continue
    n += 1
    switch (check.kind) {
      case 'colorIdentityExact':
        pool.push(commander(`gen-${n}`, check.colors))
        break
      case 'keyword':
        pool.push(commander(`gen-${n}`, [], { keywords: [check.keyword] }))
        break
      case 'hasFlavorText':
        pool.push(commander(`gen-${n}`, [], { hasFlavorText: true }))
        break
      case 'edhrecDeckCountBelow':
        pool.push(commander(`gen-${n}`, [], { numDecks: 0 }))
        break
      case 'multipleCreatureTypes':
        pool.push(commander(`gen-${n}`, [], { typeLine: 'Legendary Creature — Human Wizard' }))
        break
    }
  }
  return pool
}

/** Renders as whichever account `sub` belongs to (defaults to alice's) —
 * every player is now bound to a real account, so which player's action
 * screen shows up depends entirely on who's signed in (see ui/TurnGate.tsx
 * having been replaced by this per-user model). */
function renderAtWar(war: War, sub = 'user-alice') {
  return render(
    <FakeAuthProvider sub={sub}>
      <MemoryRouter initialEntries={[`/war/${war.id}/personal-draw`]}>
        <Routes>
          <Route path="/war/:warId/personal-draw" element={<PersonalDrawPage />} />
          <Route
            path="/war/:warId/commander-selection"
            element={<div>commander selection screen</div>}
          />
        </Routes>
      </MemoryRouter>
    </FakeAuthProvider>,
  )
}

describe('PersonalDrawPage', () => {
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

  it('shows a waiting screen for a member whose turn it is not', async () => {
    useWarStore.setState({ commanderPool: generousCommanderPool() })
    await useWarStore.getState().startNewWar(config(), 'test-host', 10)
    await useWarStore.getState().dispatch({ type: 'RUN_PREPARATION_DRAW' })
    await useWarStore.getState().dispatch({ type: 'ADVANCE_TO_PERSONAL_DRAW' })
    // Signed in as neither alice nor bob (e.g. a host who isn't playing) —
    // both players are still concurrently mid-draw.
    renderAtWar(useWarStore.getState().war!, 'user-spectator')

    expect(screen.getByText(/waiting on the players below/i)).toBeInTheDocument()
    expect(screen.queryByText('Your Modifiers')).not.toBeInTheDocument()
  })

  it(
    'draws a card and plays back an auto-redraw story, then shows a waiting ' +
      'screen once the drawing player is done',
    async () => {
      const user = userEvent.setup()
      // Only a single white commander exists — forces whichever card lands
      // on top of the shared personal deck ("Colour U") to zero the live
      // count out, deterministically exercising the auto-redraw safety net
      // (same recipe as usePersonalDrawEngine.test.ts).
      useWarStore.setState({ commanderPool: [commander('1', ['W'])] })

      await useWarStore.getState().startNewWar(config(), 'test-host', 1)
      await useWarStore.getState().dispatch({ type: 'RUN_PREPARATION_DRAW' })
      await useWarStore.getState().dispatch({ type: 'ADVANCE_TO_PERSONAL_DRAW' })

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

      renderAtWar(useWarStore.getState().war!, 'user-alice')

      await user.click(screen.getByRole('button', { name: /draw personal modifier/i }))

      await waitFor(() => {
        expect(screen.getByText(/that would leave zero valid commanders/i)).toBeInTheDocument()
      })
      expect(screen.getByText('Kept!')).toBeInTheDocument()
      // The "drawn from a deck" animation's face-down stack sits beside
      // the playback sequence (3 decorative card backs).
      expect(screen.getAllByText('🂠')).toHaveLength(3)

      // With only a single commander in the whole pool, alice's finished
      // hand is always going to be at/below the low-commander-count
      // threshold, so the new redraw-everything prompt appears here first
      // — decline it (this test is about the auto-redraw safety net, not
      // this prompt; see the dedicated "low commander count prompt"
      // describe block below for that) to reach the usual confirmation.
      expect(screen.getByText(/only 1 commander would satisfy/i)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /keep these/i }))

      expect(screen.getByText(/you're all set/i)).toBeInTheDocument()

      const alice = useWarStore.getState().war!.players.find((p) => p.playerId === 'alice')!
      expect(alice.personalModifiers).toHaveLength(1)
      expect(alice.personalModifiers[0].id).not.toBe('colour-u')
      expect(alice.personalDrawComplete).toBe(true)
    },
  )

  it('draft mode: draws 3 candidates and lets the player pick one', async () => {
    const user = userEvent.setup()
    useWarStore.setState({ commanderPool: generousCommanderPool() })
    const cfg = config({
      gameMode: 'custom',
      customOptions: { ...DEFAULT_CUSTOM_OPTIONS, draft: true },
    })
    await useWarStore.getState().startNewWar(cfg, 'test-host', 2)
    await useWarStore.getState().dispatch({ type: 'RUN_PREPARATION_DRAW' })
    await useWarStore.getState().dispatch({ type: 'ADVANCE_TO_PERSONAL_DRAW' })
    renderAtWar(useWarStore.getState().war!, 'user-alice')

    await user.click(screen.getByRole('button', { name: /draw 3 candidates/i }))

    const candidateButtons = await screen.findAllByRole('button', { name: /^choose /i })
    expect(candidateButtons).toHaveLength(3)
    // The "drawn from a deck" animation's face-down stack sits above the
    // 3 candidates (3 decorative card backs).
    expect(screen.getAllByText('🂠')).toHaveLength(3)

    await user.click(candidateButtons[0])

    await waitFor(() => {
      const alice = useWarStore.getState().war!.players.find((p) => p.playerId === 'alice')!
      expect(alice.personalModifiers).toHaveLength(1)
    })
    expect(screen.getByText(/you're all set/i)).toBeInTheDocument()
  })

  it('shows the all-done summary and advances to commander selection once everyone has finished', async () => {
    const user = userEvent.setup()
    useWarStore.setState({ commanderPool: [] })
    await useWarStore.getState().startNewWar(config(), 'test-host', 3)
    await useWarStore.getState().dispatch({ type: 'RUN_PREPARATION_DRAW' })
    await useWarStore.getState().dispatch({ type: 'ADVANCE_TO_PERSONAL_DRAW' })

    const current = useWarStore.getState().war!
    useWarStore.setState({
      war: {
        ...current,
        players: current.players.map((p) => ({ ...p, personalDrawComplete: true })),
      },
    })

    renderAtWar(useWarStore.getState().war!)

    expect(screen.getByText(/everyone has drawn their personal modifiers/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /continue to commander selection/i }))

    await waitFor(() => {
      expect(screen.getByText('commander selection screen')).toBeInTheDocument()
    })
    expect(useWarStore.getState().war?.phase).toBe('commander-selection')
  })

  describe('low commander count prompt', () => {
    async function startWar(pool: CommanderSummary[] | null) {
      useWarStore.setState({ commanderPool: pool })
      await useWarStore.getState().startNewWar(config(), 'test-host', 5)
      await useWarStore.getState().dispatch({ type: 'RUN_PREPARATION_DRAW' })
      await useWarStore.getState().dispatch({ type: 'ADVANCE_TO_PERSONAL_DRAW' })
      return useWarStore.getState().war!
    }

    /**
     * Finishes alice's hand with just Colour U, without going through the
     * real (RNG-driven) draw flow — this suite is about the prompt's
     * gating logic against a known `commanderCount`, not the draw engine
     * itself (see the auto-redraw test above, and
     * usePersonalDrawEngine.test.ts, for that). Combined with whatever
     * `commanderPool` the test set up via `startWar`,
     * `countPotentialCommanders` will resolve to however many of its
     * entries match Colour U's `colorIdentityExact` check.
     */
    function finishAliceWithColourU() {
      const colourU = ALL_CARDS.find((c) => c.id === 'colour-u')!
      const current = useWarStore.getState().war!
      useWarStore.setState({
        war: {
          ...current,
          players: current.players.map((p) =>
            p.playerId === 'alice'
              ? {
                  ...p,
                  personalModifiers: [colourU],
                  personalDrawComplete: true,
                  personalDrawLog: [
                    ...p.personalDrawLog,
                    { card: colourU, accepted: true as const },
                  ],
                }
              : p,
          ),
        },
      })
    }

    it('appears when the finished hand leaves a low (1-4) live commander count', async () => {
      const war = await startWar([
        commander('u1', ['U']),
        commander('u2', ['U']),
        commander('w1', ['W']),
      ])
      renderAtWar(war, 'user-alice')
      finishAliceWithColourU()

      await waitFor(() => {
        expect(screen.getByText(/too few commanders/i)).toBeInTheDocument()
      })
      expect(screen.getByText(/only 2 commanders would satisfy/i)).toBeInTheDocument()
      // The usual "you're done" confirmation must NOT show yet.
      expect(screen.queryByText(/you're all set/i)).not.toBeInTheDocument()
    })

    it('does not appear once the live count is at/above the threshold', async () => {
      const pool = Array.from({ length: 5 }, (_, i) => commander(`u${i}`, ['U']))
      const war = await startWar(pool)
      renderAtWar(war, 'user-alice')
      finishAliceWithColourU()

      await waitFor(() => {
        expect(screen.getByText(/you're all set/i)).toBeInTheDocument()
      })
      expect(screen.queryByText(/too few commanders/i)).not.toBeInTheDocument()
    })

    it('does not appear while the commander pool has not loaded yet (count null)', async () => {
      const war = await startWar(null)
      renderAtWar(war, 'user-alice')
      finishAliceWithColourU()

      await waitFor(() => {
        expect(screen.getByText(/you're all set/i)).toBeInTheDocument()
      })
      expect(screen.queryByText(/too few commanders/i)).not.toBeInTheDocument()
    })

    it('does not appear when the live count is exactly 0 (defensive fallback)', async () => {
      // No commander in the pool matches Colour U at all.
      const war = await startWar([commander('w1', ['W']), commander('b1', ['B'])])
      renderAtWar(war, 'user-alice')
      finishAliceWithColourU()

      await waitFor(() => {
        expect(screen.getByText(/you're all set/i)).toBeInTheDocument()
      })
      expect(screen.queryByText(/too few commanders/i)).not.toBeInTheDocument()
    })

    it('"Redraw All" calls the engine, clearing the hand and returning to the normal draw controls', async () => {
      const user = userEvent.setup()
      const war = await startWar([commander('u1', ['U']), commander('w1', ['W'])])
      renderAtWar(war, 'user-alice')
      finishAliceWithColourU()

      await waitFor(() => {
        expect(screen.getByText(/too few commanders/i)).toBeInTheDocument()
      })
      await user.click(screen.getByRole('button', { name: /redraw all/i }))

      await waitFor(() => {
        const alice = useWarStore.getState().war!.players.find((p) => p.playerId === 'alice')!
        expect(alice.personalModifiers).toHaveLength(0)
        expect(alice.personalDrawComplete).toBe(false)
      })
      expect(
        await screen.findByRole('button', { name: /draw personal modifier/i }),
      ).toBeInTheDocument()
      expect(screen.queryByText(/too few commanders/i)).not.toBeInTheDocument()
    })

    it('"Keep These" declines the redraw and proceeds to the normal finish confirmation', async () => {
      const user = userEvent.setup()
      const war = await startWar([commander('u1', ['U']), commander('w1', ['W'])])
      renderAtWar(war, 'user-alice')
      finishAliceWithColourU()

      await waitFor(() => {
        expect(screen.getByText(/too few commanders/i)).toBeInTheDocument()
      })
      await user.click(screen.getByRole('button', { name: /keep these/i }))

      expect(screen.getByText(/you're all set/i)).toBeInTheDocument()
      expect(screen.queryByText(/too few commanders/i)).not.toBeInTheDocument()
      // Declining leaves the hand untouched.
      const alice = useWarStore.getState().war!.players.find((p) => p.playerId === 'alice')!
      expect(alice.personalModifiers).toHaveLength(1)
    })

    it('reappears if a redraw still results in another low-count hand', async () => {
      const user = userEvent.setup()
      const war = await startWar([commander('u1', ['U'])])
      renderAtWar(war, 'user-alice')
      finishAliceWithColourU()

      await waitFor(() => {
        expect(screen.getByText(/only 1 commander would satisfy/i)).toBeInTheDocument()
      })
      await user.click(screen.getByRole('button', { name: /redraw all/i }))

      await waitFor(() => {
        const alice = useWarStore.getState().war!.players.find((p) => p.playerId === 'alice')!
        expect(alice.personalDrawComplete).toBe(false)
      })

      // Simulate the player drawing again and landing on another
      // low-count card, without going through the real draw flow (same
      // rationale as finishAliceWithColourU above).
      finishAliceWithColourU()

      await waitFor(() => {
        expect(screen.getByText(/only 1 commander would satisfy/i)).toBeInTheDocument()
      })
    })
  })
})
