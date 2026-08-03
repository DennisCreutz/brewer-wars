/**
 * Scoring engine.
 *
 * Per the confirmed design:
 *  - The "win the game" bonus and the "best deck brewer" vote are the only
 *    two configurable point values (set once, at war creation).
 *  - Every drawn Score modifier card uses its own printed point value
 *    (parsed from the card name, e.g. "+2 Points for ..." -> 2,
 *    "-1 Point for ..." -> -1) — never configurable.
 *  - Repeatable score cards accumulate `points * timesTriggered` per player;
 *    one-shot cards contribute their point value at most once per player.
 *  - Best-brewer voting: each player names exactly one *other* player; each
 *    vote received is worth `votePoints`.
 */
import type { ModifierCard } from './cardTypes'
import type { PlayerId } from './warTypes'

const SCORE_POINTS_RE = /^([+-]\d+)/

export function parseScoreCardPoints(card: ModifierCard): number {
  const match = SCORE_POINTS_RE.exec(card.name)
  if (!match) throw new Error(`Score card "${card.name}" has no parseable point value`)
  return Number(match[1])
}

/** How many times each player triggered a given (repeatable or one-shot)
 * score card. For one-shot cards this should only ever be 0 or 1. */
export type ScoreCardTally = Record<string /* cardId */, Record<PlayerId, number>>

export interface ScoringInput {
  players: readonly PlayerId[];
  /** Points awarded for winning the physical game (configurable at setup). */
  winPoints: number
  /** Which player won the game, if decided yet. */
  gameWinnerId: PlayerId | null
  /** Points awarded per best-brewer vote received (configurable at setup). */
  votePoints: number
  /** playerId -> the *other* player they voted for as best brewer. */
  bestBrewerVotes: Partial<Record<PlayerId, PlayerId>>
  /** The score modifier cards in play this game (empty if disabled/none drawn). */
  scoreCards: readonly ModifierCard[]
  /** Per-card, per-player trigger counts (see ScoreCardTally). */
  scoreCardTally: ScoreCardTally
}

export interface PlayerScoreBreakdown {
  playerId: PlayerId
  winPoints: number
  votePoints: number
  votesReceived: number
  scoreCardPoints: number
  perCard: { cardId: string; cardName: string; times: number; pointsEach: number; total: number }[]
  total: number
}

export interface ScoringResult {
  breakdowns: PlayerScoreBreakdown[]
  /** Players sorted by total descending; ties keep stable input order within the tie. */
  ranked: PlayerScoreBreakdown[]
  /** All players sharing the highest total (length > 1 means co-winners). */
  winners: PlayerScoreBreakdown[]
}

export function computeScoring(input: ScoringInput): ScoringResult {
  const votesReceivedBy = new Map<PlayerId, number>()
  for (const voter of Object.keys(input.bestBrewerVotes) as PlayerId[]) {
    const votedFor = input.bestBrewerVotes[voter]
    if (!votedFor) continue
    if (votedFor === voter) {
      throw new Error(`Player ${voter} cannot vote for themselves as best brewer`)
    }
    votesReceivedBy.set(votedFor, (votesReceivedBy.get(votedFor) ?? 0) + 1)
  }

  const breakdowns: PlayerScoreBreakdown[] = input.players.map((playerId) => {
    const winPoints = input.gameWinnerId === playerId ? input.winPoints : 0
    const votesReceived = votesReceivedBy.get(playerId) ?? 0
    const votePoints = votesReceived * input.votePoints

    const perCard = input.scoreCards.map((c) => {
      const pointsEach = parseScoreCardPoints(c)
      const timesRaw = input.scoreCardTally[c.id]?.[playerId] ?? 0
      const times = c.repeatable ? timesRaw : Math.min(timesRaw, 1)
      return { cardId: c.id, cardName: c.name, times, pointsEach, total: pointsEach * times }
    })
    const scoreCardPoints = perCard.reduce((sum, p) => sum + p.total, 0)

    return {
      playerId,
      winPoints,
      votePoints,
      votesReceived,
      scoreCardPoints,
      perCard,
      total: winPoints + votePoints + scoreCardPoints,
    }
  })

  const ranked = [...breakdowns].sort((a, b) => b.total - a.total)
  const highest = ranked[0]?.total ?? 0
  const winners = ranked.filter((b) => b.total === highest)

  return { breakdowns, ranked, winners }
}
