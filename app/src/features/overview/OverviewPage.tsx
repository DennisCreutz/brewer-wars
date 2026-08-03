import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageShell } from '../../ui/PageShell'
import { LoadingScreen } from '../../ui/LoadingScreen'
import { Panel, PanelTitle } from '../../ui/Panel'
import { Button } from '../../ui/Button'
import { ModifierCardView } from '../../ui/ModifierCardView'
import { useLoadedWar } from '../../router/useLoadedWar'
import { useWarStore } from '../../store/warStore'
import { warPhasePath } from '../../router/paths'
import { getPlayerName } from '../../domain/war'
import { effectiveCustomOptions } from '../../domain/warTypes'
import type { ModifierCard } from '../../domain/cardTypes'
import type { PlayerWarState } from '../../domain/warTypes'

/** Small dashed placeholder box used wherever this screen intentionally
 * withholds information (personal modifiers under the hidden custom
 * option, and every player's commander — always, regardless of that
 * option, since the commander reveal is reserved for the scoring screen). */
function HiddenPlaceholder({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-wood-400 bg-parchment-200/60 px-3 py-2 text-sm text-wood-600">
      <span aria-hidden="true">🎭</span>
      <span>{text}</span>
    </div>
  )
}

function ModifierGroup({ cards, size = 'md' }: { cards: ModifierCard[]; size?: 'sm' | 'md' }) {
  const { t } = useTranslation()
  if (cards.length === 0) {
    return <p className="text-sm text-wood-600">{t('preparation.noneDrawn')}</p>
  }
  return (
    <div className="flex flex-wrap gap-3">
      {cards.map((card) => (
        <ModifierCardView key={card.id} card={card} size={size} />
      ))}
    </div>
  )
}

function PlayerSection({
  player,
  name,
  hiddenPersonalModifiers,
}: {
  player: PlayerWarState
  name: string
  hiddenPersonalModifiers: boolean
}) {
  const { t } = useTranslation()
  return (
    <Panel>
      <PanelTitle>{t('overview.playerModifiers', { name })}</PanelTitle>

      <div className="mb-4 flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-wood-600">
          {t('overview.commanderLabel')}
        </h3>
        {/* Always hidden here regardless of any custom option — the
         * commander reveal is a scoring-screen moment by product decision. */}
        <HiddenPlaceholder text={t('overview.commanderHidden')} />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-wood-600">
          {t('overview.personalModifiersLabel')}
        </h3>
        {hiddenPersonalModifiers ? (
          <HiddenPlaceholder text={t('overview.hiddenModifiers')} />
        ) : (
          <ModifierGroup cards={player.personalModifiers} size="sm" />
        )}
      </div>
    </Panel>
  )
}

/** Read-only battle reference: everyone reviews the shared modifiers and
 * (unless hidden) each other's personal ones before playing the physical
 * game. No gating besides the single "Begin the Battle" action — players
 * may revisit this screen (e.g. via browser back) mid-game. */
export function OverviewPage() {
  const { war, status } = useLoadedWar('overview')
  const { t } = useTranslation()
  const navigate = useNavigate()
  const dispatch = useWarStore((s) => s.dispatch)
  const [isAdvancing, setIsAdvancing] = useState(false)

  if (status === 'loading' || !war) return <LoadingScreen />

  const options = effectiveCustomOptions(war.config)

  async function handleBeginBattle() {
    if (!war) return
    setIsAdvancing(true)
    try {
      await dispatch({ type: 'ADVANCE_TO_SCORING' })
      navigate(warPhasePath(war.id, 'scoring'))
    } finally {
      setIsAdvancing(false)
    }
  }

  return (
    <PageShell title={t('overview.title')}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Panel>
          <PanelTitle>{t('overview.globalModifiers')}</PanelTitle>
          <ModifierGroup cards={war.activeGlobalModifiers} size="md" />
        </Panel>

        <Panel>
          <PanelTitle>{t('overview.scoreModifiers')}</PanelTitle>
          <ModifierGroup cards={war.activeScoreModifiers} size="md" />
        </Panel>
      </div>

      <div className="flex flex-col gap-4">
        {war.players.map((player) => (
          <PlayerSection
            key={player.playerId}
            player={player}
            name={getPlayerName(war.config.players, player.playerId)}
            hiddenPersonalModifiers={options.hiddenPersonalModifiers}
          />
        ))}
      </div>

      <div className="flex justify-center py-4">
        <Button
          variant="primary"
          size="lg"
          disabled={isAdvancing}
          onClick={() => void handleBeginBattle()}
        >
          ⚔️ {t('overview.beginBattle')}
        </Button>
      </div>
    </PageShell>
  )
}
