import { describe, it, expect } from 'vitest'
import { dehydrateWar, rehydrateWar, WarCodecError } from '../warCodec'
import { createWar, warReducer } from '../war'
import {
  DEFAULT_CUSTOM_OPTIONS,
  DEFAULT_VOTE_POINTS,
  DEFAULT_WIN_POINTS,
  type WarConfig,
} from '../warTypes'
import cardsData from '../../data/generated/cards.json'
import type { ModifierCard } from '../cardTypes'

const cards = cardsData as ModifierCard[]

function baseConfig(overrides: Partial<WarConfig> = {}): WarConfig {
  return {
    players: [
      { id: 'alice', name: 'Alice' },
      { id: 'bob', name: 'Bob' },
      { id: 'carol', name: 'Carol' },
    ],
    disabledCardIds: [],
    globalCount: 2,
    personalCount: 2,
    scoreCount: 3,
    gameMode: 'normal',
    customOptions: DEFAULT_CUSTOM_OPTIONS,
    winPoints: DEFAULT_WIN_POINTS,
    votePoints: DEFAULT_VOTE_POINTS,
    ...overrides,
  }
}

describe('warCodec', () => {
  it('round-trips a freshly created war byte-for-byte', () => {
    const war = createWar(baseConfig(), cards, 42)
    const dehydrated = dehydrateWar(war)
    const rehydrated = rehydrateWar(dehydrated, cards)
    expect(rehydrated).toEqual(war)
  })

  it('round-trips a war through a full play sequence', () => {
    let war = createWar(baseConfig(), cards, 7)
    war = warReducer(war, { type: 'RUN_PREPARATION_DRAW' })
    war = warReducer(war, { type: 'ADVANCE_TO_PERSONAL_DRAW' })
    for (const player of war.players) {
      war = warReducer(war, { type: 'DRAW_PERSONAL_MODIFIER', playerId: player.playerId })
      war = warReducer(war, { type: 'DRAW_PERSONAL_MODIFIER', playerId: player.playerId })
    }
    war = warReducer(war, { type: 'ADVANCE_TO_COMMANDER_SELECTION' })

    const dehydrated = dehydrateWar(war)
    const rehydrated = rehydrateWar(dehydrated, cards)
    expect(rehydrated).toEqual(war)
  })

  it('round-trips non-shared personal decks', () => {
    const war = createWar(
      baseConfig({ gameMode: 'custom', customOptions: { ...DEFAULT_CUSTOM_OPTIONS, nonSharedPersonalDecks: true } }),
      cards,
      99,
    )
    const dehydrated = dehydrateWar(war)
    const rehydrated = rehydrateWar(dehydrated, cards)
    expect(rehydrated).toEqual(war)
  })

  it('shrinks the serialised size dramatically', () => {
    const war = createWar(baseConfig(), cards, 1)
    const hydratedBytes = JSON.stringify(war).length
    const dehydratedBytes = JSON.stringify(dehydrateWar(war)).length
    expect(dehydratedBytes).toBeLessThan(hydratedBytes * 0.2)
  })

  it('throws a WarCodecError when a card id is missing from the catalog', () => {
    const war = createWar(baseConfig(), cards, 1)
    const dehydrated = dehydrateWar(war)
    const emptyCatalog: ModifierCard[] = []
    expect(() => rehydrateWar(dehydrated, emptyCatalog)).toThrow(WarCodecError)
  })
})
