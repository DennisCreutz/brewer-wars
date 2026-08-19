import type { ModifierCard, ModifierKind } from '../domain/cardTypes'
import { PlaceholderArt } from './PlaceholderArt'

const MODIFIER_LABEL: Record<ModifierKind, string> = {
  global: 'Global',
  personal: 'Personal',
  score: 'Score',
}

const MODIFIER_BADGE_CLASSES: Record<ModifierKind, string> = {
  global: 'bg-modifier-global text-white',
  personal: 'bg-modifier-personal text-white',
  score: 'bg-modifier-score text-wood-900',
}

const DIFFICULTY_GLOW: Record<number, string> = {
  1: 'shadow-[0_0_0_2px_var(--color-difficulty-1),0_0_18px_-4px_var(--color-difficulty-1)]',
  2: 'shadow-[0_0_0_2px_var(--color-difficulty-2),0_0_18px_-4px_var(--color-difficulty-2)]',
  3: 'shadow-[0_0_0_2px_var(--color-difficulty-3),0_0_22px_-2px_var(--color-difficulty-3)]',
  4: 'shadow-[0_0_0_2px_var(--color-difficulty-4),0_0_26px_-2px_var(--color-difficulty-4)]',
  5: 'shadow-[0_0_0_3px_var(--color-difficulty-5),0_0_32px_0px_var(--color-difficulty-5)]',
}

export type ModifierCardSize = 'sm' | 'md' | 'lg'

// `w-full max-w-*` (percentage width + a capped max-width) — NOT
// `w-[min(_,100%)]` — is what actually lets these cards shrink inside a
// narrow flex/grid parent. A CSS `min()` mixing an absolute length with a
// percentage is ambiguous during intrinsic/min-content sizing (percentages
// don't resolve at that point), so browsers fall back to the absolute
// operand as the element's minimum content contribution — which, combined
// with flex/grid items' default `min-width: auto`, forces ANCESTORS to
// blow out to fit it instead of ever letting the card shrink. `w-full` is
// a plain percentage (ignored/treated as auto for intrinsic sizing, so it
// imposes no minimum), and `max-w-*` only ever caps growth — the
// combination is the standard, unambiguous "fluid but capped" pattern.
const SIZE_CLASSES: Record<
  ModifierCardSize,
  { root: string; art: string; name: string; badge: string; meta: string; desc: string }
> = {
  sm: {
    root: 'w-full max-w-52',
    art: 'h-28',
    name: 'text-sm',
    badge: 'text-[10px] px-2 py-0.5',
    meta: 'text-[11px]',
    desc: 'text-xs leading-snug line-clamp-4',
  },
  md: {
    root: 'w-full max-w-72',
    art: 'h-40',
    name: 'text-lg',
    badge: 'text-xs px-2.5 py-1',
    meta: 'text-xs',
    desc: 'text-sm leading-snug line-clamp-5',
  },
  lg: {
    root: 'w-full max-w-96',
    art: 'h-56',
    name: 'text-2xl',
    badge: 'text-sm px-3 py-1',
    meta: 'text-sm',
    desc: 'text-base leading-snug line-clamp-7',
  },
}

export interface ModifierCardViewProps {
  card: ModifierCard
  size?: ModifierCardSize
  /** Shows a small "rejected" treatment for draw-log playback (conflict/solo). */
  rejected?: boolean
  className?: string
}

/** The MTG-styled modifier card: name, modifier-kind badge, category/type
 * line, placeholder artwork, and a difficulty-tier glow (cosmetic rarity
 * ramp derived from the original sheet's "Type" column — see cardTypes.ts). */
export function ModifierCardView({
  card,
  size = 'md',
  rejected = false,
  className = '',
}: ModifierCardViewProps) {
  const sizes = SIZE_CLASSES[size]
  return (
    <div
      className={`flex min-w-0 flex-col overflow-hidden rounded-xl border-2 border-wood-700 bg-parchment-50 transition-opacity ${sizes.root} ${DIFFICULTY_GLOW[card.difficulty]} ${rejected ? 'opacity-40 grayscale' : ''} ${className}`}
    >
      <div className="flex items-center justify-between gap-1.5 bg-wood-700 px-2.5 py-1.5">
        <span
          title={card.name}
          className={`min-w-0 flex-1 truncate font-heading font-semibold text-parchment-50 ${sizes.name}`}
        >
          {card.name}
        </span>
        <span
          className={`shrink-0 rounded-full font-bold uppercase tracking-wide ${MODIFIER_BADGE_CLASSES[card.modifier]} ${sizes.badge}`}
        >
          {MODIFIER_LABEL[card.modifier]}
        </span>
      </div>
      <PlaceholderArt card={card} size={size} className={sizes.art} />
      <div
        className={`flex items-center justify-between border-y border-wood-300 bg-parchment-200 px-2.5 py-1 font-semibold uppercase tracking-wide text-wood-700 ${sizes.meta}`}
      >
        <span>{card.category === 'untyped' ? '—' : card.category}</span>
        <span>{card.target}</span>
      </div>
      <p className={`flex-1 px-2.5 py-2 text-wood-800 ${sizes.desc}`}>{card.description}</p>
    </div>
  )
}
