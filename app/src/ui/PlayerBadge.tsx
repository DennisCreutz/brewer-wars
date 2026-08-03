import { hashSeed } from '../domain/rng'

const AVATAR_RING_COLORS = ['ring-arcane-400', 'ring-verdant-400', 'ring-royal-400', 'ring-ember-400'] as const

const AVATAR_BG_COLORS = [
  'bg-arcane-600',
  'bg-verdant-600',
  'bg-royal-600',
  'bg-ember-600',
] as const

export function avatarForPlayer(playerId: string): { ringClass: string; bgClass: string } {
  const hash = hashSeed(playerId)
  return {
    ringClass: AVATAR_RING_COLORS[hash % AVATAR_RING_COLORS.length],
    bgClass: AVATAR_BG_COLORS[hash % AVATAR_BG_COLORS.length],
  }
}

function initialFor(name: string): string {
  const trimmed = name.trim()
  return trimmed ? trimmed[0].toUpperCase() : '?'
}

const SIZE_CLASSES = {
  sm: { avatar: 'h-7 w-7 text-sm', name: 'text-sm' },
  md: { avatar: 'h-10 w-10 text-xl', name: 'text-base' },
  lg: { avatar: 'h-16 w-16 text-3xl', name: 'text-xl' },
} as const

export function PlayerBadge({
  playerId,
  name,
  size = 'md',
  className = '',
  /** Once a player's commander has been revealed (scoring/podium), pass its
   * art here to replace the plain letter avatar with the commander's own
   * portrait — a nice "this is who you became" touch once it's no longer
   * secret. Absent/null before then. */
  commanderImageUrl,
}: {
  playerId: string
  name: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
  commanderImageUrl?: string | null
}) {
  const { ringClass, bgClass } = avatarForPlayer(playerId)
  const sizes = SIZE_CLASSES[size]
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {commanderImageUrl ? (
        <img
          src={commanderImageUrl}
          alt=""
          aria-hidden="true"
          className={`shrink-0 rounded-full object-cover ring-2 ${ringClass} ${sizes.avatar}`}
        />
      ) : (
        <span
          className={`flex shrink-0 items-center justify-center rounded-full font-heading font-bold text-white ring-2 ${bgClass} ${ringClass} ${sizes.avatar}`}
          aria-hidden="true"
        >
          {initialFor(name)}
        </span>
      )}
      {/* No explicit text colour here on purpose: this badge is used both
       * on the dark page background and inside light Panels, so it must
       * inherit whichever colour its container already sets rather than
       * hardcoding one that only looks right in one of those two places. */}
      <span className={`font-heading font-semibold ${sizes.name}`}>{name}</span>
    </span>
  )
}
