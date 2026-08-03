/**
 * Core War state machine types: players, phases, configuration, and the
 * per-player progress tracked through the hot-seat draw and commander
 * selection phases.
 */
import type { ModifierCard } from './cardTypes'
import type { Deck, DrawLogEntry } from './draw'
import type { ScoreCardTally, ScoringResult } from './scoring'

export type PlayerId = string

export interface Player {
  id: PlayerId
  name: string
}

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 8
export const DEFAULT_PLAYER_COUNT = 4

/**
 * The war's persisted lifecycle. Note the wizard itself is *not* a phase
 * here — nothing is persisted until the wizard completes and `createWar()`
 * produces the first real record, landing in `'preparation'`.
 */
export type Phase =
  | 'preparation'
  | 'personal-draw'
  | 'commander-selection'
  | 'overview'
  | 'scoring'
  | 'concluded'

export type GameMode = 'normal' | 'custom'

export interface CustomOptions {
  /** Personal modifiers only: draw 3 candidates, pick 1. */
  draft: boolean
  /** Skip drawing Score modifier cards entirely (only the win + vote points apply). */
  disableScoreModifiers: boolean
  /** Keep each player's personal modifiers hidden from everyone else until scoring. */
  hiddenPersonalModifiers: boolean
  /** Give each player their own independent personal deck instead of one shared pile. */
  nonSharedPersonalDecks: boolean
}

export const DEFAULT_CUSTOM_OPTIONS: CustomOptions = {
  draft: false,
  disableScoreModifiers: false,
  hiddenPersonalModifiers: false,
  nonSharedPersonalDecks: false,
}

export const DEFAULT_WIN_POINTS = 2
export const DEFAULT_VOTE_POINTS = 1

export interface WarConfig {
  players: Player[]
  /** Advanced per-card opt-out list; every card is enabled by default. */
  disabledCardIds: string[]
  globalCount: number
  personalCount: number
  scoreCount: number
  gameMode: GameMode
  customOptions: CustomOptions
  winPoints: number
  votePoints: number
}

/** Collapses `'normal'` mode to all-options-off, so callers never need to
 * branch on `gameMode` themselves. */
export function effectiveCustomOptions(config: WarConfig): CustomOptions {
  return config.gameMode === 'custom' ? config.customOptions : DEFAULT_CUSTOM_OPTIONS
}

export interface ChosenCommander {
  scryfallId: string
  name: string
  imageUrl?: string
}

export interface PlayerWarState {
  playerId: PlayerId
  personalModifiers: ModifierCard[]
  /** Full history including rejected cards, for a "what just happened" log/animation. */
  personalDrawLog: DrawLogEntry[]
  personalDrawComplete: boolean
  /** Set while a draft round's 3 candidates are awaiting a pick from this player. */
  pendingDraft: ModifierCard[] | null
  commander: ChosenCommander | null
  commanderLocked: boolean
  bestBrewerVoteFor: PlayerId | null
}

/** `initiallyComplete` should be `true` when the war's `personalCount` is 0
 * — otherwise a player who has nothing to draw would never flip
 * `personalDrawComplete`, since that only happens as a side effect of an
 * actual draw action, and 0 means no draw action is ever dispatched for
 * them. Without this, such a player would permanently show as "still
 * needs their turn" and the phase could never advance. */
export function createPlayerWarState(playerId: PlayerId, initiallyComplete = false): PlayerWarState {
  return {
    playerId,
    personalModifiers: [],
    personalDrawLog: [],
    personalDrawComplete: initiallyComplete,
    pendingDraft: null,
    commander: null,
    commanderLocked: false,
    bestBrewerVoteFor: null,
  }
}

export type PersonalDecks =
  | { mode: 'shared'; deck: Deck }
  | { mode: 'non-shared'; decks: Record<PlayerId, Deck> }

export interface ScoringState {
  gameWinnerId: PlayerId | null
  scoreCardTally: ScoreCardTally
}

export interface War {
  id: string
  seed: number
  createdAt: string
  updatedAt: string
  phase: Phase
  config: WarConfig
  globalDeck: Deck
  scoreDeck: Deck
  personalDecks: PersonalDecks
  preparationDrawComplete: boolean
  activeGlobalModifiers: ModifierCard[]
  activeScoreModifiers: ModifierCard[]
  players: PlayerWarState[]
  scoring: ScoringState
  /** Frozen once `CONCLUDE_WAR` runs, so historical results never silently
   * change if scoring logic evolves later. */
  finalScore: ScoringResult | null
}
