import { useState } from 'react'
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
 * renders/reloads) plus a curated emoji icon. Always rendered as the base
 * layer — see `PlaceholderArt` below for the generated-art overlay that
 * sits on top of this and falls back to it.
 */
function GradientFallback({
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

/**
 * Card art: tries the generated image at `/art/<id>.webp` (see
 * `tools/generate-card-art.ts`) layered over the deterministic gradient
 * fallback above. If the file doesn't exist — never generated, permanently
 * rejected by the model's content filter, or a `--test`-only run — the
 * `<img>` fails to load and unmounts, leaving the unchanged gradient+icon
 * visible underneath. No lookup table, no build-time join: whether a given
 * card has real art is decided entirely by whether the file is there.
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
  const [artFailed, setArtFailed] = useState(false)

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <GradientFallback card={card} size={size} className="absolute inset-0" />
      {!artFailed && (
        <img
          src={`/art/${card.id}.webp`}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setArtFailed(true)}
        />
      )}
    </div>
  )
}
