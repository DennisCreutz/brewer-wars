import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LoadingScreen } from '../ui/LoadingScreen'

const LandingPage = lazy(() => import('../features/landing/LandingPage').then((m) => ({ default: m.LandingPage })))
const WizardPage = lazy(() => import('../features/wizard/WizardPage').then((m) => ({ default: m.WizardPage })))
const PreparationPage = lazy(() =>
  import('../features/preparation/PreparationPage').then((m) => ({ default: m.PreparationPage })),
)
const PersonalDrawPage = lazy(() =>
  import('../features/personal-draw/PersonalDrawPage').then((m) => ({ default: m.PersonalDrawPage })),
)
const CommanderSelectionPage = lazy(() =>
  import('../features/commander-selection/CommanderSelectionPage').then((m) => ({
    default: m.CommanderSelectionPage,
  })),
)
const OverviewPage = lazy(() => import('../features/overview/OverviewPage').then((m) => ({ default: m.OverviewPage })))
const ScoringPage = lazy(() => import('../features/scoring/ScoringPage').then((m) => ({ default: m.ScoringPage })))
const PodiumPage = lazy(() => import('../features/podium/PodiumPage').then((m) => ({ default: m.PodiumPage })))

export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/new" element={<WizardPage />} />
          <Route path="/war/:warId/preparation" element={<PreparationPage />} />
          <Route path="/war/:warId/personal-draw" element={<PersonalDrawPage />} />
          <Route path="/war/:warId/commander-selection" element={<CommanderSelectionPage />} />
          <Route path="/war/:warId/overview" element={<OverviewPage />} />
          <Route path="/war/:warId/scoring" element={<ScoringPage />} />
          <Route path="/war/:warId/podium" element={<PodiumPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
