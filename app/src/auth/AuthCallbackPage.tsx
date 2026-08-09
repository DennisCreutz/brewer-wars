import { useAuth } from 'react-oidc-context'
import { LoadingScreen } from '../ui/LoadingScreen'
import { useTranslation } from 'react-i18next'

/**
 * The Cognito redirect_uri target. The actual code exchange is performed
 * automatically by react-oidc-context's <AuthProvider>, which is mounted
 * once above the router and detects the `code`/`state` query params
 * regardless of route — this page only needs to show a spinner while that
 * happens, then AuthProvider's onSigninCallback rewrites the URL to the
 * original destination.
 */
export function AuthCallbackPage() {
  const auth = useAuth()
  const { t } = useTranslation()

  if (auth.error) {
    return <LoadingScreen label={t('auth.error')} sublabel={auth.error.message} />
  }

  return <LoadingScreen label={t('auth.completingSignIn')} />
}
