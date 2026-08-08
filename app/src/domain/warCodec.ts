/**
 * Dehydrates a War for persistence and rehydrates it back.
 *
 * Every ModifierCard embedded in a War is replaced with its stable `id`
 * string; rehydration looks the id back up against the app's bundled card
 * catalog (ALL_CARDS). This is required, not optional: a freshly-created
 * 8-player war with `nonSharedPersonalDecks` embeds the full 233-card
 * catalog once per player and serialises to ~550 KB, comfortably over
 * DynamoDB's 400 KB item limit. Dehydrated, the same war is ~8 KB.
 *
 * Only `ModifierCard` values are ever swapped for ids — everything else on
 * `War` (config, players, scoring, finalScore, ...) passes through
 * unchanged, so this file must be updated whenever a new place in `War`
 * starts embedding `ModifierCard` objects.
 */
import type { ModifierCard } from './cardTypes'
import type { Deck, DrawLogEntry, DrawRejectionReason } from './draw'
import type { ChosenCommander, PersonalDecks, PlayerId, PlayerWarState, War } from './warTypes'

export class WarCodecError extends Error {}

interface DehydratedDeck {
  modifier: Deck['modifier']
  drawPile: string[]
  drawnCards: string[]
}

interface DehydratedDrawLogEntry {
  card: string
  accepted: boolean
  reason?: DrawRejectionReason
}

type DehydratedPersonalDecks =
  | { mode: 'shared'; deck: DehydratedDeck }
  | { mode: 'non-shared'; decks: Record<PlayerId, DehydratedDeck> }

interface DehydratedPlayerWarState {
  playerId: PlayerId
  personalModifiers: string[]
  personalDrawLog: DehydratedDrawLogEntry[]
  personalDrawComplete: boolean
  pendingDraft: string[] | null
  commander: ChosenCommander | null
  commanderLocked: boolean
  bestBrewerVoteFor: PlayerId | null
}

/** The wire/storage shape of a War: identical to `War` except every
 * embedded `ModifierCard` is replaced by its `id`. */
export type DehydratedWar = Omit<
  War,
  | 'globalDeck'
  | 'scoreDeck'
  | 'personalDecks'
  | 'activeGlobalModifiers'
  | 'activeScoreModifiers'
  | 'players'
> & {
  globalDeck: DehydratedDeck
  scoreDeck: DehydratedDeck
  personalDecks: DehydratedPersonalDecks
  activeGlobalModifiers: string[]
  activeScoreModifiers: string[]
  players: DehydratedPlayerWarState[]
}

function dehydrateDeck(deck: Deck): DehydratedDeck {
  return {
    modifier: deck.modifier,
    drawPile: deck.drawPile.map((c) => c.id),
    drawnCards: deck.drawnCards.map((c) => c.id),
  }
}

function dehydrateDrawLog(log: DrawLogEntry[]): DehydratedDrawLogEntry[] {
  return log.map((entry) => ({
    card: entry.card.id,
    accepted: entry.accepted,
    ...(entry.reason ? { reason: entry.reason } : {}),
  }))
}

function dehydratePersonalDecks(decks: PersonalDecks): DehydratedPersonalDecks {
  if (decks.mode === 'shared') {
    return { mode: 'shared', deck: dehydrateDeck(decks.deck) }
  }
  return {
    mode: 'non-shared',
    decks: Object.fromEntries(
      Object.entries(decks.decks).map(([playerId, deck]) => [playerId, dehydrateDeck(deck)]),
    ),
  }
}

function dehydratePlayer(player: PlayerWarState): DehydratedPlayerWarState {
  return {
    playerId: player.playerId,
    personalModifiers: player.personalModifiers.map((c) => c.id),
    personalDrawLog: dehydrateDrawLog(player.personalDrawLog),
    personalDrawComplete: player.personalDrawComplete,
    pendingDraft: player.pendingDraft ? player.pendingDraft.map((c) => c.id) : null,
    commander: player.commander,
    commanderLocked: player.commanderLocked,
    bestBrewerVoteFor: player.bestBrewerVoteFor,
  }
}

export function dehydrateWar(war: War): DehydratedWar {
  return {
    ...war,
    globalDeck: dehydrateDeck(war.globalDeck),
    scoreDeck: dehydrateDeck(war.scoreDeck),
    personalDecks: dehydratePersonalDecks(war.personalDecks),
    activeGlobalModifiers: war.activeGlobalModifiers.map((c) => c.id),
    activeScoreModifiers: war.activeScoreModifiers.map((c) => c.id),
    players: war.players.map(dehydratePlayer),
  }
}

class CardLookup {
  private readonly byId: Map<string, ModifierCard>

  constructor(allCards: readonly ModifierCard[]) {
    this.byId = new Map(allCards.map((c) => [c.id, c]))
  }

  resolve(id: string): ModifierCard {
    const card = this.byId.get(id)
    if (!card) {
      throw new WarCodecError(`Unknown card id "${id}" — not present in the current card catalog`)
    }
    return card
  }

  resolveAll(ids: readonly string[]): ModifierCard[] {
    return ids.map((id) => this.resolve(id))
  }
}

function rehydrateDeck(deck: DehydratedDeck, lookup: CardLookup): Deck {
  return {
    modifier: deck.modifier,
    drawPile: lookup.resolveAll(deck.drawPile),
    drawnCards: lookup.resolveAll(deck.drawnCards),
  }
}

function rehydrateDrawLog(log: DehydratedDrawLogEntry[], lookup: CardLookup): DrawLogEntry[] {
  return log.map((entry) => ({
    card: lookup.resolve(entry.card),
    accepted: entry.accepted,
    ...(entry.reason ? { reason: entry.reason } : {}),
  }))
}

function rehydratePersonalDecks(decks: DehydratedPersonalDecks, lookup: CardLookup): PersonalDecks {
  if (decks.mode === 'shared') {
    return { mode: 'shared', deck: rehydrateDeck(decks.deck, lookup) }
  }
  return {
    mode: 'non-shared',
    decks: Object.fromEntries(
      Object.entries(decks.decks).map(([playerId, deck]) => [
        playerId,
        rehydrateDeck(deck, lookup),
      ]),
    ),
  }
}

function rehydratePlayer(player: DehydratedPlayerWarState, lookup: CardLookup): PlayerWarState {
  return {
    playerId: player.playerId,
    personalModifiers: lookup.resolveAll(player.personalModifiers),
    personalDrawLog: rehydrateDrawLog(player.personalDrawLog, lookup),
    personalDrawComplete: player.personalDrawComplete,
    pendingDraft: player.pendingDraft ? lookup.resolveAll(player.pendingDraft) : null,
    commander: player.commander,
    commanderLocked: player.commanderLocked,
    bestBrewerVoteFor: player.bestBrewerVoteFor,
  }
}

export function rehydrateWar(dehydrated: DehydratedWar, allCards: readonly ModifierCard[]): War {
  const lookup = new CardLookup(allCards)
  return {
    ...dehydrated,
    globalDeck: rehydrateDeck(dehydrated.globalDeck, lookup),
    scoreDeck: rehydrateDeck(dehydrated.scoreDeck, lookup),
    personalDecks: rehydratePersonalDecks(dehydrated.personalDecks, lookup),
    activeGlobalModifiers: lookup.resolveAll(dehydrated.activeGlobalModifiers),
    activeScoreModifiers: lookup.resolveAll(dehydrated.activeScoreModifiers),
    players: dehydrated.players.map((p) => rehydratePlayer(p, lookup)),
  }
}
