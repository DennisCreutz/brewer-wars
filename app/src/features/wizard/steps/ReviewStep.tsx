import { useTranslation } from 'react-i18next'
import type { CustomOptions, GameMode, Player } from '../../../domain/warTypes'
import { PlayerBadge } from '../../../ui/PlayerBadge'

const CUSTOM_OPTION_KEYS = [
  'draft',
  'disableScoreModifiers',
  'hiddenPersonalModifiers',
  'nonSharedPersonalDecks',
] as const

interface ReviewStepProps {
  players: Player[]
  globalCount: number
  personalCount: number
  scoreCount: number
  gameMode: GameMode
  customOptions: CustomOptions
  winPoints: number
  votePoints: number
  disabledCardCount: number
}

/** Step 5: read-only summary of everything configured, right before
 * `startWar` assembles the final WarConfig and creates the War. */
export function ReviewStep({
  players,
  globalCount,
  personalCount,
  scoreCount,
  gameMode,
  customOptions,
  winPoints,
  votePoints,
  disabledCardCount,
}: ReviewStepProps) {
  const { t } = useTranslation()
  const activeOptions = CUSTOM_OPTION_KEYS.filter((key) => customOptions[key])

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="mb-2 font-heading text-xs font-semibold uppercase tracking-wide text-wood-600">
          {t('wizard.steps.players')}
        </h3>
        <ul className="flex flex-wrap gap-3">
          {players.map((player) => (
            <li key={player.id}>
              <PlayerBadge playerId={player.id} name={player.name} size="sm" />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 font-heading text-xs font-semibold uppercase tracking-wide text-wood-600">
          {t('wizard.steps.modifiers')}
        </h3>
        <dl className="grid grid-cols-3 gap-4 text-center">
          <div>
            <dt className="text-xs text-wood-500">{t('wizard.modifiers.globalCount')}</dt>
            <dd className="font-heading text-2xl text-wood-900">{globalCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-wood-500">{t('wizard.modifiers.personalCount')}</dt>
            <dd className="font-heading text-2xl text-wood-900">{personalCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-wood-500">{t('wizard.modifiers.scoreCount')}</dt>
            <dd className="font-heading text-2xl text-wood-900">{scoreCount}</dd>
          </div>
        </dl>
        {disabledCardCount > 0 && (
          <p className="mt-2 text-xs text-wood-500">
            {t('wizard.review.disabledCardsNote', { count: disabledCardCount })}
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-heading text-xs font-semibold uppercase tracking-wide text-wood-600">
          {t('wizard.steps.gameMode')}
        </h3>
        <p className="font-heading text-wood-900">
          {gameMode === 'custom' ? t('wizard.gameMode.custom') : t('wizard.gameMode.normal')}
        </p>
        {gameMode === 'custom' &&
          (activeOptions.length > 0 ? (
            <ul className="mt-1 list-inside list-disc text-sm text-wood-700">
              {activeOptions.map((key) => (
                <li key={key}>{t(`wizard.gameMode.${key}`)}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-wood-500">{t('wizard.review.noCustomOptions')}</p>
          ))}
      </section>

      <section>
        <h3 className="mb-2 font-heading text-xs font-semibold uppercase tracking-wide text-wood-600">
          {t('wizard.steps.points')}
        </h3>
        <p className="text-wood-900">
          {t('wizard.points.winPoints')}: <strong>{winPoints}</strong>
        </p>
        <p className="text-wood-900">
          {t('wizard.points.votePoints')}: <strong>{votePoints}</strong>
        </p>
      </section>
    </div>
  )
}
