import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '../../i18n'
import { HotSeatGate } from '../HotSeatGate'

describe('HotSeatGate', () => {
  it('shows the curtain first, hiding the children', () => {
    render(
      <HotSeatGate playerId="alice" playerName="Alice">
        <p>Secret content</p>
      </HotSeatGate>,
    )
    expect(screen.queryByText('Secret content')).not.toBeInTheDocument()
    expect(screen.getByText(/pass the device to alice/i)).toBeInTheDocument()
  })

  it('reveals children after tapping continue', async () => {
    const user = userEvent.setup()
    render(
      <HotSeatGate playerId="alice" playerName="Alice">
        <p>Secret content</p>
      </HotSeatGate>,
    )
    await user.click(screen.getByRole('button'))
    expect(screen.getByText('Secret content')).toBeInTheDocument()
  })

  it('re-shows the curtain when the active player changes', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <HotSeatGate playerId="alice" playerName="Alice">
        <p>Secret content</p>
      </HotSeatGate>,
    )
    await user.click(screen.getByRole('button'))
    expect(screen.getByText('Secret content')).toBeInTheDocument()

    rerender(
      <HotSeatGate playerId="bob" playerName="Bob">
        <p>Secret content</p>
      </HotSeatGate>,
    )
    expect(screen.queryByText('Secret content')).not.toBeInTheDocument()
    expect(screen.getByText(/pass the device to bob/i)).toBeInTheDocument()
  })
})
