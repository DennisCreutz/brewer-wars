import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useWarStore } from '../../store/warStore'
import { Button } from '../../ui/Button'
import { Panel } from '../../ui/Panel'
import { warPhasePath } from '../../router/paths'
import type { WarSummary } from '../../repository/WarRepository'

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
        className="px-3 py-1.5 text-xs"
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
  const warList = useWarStore((s) => s.warList)
  const warListLoaded = useWarStore((s) => s.warListLoaded)
  const refreshWarList = useWarStore((s) => s.refreshWarList)

  useEffect(() => {
    void refreshWarList()
  }, [refreshWarList])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-10 px-4 py-12">
      <div className="text-center">
        <h1 className="font-display text-6xl font-bold text-parchment-50 text-shadow-title">
          {t('landing.title')}
        </h1>
        <p className="mt-2 font-heading text-lg text-royal-200">{t('landing.subtitle')}</p>
      </div>

      <Button variant="primary" size="lg" onClick={() => navigate('/new')}>
        ⚔️ {t('landing.newWar')}
      </Button>

      <div className="w-full max-w-xl">
        <Panel>
          <h2 className="mb-3 font-heading text-xl font-semibold text-wood-800">{t('landing.loadWar')}</h2>
          {warListLoaded && warList.length === 0 && (
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
