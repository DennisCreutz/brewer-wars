import { describe, it, expect } from 'vitest'
import { applyCommanderSearchFilters, sortCommanders } from '../commanderSearch'
import type { CommanderSummary } from '../commanderCheck'

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

describe('applyCommanderSearchFilters', () => {
  it('returns the pool unchanged when no filters are set', () => {
    const pool = [commander({ id: '1', name: 'a' }), commander({ id: '2', name: 'b' })]
    expect(applyCommanderSearchFilters(pool, {})).toHaveLength(2)
  })

  describe('name query', () => {
    it('matches case-insensitively as a substring', () => {
      const pool = [commander({ id: '1', name: 'Atraxa, Praetors Voice' }), commander({ id: '2', name: 'Six' })]
      const result = applyCommanderSearchFilters(pool, { nameQuery: 'atraxa' })
      expect(result.map((c) => c.id)).toEqual(['1'])
    })
  })

  describe('colour filter', () => {
    it('"exact" mode matches only the identical colour set', () => {
      const pool = [
        commander({ id: '1', name: 'a', colorIdentity: ['W'] }),
        commander({ id: '2', name: 'b', colorIdentity: ['W', 'U'] }),
      ]
      const result = applyCommanderSearchFilters(pool, { color: { mode: 'exact', colors: ['W'] } })
      expect(result.map((c) => c.id)).toEqual(['1'])
    })

    it('"atLeast" mode matches commanders that include the selected colours plus possibly more', () => {
      const pool = [
        commander({ id: '1', name: 'a', colorIdentity: ['W'] }),
        commander({ id: '2', name: 'b', colorIdentity: ['W', 'U'] }),
        commander({ id: '3', name: 'c', colorIdentity: ['U'] }),
      ]
      const result = applyCommanderSearchFilters(pool, { color: { mode: 'atLeast', colors: ['W'] } })
      expect(result.map((c) => c.id).sort()).toEqual(['1', '2'])
    })

    it('an empty colour list is a no-op', () => {
      const pool = [commander({ id: '1', name: 'a', colorIdentity: ['W'] })]
      expect(applyCommanderSearchFilters(pool, { color: { mode: 'exact', colors: [] } })).toHaveLength(1)
    })
  })

  describe('mana value filter', () => {
    const pool = [
      commander({ id: '1', name: 'a', cmc: 2 }),
      commander({ id: '2', name: 'b', cmc: 4 }),
      commander({ id: '3', name: 'c', cmc: 4 }),
      commander({ id: '4', name: 'd', cmc: 6 }),
    ]

    it('eq', () => {
      const result = applyCommanderSearchFilters(pool, { manaValue: { operator: 'eq', value: 4 } })
      expect(result.map((c) => c.id).sort()).toEqual(['2', '3'])
    })

    it('lte', () => {
      const result = applyCommanderSearchFilters(pool, { manaValue: { operator: 'lte', value: 4 } })
      expect(result.map((c) => c.id).sort()).toEqual(['1', '2', '3'])
    })

    it('gte', () => {
      const result = applyCommanderSearchFilters(pool, { manaValue: { operator: 'gte', value: 4 } })
      expect(result.map((c) => c.id).sort()).toEqual(['2', '3', '4'])
    })
  })

  it('combines multiple filters as an AND', () => {
    const pool = [
      commander({ id: '1', name: 'Angel of Mercy', colorIdentity: ['W'], cmc: 4 }),
      commander({ id: '2', name: 'Angel of Wrath', colorIdentity: ['W', 'B'], cmc: 4 }),
      commander({ id: '3', name: 'Angel of Doom', colorIdentity: ['W'], cmc: 6 }),
    ]
    const result = applyCommanderSearchFilters(pool, {
      nameQuery: 'angel',
      color: { mode: 'exact', colors: ['W'] },
      manaValue: { operator: 'eq', value: 4 },
    })
    expect(result.map((c) => c.id)).toEqual(['1'])
  })
})

describe('sortCommanders', () => {
  it('sorts by edhrec rank ascending, nulls last', () => {
    const pool = [
      commander({ id: '1', name: 'a', edhrecRank: 500 }),
      commander({ id: '2', name: 'b', edhrecRank: null }),
      commander({ id: '3', name: 'c', edhrecRank: 10 }),
    ]
    expect(sortCommanders(pool, 'edhrec').map((c) => c.id)).toEqual(['3', '1', '2'])
  })

  it('sorts by mana value ascending', () => {
    const pool = [
      commander({ id: '1', name: 'a', cmc: 5 }),
      commander({ id: '2', name: 'b', cmc: 1 }),
      commander({ id: '3', name: 'c', cmc: 3 }),
    ]
    expect(sortCommanders(pool, 'manaValueAsc').map((c) => c.id)).toEqual(['2', '3', '1'])
  })

  it('sorts by mana value descending', () => {
    const pool = [
      commander({ id: '1', name: 'a', cmc: 5 }),
      commander({ id: '2', name: 'b', cmc: 1 }),
      commander({ id: '3', name: 'c', cmc: 3 }),
    ]
    expect(sortCommanders(pool, 'manaValueDesc').map((c) => c.id)).toEqual(['1', '3', '2'])
  })

  it('sorts by name alphabetically', () => {
    const pool = [
      commander({ id: '1', name: 'Zephyr' }),
      commander({ id: '2', name: 'Atraxa' }),
      commander({ id: '3', name: 'Mondrak' }),
    ]
    expect(sortCommanders(pool, 'name').map((c) => c.id)).toEqual(['2', '3', '1'])
  })

  it('does not mutate the input array', () => {
    const pool = [commander({ id: '1', name: 'b', cmc: 2 }), commander({ id: '2', name: 'a', cmc: 1 })]
    const copy = [...pool]
    sortCommanders(pool, 'manaValueAsc')
    expect(pool).toEqual(copy)
  })
})
