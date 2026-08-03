import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, useReducedMotion } from 'framer-motion'
import { PageShell } from '../../ui/PageShell'
import { LoadingScreen } from '../../ui/LoadingScreen'
import { Panel, PanelTitle } from '../../ui/Panel'
import { Button } from '../../ui/Button'
import { ModifierCardView } from '../../ui/ModifierCardView'
import { CommanderCounter } from '../../ui/CommanderCounter'
import { HotSeatGate } from '../../ui/HotSeatGate'
import { useLoadedWar } from '../../router/useLoadedWar'
import { useWarStore } from '../../store/warStore'
import { warPhasePath } from '../../router/paths'
import {
  activeCommanderConstraintsFor,
  getActivePersonalDrawPlayer,
  getPlayerName,
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

/**
 * Sequential "what just happened" playback for a single draw/pick action:
 * every card the engine looked at and rejected — including cards auto-
 * redrawn by the zero-commander safety net in usePersonalDrawEngine — in
 * order, followed by the one card that was ultimately kept. This is what
 * makes the auto-redraw mechanic visible instead of silently happening.
 * Cards fly/flip in from a `DeckStack`, as though drawn off it in turn.
 */
function DrawPlayback({ entries }: { entries: DrawLogEntry[] }) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const rejected = entries.filter((entry) => !entry.accepted)
  const kept = [...entries].reverse().find((entry) => entry.accepted)
  const sequence = kept ? [...rejected, kept] : rejected

  if (sequence.length === 0) return null

  return (
    <Panel>
      <PanelTitle>{t('personalDraw.whatHappened')}</PanelTitle>
      <div className="flex flex-wrap items-start gap-4" style={{ perspective: 1200 }}>
        <DeckStack size="sm" pulseCount={sequence.length} />
        <div className="flex flex-1 flex-wrap items-start gap-4">
          {sequence.map((entry, index) => (
            <motion.div
              key={`${entry.card.id}-${index}`}
              initial={reduceMotion ? false : DECK_DRAW_INITIAL}
              animate={DECK_DRAW_ANIMATE}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.45, delay: index * 0.3 }}
              className="flex flex-col items-center gap-1"
            >
              <ModifierCardView card={entry.card} size="sm" rejected={!entry.accepted} />
              <p
                className={`max-w-36 text-center text-[11px] font-semibold ${
                  entry.accepted ? 'text-verdant-300' : 'text-ember-300'
                }`}
              >
                {entry.accepted
                  ? t('personalDraw.cardKept')
                  : entry.reason && t(`personalDraw.rejectionReasons.${entry.reason}`)}
              </p>
            </motion.div>
          ))}
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
  const { isProcessing, drawOne, startDraft, pickDraft, redrawAllPersonalModifiers } =
    usePersonalDrawEngine()
  const [pinnedPlayerId, setPinnedPlayerId] = useState<string | null>(null)
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

  // Pin whichever player is active the first time we see a loaded war, then
  // leave the pin alone until `handlePassDevice` explicitly advances it.
  // This deliberately does NOT track `getActivePersonalDrawPlayer(war)`
  // reactively on every render: the domain layer transiently flips a
  // player's `personalDrawComplete` true -> false -> true while
  // usePersonalDrawEngine's zero-commander safety net corrects a card mid
  // draw (REDRAW_ZERO_COMMANDER_MODIFIER in domain/war.ts) — tracking it
  // live would make the active-player selector momentarily "skip" to the
  // next player and yank their curtain up mid-turn. Pinning + an explicit
  // advance-on-confirm keeps the currently-displayed player stable for the
  // whole of their turn, redraws included.
  if (pinnedPlayerId === null) {
    const next = getActivePersonalDrawPlayer(war)
    if (next) setPinnedPlayerId(next.playerId)
  }

  const displayPlayer = pinnedPlayerId
    ? (war.players.find((p) => p.playerId === pinnedPlayerId) ?? null)
    : null

  const handleContinueToCommanderSelection = async () => {
    setIsAdvancing(true)
    try {
      await dispatch({ type: 'ADVANCE_TO_COMMANDER_SELECTION' })
      navigate(warPhasePath(war.id, 'commander-selection'))
    } finally {
      setIsAdvancing(false)
    }
  }

  if (!displayPlayer) {
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

  const playerId = displayPlayer.playerId
  const playerName = getPlayerName(war.config.players, playerId)
  const draft = effectiveCustomOptions(war.config).draft
  // Only trust `personalDrawComplete` once the engine is fully settled —
  // otherwise this too could catch the transient mid-redraw blip described
  // above and flash the "you're done" confirmation before reverting.
  const handIsComplete = !isProcessing && displayPlayer.personalDrawComplete
  // Live commander count is only meaningful once the hand is actually
  // complete — `null` both while the pool hasn't loaded yet AND while the
  // player is still mid-draw (countPotentialCommanders is otherwise cheap,
  // but there's no reason to evaluate it before it could matter).
  const commanderCount = handIsComplete ? countPotentialCommanders(war, playerId) : null
  const lowCommanderPromptKey = `${playerId}:${displayPlayer.personalDrawLog.length}`
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
    commanderCount !== null &&
    commanderCount > 0 &&
    commanderCount < LOW_COMMANDER_COUNT_THRESHOLD &&
    displayPlayer.personalModifiers.length > 0 &&
    keptLowCommanderPromptFor !== lowCommanderPromptKey
      ? commanderCount
      : null
  const isConfirmingFinish = handIsComplete && lowCommanderCount === null

  /** Diffs the player's draw log against `startLength` (captured right
   * before the draw/pick) to find the newly-appended entries for sequential
   * playback. Reads straight from the store rather than the stale
   * render-time `displayPlayer` closure, since `drawOne`/`pickDraft` may
   * have looped through several auto-redraws by the time they resolve. */
  const capturePlayback = (startLength: number) => {
    const freshPlayer = useWarStore.getState().war?.players.find((p) => p.playerId === playerId)
    if (!freshPlayer) return
    setPlayback({ playerId, entries: freshPlayer.personalDrawLog.slice(startLength) })
  }

  const handleDrawOne = () => {
    const startLength = displayPlayer.personalDrawLog.length
    void drawOne(playerId).then(() => capturePlayback(startLength))
  }

  const handleStartDraft = () => {
    void startDraft(playerId)
  }

  const handlePickDraft = (cardId: string) => {
    const startLength = displayPlayer.personalDrawLog.length
    void pickDraft(playerId, cardId).then(() => capturePlayback(startLength))
  }

  const handlePassDevice = () => {
    const freshWar = useWarStore.getState().war
    const next = freshWar ? getActivePersonalDrawPlayer(freshWar) : null
    setPinnedPlayerId(next?.playerId ?? null)
    setPlayback(null)
  }

  const handleRedrawAll = () => {
    // The playback panel would otherwise keep showing cards that this
    // action is about to discard — clear it, same as a real pass-device.
    setPlayback(null)
    void redrawAllPersonalModifiers(playerId)
  }

  const handleKeepDespiteLowCount = () => {
    setKeptLowCommanderPromptFor(lowCommanderPromptKey)
  }

  return (
    <PageShell title={t('personalDraw.title')}>
      <HotSeatGate playerId={playerId} playerName={playerName}>
        <div className="flex flex-col gap-6">
          <Panel>
            <PanelTitle>{t('personalDraw.yourModifiers')}</PanelTitle>
            {displayPlayer.personalModifiers.length === 0 ? (
              <p className="text-wood-600">{t('personalDraw.noneYet')}</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {displayPlayer.personalModifiers.map((card) => (
                  <ModifierCardView key={card.id} card={card} size="sm" />
                ))}
              </div>
            )}
          </Panel>

          <CommanderCounter
            modifiers={activeCommanderConstraintsFor(war, playerId)}
            label={t('personalDraw.commanderCounterPersonal')}
          />

          {playback && playback.playerId === playerId && (
            <DrawPlayback entries={playback.entries} />
          )}

          {lowCommanderCount !== null ? (
            <LowCommanderPrompt
              count={lowCommanderCount}
              isProcessing={isProcessing}
              onRedrawAll={handleRedrawAll}
              onKeep={handleKeepDespiteLowCount}
            />
          ) : isConfirmingFinish ? (
            <Panel ornate className="mx-auto max-w-xl text-center">
              <p className="mb-4 font-heading text-xl text-wood-800">
                🎉 {t('personalDraw.done', { name: playerName })}
              </p>
              <Button variant="primary" size="lg" onClick={handlePassDevice}>
                {t('personalDraw.passDevice')}
              </Button>
            </Panel>
          ) : (
            <DrawControls
              draft={draft}
              pendingDraft={displayPlayer.pendingDraft}
              isProcessing={isProcessing}
              onDrawOne={handleDrawOne}
              onStartDraft={handleStartDraft}
              onPickDraft={handlePickDraft}
            />
          )}
        </div>
      </HotSeatGate>
    </PageShell>
  )
}
