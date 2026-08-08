import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '../../../i18n'
import { OverviewPage } from '../OverviewPage'
import { useWarStore } from '../../../store/warStore'
import {
  createPlayerWarState,
  DEFAULT_CUSTOM_OPTIONS,
  DEFAULT_VOTE_POINTS,
  DEFAULT_WIN_POINTS,
  type War,
  type WarConfig,
} from '../../../domain/warTypes'
import type { ModifierCard } from '../../../domain/cardTypes'

function config(overrides: Partial<WarConfig> = {}): WarConfig {
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
    ...overrides,
  }
}

const globalCard: ModifierCard = {
  id: 'global-test',
  name: 'Global Test Card',
  description: 'A global modifier affecting everyone.',
  artPrompt: '',
  modifier: 'global',
  category: 'rarity',
  target: 'deck',
  difficulty: 1,
  solo: false,
}

const scoreCard: ModifierCard = {
  id: 'score-test',
  name: 'Score Test Card',
  description: 'A score modifier worth points.',
  artPrompt: '',
  modifier: 'score',
  category: 'untyped',
  target: 'game',
  difficulty: 1,
  solo: false,
  repeatable: false,
}

const personalCard: ModifierCard = {
  id: 'personal-test',
  name: 'Personal Test Card',
  description: 'A personal modifier for one player.',
  artPrompt: '',
  modifier: 'personal',
  category: 'theme',
  target: 'deck',
  difficulty: 2,
  solo: false,
}

function buildWar(overrides: Partial<War> = {}): War {
  const now = new Date().toISOString()
  return {
    id: 'war-ov-test',
    seed: 1,
    createdAt: now,
    updatedAt: now,
    hostUserId: 'user-alice',
    phase: 'overview',
    config: config(),
    globalDeck: { modifier: 'global', drawPile: [], drawnCards: [] },
    scoreDeck: { modifier: 'score', drawPile: [], drawnCards: [] },
    personalDecks: { mode: 'shared', deck: { modifier: 'personal', drawPile: [], drawnCards: [] } },
    preparationDrawComplete: true,
    activeGlobalModifiers: [globalCard],
    activeScoreModifiers: [scoreCard],
    players: [
      {
        ...createPlayerWarState('alice'),
        personalModifiers: [personalCard],
        commander: { scryfallId: '1', name: 'Alpha Prime' },
        commanderLocked: true,
      },
      {
        ...createPlayerWarState('bob'),
        personalModifiers: [personalCard],
        commander: { scryfallId: '2', name: 'Beta Storm' },
        commanderLocked: true,
      },
    ],
    scoring: { gameWinnerId: null, scoreCardTally: {} },
    finalScore: null,
    ...overrides,
  }
}

function renderPage(war: War) {
  useWarStore.setState({ war })
  return render(
    <MemoryRouter initialEntries={[`/war/${war.id}/overview`]}>
      <Routes>
        <Route path="/war/:warId/overview" element={<OverviewPage />} />
        <Route path="/war/:warId/scoring" element={<div>Scoring Route</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('OverviewPage', () => {
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

  it('always shows global and score modifiers, and personal modifiers by default, but never the commander', () => {
    renderPage(buildWar())

    expect(screen.getByText('Global Modifiers')).toBeInTheDocument()
    expect(screen.getByText('Global Test Card')).toBeInTheDocument()
    expect(screen.getByText('Score Modifiers')).toBeInTheDocument()
    expect(screen.getByText('Score Test Card')).toBeInTheDocument()

    expect(screen.getByText("Alice's Modifiers")).toBeInTheDocument()
    expect(screen.getByText("Bob's Modifiers")).toBeInTheDocument()
    // One personal-modifier card rendered per player (not hidden in normal mode).
    expect(screen.getAllByText('Personal Test Card')).toHaveLength(2)

    // Commander is NEVER revealed on this screen, regardless of any hidden setting.
    expect(screen.queryByText('Alpha Prime')).not.toBeInTheDocument()
    expect(screen.queryByText('Beta Storm')).not.toBeInTheDocument()
    // One "Hidden until scoring" placeholder per player, for the commander only.
    expect(screen.getAllByText('Hidden until scoring')).toHaveLength(2)
  })

  it('hides personal modifiers behind a placeholder when hiddenPersonalModifiers is enabled', () => {
    const war = buildWar({
      config: config({
        gameMode: 'custom',
        customOptions: { ...DEFAULT_CUSTOM_OPTIONS, hiddenPersonalModifiers: true },
      }),
    })
    renderPage(war)

    expect(screen.queryByText('Personal Test Card')).not.toBeInTheDocument()
    // Now both the commander AND the personal modifiers are hidden per player (2 x 2 = 4).
    expect(screen.getAllByText('Hidden until scoring')).toHaveLength(4)
  })

  it('shows a "none drawn" placeholder when there are no global or score modifiers', () => {
    renderPage(buildWar({ activeGlobalModifiers: [], activeScoreModifiers: [] }))
    expect(screen.getAllByText('None drawn this war.').length).toBeGreaterThanOrEqual(2)
  })

  it('advances to the scoring phase when Begin the Battle is clicked', async () => {
    const user = userEvent.setup()
    const war = buildWar()
    renderPage(war)

    await user.click(screen.getByRole('button', { name: /begin the battle/i }))

    expect(await screen.findByText('Scoring Route')).toBeInTheDocument()
    expect(useWarStore.getState().war?.phase).toBe('scoring')
  })
})
