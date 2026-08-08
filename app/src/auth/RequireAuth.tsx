import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from 'react-oidc-context'
import { LoadingScreen } from '../ui/LoadingScreen'
import { useTranslation } from 'react-i18next'

/**
 * Gates every screen behind a signed-in Cognito session. Nothing renders
 * signed-out — an unauthenticated visit immediately redirects to managed
 * login, remembering the originally-requested path so the post-login
 * bounce (see AuthProvider's onSigninCallback) lands back where the user
 * was headed rather than always on the landing page.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const location = useLocation()
  const { t } = useTranslation()

  useEffect(() => {
    if (auth.isLoading || auth.isAuthenticated || auth.activeNavigator) return
    void auth.signinRedirect({
      state: { returnTo: `${location.pathname}${location.search}` },
    })
  }, [auth, location])

  if (auth.error) {
    return <LoadingScreen label={t('auth.error')} sublabel={auth.error.message} />
  }

  if (!auth.isAuthenticated) {
    return <LoadingScreen label={t('auth.redirecting')} />
  }

  return <>{children}</>
}
