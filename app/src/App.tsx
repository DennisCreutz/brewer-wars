/**
 * Root application component — router mounting point. The real
 * phase/screen routes are wired in src/router; this stays intentionally
 * thin.
 */
import { AppRouter } from './router/AppRouter'

function App() {
  return <AppRouter />
}

export default App
