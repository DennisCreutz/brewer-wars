import { hashSeed } from '../domain/rng'
import { getCardIcon } from './cardIcons'
import type { ModifierCard } from '../domain/cardTypes'

const ICON_SIZE_CLASSES = {
  sm: 'text-6xl',
  md: 'text-8xl',
  lg: 'text-9xl',
} as const

/**
 * Deterministic procedural artwork standing in for commissioned card art:
 * a two-tone gradient (hue derived from the card id, so it's stable across
 * renders/reloads) plus a curated emoji icon. Once real artwork lands per
 * card (see `artPrompt` in cards.json for the intended scene), it can
 * simply replace this component's output for that id — nothing else in
 * the app needs to change.
 */
export function PlaceholderArt({
  card,
  className = '',
  size = 'md',
}: {
  card: ModifierCard
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const hash = hashSeed(card.id)
  const hue1 = hash % 360
  const hue2 = (hue1 + 45 + ((hash >>> 8) % 90)) % 360

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${className}`}
      style={{
        background: `radial-gradient(circle at 30% 25%, hsl(${hue1} 70% 55%), hsl(${hue2} 60% 30%) 75%)`,
      }}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_75%,rgba(255,255,255,0.25),transparent_55%)]" />
      <span className={`drop-shadow-lg leading-none select-none ${ICON_SIZE_CLASSES[size]}`}>
        {getCardIcon(card)}
      </span>
    </div>
  )
}
