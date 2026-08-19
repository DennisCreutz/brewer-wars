import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, useReducedMotion } from 'framer-motion'
import { PageShell } from '../../ui/PageShell'
import { LoadingScreen } from '../../ui/LoadingScreen'
import { Panel, PanelTitle } from '../../ui/Panel'
import { Button } from '../../ui/Button'
import { ModifierCardView } from '../../ui/ModifierCardView'
import { getCardIcon } from '../../ui/cardIcons'
import { CommanderCounter } from '../../ui/CommanderCounter'
import { WaitingPanel } from '../../ui/WaitingPanel'
import { useLoadedWar } from '../../router/useLoadedWar'
import { useWarStore } from '../../store/warStore'
import { warPhasePath } from '../../router/paths'
import { useCurrentUserId } from '../../auth/useIsAdmin'
import {
  activeCommanderConstraintsFor,
  getMyPlayerId,
  getPlayerName,
  isPersonalDrawComplete,
} from '../../domain/war'
import { effectiveCustomOptions } from '../../domain/warTypes'
import type { DrawLogEntry } from '../../domain/draw'
import type { ModifierCard } from '../../domain/cardTypes'
import {
  usePersonalDrawEngine,
  countPotentialCommanders,
  LOW_COMMANDER_COUNT_THRESHOLD,
} from './usePersonalDrawEngine'

interface DrawPlaybackState {
  playerId: string
  entries: DrawLogEntry[]
}

/** Three slightly offset/rotated card-backs, front card at `rotate-0`. Kept
 * as a plain array (not Tailwind arbitrary values) so every back uses the
 * project's normal utility scale. Shared by every reveal spot on this
 * page (single-draw playback and the draft-mode candidate grid). */
const DECK_BACK_OFFSETS = [
  '-rotate-6 -translate-x-2 translate-y-1',
  'rotate-3 translate-x-1 -translate-y-0.5',
  'rotate-0',
]

const DECK_SIZE_CLASSES: Record<'sm' | 'md', string> = {
  sm: 'h-28 w-20',
  md: 'h-40 w-28',
}

const DECK_ICON_SIZE_CLASSES: Record<'sm' | 'md', string> = {
  sm: 'text-2xl',
  md: 'text-3xl',
}

/** Cards animate in as though physically peeled off the `DeckStack`
 * rendered beside them — see PreparationPage.tsx's `CardRevealGrid` for
 * the same technique applied to the global/score modifier reveal. */
const DECK_DRAW_INITIAL = { opacity: 0, x: -60, y: 18, rotate: -8, rotateY: -110, scale: 0.75 }
const DECK_DRAW_ANIMATE = { opacity: 1, x: 0, y: 0, rotate: 0, rotateY: 0, scale: 1 }

/**
 * A small stack of face-down card backs standing in for the physical deck
 * a card is "drawn" from — purely decorative (`aria-hidden`; the
 * accessible content is the revealed `ModifierCardView`s themselves). The
 * front-most back gets a brief "peeling away" pulse — retriggered via
 * `pulseCount` — every time a fresh batch of cards lands beside it.
 */
function DeckStack({ size, pulseCount }: { size: 'sm' | 'md'; pulseCount: number }) {
  const reduceMotion = useReducedMotion()
  return (
    <div className={`relative shrink-0 ${DECK_SIZE_CLASSES[size]}`} aria-hidden="true">
      {DECK_BACK_OFFSETS.map((offsetClass, i) => {
        const back = (
          <div
            className={`absolute inset-0 flex items-center justify-center rounded-lg border-2 border-wood-800 bg-gradient-to-br from-wood-500 to-wood-700 shadow-card ${offsetClass}`}
          >
            <span className={`select-none text-parchment-200/50 ${DECK_ICON_SIZE_CLASSES[size]}`}>
              🂠
            </span>
          </div>
        )
        // Only the front-most (last, un-rotated) back gets the pulse — the
        // others behind it just sit there as the rest of the "deck".
        if (i < DECK_BACK_OFFSETS.length - 1) return <div key={offsetClass}>{back}</div>
        return (
          <motion.div
            key={reduceMotion ? 'static-top' : pulseCount}
            initial={reduceMotion ? false : { x: -12, y: 6, opacity: 0.5 }}
            animate={{ x: 0, y: 0, opacity: 1 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.3, ease: 'easeOut' }}
          >
            {back}
          </motion.div>
        )
      })}
    </div>
  )
}

/** Duration (ms) each rejected chip stays "pending" before the next one
 * reveals — gives the sequence a genuine one-at-a-time feel rather than a
 * fixed stagger applied to everything at once. The kept card always
 * arrives last, after every rejected chip has appeared. */
const REJECTED_REVEAL_STEP_MS = 380

/**
 * Compact chip standing in for a single rejected draw attempt — deliberately
 * NOT a full `ModifierCardView`, so a run of several auto-redraws reads as
 * a short subordinate list rather than a wall of near-identical mini-cards.
 */
function RejectedAttemptChip({ entry }: { entry: DrawLogEntry }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2 rounded-lg border border-ember-800/40 bg-ember-950/20 px-2.5 py-1.5">
      <span aria-hidden="true" className="shrink-0 text-base opacity-70">
        {getCardIcon(entry.card)}
      </span>
      <span aria-hidden="true" className="shrink-0 text-sm font-bold text-ember-400">
        ✕
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-wood-100">{entry.card.name}</p>
        <p className="text-[11px] leading-snug text-ember-300">
          {entry.reason && t(`personalDraw.rejectionReasons.${entry.reason}`)}
        </p>
      </div>
    </div>
  )
}

/**
 * Sequential "what just happened" playback for a single draw/pick action:
 * every card the engine looked at and rejected — including cards auto-
 * redrawn by the zero-commander safety net in usePersonalDrawEngine —
 * shown as a compact, subordinate strip of chips, followed by the one
 * card that was ultimately kept, rendered as a full, clearly more
 * prominent `ModifierCardView` under its own heading. This is what makes
 * the auto-redraw mechanic visible (and *not* confusable with "I got 3
 * modifiers") instead of silently happening.
 */
function DrawPlayback({ entries }: { entries: DrawLogEntry[] }) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const rejected = entries.filter((entry) => !entry.accepted)
  const kept = [...entries].reverse().find((entry) => entry.accepted)
  const total = kept ? rejected.length + 1 : rejected.length

  // Sequential reveal state: how many rejected chips are currently shown,
  // and whether the kept card has arrived yet. With reduced motion, skip
  // straight to the fully-revealed final state.
  const [revealedRejected, setRevealedRejected] = useState(reduceMotion ? rejected.length : 0)
  const [keptRevealed, setKeptRevealed] = useState(reduceMotion ? !!kept : false)

  useEffect(() => {
    if (reduceMotion) return
    setRevealedRejected(0)
    setKeptRevealed(false)
    const timers: ReturnType<typeof setTimeout>[] = []
    rejected.forEach((_, index) => {
      timers.push(
        setTimeout(() => setRevealedRejected(index + 1), REJECTED_REVEAL_STEP_MS * (index + 1)),
      )
    })
    if (kept) {
      timers.push(
        setTimeout(() => setKeptRevealed(true), REJECTED_REVEAL_STEP_MS * (rejected.length + 1)),
      )
    }
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by identity of `entries` at call sites
  }, [entries])

  if (total === 0) return null

  const summary =
    rejected.length === 0
      ? t('personalDraw.drawSummaryNoRejections')
      : t('personalDraw.drawSummary', { count: rejected.length, total })

  return (
    <Panel>
      <PanelTitle>{t('personalDraw.whatHappened')}</PanelTitle>
      <div className="flex flex-wrap items-start gap-4" style={{ perspective: 1200 }}>
        <DeckStack size="sm" pulseCount={total} />
        <div className="min-w-0 flex-1">
          <p className="mb-3 text-sm font-semibold text-wood-700">{summary}</p>

          {rejected.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-wood-500">
                {t('personalDraw.rejectedAttempts')}
              </p>
              <div className="flex flex-wrap gap-2">
                {rejected.slice(0, revealedRejected).map((entry, index) => (
                  <motion.div
                    key={`${entry.card.id}-${index}`}
                    initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={
                      reduceMotion ? { duration: 0 } : { duration: 0.25, ease: 'easeOut' }
                    }
                  >
                    <RejectedAttemptChip entry={entry} />
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {kept && keptRevealed && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-verdant-700">
                {t('personalDraw.yourNewModifier')}
              </p>
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, scale: 0.9, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={
                  reduceMotion ? { duration: 0 } : { duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }
                }
                className="flex items-start gap-2"
              >
                <ModifierCardView card={kept.card} size="sm" />
                <span
                  aria-hidden="true"
                  className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-verdant-600 text-sm font-bold text-white"
                  title={t('personalDraw.cardKept')}
                >
                  ✓
                </span>
              </motion.div>
              <p className="sr-only">{t('personalDraw.cardKept')}</p>
            </div>
          )}
        </div>
      </div>
    </Panel>
  )
}

/** Normal-mode draw button, or draft-mode's "draw 3, pick 1" candidate grid. */
function DrawControls({
  draft,
  pendingDraft,
  isProcessing,
  onDrawOne,
  onStartDraft,
  onPickDraft,
}: {
  draft: boolean
  pendingDraft: ModifierCard[] | null
  isProcessing: boolean
  onDrawOne: () => void
  onStartDraft: () => void
  onPickDraft: (cardId: string) => void
}) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()

  if (!draft) {
    return (
      <div className="flex justify-center">
        <Button variant="primary" size="lg" disabled={isProcessing} onClick={onDrawOne}>
          🎴 {isProcessing ? t('preparation.drawing') : t('personalDraw.drawButton')}
        </Button>
      </div>
    )
  }

  if (!pendingDraft) {
    return (
      <div className="flex justify-center">
        <Button variant="primary" size="lg" disabled={isProcessing} onClick={onStartDraft}>
          🎴 {isProcessing ? t('preparation.drawing') : t('personalDraw.draftDrawButton')}
        </Button>
      </div>
    )
  }

  return (
    <Panel>
      <PanelTitle>{t('personalDraw.draftPrompt')}</PanelTitle>
      <div className="flex flex-col items-center gap-4" style={{ perspective: 1200 }}>
        <DeckStack size="md" pulseCount={pendingDraft.length} />
        <div className="flex flex-wrap justify-center gap-4">
          {pendingDraft.map((card, index) => (
            <motion.button
              key={card.id}
              type="button"
              disabled={isProcessing}
              onClick={() => onPickDraft(card.id)}
              aria-label={t('personalDraw.pickCandidate', { name: card.name })}
              initial={reduceMotion ? false : DECK_DRAW_INITIAL}
              animate={DECK_DRAW_ANIMATE}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 0.5, delay: index * 0.15, ease: [0.4, 0.2, 0.2, 1] }
              }
              whileHover={reduceMotion ? undefined : { y: -6 }}
              whileTap={reduceMotion ? undefined : { scale: 0.97 }}
              className="rounded-xl transition-shadow duration-150 hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ModifierCardView card={card} size="md" />
            </motion.button>
          ))}
        </div>
      </div>
    </Panel>
  )
}

/**
 * Offered once a player's hand is complete but their live commander count
 * is uncomfortably low (see `LOW_COMMANDER_COUNT_THRESHOLD` in
 * usePersonalDrawEngine) — lets them discard the whole hand and try again
 * via `redrawAllPersonalModifiers`, or explicitly proceed with the hand
 * they already have. This is a NEW step inserted before the existing
 * "you're done, pass the device" confirmation, not a replacement for it.
 */
function LowCommanderPrompt({
  count,
  isProcessing,
  onRedrawAll,
  onKeep,
}: {
  count: number
  isProcessing: boolean
  onRedrawAll: () => void
  onKeep: () => void
}) {
  const { t } = useTranslation()
  return (
    <Panel ornate className="mx-auto max-w-xl text-center">
      <PanelTitle>{t('personalDraw.lowCommanderCount.title')}</PanelTitle>
      <p className="mb-6 text-wood-700">{t('personalDraw.lowCommanderCount.body', { count })}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="secondary" size="lg" disabled={isProcessing} onClick={onKeep}>
          {t('personalDraw.lowCommanderCount.keep')}
        </Button>
        <Button variant="primary" size="lg" disabled={isProcessing} onClick={onRedrawAll}>
          {t('personalDraw.lowCommanderCount.redrawAll')}
        </Button>
      </div>
    </Panel>
  )
}

export function PersonalDrawPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { war, status } = useLoadedWar('personal-draw')
  const dispatch = useWarStore((s) => s.dispatch)
  const myUserId = useCurrentUserId()
  const { isProcessing, drawOne, startDraft, pickDraft, redrawAllPersonalModifiers } =
    usePersonalDrawEngine()
  const [playback, setPlayback] = useState<DrawPlaybackState | null>(null)
  const [isAdvancing, setIsAdvancing] = useState(false)
  // Generation key (playerId + draw-log length — which only ever grows,
  // including across a full redraw, see RESET_PERSONAL_MODIFIERS in
  // domain/war.ts) that the player has already explicitly dismissed the
  // low-commander-count prompt for by choosing "Keep These". Comparing
  // against the CURRENT generation key below means the prompt reappears
  // if they redraw and land on another low-count hand, and can never
  // accidentally carry over to a different player.
  const [keptLowCommanderPromptFor, setKeptLowCommanderPromptFor] = useState<string | null>(null)

  if (status === 'loading' || !war) return <LoadingScreen />

  const handleContinueToCommanderSelection = async () => {
    setIsAdvancing(true)
    try {
      await dispatch({ type: 'ADVANCE_TO_COMMANDER_SELECTION' })
      navigate(warPhasePath(war.id, 'commander-selection'))
    } finally {
      setIsAdvancing(false)
    }
  }

  if (isPersonalDrawComplete(war)) {
    return (
      <PageShell title={t('personalDraw.title')}>
        <Panel ornate className="mx-auto max-w-xl text-center">
          <PanelTitle>{t('personalDraw.allDone')}</PanelTitle>
          <Button
            variant="primary"
            size="lg"
            disabled={isAdvancing}
            onClick={() => void handleContinueToCommanderSelection()}
          >
            {t('personalDraw.continueToCommanderSelection')}
          </Button>
        </Panel>
      </PageShell>
    )
  }

  // Every player still mid-draw is shown together in the waiting screen
  // for whoever isn't one of them — there's no single "active" player any
  // more, since nothing serializes turns once every member has their own
  // device (see ui/TurnGate.tsx).
  const pendingPlayers = war.players
    .filter((p) => !p.personalDrawComplete)
    .map((p) => ({ id: p.playerId, name: getPlayerName(war.config.players, p.playerId) }))

  const myPlayerId = getMyPlayerId(war.config.players, myUserId)
  const myPlayer = myPlayerId ? war.players.find((p) => p.playerId === myPlayerId) : undefined

  // Only trust `personalDrawComplete` once the engine is fully settled —
  // otherwise this could catch the transient mid-redraw blip caused by the
  // zero-commander safety net (REDRAW_ZERO_COMMANDER_MODIFIER in
  // domain/war.ts).
  const handIsComplete = !!myPlayer && !isProcessing && myPlayer.personalDrawComplete
  // Live commander count is only meaningful once the hand is actually
  // complete — `null` both while the pool hasn't loaded yet AND while the
  // player is still mid-draw (countPotentialCommanders is otherwise cheap,
  // but there's no reason to evaluate it before it could matter).
  const commanderCount = handIsComplete ? countPotentialCommanders(war, myPlayer!.playerId) : null
  const lowCommanderPromptKey = myPlayer
    ? `${myPlayer.playerId}:${myPlayer.personalDrawLog.length}`
    : null
  // Non-null exactly when the low-commander-count prompt should show,
  // carrying the count along so the JSX below doesn't need a non-null
  // assertion. Guards: a positive-but-low count (0 is defensively excluded
  // even though the zero-commander auto-redraw safety net should already
  // make it unreachable here — see usePersonalDrawEngine), something to
  // actually redraw (RESET_PERSONAL_MODIFIERS throws on an empty hand —
  // e.g. a personalCount: 0 player, or one whose shared deck ran dry
  // before their first card), and not already dismissed for this exact
  // generation of their hand.
  const lowCommanderCount =
    myPlayer &&
    commanderCount !== null &&
    commanderCount > 0 &&
    commanderCount < LOW_COMMANDER_COUNT_THRESHOLD &&
    myPlayer.personalModifiers.length > 0 &&
    keptLowCommanderPromptFor !== lowCommanderPromptKey
      ? commanderCount
      : null

  // Still my responsibility if I haven't finished drawing yet, or I have
  // but there's a still-pending low-commander-count decision to make
  // before this player is truly "done" — once that's dismissed (redraw or
  // explicit keep), this flips straight to false and the page shows the
  // waiting screen with no extra "pass it on" step, per the concurrent,
  // per-device model (see ui/TurnGate.tsx).
  const isMyTurn = !!myPlayer && (!myPlayer.personalDrawComplete || lowCommanderCount !== null)

  if (!isMyTurn) {
    return (
      <PageShell title={t('personalDraw.title')}>
        <WaitingPanel
          heading={myPlayer ? t('personalDraw.waitingForOthers') : t('personalDraw.notAPlayer')}
          pendingPlayers={pendingPlayers}
        />
      </PageShell>
    )
  }

  const playerId = myPlayer.playerId
  const draft = effectiveCustomOptions(war.config).draft

  /** Diffs the player's draw log against `startLength` (captured right
   * before the draw/pick) to find the newly-appended entries for sequential
   * playback. Reads straight from the store rather than the stale
   * render-time `myPlayer` closure, since `drawOne`/`pickDraft` may have
   * looped through several auto-redraws by the time they resolve. */
  const capturePlayback = (startLength: number) => {
    const freshPlayer = useWarStore.getState().war?.players.find((p) => p.playerId === playerId)
    if (!freshPlayer) return
    setPlayback({ playerId, entries: freshPlayer.personalDrawLog.slice(startLength) })
  }

  const handleDrawOne = () => {
    const startLength = myPlayer.personalDrawLog.length
    void drawOne(playerId).then(() => capturePlayback(startLength))
  }

  const handleStartDraft = () => {
    void startDraft(playerId)
  }

  const handlePickDraft = (cardId: string) => {
    const startLength = myPlayer.personalDrawLog.length
    void pickDraft(playerId, cardId).then(() => capturePlayback(startLength))
  }

  const handleRedrawAll = () => {
    // The playback panel would otherwise keep showing cards that this
    // action is about to discard.
    setPlayback(null)
    void redrawAllPersonalModifiers(playerId)
  }

  const handleKeepDespiteLowCount = () => {
    setKeptLowCommanderPromptFor(lowCommanderPromptKey)
  }

  return (
    <PageShell title={t('personalDraw.title')}>
      <div className="flex flex-col gap-6">
        <Panel>
          <PanelTitle>{t('personalDraw.yourModifiers')}</PanelTitle>
          {myPlayer.personalModifiers.length === 0 ? (
            <p className="text-wood-600">{t('personalDraw.noneYet')}</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {myPlayer.personalModifiers.map((card) => (
                <ModifierCardView key={card.id} card={card} size="sm" />
              ))}
            </div>
          )}
        </Panel>

        <CommanderCounter
          modifiers={activeCommanderConstraintsFor(war, playerId)}
          label={t('personalDraw.commanderCounterPersonal')}
        />

        {playback && playback.playerId === playerId && <DrawPlayback entries={playback.entries} />}

        {lowCommanderCount !== null ? (
          <LowCommanderPrompt
            count={lowCommanderCount}
            isProcessing={isProcessing}
            onRedrawAll={handleRedrawAll}
            onKeep={handleKeepDespiteLowCount}
          />
        ) : (
          <DrawControls
            draft={draft}
            pendingDraft={myPlayer.pendingDraft}
            isProcessing={isProcessing}
            onDrawOne={handleDrawOne}
            onStartDraft={handleStartDraft}
            onPickDraft={handlePickDraft}
          />
        )}
      </div>
    </PageShell>
  )
}
