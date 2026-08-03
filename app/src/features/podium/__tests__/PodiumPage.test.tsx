import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '../../../i18n'
import { PodiumPage } from '../PodiumPage'
import { useWarStore } from '../../../store/warStore'
import { warPhasePath } from '../../../router/paths'
import {
  DEFAULT_CUSTOM_OPTIONS,
  DEFAULT_VOTE_POINTS,
  DEFAULT_WIN_POINTS,
  type WarConfig,
  type War,
  type PlayerId,
} from '../../../domain/warTypes'

const PLAYER_IDS = ['alice', 'bob']

function config(overrides: Partial<WarConfig> = {}): WarConfig {
  return {
    players: [
      { id: 'alice', name: 'Alice' },
      { id: 'bob', name: 'Bob' },
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

// Plays a war all the way to 'scoring' (same shape as
// src/domain/__tests__/war.test.ts's playThroughToScoring(), driven
// through the store like src/store/__tests__/warStore.test.ts), then
// optionally declares a winner and concludes it, so `finalScore` is
// frozen exactly the way the real ScoringPage -> PodiumPage flow does.
async function playThroughToConcluded(
  overrides: Partial<WarConfig> = {},
  gameWinnerId: PlayerId | null = null,
  seed = 5,
): Promise<War> {
  const { startNewWar, dispatch } = useWarStore.getState()
  let war = await startNewWar(config(overrides), seed)
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
  if (gameWinnerId) {
    war = await dispatch({ type: 'SET_GAME_WINNER', playerId: gameWinnerId })
  }
  war = await dispatch({ type: 'CONCLUDE_WAR' })
  return war
}

function renderPodiumPage(war: War) {
  return render(
    <MemoryRouter initialEntries={[warPhasePath(war.id, 'concluded')]}>
      <Routes>
        <Route path="/war/:warId/podium" element={<PodiumPage />} />
        <Route path="/new" element={<div>new-war-page-marker</div>} />
        <Route path="/" element={<div>landing-page-marker</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PodiumPage', () => {
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

  it('highlights a single declared winner under the "Champion" heading', async () => {
    const war = await playThroughToConcluded({}, 'alice')
    renderPodiumPage(war)

    expect(war.finalScore?.winners).toHaveLength(1)
    expect(war.finalScore?.winners[0].playerId).toBe('alice')
    expect(screen.getByText('Champion')).toBeInTheDocument()
    expect(screen.queryByText('Champions')).not.toBeInTheDocument()
  })

  it('shows the co-winners heading when every player ties (a supported scenario)', async () => {
    // No winner declared, no votes cast, and no score cards in play: every
    // player scores exactly 0 and ties for first place.
    const war = await playThroughToConcluded({ scoreCount: 0 }, null)
    renderPodiumPage(war)

    expect(war.finalScore?.winners.length).toBeGreaterThan(1)
    expect(screen.getByText('Champions')).toBeInTheDocument()
  })

  it('renders the full ranked list and both navigation actions', async () => {
    const war = await playThroughToConcluded({}, 'alice')
    renderPodiumPage(war)

    expect(screen.getByText('Final Score')).toBeInTheDocument()
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Bob').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /back to landing/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start a new war/i })).toBeInTheDocument()
  })

  it('exits to landing without deleting the war from storage', async () => {
    const war = await playThroughToConcluded({}, 'alice')
    const user = userEvent.setup()
    renderPodiumPage(war)

    await user.click(screen.getByRole('button', { name: /back to landing/i }))

    expect(await screen.findByText('landing-page-marker')).toBeInTheDocument()
    expect(useWarStore.getState().war).toBeNull()
    expect(await useWarStore.getState().loadWar(war.id)).not.toBeNull()
  })

  it('navigates to the wizard when starting a new war', async () => {
    const war = await playThroughToConcluded({}, 'alice')
    const user = userEvent.setup()
    renderPodiumPage(war)

    await user.click(screen.getByRole('button', { name: /start a new war/i }))
    expect(await screen.findByText('new-war-page-marker')).toBeInTheDocument()
  })

  it('renders successfully even though jsdom has no real confetti canvas', async () => {
    // jsdom ships no `canvas` package, so 2D contexts are unavailable;
    // usePodiumConfetti's feature-detection guard should make firing a
    // silent no-op rather than throwing from inside a rAF callback. If it
    // ever did throw, this render() call itself would throw synchronously.
    const war = await playThroughToConcluded({}, 'alice')
    expect(() => renderPodiumPage(war)).not.toThrow()
  })
})
