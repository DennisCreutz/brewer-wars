import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '../../i18n'
import { PageShell } from '../PageShell'
import { useWarStore } from '../../store/warStore'
import type { War } from '../../domain/warTypes'

function renderPageShell() {
  return render(
    <MemoryRouter initialEntries={['/war/some-war/preparation']}>
      <Routes>
        <Route path="/war/:warId/preparation" element={<PageShell title="Preparation">content</PageShell>} />
        <Route path="/" element={<div>landing-page-marker</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PageShell', () => {
  beforeEach(() => {
    useWarStore.setState({
      war: { id: 'some-war' } as War,
      warList: [],
      warListLoaded: false,
      commanderPool: null,
      commanderPoolStatus: { stage: 'reading-cache' },
    })
  })

  it('renders the title and a Main Menu button on every screen', () => {
    renderPageShell()
    expect(screen.getByText('Preparation')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /main menu/i })).toBeInTheDocument()
  })

  it('navigates home and clears the loaded war when Main Menu is clicked', async () => {
    const user = userEvent.setup()
    renderPageShell()

    await user.click(screen.getByRole('button', { name: /main menu/i }))

    expect(await screen.findByText('landing-page-marker')).toBeInTheDocument()
    expect(useWarStore.getState().war).toBeNull()
  })
})
