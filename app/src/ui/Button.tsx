import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  ref?: Ref<HTMLButtonElement>
  children: ReactNode
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-b from-royal-300 to-royal-500 text-wood-900 border-royal-700 hover:from-royal-200 hover:to-royal-400 active:from-royal-400 active:to-royal-600',
  secondary:
    'bg-gradient-to-b from-parchment-200 to-parchment-400 text-wood-900 border-wood-600 hover:from-parchment-100 hover:to-parchment-300 active:from-parchment-300 active:to-parchment-500',
  danger:
    'bg-gradient-to-b from-ember-300 to-ember-500 text-wood-900 border-ember-800 hover:from-ember-200 hover:to-ember-400 active:from-ember-500 active:to-ember-700',
  ghost:
    'bg-transparent text-parchment-100 border-parchment-100/30 hover:bg-parchment-100/10 active:bg-parchment-100/20',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'px-5 py-2.5 text-base',
  lg: 'px-8 py-4 text-lg',
}

/**
 * The chibi-fantasy button used everywhere: chunky, beveled, with a
 * satisfying press-down effect. `ref` is a plain prop in React 19 — no
 * `forwardRef` needed.
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
      className={`inline-flex items-center justify-center gap-2 rounded-xl border-2 font-heading font-semibold tracking-wide shadow-card transition-all duration-150 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 disabled:active:translate-y-0 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
