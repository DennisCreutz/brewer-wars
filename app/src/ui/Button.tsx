import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  ref?: Ref<HTMLButtonElement>
  children: ReactNode
}

// A flatter, shallower gradient (10% lighter top edge instead of a
// full-height light-to-dark ramp) plus a thinner border reads as a modern
// tactile surface instead of an oversized Web-2.0 bevel, especially at the
// now-smaller mobile button sizes above.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-b from-royal-300 to-royal-400 text-wood-900 border-royal-600 hover:from-royal-200 hover:to-royal-300 active:from-royal-400 active:to-royal-500',
  secondary:
    'bg-gradient-to-b from-parchment-200 to-parchment-300 text-wood-900 border-wood-500 hover:from-parchment-100 hover:to-parchment-200 active:from-parchment-300 active:to-parchment-400',
  danger:
    'bg-gradient-to-b from-ember-300 to-ember-400 text-wood-900 border-ember-700 hover:from-ember-200 hover:to-ember-300 active:from-ember-400 active:to-ember-500',
  ghost:
    'bg-transparent text-parchment-100 border-parchment-100/30 hover:bg-parchment-100/10 active:bg-parchment-100/20',
}

// Both sizes scale up from a tighter mobile baseline to their original
// desktop dimensions at `sm:` — `lg` in particular was fixed at
// `px-8 py-4 text-lg` before, which towers over a 360-412px phone viewport
// (the primary CTA button appears on almost every screen). Keeps a min
// 44px tap height throughout via `min-h-11`.
const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'min-h-11 px-4 py-2 text-sm sm:px-5 sm:py-2.5 sm:text-base',
  lg: 'min-h-11 px-6 py-3 text-base sm:px-8 sm:py-4 sm:text-lg',
}

/**
 * The chibi-fantasy button used everywhere: chunky, beveled, with a
 * satisfying press-down effect — scaled back on narrow viewports so it
 * reads as a crisp tap target rather than an oversized blob (`ref` is a
 * plain prop in React 19 — no `forwardRef` needed).
 */
export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ref,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      ref={ref}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border font-heading font-semibold tracking-wide shadow-card transition-all duration-150 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 disabled:active:translate-y-0 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
