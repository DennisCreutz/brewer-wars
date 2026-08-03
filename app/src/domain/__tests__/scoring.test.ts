import { describe, it, expect } from 'vitest'
import { computeScoring, parseScoreCardPoints, type ScoreCardTally } from '../scoring'
import type { ModifierCard } from '../cardTypes'

function scoreCard(name: string, repeatable: boolean): ModifierCard {
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name,
    description: '',
    artPrompt: '',
    modifier: 'score',
    category: 'untyped',
    target: 'game',
    difficulty: 5,
    solo: false,
    repeatable,
  }
}

describe('parseScoreCardPoints', () => {
  it('parses positive values', () => {
    expect(parseScoreCardPoints(scoreCard('+1 Point for Every Opponent Eliminated', true))).toBe(1)
    expect(parseScoreCardPoints(scoreCard('+2 Points for Winning the Game', false))).toBe(2)
  })

  it('parses negative values', () => {
    expect(parseScoreCardPoints(scoreCard('-1 Point for Being Eliminated First', false))).toBe(-1)
    expect(parseScoreCardPoints(scoreCard('-2 Points for Using an Infinite Combo', false))).toBe(-2)
  })

  it('throws for a card without a parseable point value', () => {
    expect(() => parseScoreCardPoints(scoreCard('Not a score card at all', false))).toThrow()
  })
})

describe('computeScoring', () => {
  const players = ['alice', 'bob', 'carol']

  it('awards win points only to the game winner', () => {
    const result = computeScoring({
      players,
      winPoints: 2,
      gameWinnerId: 'alice',
      votePoints: 1,
      bestBrewerVotes: {},
      scoreCards: [],
      scoreCardTally: {},
    })
    const alice = result.breakdowns.find((b) => b.playerId === 'alice')!
    const bob = result.breakdowns.find((b) => b.playerId === 'bob')!
    expect(alice.winPoints).toBe(2)
    expect(alice.total).toBe(2)
    expect(bob.winPoints).toBe(0)
    expect(bob.total).toBe(0)
  })

  it('tallies best-brewer votes at the configured point value', () => {
    const result = computeScoring({
      players,
      winPoints: 2,
      gameWinnerId: null,
      votePoints: 1,
      bestBrewerVotes: { alice: 'bob', carol: 'bob' },
      scoreCards: [],
      scoreCardTally: {},
    })
    const bob = result.breakdowns.find((b) => b.playerId === 'bob')!
    expect(bob.votesReceived).toBe(2)
    expect(bob.votePoints).toBe(2)
    expect(bob.total).toBe(2)
  })

  it('throws if a player votes for themselves', () => {
    expect(() =>
      computeScoring({
        players,
        winPoints: 2,
        gameWinnerId: null,
        votePoints: 1,
        bestBrewerVotes: { alice: 'alice' },
        scoreCards: [],
        scoreCardTally: {},
      }),
    ).toThrow()
  })

  it('multiplies repeatable score cards by their tally count', () => {
    const eliminated = scoreCard('+1 Point for Every Opponent Eliminated', true)
    const tally: ScoreCardTally = { [eliminated.id]: { alice: 3, bob: 0 } }
    const result = computeScoring({
      players,
      winPoints: 2,
      gameWinnerId: null,
      votePoints: 1,
      bestBrewerVotes: {},
      scoreCards: [eliminated],
      scoreCardTally: tally,
    })
    const alice = result.breakdowns.find((b) => b.playerId === 'alice')!
    expect(alice.scoreCardPoints).toBe(3)
    expect(alice.perCard[0]).toMatchObject({ times: 3, pointsEach: 1, total: 3 })
  })

  it('caps one-shot score cards at a single trigger even if tallied higher', () => {
    const winWithoutCombat = scoreCard('+1 Point for Winning Without Dealing Combat Damage', false)
    const tally: ScoreCardTally = { [winWithoutCombat.id]: { alice: 5 } }
    const result = computeScoring({
      players,
      winPoints: 2,
      gameWinnerId: null,
      votePoints: 1,
      bestBrewerVotes: {},
      scoreCards: [winWithoutCombat],
      scoreCardTally: tally,
    })
    const alice = result.breakdowns.find((b) => b.playerId === 'alice')!
    expect(alice.perCard[0]).toMatchObject({ times: 1, total: 1 })
  })

  it('applies negative score cards correctly', () => {
    const eliminatedFirst = scoreCard('-1 Point for Being Eliminated First', false)
    const tally: ScoreCardTally = { [eliminatedFirst.id]: { alice: 1 } }
    const result = computeScoring({
      players,
      winPoints: 2,
      gameWinnerId: null,
      votePoints: 1,
      bestBrewerVotes: {},
      scoreCards: [eliminatedFirst],
      scoreCardTally: tally,
    })
    const alice = result.breakdowns.find((b) => b.playerId === 'alice')!
    expect(alice.scoreCardPoints).toBe(-1)
    expect(alice.total).toBe(-1)
  })

  it('ranks players by total descending', () => {
    const result = computeScoring({
      players,
      winPoints: 2,
      gameWinnerId: 'bob',
      votePoints: 1,
      bestBrewerVotes: { alice: 'carol', bob: 'carol' },
      scoreCards: [],
      scoreCardTally: {},
    })
    expect(result.ranked.map((b) => b.playerId)).toEqual(['bob', 'carol', 'alice'])
  })

  it('detects co-winners on a tie', () => {
    const result = computeScoring({
      players: ['alice', 'bob'],
      winPoints: 2,
      gameWinnerId: null,
      votePoints: 1,
      bestBrewerVotes: { alice: 'bob' }, // bob gets 1, alice gets 0 unless...
      scoreCards: [],
      scoreCardTally: {},
    })
    // Not actually a tie in this case; verify the non-tie path first.
    expect(result.winners).toHaveLength(1)

    const tie = computeScoring({
      players: ['alice', 'bob'],
      winPoints: 2,
      gameWinnerId: null,
      votePoints: 1,
      bestBrewerVotes: {},
      scoreCards: [],
      scoreCardTally: {},
    })
    expect(tie.winners).toHaveLength(2)
    expect(tie.winners.map((w) => w.playerId).sort()).toEqual(['alice', 'bob'])
  })
})
