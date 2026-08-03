/**
 * The War reducer: one pure function per transition, dispatched through
 * `warReducer`. Every action either mutates draw-engine state (via
 * domain/draw.ts) or flips phase/progress flags — nothing here touches
 * Scryfall/EDHREC data, keeping the whole module synchronous and testable.
 */
import type { ModifierCard } from './cardTypes'
import {
  createDeck,
  drawCards,
  drawDraftRound,
  resolveDraftPick,
  type Deck,
} from './draw'
import { deriveSeed, mulberry32, randomSeed } from './rng'
import { computeScoring } from './scoring'
import {
  createPlayerWarState,
  effectiveCustomOptions,
  type ChosenCommander,
  type Phase,
  type PersonalDecks,
  type Player,
  type PlayerId,
  type PlayerWarState,
  type War,
  type WarConfig,
} from './warTypes'

export class WarStateError extends Error {}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export function createWar(config: WarConfig, allCards: readonly ModifierCard[], seed = randomSeed()): War {
  if (config.players.length < 1) throw new WarStateError('A war needs at least one player')

  const enabledCards = allCards.filter((c) => !config.disabledCardIds.includes(c.id))
  const options = effectiveCustomOptions(config)

  const globalDeck = createDeck('global', [...enabledCards], mulberry32(deriveSeed(seed, 'global')))
  const scoreDeck = createDeck('score', [...enabledCards], mulberry32(deriveSeed(seed, 'score')))

  const personalDecks: PersonalDecks = options.nonSharedPersonalDecks
    ? {
        mode: 'non-shared',
        decks: Object.fromEntries(
          config.players.map((p) => [
            p.id,
            createDeck('personal', [...enabledCards], mulberry32(deriveSeed(seed, 'personal', p.id))),
          ]),
        ),
      }
    : { mode: 'shared', deck: createDeck('personal', [...enabledCards], mulberry32(deriveSeed(seed, 'personal'))) }

  const now = new Date().toISOString()

  return {
    id: `war-${seed}-${Date.now().toString(36)}`,
    seed,
    createdAt: now,
    updatedAt: now,
    phase: 'preparation',
    config,
    globalDeck,
    scoreDeck,
    personalDecks,
    preparationDrawComplete: false,
    activeGlobalModifiers: [],
    activeScoreModifiers: [],
    players: config.players.map((p) => createPlayerWarState(p.id, config.personalCount === 0)),
    scoring: { gameWinnerId: null, scoreCardTally: {} },
    finalScore: null,
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type WarAction =
  | { type: 'RUN_PREPARATION_DRAW' }
  | { type: 'ADVANCE_TO_PERSONAL_DRAW' }
  | { type: 'DRAW_PERSONAL_MODIFIER'; playerId: PlayerId }
  /** Orchestration-layer-only: dispatched when the live commander pool
   * (Scryfall data, outside this pure reducer's knowledge) hits zero as a
   * direct result of the player's most recently drawn card. Strips that
   * card back out and draws its replacement — see domain/commanderCheck.ts
   * and the personal-draw feature's orchestration hook for the check
   * itself. */
  | { type: 'REDRAW_ZERO_COMMANDER_MODIFIER'; playerId: PlayerId; cardId: string }
  /** A player-initiated (never automatic) full reset of their own finished
   * personal-draw hand — offered when their live commander count is low
   * but not zero (zero is already handled automatically, see above). Only
   * valid once `personalDrawComplete` is true; flips it back to false with
   * an empty hand so the normal draw actions above naturally produce a
   * fresh set. */
  | { type: 'RESET_PERSONAL_MODIFIERS'; playerId: PlayerId }
  | { type: 'START_DRAFT_ROUND'; playerId: PlayerId }
  | { type: 'PICK_DRAFT_CARD'; playerId: PlayerId; cardId: string }
  | { type: 'ADVANCE_TO_COMMANDER_SELECTION' }
  | { type: 'SELECT_COMMANDER'; playerId: PlayerId; commander: ChosenCommander }
  | { type: 'ADVANCE_TO_OVERVIEW' }
  | { type: 'ADVANCE_TO_SCORING' }
  | { type: 'SET_GAME_WINNER'; playerId: PlayerId | null }
  | { type: 'SET_SCORE_CARD_TALLY'; cardId: string; playerId: PlayerId; times: number }
  | { type: 'SET_BEST_BREWER_VOTE'; voterId: PlayerId; votedForId: PlayerId | null }
  | { type: 'CONCLUDE_WAR' }

function requirePhase(war: War, ...phases: Phase[]) {
  if (!phases.includes(war.phase)) {
    throw new WarStateError(`Action requires phase ${phases.join('|')}, but war is in "${war.phase}"`)
  }
}

function findPlayer(war: War, playerId: PlayerId): PlayerWarState {
  const player = war.players.find((p) => p.playerId === playerId)
  if (!player) throw new WarStateError(`Unknown player id "${playerId}"`)
  return player
}

function updatePlayer(war: War, playerId: PlayerId, update: (p: PlayerWarState) => PlayerWarState): War {
  return {
    ...war,
    players: war.players.map((p) => (p.playerId === playerId ? update(p) : p)),
  }
}

function getPersonalDeck(war: War, playerId: PlayerId): Deck {
  return war.personalDecks.mode === 'shared' ? war.personalDecks.deck : war.personalDecks.decks[playerId]
}

function setPersonalDeck(war: War, playerId: PlayerId, deck: Deck): War {
  if (war.personalDecks.mode === 'shared') {
    return { ...war, personalDecks: { mode: 'shared', deck } }
  }
  return {
    ...war,
    personalDecks: {
      mode: 'non-shared',
      decks: { ...war.personalDecks.decks, [playerId]: deck },
    },
  }
}

function touch(war: War): War {
  return { ...war, updatedAt: new Date().toISOString() }
}

/** Shared by DRAW_PERSONAL_MODIFIER and REDRAW_ZERO_COMMANDER_MODIFIER: draws
 * exactly one accepted card for a player from their (shared or independent)
 * personal deck, appending to their log and re-evaluating completion. */
function performPersonalDraw(war: War, playerId: PlayerId): War {
  const player = findPlayer(war, playerId)
  const deck = getPersonalDeck(war, playerId)
  const result = drawCards(deck, 1, player.personalModifiers)
  const personalModifiers = [...player.personalModifiers, ...result.accepted]
  const personalDrawComplete =
    personalModifiers.length >= war.config.personalCount || result.deck.drawPile.length === 0

  let next = setPersonalDeck(war, playerId, result.deck)
  next = updatePlayer(next, playerId, (p) => ({
    ...p,
    personalModifiers,
    personalDrawLog: [...p.personalDrawLog, ...result.log],
    personalDrawComplete,
  }))
  return next
}

export function warReducer(war: War, action: WarAction): War {
  switch (action.type) {
    case 'RUN_PREPARATION_DRAW': {
      requirePhase(war, 'preparation')
      if (war.preparationDrawComplete) throw new WarStateError('Preparation draw already ran')

      const options = effectiveCustomOptions(war.config)
      const scoreCount = options.disableScoreModifiers ? 0 : war.config.scoreCount

      const globalResult = drawCards(war.globalDeck, war.config.globalCount)
      const scoreResult = drawCards(war.scoreDeck, scoreCount)

      return touch({
        ...war,
        globalDeck: globalResult.deck,
        scoreDeck: scoreResult.deck,
        activeGlobalModifiers: globalResult.accepted,
        activeScoreModifiers: scoreResult.accepted,
        preparationDrawComplete: true,
      })
    }

    case 'ADVANCE_TO_PERSONAL_DRAW': {
      requirePhase(war, 'preparation')
      if (!war.preparationDrawComplete) throw new WarStateError('Run the preparation draw first')
      return touch({ ...war, phase: 'personal-draw' })
    }

    case 'DRAW_PERSONAL_MODIFIER': {
      requirePhase(war, 'personal-draw')
      const player = findPlayer(war, action.playerId)
      if (player.personalDrawComplete) throw new WarStateError('This player already finished their personal draw')
      if (player.pendingDraft) throw new WarStateError('Resolve the pending draft pick first')

      return touch(performPersonalDraw(war, action.playerId))
    }

    case 'REDRAW_ZERO_COMMANDER_MODIFIER': {
      requirePhase(war, 'personal-draw')
      const player = findPlayer(war, action.playerId)
      const last = player.personalModifiers.at(-1)
      if (!last || last.id !== action.cardId) {
        throw new WarStateError(
          `Card "${action.cardId}" is not this player's most recently drawn modifier — cannot redraw it`,
        )
      }

      // The commander pool hit zero because of this card: strip it back out
      // (it stays permanently gone from the deck, exactly like a normal
      // conflict rejection) and log why, then draw its replacement.
      let next = updatePlayer(war, action.playerId, (p) => ({
        ...p,
        personalModifiers: p.personalModifiers.slice(0, -1),
        personalDrawLog: [...p.personalDrawLog, { card: last, accepted: false, reason: 'zero-commanders' as const }],
        personalDrawComplete: false,
      }))
      next = performPersonalDraw(next, action.playerId)
      return touch(next)
    }

    case 'RESET_PERSONAL_MODIFIERS': {
      requirePhase(war, 'personal-draw')
      const player = findPlayer(war, action.playerId)
      if (!player.personalDrawComplete) {
        throw new WarStateError('Can only reset a personal draw that has already finished')
      }
      if (player.personalModifiers.length === 0) {
        throw new WarStateError('Nothing to reset — this player has no personal modifiers yet')
      }

      // The discarded cards are already permanently gone from the deck's
      // drawable pile (they were removed the moment they were originally
      // drawn — see performPersonalDraw/drawCards) — this action only
      // clears the player's *hand*, ready for a completely fresh set of
      // draws from wherever the deck is now. Logged the same way as any
      // other rejection, so the "what just happened" playback stays
      // complete and honest about a player choosing to start over (e.g.
      // because too few commanders remained legal for their liking).
      return touch(
        updatePlayer(war, action.playerId, (p) => ({
          ...p,
          personalModifiers: [],
          personalDrawComplete: false,
          personalDrawLog: [
            ...p.personalDrawLog,
            ...p.personalModifiers.map((card) => ({
              card,
              accepted: false as const,
              reason: 'player-redraw-all' as const,
            })),
          ],
        })),
      )
    }

    case 'START_DRAFT_ROUND': {
      requirePhase(war, 'personal-draw')
      const player = findPlayer(war, action.playerId)
      if (player.personalDrawComplete) throw new WarStateError('This player already finished their personal draw')
      if (player.pendingDraft) throw new WarStateError('A draft round is already pending for this player')

      const deck = getPersonalDeck(war, action.playerId)
      const round = drawDraftRound(deck, player.personalModifiers, 3)

      let next = setPersonalDeck(war, action.playerId, round.deck)
      next = updatePlayer(next, action.playerId, (p) => ({
        ...p,
        pendingDraft: round.candidates,
        personalDrawLog: [...p.personalDrawLog, ...round.log],
      }))
      return touch(next)
    }

    case 'PICK_DRAFT_CARD': {
      requirePhase(war, 'personal-draw')
      const player = findPlayer(war, action.playerId)
      if (!player.pendingDraft) throw new WarStateError('No draft round is pending for this player')
      const chosen = player.pendingDraft.find((c) => c.id === action.cardId)
      if (!chosen) throw new WarStateError(`Card "${action.cardId}" was not one of the drafted candidates`)

      const deck = getPersonalDeck(war, action.playerId)
      const rand = mulberry32(deriveSeed(war.seed, 'draft-return', action.playerId, player.personalModifiers.length))
      const resolvedDeck = resolveDraftPick(deck, player.pendingDraft, chosen, rand)
      const personalModifiers = [...player.personalModifiers, chosen]
      const personalDrawComplete =
        personalModifiers.length >= war.config.personalCount || resolvedDeck.drawPile.length === 0

      let next = setPersonalDeck(war, action.playerId, resolvedDeck)
      next = updatePlayer(next, action.playerId, (p) => ({
        ...p,
        personalModifiers,
        pendingDraft: null,
        personalDrawComplete,
      }))
      return touch(next)
    }

    case 'ADVANCE_TO_COMMANDER_SELECTION': {
      requirePhase(war, 'personal-draw')
      if (!war.players.every((p) => p.personalDrawComplete)) {
        throw new WarStateError('Not every player has finished their personal draw yet')
      }
      return touch({ ...war, phase: 'commander-selection' })
    }

    case 'SELECT_COMMANDER': {
      requirePhase(war, 'commander-selection')
      const player = findPlayer(war, action.playerId)
      if (player.commanderLocked) throw new WarStateError('This player already locked in their commander')
      return touch(
        updatePlayer(war, action.playerId, (p) => ({
          ...p,
          commander: action.commander,
          commanderLocked: true,
        })),
      )
    }

    case 'ADVANCE_TO_OVERVIEW': {
      requirePhase(war, 'commander-selection')
      if (!war.players.every((p) => p.commanderLocked)) {
        throw new WarStateError('Not every player has locked in a commander yet')
      }
      return touch({ ...war, phase: 'overview' })
    }

    case 'ADVANCE_TO_SCORING': {
      requirePhase(war, 'overview')
      return touch({ ...war, phase: 'scoring' })
    }

    case 'SET_GAME_WINNER': {
      requirePhase(war, 'scoring')
      if (action.playerId) findPlayer(war, action.playerId)
      return touch({ ...war, scoring: { ...war.scoring, gameWinnerId: action.playerId } })
    }

    case 'SET_SCORE_CARD_TALLY': {
      requirePhase(war, 'scoring')
      findPlayer(war, action.playerId)
      if (action.times < 0) throw new WarStateError('times must be >= 0')
      const cardTally = { ...(war.scoring.scoreCardTally[action.cardId] ?? {}) }
      cardTally[action.playerId] = action.times
      return touch({
        ...war,
        scoring: {
          ...war.scoring,
          scoreCardTally: { ...war.scoring.scoreCardTally, [action.cardId]: cardTally },
        },
      })
    }

    case 'SET_BEST_BREWER_VOTE': {
      requirePhase(war, 'scoring')
      findPlayer(war, action.voterId)
      if (action.votedForId === action.voterId) {
        throw new WarStateError('A player cannot vote for themselves')
      }
      if (action.votedForId) findPlayer(war, action.votedForId)
      return touch(
        updatePlayer(war, action.voterId, (p) => ({ ...p, bestBrewerVoteFor: action.votedForId })),
      )
    }

    case 'CONCLUDE_WAR': {
      requirePhase(war, 'scoring')
      const bestBrewerVotes: Partial<Record<PlayerId, PlayerId>> = {}
      for (const p of war.players) {
        if (p.bestBrewerVoteFor) bestBrewerVotes[p.playerId] = p.bestBrewerVoteFor
      }
      const finalScore = computeScoring({
        players: war.players.map((p) => p.playerId),
        winPoints: war.config.winPoints,
        gameWinnerId: war.scoring.gameWinnerId,
        votePoints: war.config.votePoints,
        bestBrewerVotes,
        scoreCards: war.activeScoreModifiers,
        scoreCardTally: war.scoring.scoreCardTally,
      })
      return touch({ ...war, phase: 'concluded', finalScore })
    }

    default: {
      const exhaustive: never = action
      throw new WarStateError(`Unknown action: ${JSON.stringify(exhaustive)}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** The player whose turn it is in the personal-draw hot seat, or null once everyone's done. */
export function getActivePersonalDrawPlayer(war: War): PlayerWarState | null {
  return war.players.find((p) => !p.personalDrawComplete) ?? null
}

/** The player whose turn it is to pick a commander, or null once everyone's done. */
export function getActiveCommanderSelectionPlayer(war: War): PlayerWarState | null {
  return war.players.find((p) => !p.commanderLocked) ?? null
}

export function isPersonalDrawComplete(war: War): boolean {
  return war.players.every((p) => p.personalDrawComplete)
}

export function isCommanderSelectionComplete(war: War): boolean {
  return war.players.every((p) => p.commanderLocked)
}

/** All Commander-target modifiers that apply to a given player: the war's
 * global ones plus that player's own personal ones. Used to drive the live
 * commander counter/filter (see data/commanderPool.ts). */
export function activeCommanderConstraintsFor(war: War, playerId: PlayerId): ModifierCard[] {
  const player = findPlayer(war, playerId)
  return [
    ...war.activeGlobalModifiers.filter((c) => c.target === 'commander'),
    ...player.personalModifiers.filter((c) => c.target === 'commander'),
  ]
}

export function getPlayerName(players: readonly Player[], playerId: PlayerId): string {
  return players.find((p) => p.id === playerId)?.name ?? playerId
}
