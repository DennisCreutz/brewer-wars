import { useTranslation } from 'react-i18next'
import type { CustomOptions, GameMode } from '../../../domain/warTypes'

const CUSTOM_OPTION_KEYS = [
  'draft',
  'disableScoreModifiers',
  'hiddenPersonalModifiers',
  'nonSharedPersonalDecks',
] as const

interface GameModeStepProps {
  gameMode: GameMode
  onGameModeChange: (mode: GameMode) => void
  customOptions: CustomOptions
  onCustomOptionsChange: (options: CustomOptions) => void
}

/** Step 3: Normal vs Custom radio choice, revealing the four independent
 * CustomOptions checkboxes (all default off) only when Custom is picked. */
export function GameModeStep({
  gameMode,
  onGameModeChange,
  customOptions,
  onCustomOptionsChange,
}: GameModeStepProps) {
  const { t } = useTranslation()

  function toggleOption(key: (typeof CUSTOM_OPTION_KEYS)[number]) {
    onCustomOptionsChange({ ...customOptions, [key]: !customOptions[key] })
  }

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-heading text-sm font-semibold text-wood-800">
          {t('wizard.gameMode.title')}
        </legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="gameMode"
            value="normal"
            checked={gameMode === 'normal'}
            onChange={() => onGameModeChange('normal')}
            className="h-4 w-4 accent-royal-500"
          />
          <span className="text-wood-900">{t('wizard.gameMode.normal')}</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="gameMode"
            value="custom"
            checked={gameMode === 'custom'}
            onChange={() => onGameModeChange('custom')}
            className="h-4 w-4 accent-royal-500"
          />
          <span className="text-wood-900">{t('wizard.gameMode.custom')}</span>
        </label>
      </fieldset>

      {gameMode === 'custom' && (
        <fieldset className="flex flex-col gap-3 rounded-xl border border-wood-300/50 bg-parchment-50/70 p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-wood-600">
            {t('wizard.gameMode.custom')}
          </legend>
          {CUSTOM_OPTION_KEYS.map((key) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={customOptions[key]}
                onChange={() => toggleOption(key)}
                className="h-4 w-4 accent-royal-500"
              />
              <span className="text-wood-900">{t(`wizard.gameMode.${key}`)}</span>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  )
}
