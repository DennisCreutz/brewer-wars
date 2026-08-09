import { useState } from 'react'
import { hashSeed, mulberry32, shuffle } from '../domain/rng'
import { Identicon } from './Identicon'

const AVATAR_POOL_SIZE = 10
const THOMAS_AVATAR_PATH = '/avatars/avatar-thomas.webp'

/** This app has no separate display-name field distinct from the account
 * itself — `usersApi.ts`'s `displayNameFor` falls back to email when no
 * Cognito `preferred_username` has been set. "The user is named Thomas" is
 * read as *that* effective username containing "thomas", case-insensitive
 * — a substring match, deliberately looser than an exact-name check, since
 * that's what was asked for. An account with no username at all never
 * matches (email is not considered here — only a real username qualifies). */
export function isThomas(username: string | undefined): boolean {
  return !!username && username.toLowerCase().includes('thomas')
}

/**
 * Assigns every account in the picker a chibi profile picture such that no
 * two non-Thomas accounts ever share one (see
 * tools/generate-card-art.ts for how the 10-image pool + the exclusive
 * Thomas image were generated).
 *
 * A per-account independent hash (the previous approach) can't guarantee
 * uniqueness — it has no visibility into what anyone else got. This
 * computes the whole picker's assignment at once instead:
 *   1. Every account whose username matches `isThomas` gets the exclusive
 *      image. If more than one account matches, all of them get it —
 *      "always and exclusive" is about the image never going to anyone
 *      else, not a promise that at most one account can match.
 *   2. Everyone else is sorted by `sub` (a fixed, content-independent
 *      order, so the assignment doesn't reshuffle just because the API
 *      happened to return accounts in a different order) and zipped
 *      against a deterministic shuffle of the 10-slot pool, seeded from
 *      the full sorted `sub` list — same account list in, same assignment
 *      out, every time, but "looks arbitrary" per account.
 *   3. Beyond 10 non-Thomas accounts the pool wraps (the 11th account
 *      reuses the 1st's image) rather than duplicating randomly — a
 *      stated limitation, not a blocker, given `MAX_PLAYERS` is 8.
 */
export function assignAvatars(accounts: { sub: string; username?: string }[]): Map<string, string> {
  const result = new Map<string, string>()
  const otherSubs: string[] = []

  for (const account of accounts) {
    if (isThomas(account.username)) {
      result.set(account.sub, THOMAS_AVATAR_PATH)
    } else {
      otherSubs.push(account.sub)
    }
  }

  const sortedSubs = [...otherSubs].sort()
  const poolIndices = shuffle(
    Array.from({ length: AVATAR_POOL_SIZE }, (_, i) => i + 1),
    mulberry32(hashSeed(...sortedSubs)),
  )

  sortedSubs.forEach((sub, i) => {
    result.set(sub, `/avatars/avatar-${poolIndices[i % poolIndices.length]}.webp`)
  })

  return result
}

/**
 * Chibi-fantasy profile picture for the wizard's hero-select grid (see
 * features/wizard/steps/PlayersStep.tsx, which computes `src` for every
 * tile at once via `assignAvatars`), with the account's existing Identicon
 * as the fallback — same technique as ui/PlaceholderArt.tsx: the fallback
 * renders unconditionally as the base layer, the real image sits on top,
 * and `onError` unmounts it, leaving Identicon showing. A missing avatar
 * file is therefore harmless by construction, exactly like card art.
 */
export function PlayerAvatar({
  src,
  sub,
  size = 64,
  className = '',
}: {
  src: string
  sub: string
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <Identicon seed={sub} size={size} className="absolute inset-0" />
      {!failed && (
        <img
          key={src}
          src={src}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full rounded-lg object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}
