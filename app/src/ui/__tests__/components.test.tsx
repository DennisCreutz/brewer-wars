import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '../../i18n'
import { PlayerBadge } from '../PlayerBadge'
import { ModifierCardView } from '../ModifierCardView'
import { CommanderCounter } from '../CommanderCounter'
import { useWarStore } from '../../store/warStore'
import cardsData from '../../data/generated/cards.json'
import type { ModifierCard } from '../../domain/cardTypes'

const cards = cardsData as ModifierCard[]

describe('PlayerBadge', () => {
  it('renders the player name', () => {
    render(<PlayerBadge playerId="alice" name="Alice" />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('shows the first letter of the name, uppercased, as the avatar', () => {
    render(<PlayerBadge playerId="alice" name="bob" />)
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('is deterministic — same id always gets the same ring/background colour regardless of name', () => {
    const { container: c1 } = render(<PlayerBadge playerId="alice" name="Alice" />)
    const { container: c2 } = render(<PlayerBadge playerId="alice" name="Zed" />)
    const avatar1 = c1.querySelector('span[aria-hidden]')
    const avatar2 = c2.querySelector('span[aria-hidden]')
    expect(avatar1?.className).toBe(avatar2?.className)
    // ...but the letter itself does follow the (different) name.
    expect(avatar1?.textContent).toBe('A')
    expect(avatar2?.textContent).toBe('Z')
  })

  it('shows the commander portrait instead of the letter once one is provided', () => {
    const { container } = render(
      <PlayerBadge playerId="alice" name="Alice" commanderImageUrl="https://example.com/art.jpg" />,
    )
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', 'https://example.com/art.jpg')
    expect(screen.queryByText('A')).not.toBeInTheDocument()
  })
})

describe('ModifierCardView', () => {
  it('renders a card name, category, and description', () => {
    const card = cards.find((c) => c.id === 'tribal-angel')!
    render(<ModifierCardView card={card} />)
    expect(screen.getByText('Tribal Angel')).toBeInTheDocument()
    expect(screen.getByText(card.description)).toBeInTheDocument()
  })

  it('renders the modifier kind badge', () => {
    const globalCard = cards.find((c) => c.modifier === 'global')!
    render(<ModifierCardView card={globalCard} />)
    expect(screen.getByText('Global')).toBeInTheDocument()
  })
})

describe('CommanderCounter', () => {
  it('shows a loading state when the pool has not been fetched yet', () => {
    useWarStore.setState({ commanderPool: null })
    const flyingCard = cards.find((c) => c.id === 'must-have-flying')!
    render(<CommanderCounter modifiers={[flyingCard]} />)
    expect(screen.getAllByText(/loading/i).length).toBeGreaterThan(0)
  })

  it('shows a live count once the pool is loaded', () => {
    useWarStore.setState({
      commanderPool: [
        {
          id: '1',
          name: 'Test',
          colorIdentity: [],
          typeLine: 'Legendary Creature — Bird',
          keywords: ['Flying'],
          hasFlavorText: false,
          rarity: 'rare',
          cmc: 3,
          edhrecRank: null,
          numDecks: null,
          scryfallUri: '',
          artCropUrl: null,
          imageUrl: null,
        },
      ],
    })
    const flyingCard = cards.find((c) => c.id === 'must-have-flying')!
    render(<CommanderCounter modifiers={[flyingCard]} />)
    expect(screen.getByText(/1 potential commander/)).toBeInTheDocument()
  })
})
