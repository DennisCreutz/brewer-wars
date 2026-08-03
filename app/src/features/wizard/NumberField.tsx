import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/Button'

interface NumberFieldProps {
  id: string
  label: string
  hint?: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  disabled?: boolean
}

/**
 * Shared +/- stepper used for modifier draw counts and point values.
 * Always clamps to [min, max] before calling onChange, so callers never
 * need to re-validate the number themselves — a stale `value` above a
 * newly-lowered `max` (e.g. after disabling cards in the wizard's advanced
 * section) still renders and behaves correctly since clamping happens
 * every render, not just on change.
 */
export function NumberField({
  id,
  label,
  hint,
  value,
  min,
  max,
  onChange,
  disabled = false,
}: NumberFieldProps) {
  const { t } = useTranslation()

  function clamp(next: number): number {
    if (Number.isNaN(next)) return min
    return Math.min(max, Math.max(min, Math.round(next)))
  }

  return (
    <div className={`flex flex-col gap-1 ${disabled ? 'opacity-50' : ''}`}>
      <label htmlFor={id} className="font-heading text-sm font-semibold text-wood-800">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          className="px-3 py-1 text-lg leading-none"
          onClick={() => onChange(clamp(value - 1))}
          disabled={disabled || value <= min}
          aria-label={t('wizard.numberField.decrease', { label })}
        >
          −
        </Button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          className="w-16 rounded-lg border-2 border-wood-300 bg-parchment-50 px-2 py-1 text-center font-heading text-lg text-wood-900 focus:border-royal-400 focus:outline-none disabled:opacity-60"
          value={value}
          min={min}
          max={max}
          disabled={disabled}
          onChange={(e) => onChange(clamp(e.target.valueAsNumber))}
        />
        <Button
          type="button"
          variant="secondary"
          className="px-3 py-1 text-lg leading-none"
          onClick={() => onChange(clamp(value + 1))}
          disabled={disabled || value >= max}
          aria-label={t('wizard.numberField.increase', { label })}
        >
          +
        </Button>
      </div>
      {hint && <p className="text-xs text-wood-600">{hint}</p>}
    </div>
  )
}
