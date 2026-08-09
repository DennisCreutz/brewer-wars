import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import '../../../i18n'
import { WizardPage } from '../WizardPage'
import { useWarStore } from '../../../store/warStore'
import { FakeAuthProvider } from '../../../test/FakeAuthProvider'
import { MAX_PLAYERS, MIN_PLAYERS } from '../../../domain/warTypes'
import * as usersApi from '../../../data/usersApi'

const USERS = [
  { sub: 'user-alice', email: 'alice@example.com' },
  { sub: 'user-bob', email: 'bob@example.com' },
  { sub: 'user-carol', email: 'carol@example.com' },
  { sub: 'user-dave', email: 'dave@example.com' },
  { sub: 'user-erin', email: 'erin@example.com' },
  { sub: 'user-frank', email: 'frank@example.com' },
  { sub: 'user-gina', email: 'gina@example.com' },
  { sub: 'user-hank', email: 'hank@example.com' },
]

function renderWizard() {
  return render(
    <FakeAuthProvider sub="test-host">
      <MemoryRouter initialEntries={['/new']}>
        <WizardPage />
      </MemoryRouter>
    </FakeAuthProvider>,
  )
}

/** Selects the given number of user cards from the hero-select grid, in
 * order — the card grid replaced free-text name entry (see
 * features/wizard/steps/PlayersStep.tsx). */
async function selectPlayers(user: ReturnType<typeof userEvent.setup>, count: number) {
  const cards = await screen.findAllByRole('button', { pressed: false })
  for (let i = 0; i < count; i++) {
    await user.click(cards[i])
  }
}

beforeEach(() => {
  localStorage.clear()
  useWarStore.setState({
    war: null,
    warList: [],
    warListLoaded: false,
    commanderPool: null,
    commanderPoolStatus: { stage: 'reading-cache' },
  })
  vi.spyOn(usersApi, 'fetchAllUsers').mockResolvedValue(USERS)
})

describe('WizardPage', () => {
  it('renders the players step with a card per account, none selected, Next disabled', async () => {
    renderWizard()

    const cards = await screen.findAllByRole('button', { pressed: false })
    expect(cards).toHaveLength(USERS.length)
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('enables Next once between MIN_PLAYERS and MAX_PLAYERS accounts are selected', async () => {
    const user = userEvent.setup()
    renderWizard()

    await selectPlayers(user, 4)
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
  })

  it('enforces MAX_PLAYERS by disabling unselected cards once the ceiling is hit', async () => {
    const user = userEvent.setup()
    renderWizard()

    await selectPlayers(user, MAX_PLAYERS)
    const unselected = screen.queryAllByRole('button', { pressed: false })
    expect(unselected.every((btn) => (btn as HTMLButtonElement).disabled)).toBe(true)
  })

  it('toggles a card off when clicked again, dropping the player count below MIN_PLAYERS is allowed by the grid (Next disables itself)', async () => {
    const user = userEvent.setup()
    renderWizard()

    await selectPlayers(user, MIN_PLAYERS)
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()

    const selected = await screen.findAllByRole('button', { pressed: true })
    await user.click(selected[0])
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('recomputes wizard limits live as advanced cards are disabled, clamping the affected stepper', async () => {
    const user = userEvent.setup()
    renderWizard()

    await selectPlayers(user, 4)
    await user.click(screen.getByRole('button', { name: 'Next' })) // -> Modifiers step

    const globalInput = screen.getByRole('spinbutton', { name: /global modifiers to draw/i })
    expect(globalInput).toHaveValue(1) // the wizard's sensible non-zero default

    await user.click(screen.getByRole('button', { name: /advanced/i }))

    // The global deck has exactly 3 categories (rarity, price, deckCount — see
    // domain/__tests__/validation.test.ts). Disabling every card in all three
    // via each group's "select none" drops the global ceiling to 0.
    const selectNoneButtons = screen.getAllByRole('button', { name: /select none/i })
    for (const button of selectNoneButtons.slice(0, 3)) {
      await user.click(button)
    }

    expect(globalInput).toHaveValue(0)
    expect(screen.getByText(/up to 0/i)).toBeInTheDocument()
  })

  it('walks through every step and calls startNewWar with the assembled config on Start War', async () => {
    const user = userEvent.setup()
    renderWizard()

    // Step 1: Players — pick 4 accounts from the hero-select grid.
    await selectPlayers(user, 4)
    await user.click(screen.getByRole('button', { name: 'Next' }))

    // Step 2: Modifiers — three steppers, defaults accepted as-is.
    expect(screen.getAllByRole('spinbutton')).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: 'Next' }))

    // Step 3: Game Mode — "Normal" is selected by default.
    expect(screen.getByRole('radio', { name: /normal/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /custom/i })).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Next' }))

    // Step 4: Points — two steppers, defaults accepted as-is.
    expect(screen.getAllByRole('spinbutton')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Next' }))

    // Step 5: Review — every configured player shows up in the summary.
    expect(screen.getByRole('heading', { name: /ready for war/i })).toBeInTheDocument()
    for (const { email } of USERS.slice(0, 4)) {
      expect(screen.getByText(email)).toBeInTheDocument()
    }

    await user.click(screen.getByRole('button', { name: /start war/i }))

    await waitFor(() => expect(useWarStore.getState().war).not.toBeNull())

    const war = useWarStore.getState().war!
    expect(war.phase).toBe('preparation')
    expect(war.hostUserId).toBe('test-host')
    expect(war.config.players.map((p) => p.userId)).toEqual(USERS.slice(0, 4).map((u) => u.sub))
    expect(war.config.players.map((p) => p.name)).toEqual(USERS.slice(0, 4).map((u) => u.email))
    expect(war.config.disabledCardIds).toEqual([])
    expect(war.config.globalCount).toBe(1)
    expect(war.config.personalCount).toBe(3)
    expect(war.config.scoreCount).toBe(1)
    expect(war.config.gameMode).toBe('normal')
    expect(war.config.winPoints).toBe(2)
    expect(war.config.votePoints).toBe(1)

    // Persisted, not just held in memory (mirrors store/__tests__/warStore.test.ts).
    const reloaded = await useWarStore.getState().loadWar(war.id)
    expect(reloaded?.id).toBe(war.id)
  })
})
