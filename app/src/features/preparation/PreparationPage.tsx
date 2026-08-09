import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, useReducedMotion } from 'framer-motion'
import { PageShell } from '../../ui/PageShell'
import { LoadingScreen } from '../../ui/LoadingScreen'
import { Panel, PanelTitle } from '../../ui/Panel'
import { Button } from '../../ui/Button'
import { ModifierCardView } from '../../ui/ModifierCardView'
import { CommanderCounter } from '../../ui/CommanderCounter'
import { useLoadedWar } from '../../router/useLoadedWar'
import { useWarStore } from '../../store/warStore'
import { warPhasePath } from '../../router/paths'
import { useCurrentUserId } from '../../auth/useIsAdmin'
import type { ModifierCard } from '../../domain/cardTypes'

/** Three slightly offset/rotated card-backs, front card at `rotate-0`. Kept
 * as a plain array (not Tailwind arbitrary values) so every back uses the
 * project's normal utility scale. */
const DECK_BACK_OFFSETS = [
  '-rotate-6 -translate-x-2 translate-y-1',
  'rotate-3 translate-x-1 -translate-y-0.5',
  'rotate-0',
]

/** Cards animate in as though physically peeled off the `DeckStack`
 * rendered beside them: translated back toward the deck, rotated, scaled
 * down, and flipped face-down (`rotateY`), then settling face-up at full
 * scale in their resting position. Mirrors the CSS `--animate-card-flip`
 * keyframe's rotateY sweep (see index.css) but driven through
 * framer-motion so it can be staggered per card. */
const DECK_DRAW_INITIAL = { opacity: 0, x: -72, y: 20, rotate: -8, rotateY: -110, scale: 0.72 }
const DECK_DRAW_ANIMATE = { opacity: 1, x: 0, y: 0, rotate: 0, rotateY: 0, scale: 1 }

/**
 * A small stack of face-down card backs standing in for the physical deck
 * each revealed card is "drawn" from — purely decorative (`aria-hidden`;
 * the accessible content is the `ModifierCardView` cards themselves). The
 * front-most back gets a brief "peeling away" pulse — retriggered via
 * `pulseCount` (the number of cards currently revealed) — every time a
 * fresh batch lands beside it, reinforcing the deck/reveal connection.
 */
function DeckStack({ pulseCount }: { pulseCount: number }) {
  const reduceMotion = useReducedMotion()
  return (
    <div className="relative h-40 w-28 shrink-0" aria-hidden="true">
      {DECK_BACK_OFFSETS.map((offsetClass, i) => {
        const back = (
          <div
            className={`absolute inset-0 flex items-center justify-center rounded-lg border-2 border-wood-800 bg-gradient-to-br from-wood-500 to-wood-700 shadow-card ${offsetClass}`}
          >
            <span className="select-none text-3xl text-parchment-200/50">🂠</span>
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
 * Staggered "drawn off the top of the deck" reveal for a freshly-drawn set
 * of modifier cards: a `DeckStack` sits beside the reveal area, and each
 * card flies/flips in from its direction. Driven through framer-motion so
 * we can stagger per-card and cleanly no-op under prefers-reduced-motion
 * via `useReducedMotion()`.
 */
function CardRevealGrid({ cards }: { cards: ModifierCard[] }) {
  const reduceMotion = useReducedMotion()
  return (
    <div className="flex flex-wrap items-start gap-4" style={{ perspective: 1200 }}>
      <DeckStack pulseCount={cards.length} />
      <div className="flex flex-1 flex-wrap gap-4">
        {cards.map((card, index) => (
          <motion.div
            key={card.id}
            initial={reduceMotion ? false : DECK_DRAW_INITIAL}
            animate={DECK_DRAW_ANIMATE}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 0.55, delay: index * 0.12, ease: [0.4, 0.2, 0.2, 1] }
            }
          >
            <ModifierCardView card={card} size="md" />
          </motion.div>
        ))}
      </div>
    </div>
  )
}

export function PreparationPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { war, status } = useLoadedWar('preparation')
  const dispatch = useWarStore((s) => s.dispatch)
  const ensureCommanderPool = useWarStore((s) => s.ensureCommanderPool)
  const commanderPoolStatus = useWarStore((s) => s.commanderPoolStatus)
  const myUserId = useCurrentUserId()
  const [isDrawing, setIsDrawing] = useState(false)
  const [isAdvancing, setIsAdvancing] = useState(false)

  // Product requirement: the ~3,300-card Scryfall commander pool is fetched
  // (and IndexedDB-cached) once per war, kicked off here so it's ready
  // before players start seeing/relying on live commander counts.
  useEffect(() => {
    void ensureCommanderPool()
  }, [ensureCommanderPool])

  if (status === 'loading' || !war) return <LoadingScreen />

  if (commanderPoolStatus.stage !== 'ready') {
    const progress = commanderPoolStatus.progress
    const sublabel =
      progress && progress.total > 0
        ? t('preparation.commanderArchiveProgress', {
            loaded: progress.loaded,
            total: progress.total,
          })
        : undefined
    return <LoadingScreen label={t('commanderCounter.loading')} sublabel={sublabel} />
  }

  const handleStartWar = async () => {
    setIsDrawing(true)
    try {
      await dispatch({ type: 'RUN_PREPARATION_DRAW' })
    } finally {
      setIsDrawing(false)
    }
  }

  const handleContinue = async () => {
    setIsAdvancing(true)
    try {
      await dispatch({ type: 'ADVANCE_TO_PERSONAL_DRAW' })
      navigate(warPhasePath(war.id, 'personal-draw'))
    } finally {
      setIsAdvancing(false)
    }
  }

  const isHost = myUserId !== null && myUserId === war.hostUserId

  return (
    <PageShell title={t('preparation.title')}>
      {!war.preparationDrawComplete ? (
        <Panel ornate className="mx-auto max-w-xl text-center">
          <PanelTitle>{t('preparation.title')}</PanelTitle>
          <p className="mb-6 text-wood-700">{t('preparation.intro')}</p>
          {isHost ? (
            <Button
              variant="primary"
              size="lg"
              disabled={isDrawing}
              onClick={() => void handleStartWar()}
            >
              ⚔️ {isDrawing ? t('preparation.drawing') : t('preparation.startWar')}
            </Button>
          ) : (
            <p className="text-sm italic text-wood-500">{t('preparation.hostOnlyHint')}</p>
          )}
        </Panel>
      ) : (
        <div className="flex flex-col gap-6">
          <CommanderCounter modifiers={war.activeGlobalModifiers} />

          <Panel>
            <PanelTitle>{t('preparation.globalModifiers')}</PanelTitle>
            {war.activeGlobalModifiers.length === 0 ? (
              <p className="text-wood-600">{t('preparation.noneDrawn')}</p>
            ) : (
              <CardRevealGrid cards={war.activeGlobalModifiers} />
            )}
          </Panel>

          <Panel>
            <PanelTitle>{t('preparation.scoreModifiers')}</PanelTitle>
            {war.activeScoreModifiers.length === 0 ? (
              <p className="text-wood-600">{t('preparation.noneDrawn')}</p>
            ) : (
              <CardRevealGrid cards={war.activeScoreModifiers} />
            )}
          </Panel>

          {isHost ? (
            <div className="flex justify-end">
              <Button
                variant="primary"
                size="lg"
                disabled={isAdvancing}
                onClick={() => void handleContinue()}
              >
                {t('preparation.continueToPersonalDraw')}
              </Button>
            </div>
          ) : (
            <p className="text-right text-sm italic text-wood-500">
              {t('preparation.hostOnlyHint')}
            </p>
          )}
        </div>
      )}
    </PageShell>
  )
}
