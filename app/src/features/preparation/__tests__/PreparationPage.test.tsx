import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { IDBFactory } from 'fake-indexeddb'
import '../../../i18n'
import { PreparationPage } from '../PreparationPage'
import { useWarStore } from '../../../store/warStore'
import {
  DEFAULT_CUSTOM_OPTIONS,
  DEFAULT_VOTE_POINTS,
  DEFAULT_WIN_POINTS,
  type WarConfig,
} from '../../../domain/warTypes'
import type { War } from '../../../domain/warTypes'

function config(overrides: Partial<WarConfig> = {}): WarConfig {
  return {
    players: [
      { id: 'alice', name: 'Alice' },
      { id: 'bob', name: 'Bob' },
    ],
    disabledCardIds: [],
    globalCount: 2,
    personalCount: 3,
    scoreCount: 1,
    gameMode: 'normal',
    customOptions: DEFAULT_CUSTOM_OPTIONS,
    winPoints: DEFAULT_WIN_POINTS,
    votePoints: DEFAULT_VOTE_POINTS,
    ...overrides,
  }
}

function emptyPoolFetchMock() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: [], has_more: false, total_cards: 0 }),
  }) as unknown as typeof fetch
}

function renderAtWar(war: War) {
  return render(
    <MemoryRouter initialEntries={[`/war/${war.id}/preparation`]}>
      <Routes>
        <Route path="/war/:warId/preparation" element={<PreparationPage />} />
        <Route path="/war/:warId/personal-draw" element={<div>personal draw screen</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PreparationPage', () => {
  beforeEach(() => {
    localStorage.clear()
    // Fresh IndexedDB per test so the commander-pool cache never leaks
    // between tests (mirrors src/data/__tests__/commanderPoolCache.test.ts).
    ;(globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
    useWarStore.setState({
      war: null,
      warList: [],
      warListLoaded: false,
      commanderPool: null,
      commanderPoolStatus: { stage: 'reading-cache' },
    })
    globalThis.fetch = emptyPoolFetchMock()
  })

  it('shows a stage-appropriate loading screen while the commander pool is being fetched', async () => {
    let resolveFetch: (value: unknown) => void = () => {}
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        }),
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const war = await useWarStore.getState().startNewWar(config(), 1)
    renderAtWar(war)

    expect(await screen.findByText(/summoning the commander archive/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /start war/i })).not.toBeInTheDocument()

    // 'reading-cache' and 'fetching' render the same loading text, so wait
    // for the mock to actually have been invoked before resolving it —
    // otherwise `resolveFetch` may still point at a stale/never-called
    // promise from before the real fetch() call happened.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    resolveFetch({ ok: true, json: async () => ({ data: [], has_more: false, total_cards: 0 }) })

    expect(await screen.findByRole('button', { name: /start war/i })).toBeInTheDocument()
  })

  it('shows the intro and Start War button once the commander pool is ready', async () => {
    const war = await useWarStore.getState().startNewWar(config(), 1)
    renderAtWar(war)

    expect(await screen.findByRole('button', { name: /start war/i })).toBeInTheDocument()
    expect(screen.getByText(/global and score modifiers are drawn/i)).toBeInTheDocument()
  })

  it('runs the preparation draw and reveals the drawn cards plus a commander counter', async () => {
    const user = userEvent.setup()
    const war = await useWarStore.getState().startNewWar(config(), 1)
    renderAtWar(war)

    await user.click(await screen.findByRole('button', { name: /start war/i }))

    await waitFor(() => {
      expect(useWarStore.getState().war?.preparationDrawComplete).toBe(true)
    })
    expect(screen.getByText('Global Modifiers')).toBeInTheDocument()
    expect(screen.getByText('Score Modifiers')).toBeInTheDocument()
    expect(screen.getByText(/\d+ potential commanders?/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue to personal draws/i })).toBeInTheDocument()
  })

  it('renders a face-down deck stack beside each reveal (the "drawn from a deck" animation)', async () => {
    const user = userEvent.setup()
    const war = await useWarStore.getState().startNewWar(config(), 1)
    renderAtWar(war)

    await user.click(await screen.findByRole('button', { name: /start war/i }))

    await waitFor(() => {
      expect(useWarStore.getState().war?.preparationDrawComplete).toBe(true)
    })
    // One deck stack for the global-modifiers panel, one for score
    // modifiers — each rendered as 3 decorative (aria-hidden) card backs.
    expect(screen.getAllByText('🂠')).toHaveLength(6)
  })

  it('shows "none drawn" for an empty modifier deck', async () => {
    await useWarStore.getState().startNewWar(config({ scoreCount: 0 }), 1)
    await useWarStore.getState().dispatch({ type: 'RUN_PREPARATION_DRAW' })
    renderAtWar(useWarStore.getState().war!)

    await screen.findByText('Score Modifiers')
    expect(useWarStore.getState().war?.activeScoreModifiers).toHaveLength(0)
    expect(screen.getByText(/none drawn this war/i)).toBeInTheDocument()
  })

  it('continuing advances the phase and navigates to the personal draw screen', async () => {
    const user = userEvent.setup()
    await useWarStore.getState().startNewWar(config(), 1)
    await useWarStore.getState().dispatch({ type: 'RUN_PREPARATION_DRAW' })
    renderAtWar(useWarStore.getState().war!)

    const continueButton = await screen.findByRole('button', {
      name: /continue to personal draws/i,
    })
    await user.click(continueButton)

    await waitFor(() => {
      expect(screen.getByText('personal draw screen')).toBeInTheDocument()
    })
    expect(useWarStore.getState().war?.phase).toBe('personal-draw')
  })
})
