import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import '../../../i18n'
import { LandingPage } from '../LandingPage'
import { useWarStore } from '../../../store/warStore'
import { FakeAuthProvider } from '../../../test/FakeAuthProvider'
import {
  DEFAULT_CUSTOM_OPTIONS,
  DEFAULT_VOTE_POINTS,
  DEFAULT_WIN_POINTS,
  type WarConfig,
} from '../../../domain/warTypes'

function config(): WarConfig {
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
  }
}

function renderLandingPage() {
  return render(
    <MemoryRouter>
      <FakeAuthProvider>
        <LandingPage />
      </FakeAuthProvider>
    </MemoryRouter>,
  )
}

describe('LandingPage', () => {
  beforeEach(() => {
    localStorage.clear()
    useWarStore.setState({ war: null, warList: [], warListLoaded: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not show the "Reset Games" button when there are no saved wars', async () => {
    renderLandingPage()
    await waitFor(() => expect(screen.getByText(/no wars yet/i)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /reset games/i })).not.toBeInTheDocument()
  })

  it('shows "Reset Games" once wars exist, and wipes them all after confirming', async () => {
    await useWarStore.getState().startNewWar(config(), 1)
    await useWarStore.getState().startNewWar(config(), 2)

    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderLandingPage()

    const resetButton = await screen.findByRole('button', { name: /reset games/i })
    await user.click(resetButton)

    await waitFor(() => expect(screen.getByText(/no wars yet/i)).toBeInTheDocument())
    expect(useWarStore.getState().warList).toEqual([])
  })

  it('does nothing if the confirm dialog is dismissed', async () => {
    await useWarStore.getState().startNewWar(config(), 3)
    await useWarStore.getState().refreshWarList()

    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderLandingPage()

    const resetButton = await screen.findByRole('button', { name: /reset games/i })
    await user.click(resetButton)

    expect(useWarStore.getState().warList.length).toBeGreaterThan(0)
  })
})
