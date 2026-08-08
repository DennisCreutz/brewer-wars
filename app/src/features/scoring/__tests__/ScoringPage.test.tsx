import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '../../../i18n'
import { ScoringPage } from '../ScoringPage'
import { useWarStore } from '../../../store/warStore'
import { FakeAuthProvider } from '../../../test/FakeAuthProvider'
import { warPhasePath } from '../../../router/paths'
import {
  DEFAULT_CUSTOM_OPTIONS,
  DEFAULT_VOTE_POINTS,
  DEFAULT_WIN_POINTS,
  type WarConfig,
  type War,
} from '../../../domain/warTypes'

const PLAYER_IDS = ['alice', 'bob', 'carol']

function config(overrides: Partial<WarConfig> = {}): WarConfig {
  return {
    players: [
      { id: 'alice', name: 'Alice', userId: 'user-alice' },
      { id: 'bob', name: 'Bob', userId: 'user-bob' },
      { id: 'carol', name: 'Carol', userId: 'user-carol' },
    ],
    disabledCardIds: [],
    globalCount: 1,
    personalCount: 1,
    scoreCount: 1,
    gameMode: 'normal',
    customOptions: DEFAULT_CUSTOM_OPTIONS,
    winPoints: DEFAULT_WIN_POINTS,
    votePoints: DEFAULT_VOTE_POINTS,
    ...overrides,
  }
}

// Adapted from src/domain/__tests__/war.test.ts's playThroughToScoring(),
// but driven through the store's dispatch (like warStore.test.ts) instead
// of the bare reducer, since the pages under test read from the store.
async function playThroughToScoring(overrides: Partial<WarConfig> = {}, seed = 9): Promise<War> {
  const { startNewWar, dispatch } = useWarStore.getState()
  let war = await startNewWar(config(overrides), 'test-host', seed)
  war = await dispatch({ type: 'RUN_PREPARATION_DRAW' })
  war = await dispatch({ type: 'ADVANCE_TO_PERSONAL_DRAW' })
  for (const playerId of PLAYER_IDS) {
    war = await dispatch({ type: 'DRAW_PERSONAL_MODIFIER', playerId })
  }
  war = await dispatch({ type: 'ADVANCE_TO_COMMANDER_SELECTION' })
  for (const playerId of PLAYER_IDS) {
    war = await dispatch({
      type: 'SELECT_COMMANDER',
      playerId,
      commander: { scryfallId: playerId, name: `${playerId} Commander` },
    })
  }
  war = await dispatch({ type: 'ADVANCE_TO_OVERVIEW' })
  war = await dispatch({ type: 'ADVANCE_TO_SCORING' })
  return war
}

function renderScoringPage(war: War, sub = 'test-host') {
  return render(
    <FakeAuthProvider sub={sub}>
      <MemoryRouter initialEntries={[warPhasePath(war.id, 'scoring')]}>
        <Routes>
          <Route path="/war/:warId/scoring" element={<ScoringPage />} />
          <Route path="/war/:warId/podium" element={<div>podium-page-marker</div>} />
        </Routes>
      </MemoryRouter>
    </FakeAuthProvider>,
  )
}

describe('ScoringPage', () => {
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

  it('reveals every player commander and personal modifiers', async () => {
    const war = await playThroughToScoring()
    renderScoringPage(war)

    // Commander reveal text is unique per player (only rendered once, in
    // the reveal panel), so it is a safe target even though player names
    // themselves repeat across many sections of this dashboard-like page.
    expect(screen.getByText('Commander: alice Commander')).toBeInTheDocument()
    expect(screen.getByText('Commander: bob Commander')).toBeInTheDocument()
    expect(screen.getByText('Commander: carol Commander')).toBeInTheDocument()

    const alice = war.players.find((p) => p.playerId === 'alice')!
    expect(alice.personalModifiers).toHaveLength(1)
    expect(screen.getByText(alice.personalModifiers[0].name)).toBeInTheDocument()
  })

  it('shows a plain message when there are no active score modifiers', async () => {
    const war = await playThroughToScoring({ scoreCount: 0 })
    renderScoringPage(war)
    expect(war.activeScoreModifiers).toHaveLength(0)
    expect(screen.getByText(/no score modifiers this war/i)).toBeInTheDocument()
  })

  it('selecting a game winner updates the store and disables/enables Conclude', async () => {
    const war = await playThroughToScoring()
    const user = userEvent.setup()
    renderScoringPage(war)

    const concludeButton = screen.getByRole('button', { name: /conclude/i })
    expect(concludeButton).toBeDisabled()

    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(3)
    await user.click(radios[0])

    expect(radios[0]).toBeChecked()
    await waitFor(() => {
      expect(useWarStore.getState().war?.scoring.gameWinnerId).toBe('alice')
    })
    expect(concludeButton).not.toBeDisabled()
  })

  it('shows a waiting screen for the first player who has not voted yet, from their own device', async () => {
    const war = await playThroughToScoring()
    renderScoringPage(war, 'user-alice')

    // Alice hasn't voted yet, so her own screen shows her vote booth —
    // nobody else's voting choices are visible on it (each member only
    // ever sees their own turn now, see ui/TurnGate.tsx).
    expect(screen.getByRole('button', { name: /vote for bob/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /vote for carol/i })).toBeInTheDocument()
  })

  it('shows a waiting summary for a member who already voted', async () => {
    const war = await playThroughToScoring()
    const user = userEvent.setup()
    renderScoringPage(war, 'user-alice')

    await user.click(screen.getByRole('button', { name: /vote for bob/i }))
    await user.click(screen.getByRole('button', { name: /confirm vote/i }))

    await waitFor(() => {
      expect(
        useWarStore.getState().war?.players.find((p) => p.playerId === 'alice')?.bestBrewerVoteFor,
      ).toBe('bob')
    })
    expect(screen.getByText(/vote cast! waiting for the others/i)).toBeInTheDocument()
  })

  it('excludes the current voter from their own best-brewer vote choices (still cannot vote for yourself)', async () => {
    const war = await playThroughToScoring()
    renderScoringPage(war, 'user-alice')

    expect(screen.getByRole('button', { name: /vote for bob/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /vote for carol/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /vote for alice/i })).not.toBeInTheDocument()
  })

  it('disables the confirm button until a candidate is picked', async () => {
    const war = await playThroughToScoring()
    const user = userEvent.setup()
    renderScoringPage(war, 'user-alice')

    expect(screen.getByRole('button', { name: /confirm vote/i })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /vote for bob/i }))
    expect(screen.getByRole('button', { name: /confirm vote/i })).not.toBeDisabled()
  })

  it(
    'casts a best-brewer vote (dispatching the same SET_BEST_BREWER_VOTE shape as before), each ' +
      "from the voting member's own device",
    async () => {
      const war = await playThroughToScoring()
      const user = userEvent.setup()
      renderScoringPage(war, 'user-alice')

      await user.click(screen.getByRole('button', { name: /vote for bob/i }))
      await user.click(screen.getByRole('button', { name: /confirm vote/i }))

      await waitFor(() => {
        const alice = useWarStore.getState().war?.players.find((p) => p.playerId === 'alice')
        expect(alice?.bestBrewerVoteFor).toBe('bob')
      })
    },
  )

  it('reveals a tally and per-player vote bonus once every player has voted', async () => {
    const war = await playThroughToScoring()
    const user = userEvent.setup()

    // Each member votes from their own render (their own device) — no
    // shared curtain state carries between them any more.
    const { unmount: unmountAlice } = renderScoringPage(war, 'user-alice')
    await user.click(screen.getByRole('button', { name: /vote for bob/i }))
    await user.click(screen.getByRole('button', { name: /confirm vote/i }))
    await waitFor(() => {
      expect(
        useWarStore.getState().war?.players.find((p) => p.playerId === 'alice')?.bestBrewerVoteFor,
      ).toBe('bob')
    })
    unmountAlice()

    const { unmount: unmountBob } = renderScoringPage(useWarStore.getState().war!, 'user-bob')
    await user.click(screen.getByRole('button', { name: /vote for carol/i }))
    await user.click(screen.getByRole('button', { name: /confirm vote/i }))
    await waitFor(() => {
      expect(
        useWarStore.getState().war?.players.find((p) => p.playerId === 'bob')?.bestBrewerVoteFor,
      ).toBe('carol')
    })
    unmountBob()

    renderScoringPage(useWarStore.getState().war!, 'user-carol')
    await user.click(screen.getByRole('button', { name: /vote for bob/i }))
    await user.click(screen.getByRole('button', { name: /confirm vote/i }))

    // A completion summary with a per-player tally (Bob: 2 votes, Carol: 1,
    // Alice: 0) takes the place of any voting UI once everyone's voted.
    expect(await screen.findByText(/everyone has voted/i)).toBeInTheDocument()
    expect(screen.getByText('2 votes')).toBeInTheDocument()
    expect(screen.getByText('1 vote')).toBeInTheDocument()

    const finalWar = useWarStore.getState().war
    expect(finalWar?.players.find((p) => p.playerId === 'alice')?.bestBrewerVoteFor).toBe('bob')
    expect(finalWar?.players.find((p) => p.playerId === 'bob')?.bestBrewerVoteFor).toBe('carol')
    expect(finalWar?.players.find((p) => p.playerId === 'carol')?.bestBrewerVoteFor).toBe('bob')
  })

  it('records a score-card tally for a player (checkbox or stepper, whichever this card is)', async () => {
    const war = await playThroughToScoring({ scoreCount: 1 })
    const user = userEvent.setup()
    renderScoringPage(war)

    const card = war.activeScoreModifiers[0]

    if (card.repeatable) {
      const inputs = screen.getAllByRole('spinbutton')
      expect(inputs.length).toBeGreaterThan(0)
      await user.clear(inputs[0])
      await user.type(inputs[0], '3')
      await waitFor(() => {
        expect(useWarStore.getState().war?.scoring.scoreCardTally[card.id]?.alice).toBe(3)
      })
    } else {
      const checkboxes = screen.getAllByRole('checkbox')
      expect(checkboxes.length).toBeGreaterThan(0)
      await user.click(checkboxes[0])
      await waitFor(() => {
        expect(useWarStore.getState().war?.scoring.scoreCardTally[card.id]?.alice).toBe(1)
      })
    }
  })

  it('concludes the war and navigates to the podium once a winner is chosen', async () => {
    const war = await playThroughToScoring()
    const user = userEvent.setup()
    renderScoringPage(war)

    const radios = screen.getAllByRole('radio')
    await user.click(radios[0])

    const concludeButton = screen.getByRole('button', { name: /conclude/i })
    await waitFor(() => expect(concludeButton).not.toBeDisabled())
    await user.click(concludeButton)

    expect(await screen.findByText('podium-page-marker')).toBeInTheDocument()
    expect(useWarStore.getState().war?.phase).toBe('concluded')
    expect(useWarStore.getState().war?.finalScore).not.toBeNull()
  })
})
