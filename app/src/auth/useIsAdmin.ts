import { useAuth } from 'react-oidc-context'

/** Reads the `cognito:groups` claim off the ID token. Mirrors the
 * server-side check in backend/src/lib/auth.ts — the API is the actual
 * enforcement point; this only drives UI affordances (e.g. hiding the
 * "New War" button from non-admins). */
export function useIsAdmin(): boolean {
  const auth = useAuth()
  const claim = auth.user?.profile?.['cognito:groups']
  const groups = Array.isArray(claim) ? claim.map(String) : typeof claim === 'string' ? [claim] : []
  return groups.includes('admins')
}

export function useAccessToken(): string | null {
  const auth = useAuth()
  return auth.user?.access_token ?? null
}
