import { describe, it, expect, beforeEach } from 'vitest'
import {
  createWar,
  warReducer,
  getActivePersonalDrawPlayer,
  getActiveCommanderSelectionPlayer,
  isPersonalDrawComplete,
  isCommanderSelectionComplete,
  activeCommanderConstraintsFor,
  WarStateError,
  type WarAction,
} from '../war'
import {
  DEFAULT_CUSTOM_OPTIONS,
  DEFAULT_VOTE_POINTS,
  DEFAULT_WIN_POINTS,
  type War,
  type WarConfig,
} from '../warTypes'
import cardsData from '../../data/generated/cards.json'
import type { ModifierCard } from '../cardTypes'

const cards = cardsData as ModifierCard[]

function baseConfig(overrides: Partial<WarConfig> = {}): WarConfig {
  return {
    players: [
      { id: 'alice', name: 'Alice', userId: 'user-alice' },
      { id: 'bob', name: 'Bob', userId: 'user-bob' },
      { id: 'carol', name: 'Carol', userId: 'user-carol' },
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

function dispatch(war: War, action: WarAction): War {
  return warReducer(war, action)
}

describe('createWar', () => {
  it('starts in the preparation phase with untouched decks', () => {
    const war = createWar(baseConfig(), cards, 'test-host', 1)
    expect(war.phase).toBe('preparation')
    expect(war.preparationDrawComplete).toBe(false)
    expect(war.activeGlobalModifiers).toEqual([])
    expect(war.players).toHaveLength(3)
    expect(war.players.every((p) => !p.personalDrawComplete)).toBe(true)
  })

  it('is fully deterministic for a given seed', () => {
    const warA = createWar(baseConfig(), cards, 'test-host', 42)
    const warB = createWar(baseConfig(), cards, 'test-host', 42)
    const drawnA = dispatch(warA, { type: 'RUN_PREPARATION_DRAW' })
    const drawnB = dispatch(warB, { type: 'RUN_PREPARATION_DRAW' })
    expect(drawnA.activeGlobalModifiers.map((c) => c.id)).toEqual(
      drawnB.activeGlobalModifiers.map((c) => c.id),
    )
    expect(drawnA.activeScoreModifiers.map((c) => c.id)).toEqual(
      drawnB.activeScoreModifiers.map((c) => c.id),
    )
  })

  it('excludes cards on the disabled list from every deck', () => {
    const war = createWar(
      baseConfig({ disabledCardIds: ['rarity-common'], globalCount: 19 }),
      cards,
      'test-host',
      1,
    )
    const allGlobalCardIds = [...war.globalDeck.drawPile, ...war.globalDeck.drawnCards].map(
      (c) => c.id,
    )
    expect(allGlobalCardIds).not.toContain('rarity-common')
  })

  it('creates one shared personal deck by default', () => {
    const war = createWar(baseConfig(), cards, 'test-host', 1)
    expect(war.personalDecks.mode).toBe('shared')
  })

  it('marks every player already-complete when personalCount is 0, so the phase is never stuck (regression)', () => {
    // personalCount: 0 is an explicitly supported "disable this deck"
    // configuration. Without this, personalDrawComplete only ever flips via
    // a draw action, which never happens for a 0-count player, permanently
    // soft-locking the personal-draw phase.
    const war = createWar(baseConfig({ personalCount: 0 }), cards, 'test-host', 1)
    expect(war.players.every((p) => p.personalDrawComplete)).toBe(true)
  })

  it('creates independent personal decks when nonSharedPersonalDecks is set', () => {
    const war = createWar(
      baseConfig({
        gameMode: 'custom',
        customOptions: { ...DEFAULT_CUSTOM_OPTIONS, nonSharedPersonalDecks: true },
      }),
      cards,
      'test-host',
      1,
    )
    expect(war.personalDecks.mode).toBe('non-shared')
    if (war.personalDecks.mode === 'non-shared') {
      expect(Object.keys(war.personalDecks.decks).sort()).toEqual(['alice', 'bob', 'carol'])
    }
  })
})

describe('preparation phase', () => {
  it('draws the configured number of global and score cards', () => {
    let war = createWar(baseConfig({ globalCount: 2, scoreCount: 3 }), cards, 'test-host', 7)
    war = dispatch(war, { type: 'RUN_PREPARATION_DRAW' })
    expect(war.activeGlobalModifiers).toHaveLength(2)
    expect(war.activeScoreModifiers).toHaveLength(3)
    expect(war.preparationDrawComplete).toBe(true)
  })

  it('draws zero score cards when disableScoreModifiers is set, regardless of scoreCount', () => {
    let war = createWar(
      baseConfig({
        scoreCount: 5,
        gameMode: 'custom',
        customOptions: { ...DEFAULT_CUSTOM_OPTIONS, disableScoreModifiers: true },
      }),
      cards,
      'test-host',
      1,
    )
    war = dispatch(war, { type: 'RUN_PREPARATION_DRAW' })
    expect(war.activeScoreModifiers).toHaveLength(0)
  })

  it('cannot run the preparation draw twice', () => {
    let war = createWar(baseConfig(), cards, 'test-host', 1)
    war = dispatch(war, { type: 'RUN_PREPARATION_DRAW' })
    expect(() => dispatch(war, { type: 'RUN_PREPARATION_DRAW' })).toThrow(WarStateError)
  })

  it('cannot advance to personal draw before the preparation draw runs', () => {
    const war = createWar(baseConfig(), cards, 'test-host', 1)
    expect(() => dispatch(war, { type: 'ADVANCE_TO_PERSONAL_DRAW' })).toThrow(WarStateError)
  })
})

describe('personal draw phase (hot seat)', () => {
  let war: War
  beforeEach(() => {
    war = createWar(baseConfig({ personalCount: 2 }), cards, 'test-host', 3)
    war = dispatch(war, { type: 'RUN_PREPARATION_DRAW' })
    war = dispatch(war, { type: 'ADVANCE_TO_PERSONAL_DRAW' })
  })

  it('tracks the active hot-seat player in player order', () => {
    expect(getActivePersonalDrawPlayer(war)?.playerId).toBe('alice')
    war = dispatch(war, { type: 'DRAW_PERSONAL_MODIFIER', playerId: 'alice' })
    war = dispatch(war, { type: 'DRAW_PERSONAL_MODIFIER', playerId: 'alice' })
    expect(getActivePersonalDrawPlayer(war)?.playerId).toBe('bob')
  })

  it('marks a player complete once they reach personalCount', () => {
    war = dispatch(war, { type: 'DRAW_PERSONAL_MODIFIER', playerId: 'alice' })
    let alice = war.players.find((p) => p.playerId === 'alice')!
    expect(alice.personalDrawComplete).toBe(false)
    war = dispatch(war, { type: 'DRAW_PERSONAL_MODIFIER', playerId: 'alice' })
    alice = war.players.find((p) => p.playerId === 'alice')!
    expect(alice.personalDrawComplete).toBe(true)
    expect(alice.personalModifiers).toHaveLength(2)
  })

  it('removes drawn cards from the shared deck so other players cannot draw them again', () => {
    war = dispatch(war, { type: 'DRAW_PERSONAL_MODIFIER', playerId: 'alice' })
    const alice = war.players.find((p) => p.playerId === 'alice')!
    const drawnId = alice.personalModifiers[0].id
    expect(war.personalDecks.mode).toBe('shared')
    if (war.personalDecks.mode === 'shared') {
      const stillInPile = war.personalDecks.deck.drawPile.some((c) => c.id === drawnId)
      expect(stillInPile).toBe(false)
    }
  })

  it('rejects drawing for a player who already finished', () => {
    war = dispatch(war, { type: 'DRAW_PERSONAL_MODIFIER', playerId: 'alice' })
    war = dispatch(war, { type: 'DRAW_PERSONAL_MODIFIER', playerId: 'alice' })
    expect(() => dispatch(war, { type: 'DRAW_PERSONAL_MODIFIER', playerId: 'alice' })).toThrow(
      WarStateError,
    )
  })

  it('cannot advance to commander selection until every player is done', () => {
    expect(() => dispatch(war, { type: 'ADVANCE_TO_COMMANDER_SELECTION' })).toThrow(WarStateError)

    for (const playerId of ['alice', 'bob', 'carol']) {
      war = dispatch(war, { type: 'DRAW_PERSONAL_MODIFIER', playerId })
      war = dispatch(war, { type: 'DRAW_PERSONAL_MODIFIER', playerId })
    }
    expect(isPersonalDrawComplete(war)).toBe(true)
    war = dispatch(war, { type: 'ADVANCE_TO_COMMANDER_SELECTION' })
    expect(war.phase).toBe('commander-selection')
  })

  it('never accepts two personal modifiers of the same category for one player', () => {
    // Draw a large number of cards for alice (bounded by personalCount=2 anyway);
    // instead directly stress-test via many seeds that no player ever ends up
    // with a same-category conflict internally.
    for (let seed = 0; seed < 25; seed++) {
      let w = createWar(baseConfig({ personalCount: 6 }), cards, 'test-host', seed)
      w = dispatch(w, { type: 'RUN_PREPARATION_DRAW' })
      w = dispatch(w, { type: 'ADVANCE_TO_PERSONAL_DRAW' })
      for (let i = 0; i < 6; i++)
        w = dispatch(w, { type: 'DRAW_PERSONAL_MODIFIER', playerId: 'alice' })
      const alice = w.players.find((p) => p.playerId === 'alice')!
      const categories = alice.personalModifiers
        .filter((c) => c.category !== 'untyped')
        .map((c) => c.category)
      expect(new Set(categories).size).toBe(categories.length)
    }
  })
})

describe('REDRAW_ZERO_COMMANDER_MODIFIER (orchestration-driven auto-redraw)', () => {
  let war: War
  beforeEach(() => {
    war = createWar(baseConfig({ personalCount: 3 }), cards, 'test-host', 3)
    war = dispatch(war, { type: 'RUN_PREPARATION_DRAW' })
    war = dispatch(war, { type: 'ADVANCE_TO_PERSONAL_DRAW' })
  })

  it('removes the offending card, logs it as zero-commanders, and draws a replacement', () => {
    war = dispatch(war, { type: 'DRAW_PERSONAL_MODIFIER', playerId: 'alice' })
    const alice = war.players.find((p) => p.playerId === 'alice')!
    const offendingCard = alice.personalModifiers[0]

    war = dispatch(war, {
      type: 'REDRAW_ZERO_COMMANDER_MODIFIER',
      playerId: 'alice',
      cardId: offendingCard.id,
    })
    const aliceAfter = war.players.find((p) => p.playerId === 'alice')!

    // Still exactly 1 modifier (the offending one was replaced, not just removed).
    expect(aliceAfter.personalModifiers).toHaveLength(1)
    expect(aliceAfter.personalModifiers[0].id).not.toBe(offendingCard.id)

    // The offending card is logged as rejected...
    const rejectionEntry = aliceAfter.personalDrawLog.find(
      (e) => e.card.id === offendingCard.id && !e.accepted,
    )
    expect(rejectionEntry?.reason).toBe('zero-commanders')
    // ...and permanently gone from the drawable pile (never drawable again),
    // while remaining in drawnCards as permanent history.
    expect(war.personalDecks.mode).toBe('shared')
    if (war.personalDecks.mode === 'shared') {
      const stillDrawable = war.personalDecks.deck.drawPile.some((c) => c.id === offendingCard.id)
      expect(stillDrawable).toBe(false)
      const inHistory = war.personalDecks.deck.drawnCards.some((c) => c.id === offendingCard.id)
      expect(inHistory).toBe(true)
    }
  })

  it('throws if the given cardId is not the players most recent draw', () => {
    war = dispatch(war, { type: 'DRAW_PERSONAL_MODIFIER', playerId: 'alice' })
    expect(() =>
      dispatch(war, {
        type: 'REDRAW_ZERO_COMMANDER_MODIFIER',
        playerId: 'alice',
        cardId: 'not-the-last-card',
      }),
    ).toThrow(WarStateError)
  })

  it('re-evaluates personalDrawComplete after the replacement (works even on the final card)', () => {
    war = createWar(baseConfig({ personalCount: 1 }), cards, 'test-host', 3)
    war = dispatch(war, { type: 'RUN_PREPARATION_DRAW' })
    war = dispatch(war, { type: 'ADVANCE_TO_PERSONAL_DRAW' })
    war = dispatch(war, { type: 'DRAW_PERSONAL_MODIFIER', playerId: 'alice' })
    let alice = war.players.find((p) => p.playerId === 'alice')!
    expect(alice.personalDrawComplete).toBe(true)

    war = dispatch(war, {
      type: 'REDRAW_ZERO_COMMANDER_MODIFIER',
      playerId: 'alice',
      cardId: alice.personalModifiers[0].id,
    })
    alice = war.players.find((p) => p.playerId === 'alice')!
    expect(alice.personalDrawComplete).toBe(true)
    expect(alice.personalModifiers).toHaveLength(1)
  })

  it('works identically after a draft pick (the chosen card is still "most recent")', () => {
    war = createWar(
      baseConfig({
        personalCount: 2,
        gameMode: 'custom',
        customOptions: { ...DEFAULT_CUSTOM_OPTIONS, draft: true },
      }),
      cards,
      'test-host',
      11,
    )
    war = dispatch(war, { type: 'RUN_PREPARATION_DRAW' })
    war = dispatch(war, { type: 'ADVANCE_TO_PERSONAL_DRAW' })
    war = dispatch(war, { type: 'START_DRAFT_ROUND', playerId: 'alice' })
    const alice = war.players.find((p) => p.playerId === 'alice')!
    war = dispatch(war, {
      type: 'PICK_DRAFT_CARD',
      playerId: 'alice',
      cardId: alice.pendingDraft![0].id,
    })
    const chosenId = alice.pendingDraft![0].id

    war = dispatch(war, {
      type: 'REDRAW_ZERO_COMMANDER_MODIFIER',
      playerId: 'alice',
      cardId: chosenId,
    })
    const aliceAfter = war.players.find((p) => p.playerId === 'alice')!
    expect(aliceAfter.personalModifiers).toHaveLength(1)
    expect(aliceAfter.personalModifiers[0].id).not.toBe(chosenId)
  })
})

describe('RESET_PERSONAL_MODIFIERS (player-chosen full redraw)', () => {
  let war: War
  beforeEach(() => {
    war = createWar(baseConfig({ personalCount: 2 }), cards, 'test-host', 3)
    war = dispatch(war, { type: 'RUN_PREPARATION_DRAW' })
    war = dispatch(war, { type: 'ADVANCE_TO_PERSONAL_DRAW' })
    war = dispatch(war, { type: 'DRAW_PERSONAL_MODIFIER', playerId: 'alice' })
    war = dispatch(war, { type: 'DRAW_PERSONAL_MODIFIER', playerId: 'alice' })
  })

  it('clears the hand and flips personalDrawComplete back to false', () => {
    let alice = war.players.find((p) => p.playerId === 'alice')!
    expect(alice.personalDrawComplete).toBe(true)
    const discarded = alice.personalModifiers.map((c) => c.id)

    war = dispatch(war, { type: 'RESET_PERSONAL_MODIFIERS', playerId: 'alice' })
    alice = war.players.find((p) => p.playerId === 'alice')!
    expect(alice.personalModifiers).toEqual([])
    expect(alice.personalDrawComplete).toBe(false)

    // Logged as rejected, for the "what just happened" playback.
    for (const cardId of discarded) {
      const entry = alice.personalDrawLog.find((e) => e.card.id === cardId && !e.accepted)
      expect(entry?.reason).toBe('player-redraw-all')
    }
  })

  it('lets the player draw a completely fresh hand afterwards', () => {
    war = dispatch(war, { type: 'RESET_PERSONAL_MODIFIERS', playerId: 'alice' })
    war = dispatch(war, { type: 'DRAW_PERSONAL_MODIFIER', playerId: 'alice' })
    war = dispatch(war, { type: 'DRAW_PERSONAL_MODIFIER', playerId: 'alice' })
    const alice = war.players.find((p) => p.playerId === 'alice')!
    expect(alice.personalDrawComplete).toBe(true)
    expect(alice.personalModifiers).toHaveLength(2)
  })

  it('discarded cards never come back from the shared deck', () => {
    const alice = war.players.find((p) => p.playerId === 'alice')!
    const discardedIds = new Set(alice.personalModifiers.map((c) => c.id))
    war = dispatch(war, { type: 'RESET_PERSONAL_MODIFIERS', playerId: 'alice' })

    expect(war.personalDecks.mode).toBe('shared')
    if (war.personalDecks.mode === 'shared') {
      const stillDrawable = war.personalDecks.deck.drawPile.some((c) => discardedIds.has(c.id))
      expect(stillDrawable).toBe(false)
    }
  })

  it('throws if the player has not finished their draw yet', () => {
    let w = createWar(baseConfig({ personalCount: 2 }), cards, 'test-host', 3)
    w = dispatch(w, { type: 'RUN_PREPARATION_DRAW' })
    w = dispatch(w, { type: 'ADVANCE_TO_PERSONAL_DRAW' })
    w = dispatch(w, { type: 'DRAW_PERSONAL_MODIFIER', playerId: 'alice' }) // only 1 of 2, not complete
    expect(() => dispatch(w, { type: 'RESET_PERSONAL_MODIFIERS', playerId: 'alice' })).toThrow(
      WarStateError,
    )
  })

  it('throws if there is nothing to reset', () => {
    let w = createWar(baseConfig({ personalCount: 0 }), cards, 'test-host', 3)
    w = dispatch(w, { type: 'RUN_PREPARATION_DRAW' })
    w = dispatch(w, { type: 'ADVANCE_TO_PERSONAL_DRAW' })
    // personalCount 0 means alice is immediately "complete" with an empty hand.
    const alice = w.players.find((p) => p.playerId === 'alice')!
    expect(alice.personalDrawComplete).toBe(true)
    expect(() => dispatch(w, { type: 'RESET_PERSONAL_MODIFIERS', playerId: 'alice' })).toThrow(
      WarStateError,
    )
  })
})

describe('draft mode', () => {
  let war: War
  beforeEach(() => {
    war = createWar(
      baseConfig({
        personalCount: 2,
        gameMode: 'custom',
        customOptions: { ...DEFAULT_CUSTOM_OPTIONS, draft: true },
      }),
      cards,
      'test-host',
      11,
    )
    war = dispatch(war, { type: 'RUN_PREPARATION_DRAW' })
    war = dispatch(war, { type: 'ADVANCE_TO_PERSONAL_DRAW' })
  })

  it('offers 3 candidates and conserves total deck size after picking', () => {
    const before =
      war.personalDecks.mode === 'shared'
        ? war.personalDecks.deck.drawPile.length + war.personalDecks.deck.drawnCards.length
        : 0

    war = dispatch(war, { type: 'START_DRAFT_ROUND', playerId: 'alice' })
    const alice = war.players.find((p) => p.playerId === 'alice')!
    expect(alice.pendingDraft).toHaveLength(3)

    war = dispatch(war, {
      type: 'PICK_DRAFT_CARD',
      playerId: 'alice',
      cardId: alice.pendingDraft![0].id,
    })
    const aliceAfter = war.players.find((p) => p.playerId === 'alice')!
    expect(aliceAfter.pendingDraft).toBeNull()
    expect(aliceAfter.personalModifiers).toHaveLength(1)

    const after =
      war.personalDecks.mode === 'shared'
        ? war.personalDecks.deck.drawPile.length + war.personalDecks.deck.drawnCards.length
        : 0
    expect(after).toBe(before)
  })

  it('cannot draw normally while a draft is pending', () => {
    war = dispatch(war, { type: 'START_DRAFT_ROUND', playerId: 'alice' })
    expect(() => dispatch(war, { type: 'DRAW_PERSONAL_MODIFIER', playerId: 'alice' })).toThrow(
      WarStateError,
    )
  })

  it('rejects picking a card that was not offered', () => {
    war = dispatch(war, { type: 'START_DRAFT_ROUND', playerId: 'alice' })
    expect(() =>
      dispatch(war, { type: 'PICK_DRAFT_CARD', playerId: 'alice', cardId: 'not-a-real-id' }),
    ).toThrow(WarStateError)
  })
})

describe('commander selection phase', () => {
  let war: War
  beforeEach(() => {
    war = createWar(baseConfig({ personalCount: 1 }), cards, 'test-host', 5)
    war = dispatch(war, { type: 'RUN_PREPARATION_DRAW' })
    war = dispatch(war, { type: 'ADVANCE_TO_PERSONAL_DRAW' })
    for (const playerId of ['alice', 'bob', 'carol']) {
      war = dispatch(war, { type: 'DRAW_PERSONAL_MODIFIER', playerId })
    }
    war = dispatch(war, { type: 'ADVANCE_TO_COMMANDER_SELECTION' })
  })

  it('tracks the active hot-seat player for commander selection', () => {
    expect(getActiveCommanderSelectionPlayer(war)?.playerId).toBe('alice')
    war = dispatch(war, {
      type: 'SELECT_COMMANDER',
      playerId: 'alice',
      commander: { scryfallId: 'x', name: 'Test Commander' },
    })
    expect(getActiveCommanderSelectionPlayer(war)?.playerId).toBe('bob')
  })

  it('locks the commander choice — cannot be selected twice', () => {
    war = dispatch(war, {
      type: 'SELECT_COMMANDER',
      playerId: 'alice',
      commander: { scryfallId: 'x', name: 'Test Commander' },
    })
    expect(() =>
      dispatch(war, {
        type: 'SELECT_COMMANDER',
        playerId: 'alice',
        commander: { scryfallId: 'y', name: 'Other Commander' },
      }),
    ).toThrow(WarStateError)
  })

  it('combines global + personal commander-target modifiers for a player', () => {
    const constraints = activeCommanderConstraintsFor(war, 'alice')
    expect(constraints.every((c) => c.target === 'commander')).toBe(true)
  })

  it('cannot advance to overview until everyone locked a commander', () => {
    expect(() => dispatch(war, { type: 'ADVANCE_TO_OVERVIEW' })).toThrow(WarStateError)
    for (const playerId of ['alice', 'bob', 'carol']) {
      war = dispatch(war, {
        type: 'SELECT_COMMANDER',
        playerId,
        commander: { scryfallId: playerId, name: `${playerId} commander` },
      })
    }
    expect(isCommanderSelectionComplete(war)).toBe(true)
    war = dispatch(war, { type: 'ADVANCE_TO_OVERVIEW' })
    expect(war.phase).toBe('overview')
  })
})

describe('scoring phase and full lifecycle', () => {
  function playThroughToScoring(): War {
    let war = createWar(
      baseConfig({ personalCount: 1, globalCount: 1, scoreCount: 2 }),
      cards,
      'test-host',
      9,
    )
    war = dispatch(war, { type: 'RUN_PREPARATION_DRAW' })
    war = dispatch(war, { type: 'ADVANCE_TO_PERSONAL_DRAW' })
    for (const playerId of ['alice', 'bob', 'carol']) {
      war = dispatch(war, { type: 'DRAW_PERSONAL_MODIFIER', playerId })
    }
    war = dispatch(war, { type: 'ADVANCE_TO_COMMANDER_SELECTION' })
    for (const playerId of ['alice', 'bob', 'carol']) {
      war = dispatch(war, {
        type: 'SELECT_COMMANDER',
        playerId,
        commander: { scryfallId: playerId, name: playerId },
      })
    }
    war = dispatch(war, { type: 'ADVANCE_TO_OVERVIEW' })
    war = dispatch(war, { type: 'ADVANCE_TO_SCORING' })
    return war
  }

  it('reaches scoring with everything decided along the way', () => {
    const war = playThroughToScoring()
    expect(war.phase).toBe('scoring')
    expect(war.activeScoreModifiers).toHaveLength(2)
  })

  it('records the game winner, score-card tallies, and votes', () => {
    let war = playThroughToScoring()
    war = dispatch(war, { type: 'SET_GAME_WINNER', playerId: 'bob' })
    expect(war.scoring.gameWinnerId).toBe('bob')

    const card = war.activeScoreModifiers[0]
    war = dispatch(war, {
      type: 'SET_SCORE_CARD_TALLY',
      cardId: card.id,
      playerId: 'alice',
      times: 2,
    })
    expect(war.scoring.scoreCardTally[card.id].alice).toBe(2)

    war = dispatch(war, { type: 'SET_BEST_BREWER_VOTE', voterId: 'alice', votedForId: 'carol' })
    expect(war.players.find((p) => p.playerId === 'alice')!.bestBrewerVoteFor).toBe('carol')
  })

  it('rejects a player voting for themselves', () => {
    const war = playThroughToScoring()
    expect(() =>
      dispatch(war, { type: 'SET_BEST_BREWER_VOTE', voterId: 'alice', votedForId: 'alice' }),
    ).toThrow(WarStateError)
  })

  it('concludes the war, moving to the final phase', () => {
    let war = playThroughToScoring()
    war = dispatch(war, { type: 'SET_GAME_WINNER', playerId: 'bob' })
    war = dispatch(war, { type: 'CONCLUDE_WAR' })
    expect(war.phase).toBe('concluded')
  })

  it('freezes a computed finalScore snapshot on conclude', () => {
    let war = playThroughToScoring()
    war = dispatch(war, { type: 'SET_GAME_WINNER', playerId: 'bob' })
    war = dispatch(war, { type: 'SET_BEST_BREWER_VOTE', voterId: 'alice', votedForId: 'carol' })
    war = dispatch(war, { type: 'CONCLUDE_WAR' })

    expect(war.finalScore).not.toBeNull()
    const bob = war.finalScore!.breakdowns.find((b) => b.playerId === 'bob')!
    expect(bob.winPoints).toBe(war.config.winPoints)
    const carol = war.finalScore!.breakdowns.find((b) => b.playerId === 'carol')!
    expect(carol.votePoints).toBe(war.config.votePoints)
    expect(war.finalScore!.ranked[0].playerId).toBe('bob')
  })

  it('rejects out-of-phase actions (e.g. drawing personal modifiers after scoring starts)', () => {
    const war = playThroughToScoring()
    expect(() => dispatch(war, { type: 'DRAW_PERSONAL_MODIFIER', playerId: 'alice' })).toThrow(
      WarStateError,
    )
  })
})
