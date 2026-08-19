import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from 'react-oidc-context'
import { useWarStore } from '../../store/warStore'
import { Button } from '../../ui/Button'
import { Panel } from '../../ui/Panel'
import { warPhasePath } from '../../router/paths'
import type { WarSummary } from '../../repository/WarRepository'
import { useIsAdmin } from '../../auth/useIsAdmin'
import { useSignOut } from '../../auth/useSignOut'

const PHASE_ICON: Record<WarSummary['phase'], string> = {
  preparation: '📜',
  'personal-draw': '🎴',
  'commander-selection': '👑',
  overview: '🗺️',
  scoring: '⚔️',
  concluded: '🏆',
}

function WarListItem({ war }: { war: WarSummary }) {
  const navigate = useNavigate()
  const deleteWar = useWarStore((s) => s.deleteWar)
  const { t } = useTranslation()

  return (
    <li className="flex items-center gap-3 rounded-xl border border-wood-300/60 bg-parchment-50/60 px-4 py-3 transition hover:bg-parchment-50">
      <span className="text-2xl" aria-hidden="true">
        {PHASE_ICON[war.phase]}
      </span>
      <button
        type="button"
        onClick={() => navigate(warPhasePath(war.id, war.phase))}
        className="flex-1 text-left"
      >
        <p className="font-heading font-semibold text-wood-900">{war.playerNames.join(', ')}</p>
        <p className="text-xs text-wood-600">
          {t('landing.phaseLabel', { phase: t(`common.phases.${war.phase}`) })}
        </p>
      </button>
      <Button
        variant="danger"
        size="md"
        className="min-h-9 px-3 py-1.5 text-xs"
        onClick={() => {
          if (window.confirm(t('landing.deleteConfirm'))) void deleteWar(war.id)
        }}
      >
        {t('common.buttons.delete')}
      </Button>
    </li>
  )
}

export function LandingPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const auth = useAuth()
  const isAdmin = useIsAdmin()
  const signOut = useSignOut()
  const warList = useWarStore((s) => s.warList)
  const warListLoaded = useWarStore((s) => s.warListLoaded)
  const warListError = useWarStore((s) => s.warListError)
  const refreshWarList = useWarStore((s) => s.refreshWarList)
  const resetAllWars = useWarStore((s) => s.resetAllWars)

  useEffect(() => {
    void refreshWarList()
  }, [refreshWarList])

  function handleResetAllWars() {
    if (window.confirm(t('landing.resetAllConfirm'))) void resetAllWars()
  }

  return (
    // No `justify-center` + a floating `absolute` corner element here
    // anymore — that combination meant any extra content (a resumable war
    // in the list below, a longer username, a warListError message) grew
    // the vertically-centered block's height, which pushed its *top* edge
    // up into the fixed-position sign-out corner, overlapping the "Brewer
    // Wars" heading on short mobile viewports. The sign-out row is now a
    // normal flex child (in-flow, right-aligned) so the rest of the
    // content always flows below it instead of risking an overlap.
    <div className="flex min-h-screen flex-col items-center gap-8 px-4 py-8 sm:py-12">
      <div className="flex w-full max-w-xl items-center justify-end gap-3 text-sm text-parchment-200/80">
        <span className="truncate">
          {auth.user?.profile.preferred_username ?? auth.user?.profile.email}
        </span>
        <Button
          variant="secondary"
          size="md"
          className="min-h-9 shrink-0 px-3 py-1.5 text-xs"
          onClick={() => void signOut()}
        >
          {t('common.buttons.signOut')}
        </Button>
      </div>

      <div className="text-center">
        <h1 className="font-display text-6xl font-bold text-parchment-50 text-shadow-title">
          {t('landing.title')}
        </h1>
        <p className="mt-2 font-heading text-lg text-royal-200">{t('landing.subtitle')}</p>
      </div>

      {isAdmin && (
        <Button variant="primary" size="lg" onClick={() => navigate('/new')}>
          ⚔️ {t('landing.newWar')}
        </Button>
      )}

      <div className="w-full max-w-xl">
        <Panel>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold text-wood-800">
              {t('landing.loadWar')}
            </h2>
            {isAdmin && warList.length > 0 && (
              <Button
                variant="danger"
                size="md"
                className="min-h-9 px-3 py-1.5 text-xs"
                onClick={handleResetAllWars}
              >
                🗑️ {t('landing.resetAllGames')}
              </Button>
            )}
          </div>
          {warListError && <p className="text-sm text-red-700">{warListError}</p>}
          {!warListError && warListLoaded && warList.length === 0 && (
            <p className="text-sm text-wood-600">{t('landing.noWars')}</p>
          )}
          {warList.length > 0 && (
            <ul className="flex flex-col gap-2">
              {warList.map((war) => (
                <WarListItem key={war.id} war={war} />
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
