import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import '../../../i18n'
import { WizardPage } from '../WizardPage'
import { useWarStore } from '../../../store/warStore'
import { DEFAULT_PLAYER_COUNT, MAX_PLAYERS, MIN_PLAYERS } from '../../../domain/warTypes'

function renderWizard() {
  return render(
    <MemoryRouter initialEntries={['/new']}>
      <WizardPage />
    </MemoryRouter>,
  )
}

async function fillPlayerNames(user: ReturnType<typeof userEvent.setup>, names: readonly string[]) {
  const inputs = screen.getAllByRole('textbox')
  for (const [i, input] of inputs.entries()) {
    await user.type(input, names[i] ?? `Player ${i + 1}`)
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
})

describe('WizardPage', () => {
  it('renders the players step with the default number of empty player inputs, Next disabled', () => {
    renderWizard()

    const nameInputs = screen.getAllByRole('textbox')
    expect(nameInputs).toHaveLength(DEFAULT_PLAYER_COUNT)
    for (const input of nameInputs) {
      expect(input).toHaveValue('')
    }
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('enables Next once every player name is filled in', async () => {
    const user = userEvent.setup()
    renderWizard()

    await fillPlayerNames(user, ['Alice', 'Bob', 'Carol', 'Dave'])
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
  })

  it('enforces MIN_PLAYERS..MAX_PLAYERS when adding/removing players', async () => {
    const user = userEvent.setup()
    renderWizard()

    // Starts at DEFAULT_PLAYER_COUNT (4); remove down to the MIN_PLAYERS floor.
    expect(screen.getAllByRole('textbox')).toHaveLength(DEFAULT_PLAYER_COUNT)
    while (screen.getAllByRole('textbox').length > MIN_PLAYERS) {
      await user.click(screen.getAllByRole('button', { name: /remove/i })[0])
    }
    expect(screen.getAllByRole('textbox')).toHaveLength(MIN_PLAYERS)
    for (const button of screen.getAllByRole('button', { name: /remove/i })) {
      expect(button).toBeDisabled()
    }

    // Add back up to the MAX_PLAYERS ceiling.
    const addButton = screen.getByRole('button', { name: /add player/i })
    while (screen.getAllByRole('textbox').length < MAX_PLAYERS) {
      await user.click(addButton)
    }
    expect(screen.getAllByRole('textbox')).toHaveLength(MAX_PLAYERS)
    expect(screen.getByRole('button', { name: /add player/i })).toBeDisabled()
  })

  it('recomputes wizard limits live as advanced cards are disabled, clamping the affected stepper', async () => {
    const user = userEvent.setup()
    renderWizard()

    await fillPlayerNames(user, ['Alice', 'Bob', 'Carol', 'Dave'])
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

    // Step 1: Players
    const names = ['Alice', 'Bob', 'Carol', 'Dave']
    await fillPlayerNames(user, names)
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

    // Step 5: Review — every configured player name shows up in the summary.
    expect(screen.getByRole('heading', { name: /ready for war/i })).toBeInTheDocument()
    for (const name of names) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }

    await user.click(screen.getByRole('button', { name: /start war/i }))

    await waitFor(() => expect(useWarStore.getState().war).not.toBeNull())

    const war = useWarStore.getState().war!
    expect(war.phase).toBe('preparation')
    expect(war.config.players.map((p) => p.name)).toEqual(names)
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
