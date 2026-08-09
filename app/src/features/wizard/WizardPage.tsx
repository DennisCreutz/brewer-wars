import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from 'react-oidc-context'
import { ALL_CARDS, useWarStore } from '../../store/warStore'
import { computeWizardLimits } from '../../domain/validation'
import {
  DEFAULT_CUSTOM_OPTIONS,
  DEFAULT_VOTE_POINTS,
  DEFAULT_WIN_POINTS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type CustomOptions,
  type GameMode,
  type Player,
  type WarConfig,
} from '../../domain/warTypes'
import { Button } from '../../ui/Button'
import { Panel, PanelTitle } from '../../ui/Panel'
import { PageShell } from '../../ui/PageShell'
import { warPhasePath, paths } from '../../router/paths'
import { PlayersStep } from './steps/PlayersStep'
import { ModifiersStep } from './steps/ModifiersStep'
import { GameModeStep } from './steps/GameModeStep'
import { PointsStep, POINTS_MAX, POINTS_MIN } from './steps/PointsStep'
import { ReviewStep } from './steps/ReviewStep'

type StepId = 'players' | 'modifiers' | 'gameMode' | 'points' | 'review'

interface StepDef {
  id: StepId
  /** i18n key for the descriptive Panel headline, e.g. "Choose your modifiers". */
  titleKey: string
  /** i18n key for the short step-indicator label, e.g. "Modifiers". */
  labelKey: string
}

const STEPS: readonly StepDef[] = [
  { id: 'players', titleKey: 'wizard.players.title', labelKey: 'wizard.steps.players' },
  { id: 'modifiers', titleKey: 'wizard.modifiers.title', labelKey: 'wizard.steps.modifiers' },
  { id: 'gameMode', titleKey: 'wizard.gameMode.title', labelKey: 'wizard.steps.gameMode' },
  { id: 'points', titleKey: 'wizard.points.title', labelKey: 'wizard.steps.points' },
  { id: 'review', titleKey: 'wizard.review.title', labelKey: 'wizard.steps.review' },
]

// Sensible starting point for a brand-new war: some of each deck active by
// default rather than "everything off" — always valid against the shipped
// card set (global/personal/score each have well over this many cards).
const DEFAULT_GLOBAL_COUNT = 1
const DEFAULT_PERSONAL_COUNT = 3
const DEFAULT_SCORE_COUNT = 1

function createDefaultPlayers(): Player[] {
  return []
}

function StepIndicator({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <ol className="flex items-start" aria-label="Wizard progress">
      {steps.map((label, index) => {
        const status = index < current ? 'done' : index === current ? 'current' : 'upcoming'
        return (
          <li
            key={label}
            className="flex flex-1 items-center last:flex-initial"
            aria-current={status === 'current' ? 'step' : undefined}
          >
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 font-heading text-sm font-bold transition-colors ${
                  status === 'done'
                    ? 'border-verdant-500 bg-verdant-500 text-white'
                    : status === 'current'
                      ? 'border-royal-400 bg-royal-400 text-wood-900'
                      : 'border-parchment-100/30 bg-transparent text-parchment-100/50'
                }`}
              >
                {status === 'done' ? '✓' : index + 1}
              </div>
              <span
                className={`hidden text-center text-xs font-heading sm:block ${
                  status === 'upcoming' ? 'text-parchment-100/50' : 'text-parchment-50'
                }`}
              >
                {label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`mx-2 h-0.5 flex-1 ${status === 'done' ? 'bg-verdant-500' : 'bg-parchment-100/20'}`}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * The pre-War setup wizard: builds a `WarConfig` entirely in local state
 * across five steps, then hands it to `startNewWar` and navigates to the
 * freshly-created War's first phase. Nothing here touches the war
 * store/reducer until the very last step — there is no War to dispatch
 * actions against yet.
 */
export function WizardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const startNewWar = useWarStore((s) => s.startNewWar)
  const auth = useAuth()

  const [step, setStep] = useState(0)

  const [players, setPlayers] = useState<Player[]>(createDefaultPlayers)
  const [disabledCardIds, setDisabledCardIds] = useState<Set<string>>(() => new Set())
  const [globalCountRaw, setGlobalCountRaw] = useState(DEFAULT_GLOBAL_COUNT)
  const [personalCountRaw, setPersonalCountRaw] = useState(DEFAULT_PERSONAL_COUNT)
  const [scoreCountRaw, setScoreCountRaw] = useState(DEFAULT_SCORE_COUNT)
  const [gameMode, setGameMode] = useState<GameMode>('normal')
  const [customOptions, setCustomOptions] = useState<CustomOptions>(DEFAULT_CUSTOM_OPTIONS)
  const [winPoints, setWinPoints] = useState(DEFAULT_WIN_POINTS)
  const [votePoints, setVotePoints] = useState(DEFAULT_VOTE_POINTS)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Recomputed from the currently-*enabled* pool (not the full 233-card
  // set): disabling every card of a category removes that category from
  // the ceiling, per domain/validation.ts's docblock. Re-runs live as the
  // user toggles cards in the advanced list below.
  const enabledCards = useMemo(
    () => ALL_CARDS.filter((c) => !disabledCardIds.has(c.id)),
    [disabledCardIds],
  )
  const limits = useMemo(() => computeWizardLimits(enabledCards), [enabledCards])

  const scoreDisabledByGameMode = gameMode === 'custom' && customOptions.disableScoreModifiers

  // Derive the *effective* counts from the raw, user-chosen values instead
  // of clamping via an effect ("adjusting state when a prop changes" — see
  // React docs / ui/HotSeatGate.tsx for the same pattern elsewhere in this
  // codebase). If disabling cards later lowers a limit below what the user
  // picked, this just displays/submits the clamped value without
  // discarding their original choice — re-enabling cards affecting that
  // ceiling brings it straight back with no extra step.
  const globalCount = Math.min(globalCountRaw, limits.global)
  const personalCount = Math.min(personalCountRaw, limits.personal)
  const scoreCount = scoreDisabledByGameMode ? 0 : Math.min(scoreCountRaw, limits.score)

  const playersValid = players.length >= MIN_PLAYERS && players.length <= MAX_PLAYERS

  const pointsValid =
    Number.isInteger(winPoints) &&
    winPoints >= POINTS_MIN &&
    winPoints <= POINTS_MAX &&
    Number.isInteger(votePoints) &&
    votePoints >= POINTS_MIN &&
    votePoints <= POINTS_MAX

  const stepValidity: readonly boolean[] = [playersValid, true, true, pointsValid, true]
  const canGoNext = stepValidity[step]
  const isLastStep = step === STEPS.length - 1
  const current = STEPS[step]

  function toggleCard(id: string) {
    setDisabledCardIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function setCardsDisabled(ids: string[], disabled: boolean) {
    setDisabledCardIds((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (disabled) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  async function startWar() {
    // Defense-in-depth: the linear step gating below should make this
    // unreachable with invalid data, but never assemble/submit a config
    // that violates the wizard's own rules.
    if (!playersValid || !pointsValid || isSubmitting) return

    const hostUserId = auth.user?.profile?.sub
    if (!hostUserId) {
      setSubmitError(t('common.unknownError'))
      return
    }

    setSubmitError(null)
    setIsSubmitting(true)

    const config: WarConfig = {
      players,
      disabledCardIds: [...disabledCardIds],
      globalCount,
      personalCount,
      scoreCount,
      gameMode,
      customOptions,
      winPoints,
      votePoints,
    }

    try {
      const war = await startNewWar(config, hostUserId)
      navigate(warPhasePath(war.id, war.phase))
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t('common.unknownError'))
      setIsSubmitting(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canGoNext) return
    if (isLastStep) {
      void startWar()
    } else {
      setStep((s) => Math.min(s + 1, STEPS.length - 1))
    }
  }

  function goBack() {
    // Nothing is persisted to the store/repository until `startWar()`
    // dispatches at the very last step, so stepping "back" off the first
    // step is always safe to treat as leaving the wizard entirely, rather
    // than trapping the player with a disabled button and no way out
    // short of a manual URL edit or full page reload.
    if (step === 0) {
      navigate(paths.landing)
      return
    }
    setSubmitError(null)
    setStep((s) => Math.max(s - 1, 0))
  }

  return (
    <PageShell title={t('wizard.title')}>
      <StepIndicator steps={STEPS.map((s) => t(s.labelKey))} current={step} />

      <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-6" noValidate>
        <Panel className="flex-1">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-wood-500">
            {t('wizard.stepOf', { current: step + 1, total: STEPS.length })}
          </p>
          <PanelTitle>{t(current.titleKey)}</PanelTitle>

          {current.id === 'players' && <PlayersStep players={players} onChange={setPlayers} />}

          {current.id === 'modifiers' && (
            <ModifiersStep
              globalCount={globalCount}
              personalCount={personalCount}
              scoreCount={scoreCount}
              onGlobalCountChange={setGlobalCountRaw}
              onPersonalCountChange={setPersonalCountRaw}
              onScoreCountChange={setScoreCountRaw}
              limits={limits}
              scoreDisabledByGameMode={scoreDisabledByGameMode}
              disabledCardIds={disabledCardIds}
              onToggleCard={toggleCard}
              onSetCardsDisabled={setCardsDisabled}
            />
          )}

          {current.id === 'gameMode' && (
            <GameModeStep
              gameMode={gameMode}
              onGameModeChange={setGameMode}
              customOptions={customOptions}
              onCustomOptionsChange={setCustomOptions}
            />
          )}

          {current.id === 'points' && (
            <PointsStep
              winPoints={winPoints}
              votePoints={votePoints}
              onWinPointsChange={setWinPoints}
              onVotePointsChange={setVotePoints}
            />
          )}

          {current.id === 'review' && (
            <ReviewStep
              players={players}
              globalCount={globalCount}
              personalCount={personalCount}
              scoreCount={scoreCount}
              gameMode={gameMode}
              customOptions={customOptions}
              winPoints={winPoints}
              votePoints={votePoints}
              disabledCardCount={disabledCardIds.size}
            />
          )}

          {submitError && (
            <p role="alert" className="mt-4 text-sm font-semibold text-ember-600">
              {submitError}
            </p>
          )}
        </Panel>

        <div className="flex items-center justify-between gap-4">
          <Button type="button" variant="secondary" onClick={goBack} disabled={isSubmitting}>
            {step === 0 ? t('common.buttons.exitToMenu') : t('common.buttons.back')}
          </Button>
          <Button type="submit" variant="primary" disabled={!canGoNext || isSubmitting}>
            {isLastStep
              ? isSubmitting
                ? t('common.loading')
                : t('wizard.review.startWar')
              : t('common.buttons.next')}
          </Button>
        </div>
      </form>
    </PageShell>
  )
}
