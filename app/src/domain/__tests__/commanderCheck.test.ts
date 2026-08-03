import { describe, it, expect } from 'vitest'
import {
  commanderSatisfies,
  filterCommanders,
  splitCommanderModifiers,
  buildScryfallSearchUrl,
  type CommanderSummary,
} from '../commanderCheck'
import type { ModifierCard, CommanderCheck } from '../cardTypes'

function commander(overrides: Partial<CommanderSummary> & Pick<CommanderSummary, 'id' | 'name'>): CommanderSummary {
  return {
    colorIdentity: [],
    typeLine: 'Legendary Creature — Human Wizard',
    keywords: [],
    hasFlavorText: false,
    rarity: 'rare',
    cmc: 3,
    edhrecRank: null,
    numDecks: null,
    scryfallUri: '',
    artCropUrl: null,
    imageUrl: null,
    ...overrides,
  }
}

describe('commanderSatisfies', () => {
  it('colorIdentityExact matches only the exact set, not a subset or superset', () => {
    const check: CommanderCheck = { kind: 'colorIdentityExact', colors: ['W', 'U'] }
    expect(commanderSatisfies(commander({ id: '1', name: 'a', colorIdentity: ['W', 'U'] }), check)).toBe(true)
    expect(commanderSatisfies(commander({ id: '2', name: 'b', colorIdentity: ['U', 'W'] }), check)).toBe(true)
    expect(commanderSatisfies(commander({ id: '3', name: 'c', colorIdentity: ['W'] }), check)).toBe(false)
    expect(commanderSatisfies(commander({ id: '4', name: 'd', colorIdentity: [] }), check)).toBe(false)
    expect(commanderSatisfies(commander({ id: '5', name: 'e', colorIdentity: ['W', 'U', 'B'] }), check)).toBe(false)
  })

  it('colourless commanders never satisfy a mono-colour check (per confirmed design decision)', () => {
    const check: CommanderCheck = { kind: 'colorIdentityExact', colors: ['W'] }
    expect(commanderSatisfies(commander({ id: '1', name: 'Kozilek', colorIdentity: [] }), check)).toBe(false)
  })

  it('edhrecDeckCountBelow uses the known count when present', () => {
    const check: CommanderCheck = { kind: 'edhrecDeckCountBelow', threshold: 500 }
    expect(commanderSatisfies(commander({ id: '1', name: 'a', numDecks: 100 }), check)).toBe(true)
    expect(commanderSatisfies(commander({ id: '2', name: 'b', numDecks: 10000 }), check)).toBe(false)
  })

  it('edhrecDeckCountBelow conservatively FAILS when numDecks is unknown, regardless of threshold', () => {
    // This is the fix for a real bug report: an earlier "assume very few
    // decks" fallback made popular-but-unmatched commanders incorrectly
    // pass restrictive "#Decks < N" filters. Missing data must never look
    // like a pass — see tools/build-edhrec-data.ts's module doc.
    const generous: CommanderCheck = { kind: 'edhrecDeckCountBelow', threshold: 50000 }
    expect(commanderSatisfies(commander({ id: '1', name: 'a', numDecks: null }), generous)).toBe(false)
    const strict: CommanderCheck = { kind: 'edhrecDeckCountBelow', threshold: 1 }
    expect(commanderSatisfies(commander({ id: '2', name: 'b', numDecks: null }), strict)).toBe(false)
  })

  it('keyword check is case-insensitive', () => {
    const check: CommanderCheck = { kind: 'keyword', keyword: 'flying' }
    expect(commanderSatisfies(commander({ id: '1', name: 'a', keywords: ['Flying'] }), check)).toBe(true)
    expect(commanderSatisfies(commander({ id: '2', name: 'b', keywords: ['Trample'] }), check)).toBe(false)
  })

  it('hasFlavorText check', () => {
    const check: CommanderCheck = { kind: 'hasFlavorText' }
    expect(commanderSatisfies(commander({ id: '1', name: 'a', hasFlavorText: true }), check)).toBe(true)
    expect(commanderSatisfies(commander({ id: '2', name: 'b', hasFlavorText: false }), check)).toBe(false)
  })

  it('multipleCreatureTypes counts subtypes after the em dash', () => {
    const check: CommanderCheck = { kind: 'multipleCreatureTypes' }
    expect(
      commanderSatisfies(commander({ id: '1', name: 'a', typeLine: 'Legendary Creature — Human Wizard' }), check),
    ).toBe(true)
    expect(
      commanderSatisfies(commander({ id: '2', name: 'b', typeLine: 'Legendary Creature — Dragon' }), check),
    ).toBe(false)
    expect(
      commanderSatisfies(commander({ id: '3', name: 'c', typeLine: 'Legendary Planeswalker — Jace' }), check),
    ).toBe(false)
  })
})

describe('filterCommanders', () => {
  it('applies every check as an AND', () => {
    const pool = [
      commander({ id: '1', name: 'a', colorIdentity: ['W'], keywords: ['Flying'] }),
      commander({ id: '2', name: 'b', colorIdentity: ['W'], keywords: [] }),
      commander({ id: '3', name: 'c', colorIdentity: ['U'], keywords: ['Flying'] }),
    ]
    const checks: CommanderCheck[] = [
      { kind: 'colorIdentityExact', colors: ['W'] },
      { kind: 'keyword', keyword: 'flying' },
    ]
    const result = filterCommanders(pool, checks)
    expect(result.map((c) => c.id)).toEqual(['1'])
  })

  it('returns the whole pool when there are no checks', () => {
    const pool = [commander({ id: '1', name: 'a' }), commander({ id: '2', name: 'b' })]
    expect(filterCommanders(pool, [])).toHaveLength(2)
  })
})

describe('splitCommanderModifiers', () => {
  function modifier(overrides: Partial<ModifierCard> & Pick<ModifierCard, 'id'>): ModifierCard {
    return {
      name: overrides.id,
      description: '',
      artPrompt: '',
      modifier: 'personal',
      category: 'commanderArt',
      target: 'commander',
      difficulty: 2,
      solo: false,
      ...overrides,
    }
  }

  it('separates checkable from uncheckable commander-target modifiers', () => {
    const checkable = modifier({ id: 'flying', commanderCheck: { kind: 'keyword', keyword: 'flying' } })
    const uncheckable = modifier({ id: 'must-wear-a-hat' })
    const deckCard = modifier({ id: 'tribal-angel', target: 'deck' })
    const { checkable: c, uncheckable: u } = splitCommanderModifiers([checkable, uncheckable, deckCard])
    expect(c).toHaveLength(1)
    expect(c[0].card.id).toBe('flying')
    expect(u).toHaveLength(1)
    expect(u[0].id).toBe('must-wear-a-hat')
  })
})

describe('buildScryfallSearchUrl', () => {
  it('includes is:commander and legal:commander always', () => {
    const url = buildScryfallSearchUrl([])
    expect(url).toContain(encodeURIComponent('is:commander'))
    expect(url).toContain(encodeURIComponent('legal:commander'))
  })

  it('expresses colour identity, keyword, and flavor-text checks', () => {
    const url = buildScryfallSearchUrl([
      { kind: 'colorIdentityExact', colors: ['U', 'W'] },
      { kind: 'keyword', keyword: 'flying' },
      { kind: 'hasFlavorText' },
    ])
    const decoded = decodeURIComponent(url)
    expect(decoded).toContain('id=WU')
    expect(decoded).toContain('keyword:flying')
    expect(decoded).toContain('has:flavor')
  })

  it('omits checks with no Scryfall equivalent', () => {
    const url = buildScryfallSearchUrl([
      { kind: 'edhrecDeckCountBelow', threshold: 500 },
      { kind: 'multipleCreatureTypes' },
    ])
    const decoded = decodeURIComponent(url)
    expect(decoded).toBe('https://scryfall.com/search?q=is:commander legal:commander&order=edhrec')
  })
})
