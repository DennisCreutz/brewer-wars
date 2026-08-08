/**
 * Root application component. Loads runtime config (API URL, Cognito
 * pool/client ids — see src/config/runtimeConfig.ts) once at boot, then
 * mounts the auth provider and router. Nothing else renders until config
 * is loaded, since the auth provider needs it to even construct itself.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppRouter } from './router/AppRouter'
import { BrewerWarsAuthProvider } from './auth/AuthProvider'
import { LoadingScreen } from './ui/LoadingScreen'
import { loadRuntimeConfig, type RuntimeConfig } from './config/runtimeConfig'

function App() {
  const { t } = useTranslation()
  const [config, setConfig] = useState<RuntimeConfig | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadRuntimeConfig()
      .then((loaded) => {
        if (!cancelled) setConfig(loaded)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return <LoadingScreen label={t('common.configError')} sublabel={error} />
  }

  if (!config) {
    return <LoadingScreen />
  }

  return (
    <BrewerWarsAuthProvider config={config}>
      <AppRouter />
    </BrewerWarsAuthProvider>
  )
}

export default App
