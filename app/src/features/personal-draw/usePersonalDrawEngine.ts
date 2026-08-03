/**
 * Orchestrates the hot-seat personal draw for a single war: normal draws,
 * draft rounds, the "auto-redraw if this card zeroes out the live
 * commander pool" safety net (decision: auto-redraw, see project notes),
 * and the player-initiated "too few commanders, redraw everything?" flow
 * (decision: offer a full redraw once a finished hand's live count is
 * positive but below 5). Both checks need the cached Scryfall pool, which
 * the pure domain reducer (src/domain/war.ts) deliberately has no
 * knowledge of, so they live here instead as a thin orchestration layer
 * over it.
 *
 * UI components should use this hook rather than calling `dispatch`
 * directly for draw-related actions, so every screen gets both safety
 * nets for free.
 */
import { useCallback, useState } from 'react'
import { useWarStore } from '../../store/warStore'
import { filterCommanders, splitCommanderModifiers } from '../../domain/commanderCheck'
import { activeCommanderConstraintsFor } from '../../domain/war'
import type { PlayerId } from '../../domain/warTypes'
import type { War } from '../../domain/warTypes'

const MAX_AUTO_REDRAW_ATTEMPTS = 20

/** The threshold below which a *positive* commander count still prompts the
 * player to consider a full redraw (a count of exactly 0 is always handled
 * automatically, never reaches this prompt). */
export const LOW_COMMANDER_COUNT_THRESHOLD = 5

/** Live potential-commander count for a player, or `null` while the pool
 * hasn't loaded yet. Exported so the UI can reactively decide whether to
 * show the "redraw everything?" prompt without duplicating this logic. */
export function countPotentialCommanders(war: War, playerId: PlayerId): number | null {
  const pool = useWarStore.getState().commanderPool
  if (!pool) return null
  const constraints = activeCommanderConstraintsFor(war, playerId)
  const { checkable } = splitCommanderModifiers(constraints)
  return filterCommanders(
    pool,
    checkable.map((c) => c.check),
  ).length
}

/** After a draw/pick, repeatedly discards-and-redraws the player's most
 * recent modifier as long as it (a) actually participates in commander
 * filtering and (b) the live pool is currently at zero. Bounded so a
 * pre-existing lock (theoretically possible, not reachable with the
 * current card set — see project notes) can't loop forever. */
async function resolveZeroCommanderLock(playerId: PlayerId): Promise<void> {
  const { dispatch } = useWarStore.getState()

  for (let attempt = 0; attempt < MAX_AUTO_REDRAW_ATTEMPTS; attempt++) {
    const war = useWarStore.getState().war
    if (!war) return
    const player = war.players.find((p) => p.playerId === playerId)
    const lastCard = player?.personalModifiers.at(-1)
    // Nothing to check if there's no card yet, or it can't affect the
    // commander pool at all (not commander-target, or an uncheckable
    // artwork-style commander rule that never participates in filtering).
    if (!lastCard || lastCard.target !== 'commander' || !lastCard.commanderCheck) return

    const count = countPotentialCommanders(war, playerId)
    if (count === null || count > 0) return

    await dispatch({ type: 'REDRAW_ZERO_COMMANDER_MODIFIER', playerId, cardId: lastCard.id })
  }
}

export interface PersonalDrawEngine {
  isProcessing: boolean
  /** Normal mode: draws exactly one accepted card, auto-redrawing if it
   * would zero out the commander pool. */
  drawOne: (playerId: PlayerId) => Promise<void>
  /** Draft mode: draws 3 candidates for the player to choose from. */
  startDraft: (playerId: PlayerId) => Promise<void>
  /** Draft mode: resolves the pending pick, with the same auto-redraw safety net. */
  pickDraft: (playerId: PlayerId, cardId: string) => Promise<void>
  /** Player-chosen full restart: discards the player's entire finished hand
   * so the normal draw controls (drawOne / startDraft+pickDraft — whichever
   * this war's game mode uses) naturally produce a completely fresh set of
   * `config.personalCount` cards, exactly as if this were their first turn.
   * Deliberately does not auto-draw the replacements itself: draft mode
   * needs the player's own picks at each round, so resetting-and-continuing
   * through the same UI the player already used is the one flow that's
   * correct for every game mode. Only valid once the player's draw is
   * already complete. */
  redrawAllPersonalModifiers: (playerId: PlayerId) => Promise<void>
}

export function usePersonalDrawEngine(): PersonalDrawEngine {
  const dispatch = useWarStore((s) => s.dispatch)
  const [isProcessing, setIsProcessing] = useState(false)

  const drawOne = useCallback(
    async (playerId: PlayerId) => {
      setIsProcessing(true)
      try {
        await dispatch({ type: 'DRAW_PERSONAL_MODIFIER', playerId })
        await resolveZeroCommanderLock(playerId)
      } finally {
        setIsProcessing(false)
      }
    },
    [dispatch],
  )

  const startDraft = useCallback(
    async (playerId: PlayerId) => {
      setIsProcessing(true)
      try {
        await dispatch({ type: 'START_DRAFT_ROUND', playerId })
      } finally {
        setIsProcessing(false)
      }
    },
    [dispatch],
  )

  const pickDraft = useCallback(
    async (playerId: PlayerId, cardId: string) => {
      setIsProcessing(true)
      try {
        await dispatch({ type: 'PICK_DRAFT_CARD', playerId, cardId })
        await resolveZeroCommanderLock(playerId)
      } finally {
        setIsProcessing(false)
      }
    },
    [dispatch],
  )

  const redrawAllPersonalModifiers = useCallback(
    async (playerId: PlayerId) => {
      setIsProcessing(true)
      try {
        await dispatch({ type: 'RESET_PERSONAL_MODIFIERS', playerId })
      } finally {
        setIsProcessing(false)
      }
    },
    [dispatch],
  )

  return { isProcessing, drawOne, startDraft, pickDraft, redrawAllPersonalModifiers }
}
