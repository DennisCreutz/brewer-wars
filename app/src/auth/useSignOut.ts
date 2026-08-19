import { useAuth } from 'react-oidc-context'
import { getCachedRuntimeConfigOrThrow } from '../config/runtimeConfig'
import { setSigningOut } from './signOutTransition'

/** Cognito's discovery document has no standard `end_session_endpoint`, so
 * a full sign-out (clearing the Cognito hosted-login session cookie, not
 * just the local token) needs its non-standard `/logout` endpoint built by
 * hand — see https://docs.aws.amazon.com/cognito/latest/developerguide/logout-endpoint.html
 *
 * `auth.removeUser()` below flips `auth.isAuthenticated` to `false` (it's
 * `react-oidc-context` state, so every mounted `<RequireAuth>` re-renders
 * synchronously). Without the `setSigningOut` guard, `RequireAuth`'s own
 * "not authenticated -> bounce to hosted login" effect can win the race
 * against this function's own `window.location.href` navigation below —
 * actual browser navigation doesn't happen instantly, so there's a real
 * window where both this handler and `RequireAuth` are trying to set
 * `window.location.href` to two different URLs, and whichever runs last
 * wins. That's exactly the "sign out doesn't work" flakiness: sometimes
 * the user gets bounced straight back into a fresh sign-in instead of
 * actually landing on the Cognito logout page. See `signOutTransition.ts`. */
export function useSignOut(): () => Promise<void> {
  const auth = useAuth()
  return async () => {
    setSigningOut(true)
    try {
      const config = getCachedRuntimeConfigOrThrow()
      await auth.removeUser()
      const params = new URLSearchParams({
        client_id: config.cognitoClientId,
        logout_uri: `${window.location.origin}/`,
      })
      window.location.href = `${config.cognitoDomain}/logout?${params.toString()}`
    } catch (err) {
      // Didn't make it to the actual navigation (e.g. runtime config
      // wasn't loaded yet) — let RequireAuth's redirect resume normally
      // instead of leaving the app permanently unable to re-authenticate.
      setSigningOut(false)
      throw err
    }
  }
}
