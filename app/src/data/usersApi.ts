/**
 * Thin client for `GET /users` — the admin-only Cognito user directory used
 * by the wizard's hero-select player picker (see
 * features/wizard/steps/PlayersStep.tsx). Deliberately not part of
 * WarRepository: it has nothing to do with War persistence, just account
 * lookup for assembling a WarConfig.
 */
import { getAccessToken } from '../auth/accessTokenHolder'
import { getCachedRuntimeConfigOrThrow } from '../config/runtimeConfig'

export interface UserSummary {
  sub: string
  email: string
  /** The account's Cognito `preferred_username`, if an admin has set one.
   * Absent for accounts that haven't been given one yet — use
   * `displayNameFor` rather than reading this directly, so every caller
   * falls back to email the same way. */
  username?: string
}

/** Single source of truth for "what do we call this account" — every place
 * that used to show/store `user.email` directly (the wizard's hero-select
 * grid, `Player.name` at war-creation time) should go through this instead,
 * so a future admin setting/clearing someone's username changes it
 * everywhere at once. */
export function displayNameFor(user: UserSummary): string {
  return user.username?.trim() || user.email
}

export async function fetchAllUsers(): Promise<UserSummary[]> {
  const token = getAccessToken()
  if (!token) {
    throw new Error('No active session. Please sign in again.')
  }
  const { apiBaseUrl } = getCachedRuntimeConfigOrThrow()
  const res = await fetch(`${apiBaseUrl}/users`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(`Failed to load users: ${res.status} ${res.statusText}`)
  }
  const body = (await res.json()) as { users: UserSummary[] }
  return body.users
}
