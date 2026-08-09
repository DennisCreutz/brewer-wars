/**
 * Deterministic per-account "generated profile image" for the hero-select
 * user picker (see features/wizard/steps/PlayersStep.tsx). Seeded by the
 * Cognito `sub`/email so the same account always renders the same avatar,
 * with zero external calls, zero storage, and no new dependency — just an
 * inline SVG built from a small string hash.
 */

/** FNV-1a: cheap, deterministic, evenly-distributed enough for picking
 * hues/shapes out of a small palette — cryptographic strength is not a
 * concern here. */
function hash(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const SHAPE_COUNT = 5

function shapeAt(cx: number, cy: number, r: number, variant: number, fill: string) {
  switch (variant) {
    case 0:
      return <circle cx={cx} cy={cy} r={r} fill={fill} />
    case 1:
      return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={r * 0.3} fill={fill} />
    case 2:
      return (
        <polygon points={`${cx},${cy - r} ${cx + r},${cy + r} ${cx - r},${cy + r}`} fill={fill} />
      )
    case 3:
      return (
        <polygon
          points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`}
          fill={fill}
        />
      )
    default:
      return (
        <polygon
          points={Array.from({ length: 6 }, (_, i) => {
            const angle = (Math.PI / 3) * i - Math.PI / 2
            return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`
          }).join(' ')}
          fill={fill}
        />
      )
  }
}

export interface IdenticonProps {
  /** Stable identity to seed the avatar from — pass the account's Cognito
   * `sub` (falls back to email if that's all that's available). */
  seed: string
  size?: number
  className?: string
}

/** Renders a small abstract geometric avatar, deterministic per `seed`. */
export function Identicon({ seed, size = 64, className }: IdenticonProps) {
  const h1 = hash(seed)
  const h2 = hash(`${seed}:2`)
  const h3 = hash(`${seed}:3`)

  const hue = h1 % 360
  const bgFrom = `hsl(${hue}, 55%, 30%)`
  const bgTo = `hsl(${(hue + 40) % 360}, 60%, 20%)`
  const fgHue = (hue + 180) % 360
  const fg1 = `hsl(${fgHue}, 70%, 65%)`
  const fg2 = `hsl(${(fgHue + 25) % 360}, 70%, 75%)`

  const gradientId = `identicon-bg-${h1}`
  const variantA = h2 % SHAPE_COUNT
  const variantB = h3 % SHAPE_COUNT

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={bgFrom} />
          <stop offset="100%" stopColor={bgTo} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="12" fill={`url(#${gradientId})`} />
      {shapeAt(24 + (h2 % 8), 26 + (h3 % 6), 14, variantA, fg1)}
      {shapeAt(42 - (h3 % 8), 42 - (h2 % 6), 10, variantB, fg2)}
    </svg>
  )
}
