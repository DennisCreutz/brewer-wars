import { useAuth } from 'react-oidc-context'
import { getCachedRuntimeConfigOrThrow } from '../config/runtimeConfig'

/** Cognito's discovery document has no standard `end_session_endpoint`, so
 * a full sign-out (clearing the Cognito hosted-login session cookie, not
 * just the local token) needs its non-standard `/logout` endpoint built by
 * hand — see https://docs.aws.amazon.com/cognito/latest/developerguide/logout-endpoint.html */
export function useSignOut(): () => Promise<void> {
  const auth = useAuth()
  return async () => {
    const config = getCachedRuntimeConfigOrThrow()
    await auth.removeUser()
    const params = new URLSearchParams({
      client_id: config.cognitoClientId,
      logout_uri: `${window.location.origin}/`,
    })
    window.location.href = `${config.cognitoDomain}/logout?${params.toString()}`
  }
}
