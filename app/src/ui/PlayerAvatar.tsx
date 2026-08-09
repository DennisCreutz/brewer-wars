import { useState } from 'react'
import { hashSeed } from '../domain/rng'
import { Identicon } from './Identicon'

const AVATAR_POOL_SIZE = 10
const THOMAS_AVATAR_PATH = '/avatars/avatar-thomas.webp'

/** This app has no display-name field anywhere — PlayersStep.tsx sets
 * `Player.name` to the account's email directly — so "the user is named
 * Thomas" is read as the email's local-part (before `@`), lowercased,
 * being exactly "thomas". Not a substring match: "thomasmiller@..." does
 * not qualify. */
export function isThomas(email: string): boolean {
  return email.split('@')[0]?.toLowerCase() === 'thomas'
}

/** Deterministic per-account chibi profile picture (see
 * tools/generate-card-art.ts for how these were generated): a fixed
 * exclusive image for Thomas, otherwise one of a 10-image pool chosen by
 * `sub` — the same stable identity Identicon itself seeds from — so the
 * assignment stays the same across renders/reloads rather than re-rolling
 * randomly, and never coincidentally lands on the Thomas image for anyone
 * else. */
export function avatarPathFor(sub: string, email: string): string {
  if (isThomas(email)) return THOMAS_AVATAR_PATH
  const index = hashSeed(sub) % AVATAR_POOL_SIZE
  return `/avatars/avatar-${index + 1}.webp`
}

/**
 * Chibi-fantasy profile picture for the wizard's hero-select grid (see
 * features/wizard/steps/PlayersStep.tsx), with the account's existing
 * Identicon as the fallback — same technique as ui/PlaceholderArt.tsx:
 * the fallback renders unconditionally as the base layer, the real image
 * sits on top, and `onError` unmounts it, leaving Identicon showing. A
 * missing/not-yet-generated avatar file is therefore harmless by
 * construction, exactly like card art.
 */
export function PlayerAvatar({
  sub,
  email,
  size = 64,
  className = '',
}: {
  sub: string
  email: string
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <Identicon seed={sub} size={size} className="absolute inset-0" />
      {!failed && (
        <img
          src={avatarPathFor(sub, email)}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full rounded-lg object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}
