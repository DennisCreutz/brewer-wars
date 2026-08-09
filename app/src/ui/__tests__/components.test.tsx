import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '../../i18n'
import { PlayerBadge } from '../PlayerBadge'
import { ModifierCardView } from '../ModifierCardView'
import { CommanderCounter } from '../CommanderCounter'
import { PlaceholderArt } from '../PlaceholderArt'
import { PlayerAvatar, isThomas, assignAvatars } from '../PlayerAvatar'
import { getCardIcon } from '../cardIcons'
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

describe('PlaceholderArt', () => {
  it('attempts to load generated art at the predictable per-card path', () => {
    const card = cards.find((c) => c.id === 'tribal-angel')!
    const { container } = render(<PlaceholderArt card={card} />)
    expect(container.querySelector('img')).toHaveAttribute('src', '/art/tribal-angel.webp')
  })

  it('shows the gradient + icon fallback underneath, before the art has loaded or failed', () => {
    const card = cards.find((c) => c.id === 'tribal-angel')!
    render(<PlaceholderArt card={card} />)
    expect(screen.getByText(getCardIcon(card))).toBeInTheDocument()
  })

  it('unmounts the art and leaves the unchanged gradient + icon fallback visible when it fails to load', () => {
    const card = cards.find((c) => c.id === 'tribal-angel')!
    const { container } = render(<PlaceholderArt card={card} />)
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).not.toBeInTheDocument()
    expect(screen.getByText(getCardIcon(card))).toBeInTheDocument()
  })
})

describe('isThomas', () => {
  it('matches a username containing "thomas", case-insensitively', () => {
    expect(isThomas('Thomas')).toBe(true)
    expect(isThomas('ThomasK')).toBe(true)
    expect(isThomas('THOMASINA')).toBe(true) // substring match — deliberate, not a bug
  })

  it('does not match a non-matching or missing username', () => {
    expect(isThomas('alice')).toBe(false)
    expect(isThomas(undefined)).toBe(false)
  })
})

describe('assignAvatars', () => {
  it('gives every Thomas-matching account the exclusive path, and everyone else a unique pooled path', () => {
    const accounts = [
      { sub: 'sub-1', username: 'Alice' },
      { sub: 'sub-2', username: 'Bob' },
      { sub: 'sub-3', username: 'thomasK' },
      { sub: 'sub-4', username: 'Carol' },
    ]
    const assignment = assignAvatars(accounts)
    expect(assignment.get('sub-3')).toBe('/avatars/avatar-thomas.webp')

    const nonThomasPaths = ['sub-1', 'sub-2', 'sub-4'].map((sub) => assignment.get(sub))
    expect(new Set(nonThomasPaths).size).toBe(nonThomasPaths.length) // no duplicates
    expect(nonThomasPaths.every((p) => p !== '/avatars/avatar-thomas.webp')).toBe(true)
    expect(nonThomasPaths.every((p) => /^\/avatars\/avatar-\d+\.webp$/.test(p!))).toBe(true)
  })

  it('is stable across calls regardless of input order', () => {
    const accounts = [
      { sub: 'sub-1', username: 'Alice' },
      { sub: 'sub-2', username: 'Bob' },
      { sub: 'sub-3', username: 'Carol' },
    ]
    const first = assignAvatars(accounts)
    const second = assignAvatars([...accounts].reverse())
    for (const { sub } of accounts) {
      expect(first.get(sub)).toBe(second.get(sub))
    }
  })

  it('gives every matching account the exclusive path when more than one username contains "thomas"', () => {
    const assignment = assignAvatars([
      { sub: 'sub-1', username: 'Thomas' },
      { sub: 'sub-2', username: 'ThomasTwo' },
    ])
    expect(assignment.get('sub-1')).toBe('/avatars/avatar-thomas.webp')
    expect(assignment.get('sub-2')).toBe('/avatars/avatar-thomas.webp')
  })
})

describe('PlayerAvatar', () => {
  it('renders the given src', () => {
    const { container } = render(<PlayerAvatar sub="sub-alice" src="/avatars/avatar-3.webp" />)
    expect(container.querySelector('img')).toHaveAttribute('src', '/avatars/avatar-3.webp')
  })

  it('unmounts the image and leaves the Identicon fallback visible when it fails to load', () => {
    const { container } = render(<PlayerAvatar sub="sub-alice" src="/avatars/avatar-3.webp" />)
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).not.toBeInTheDocument()
    expect(container.querySelector('svg')).toBeInTheDocument()
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
