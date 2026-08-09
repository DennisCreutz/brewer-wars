import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { IDBFactory } from 'fake-indexeddb'
import '../../../i18n'
import { CommanderSelectionPage } from '../CommanderSelectionPage'
import { useWarStore } from '../../../store/warStore'
import { FakeAuthProvider } from '../../../test/FakeAuthProvider'
import {
  createPlayerWarState,
  DEFAULT_CUSTOM_OPTIONS,
  DEFAULT_VOTE_POINTS,
  DEFAULT_WIN_POINTS,
  type War,
  type WarConfig,
} from '../../../domain/warTypes'
import type { ModifierCard } from '../../../domain/cardTypes'
import type { CommanderSummary } from '../../../domain/commanderCheck'
import type { CommanderPoolStage } from '../../../data/commanderPoolCache'

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

function buildWar(overrides: Partial<War> = {}): War {
  const now = new Date().toISOString()
  return {
    id: 'war-cs-test',
    seed: 1,
    createdAt: now,
    updatedAt: now,
    hostUserId: 'user-alice',
    phase: 'commander-selection',
    config: config(),
    globalDeck: { modifier: 'global', drawPile: [], drawnCards: [] },
    scoreDeck: { modifier: 'score', drawPile: [], drawnCards: [] },
    personalDecks: { mode: 'shared', deck: { modifier: 'personal', drawPile: [], drawnCards: [] } },
    preparationDrawComplete: true,
    activeGlobalModifiers: [],
    activeScoreModifiers: [],
    players: [createPlayerWarState('alice'), createPlayerWarState('bob')],
    scoring: { gameWinnerId: null, scoreCardTally: {} },
    finalScore: null,
    ...overrides,
  }
}

function commander(
  id: string,
  name: string,
  colorIdentity: string[] = [],
  overrides: Partial<CommanderSummary> = {},
): CommanderSummary {
  return {
    id,
    name,
    colorIdentity,
    typeLine: 'Legendary Creature — Human',
    keywords: [],
    hasFlavorText: false,
    rarity: 'rare',
    cmc: 3,
    edhrecRank: null,
    numDecks: null,
    scryfallUri: `https://scryfall.com/card/${id}`,
    artCropUrl: null,
    imageUrl: null,
    ...overrides,
  }
}

const colourWCard: ModifierCard = {
  id: 'colour-w-test',
  name: 'Colour W',
  description: 'Your commander must be exactly mono-white.',
  artPrompt: '',
  modifier: 'personal',
  category: 'colour',
  target: 'commander',
  difficulty: 1,
  solo: false,
  commanderCheck: { kind: 'colorIdentityExact', colors: ['W'] },
}

const hatCard: ModifierCard = {
  id: 'commander-hat-test',
  name: 'Silly Hat Commander',
  description: 'Your commander must be depicted wearing a hat.',
  artPrompt: '',
  modifier: 'personal',
  category: 'commanderArt',
  target: 'commander',
  difficulty: 2,
  solo: false,
}

const globalFlavorCard: ModifierCard = {
  id: 'global-flavor-test',
  name: 'Poets Only',
  description: 'Every commander in this war must have flavor text.',
  artPrompt: '',
  modifier: 'global',
  category: 'untyped',
  target: 'commander',
  difficulty: 1,
  solo: false,
  commanderCheck: { kind: 'hasFlavorText' },
}

const globalArtCard: ModifierCard = {
  id: 'global-art-test',
  name: 'Ancient Hat Mandate',
  description: 'Every commander in this war must be depicted wearing a hat.',
  artPrompt: '',
  modifier: 'global',
  category: 'commanderArt',
  target: 'commander',
  difficulty: 2,
  solo: false,
}

function renderPage(
  war: War,
  pool: CommanderSummary[] = [],
  stage: CommanderPoolStage = 'ready',
  sub = 'user-alice',
) {
  useWarStore.setState({ war, commanderPool: pool, commanderPoolStatus: { stage } })
  return render(
    <FakeAuthProvider sub={sub}>
      <MemoryRouter initialEntries={[`/war/${war.id}/commander-selection`]}>
        <Routes>
          <Route path="/war/:warId/commander-selection" element={<CommanderSelectionPage />} />
          <Route path="/war/:warId/overview" element={<div>Overview Route</div>} />
        </Routes>
      </MemoryRouter>
    </FakeAuthProvider>,
  )
}

describe('CommanderSelectionPage', () => {
  beforeEach(() => {
    localStorage.clear()
    ;(globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
    useWarStore.setState({
      war: null,
      warList: [],
      warListLoaded: false,
      commanderPool: null,
      commanderPoolStatus: { stage: 'reading-cache' },
    })
  })

  it('shows a waiting screen for a member whose turn it is not', () => {
    renderPage(buildWar(), [commander('1', 'Alpha Prime', ['W'])], 'ready', 'user-spectator')
    expect(screen.getByText(/waiting on the players below/i)).toBeInTheDocument()
    expect(screen.queryByText('Alpha Prime')).not.toBeInTheDocument()
  })

  it(
    'reveals a filtered, searchable grid for the signed-in player, applies constraints ' +
      'transparently, shows the manual checklist without blocking selection, and locking in ' +
      'moves them to the waiting screen',
    async () => {
      const user = userEvent.setup()
      const war = buildWar({
        players: [
          { ...createPlayerWarState('alice'), personalModifiers: [colourWCard, hatCard] },
          createPlayerWarState('bob'),
        ],
      })
      renderPage(war, [
        commander('1', 'Alpha Prime', ['W']),
        commander('2', 'Beta Storm', ['U']),
        commander('3', 'Gamma Wolf', ['W']),
      ])

      // Transparency: the checkable rule that was actually applied.
      expect(await screen.findByText(/colour w applied/i)).toBeInTheDocument()

      // The colorIdentityExact:['W'] constraint excludes the blue commander.
      expect(screen.getByText('Alpha Prime')).toBeInTheDocument()
      expect(screen.getByText('Gamma Wolf')).toBeInTheDocument()
      expect(screen.queryByText('Beta Storm')).not.toBeInTheDocument()

      // The manual (uncheckable) rule renders as a non-blocking checklist.
      expect(screen.getByText('Silly Hat Commander')).toBeInTheDocument()
      const hatCheckbox = screen.getByRole('checkbox', { name: /silly hat commander/i })
      expect(hatCheckbox).not.toBeChecked()
      await user.click(hatCheckbox)
      expect(hatCheckbox).toBeChecked()

      // Search narrows the grid client-side.
      await user.type(screen.getByPlaceholderText(/search commanders/i), 'Alpha')
      expect(screen.getByText('Alpha Prime')).toBeInTheDocument()
      expect(screen.queryByText('Gamma Wolf')).not.toBeInTheDocument()

      // Selecting + locking in is unaffected by the manual checklist state.
      await user.click(screen.getByText('Alpha Prime'))
      await user.click(screen.getByRole('button', { name: /lock in this commander/i }))

      // Alice is locked in and her own screen moves to waiting (concurrent
      // model — bob isn't gated behind her any more, see ui/TurnGate.tsx).
      expect(await screen.findByText(/waiting for the others/i)).toBeInTheDocument()
      const alice = useWarStore.getState().war?.players.find((p) => p.playerId === 'alice')
      expect(alice?.commanderLocked).toBe(true)
      expect(alice?.commander).toEqual({
        scryfallId: '1',
        name: 'Alpha Prime',
        imageUrl: undefined,
      })
    },
  )

  it('shows a no-results message when the search matches nothing', async () => {
    const user = userEvent.setup()
    renderPage(buildWar(), [commander('1', 'Alpha Prime')])
    await user.type(screen.getByPlaceholderText(/search commanders/i), 'zzz-no-such-commander')
    expect(await screen.findByText(/no commanders match every rule/i)).toBeInTheDocument()
  })

  it('paginates a large pool and reveals more via Load More', async () => {
    const user = userEvent.setup()
    const pool = Array.from({ length: 75 }, (_, i) =>
      commander(String(i), `Commander ${String(i).padStart(2, '0')}`),
    )
    renderPage(buildWar(), pool)

    expect(screen.getByText('Showing 60 of 75 commanders')).toBeInTheDocument()
    const loadMore = screen.getByRole('button', { name: /load 15 more/i })

    await user.click(loadMore)

    expect(screen.getByText('Showing 75 of 75 commanders')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /load.*more/i })).not.toBeInTheDocument()
  })

  it('shows a loading screen instead of the grid while the commander pool is not ready', async () => {
    renderPage(buildWar(), [], 'fetching')
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/search commanders/i)).not.toBeInTheDocument()
  })

  it('fetches the commander pool itself when navigated to directly (pool starts null)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [], has_more: false, total_cards: 0 }),
    }) as unknown as typeof fetch

    const war = buildWar()
    useWarStore.setState({
      war,
      commanderPool: null,
      commanderPoolStatus: { stage: 'reading-cache' },
    })
    render(
      <FakeAuthProvider sub="user-alice">
        <MemoryRouter initialEntries={[`/war/${war.id}/commander-selection`]}>
          <Routes>
            <Route path="/war/:warId/commander-selection" element={<CommanderSelectionPage />} />
          </Routes>
        </MemoryRouter>
      </FakeAuthProvider>,
    )

    await waitFor(() => {
      expect(useWarStore.getState().commanderPool).not.toBeNull()
    })
  })

  it('shows a completion summary once everyone has locked in, and advances to the overview phase', async () => {
    const user = userEvent.setup()
    const war = buildWar({
      players: [
        {
          ...createPlayerWarState('alice'),
          commander: { scryfallId: '1', name: 'Alpha Prime' },
          commanderLocked: true,
        },
        {
          ...createPlayerWarState('bob'),
          commander: { scryfallId: '2', name: 'Beta Storm' },
          commanderLocked: true,
        },
      ],
    })
    renderPage(war, [])

    expect(screen.getByText(/everyone has chosen a commander/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /continue to overview/i }))

    expect(await screen.findByText('Overview Route')).toBeInTheDocument()
    expect(useWarStore.getState().war?.phase).toBe('overview')
  })

  describe('browsing filters', () => {
    it('filters by colour identity, respecting the "at least" vs. "exactly" mode', async () => {
      const user = userEvent.setup()
      renderPage(buildWar(), [
        commander('1', 'Mono White Knight', ['W']),
        commander('2', 'Azorius Strategist', ['W', 'U']),
        commander('3', 'Blue Loner', ['U']),
      ])

      // Default mode is "at least": White should keep both W and W/U.
      await user.click(screen.getByRole('button', { name: 'White' }))
      expect(screen.getByText('Mono White Knight')).toBeInTheDocument()
      expect(screen.getByText('Azorius Strategist')).toBeInTheDocument()
      expect(screen.queryByText('Blue Loner')).not.toBeInTheDocument()

      // Switching to "exactly" narrows down to only the mono-white one.
      await user.click(screen.getByRole('radio', { name: /exactly these colours/i }))
      expect(screen.getByText('Mono White Knight')).toBeInTheDocument()
      expect(screen.queryByText('Azorius Strategist')).not.toBeInTheDocument()
      expect(screen.queryByText('Blue Loner')).not.toBeInTheDocument()
    })

    it('filters by mana value using the selected comparison operator', async () => {
      const user = userEvent.setup()
      renderPage(buildWar(), [
        commander('1', 'Cheap Commander', [], { cmc: 2 }),
        commander('2', 'Mid Commander', [], { cmc: 4 }),
        commander('3', 'Big Commander', [], { cmc: 6 }),
      ])

      await user.selectOptions(
        screen.getByRole('combobox', { name: /mana value comparison/i }),
        'gte',
      )
      await user.type(screen.getByRole('spinbutton', { name: /mana value/i }), '4')

      expect(screen.queryByText('Cheap Commander')).not.toBeInTheDocument()
      expect(screen.getByText('Mid Commander')).toBeInTheDocument()
      expect(screen.getByText('Big Commander')).toBeInTheDocument()
    })

    it('sorts the grid by the selected sort key', async () => {
      const user = userEvent.setup()
      const { container } = renderPage(buildWar(), [
        commander('1', 'Zephyr Warden', []),
        commander('2', 'Atraxa Ascendant', []),
        commander('3', 'Mondrak Prime', []),
      ])

      await user.selectOptions(screen.getByRole('combobox', { name: /sort by/i }), 'name')

      const html = container.innerHTML
      const posAtraxa = html.indexOf('Atraxa Ascendant')
      const posMondrak = html.indexOf('Mondrak Prime')
      const posZephyr = html.indexOf('Zephyr Warden')
      expect(posAtraxa).toBeGreaterThan(-1)
      expect(posAtraxa).toBeLessThan(posMondrak)
      expect(posMondrak).toBeLessThan(posZephyr)
    })

    it('only shows "Clear Filters" once a filter is active, and resets browsing state on click', async () => {
      const user = userEvent.setup()
      renderPage(buildWar(), [
        commander('1', 'Mono White Knight', ['W']),
        commander('2', 'Blue Loner', ['U']),
      ])

      expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'White' }))
      expect(screen.queryByText('Blue Loner')).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /clear filters/i }))

      expect(screen.getByText('Blue Loner')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument()
    })

    it('keeps a made selection lockable even after changing filters afterwards', async () => {
      const user = userEvent.setup()
      renderPage(buildWar(), [
        commander('1', 'Mono White Knight', ['W']),
        commander('2', 'Blue Loner', ['U']),
      ])

      await user.click(screen.getByText('Mono White Knight'))
      expect(screen.getByRole('button', { name: /lock in this commander/i })).toBeInTheDocument()

      // Filtering the grid down to exclude the pick shouldn't drop it from
      // the floating confirmation bar.
      await user.click(screen.getByRole('button', { name: 'Blue' }))
      expect(screen.queryByRole('button', { name: 'Mono White Knight' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /lock in this commander/i })).toBeInTheDocument()
    })
  })

  describe('global vs. personal modifier panels', () => {
    it('shows an empty-state message on both sides when no commander-target modifiers are active', async () => {
      renderPage(buildWar(), [commander('1', 'Alpha Prime')])

      expect(screen.getByRole('heading', { name: /global commander rules/i })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /your commander rules/i })).toBeInTheDocument()
      expect(screen.getAllByText(/no commander-specific modifiers here/i)).toHaveLength(2)
    })

    it('splits global modifiers into the left panel and personal modifiers into the right panel', async () => {
      const war = buildWar({
        activeGlobalModifiers: [globalFlavorCard, globalArtCard],
        players: [
          { ...createPlayerWarState('alice'), personalModifiers: [colourWCard, hatCard] },
          createPlayerWarState('bob'),
        ],
      })
      renderPage(war, [
        commander('1', 'Alpha Prime', ['W'], { hasFlavorText: true }),
        commander('2', 'Beta Storm', ['U'], { hasFlavorText: true }),
        commander('3', 'Gamma Wolf', ['W'], { hasFlavorText: false }),
      ])

      // Sanity check: both the global (flavor text) and personal (colour)
      // checkable constraints are enforced together on the actual grid —
      // only the commander satisfying every one of them appears.
      expect(await screen.findByText('Alpha Prime')).toBeInTheDocument()
      expect(screen.queryByText('Beta Storm')).not.toBeInTheDocument()
      expect(screen.queryByText('Gamma Wolf')).not.toBeInTheDocument()

      const globalPanel = screen.getByRole('heading', { name: /global commander rules/i })
        .parentElement as HTMLElement
      const personalPanel = screen.getByRole('heading', { name: /your commander rules/i })
        .parentElement as HTMLElement

      expect(within(globalPanel).getByText(/poets only applied/i)).toBeInTheDocument()
      expect(within(globalPanel).getByText('Ancient Hat Mandate')).toBeInTheDocument()
      expect(within(globalPanel).queryByText(/colour w applied/i)).not.toBeInTheDocument()
      expect(within(globalPanel).queryByText('Silly Hat Commander')).not.toBeInTheDocument()

      expect(within(personalPanel).getByText(/colour w applied/i)).toBeInTheDocument()
      expect(within(personalPanel).getByText('Silly Hat Commander')).toBeInTheDocument()
      expect(within(personalPanel).queryByText(/poets only applied/i)).not.toBeInTheDocument()
      expect(within(personalPanel).queryByText('Ancient Hat Mandate')).not.toBeInTheDocument()
    })
  })
})
