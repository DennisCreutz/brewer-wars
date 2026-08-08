import { AuthProvider as OidcAuthProvider, useAuth, type AuthProviderProps } from 'react-oidc-context'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import type { User } from 'oidc-client-ts'
import type { RuntimeConfig } from '../config/runtimeConfig'
import { WebStorageStateStore } from 'oidc-client-ts'
import { setAccessToken, getAccessToken } from './accessTokenHolder'
import { setWarRepository } from '../store/warStore'
import { ApiWarRepository } from '../repository/ApiWarRepository'

/** Keeps the access-token holder and the store's repository in sync with
 * the current oidc session. Must render inside <OidcAuthProvider> to use
 * useAuth(). The repository can't be constructed until we know both the
 * API URL (from runtime config) and have a token provider, so this can't
 * happen at module-eval time (see store/warStore.ts's setWarRepository). */
function RepositorySync({ apiBaseUrl, children }: { apiBaseUrl: string; children: ReactNode }) {
  const auth = useAuth()

  useEffect(() => {
    setAccessToken(auth.user?.access_token ?? null)
  }, [auth.user])

  useEffect(() => {
    setWarRepository(new ApiWarRepository(apiBaseUrl, getAccessToken))
  }, [apiBaseUrl])

  return <>{children}</>
}

export function BrewerWarsAuthProvider({
  config,
  children,
}: {
  config: RuntimeConfig
  children: ReactNode
}) {
  const settings: AuthProviderProps = {
    authority: config.cognitoAuthority,
    client_id: config.cognitoClientId,
    redirect_uri: `${window.location.origin}/auth/callback`,
    post_logout_redirect_uri: `${window.location.origin}/`,
    response_type: 'code',
    scope: 'openid email profile',
    userStore: new WebStorageStateStore({ store: window.localStorage }),
    metadataUrl: `${config.cognitoAuthority}/.well-known/openid-configuration`,
    automaticSilentRenew: true,
    onSigninCallback: (user: User | void) => {
      const state = user?.state as { returnTo?: string } | undefined
      // history.replaceState alone only changes the URL bar — react-router
      // keeps its own notion of the current location and only updates it
      // on a 'popstate' event (or via its own navigate()), which this
      // callback has no access to since it fires outside the React tree.
      // Without the manual dispatch below, the app would stay stuck
      // rendering AuthCallbackPage forever despite the URL bar moving.
      window.history.replaceState({}, document.title, state?.returnTo ?? '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    },
  }

  return (
    <OidcAuthProvider {...settings}>
      <RepositorySync apiBaseUrl={config.apiBaseUrl}>{children}</RepositorySync>
    </OidcAuthProvider>
  )
}
