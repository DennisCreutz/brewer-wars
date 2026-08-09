import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { PageShell } from '../../ui/PageShell'
import { LoadingScreen } from '../../ui/LoadingScreen'
import { Panel, PanelTitle } from '../../ui/Panel'
import { Button } from '../../ui/Button'
import { PlayerBadge } from '../../ui/PlayerBadge'
import { useLoadedWar } from '../../router/useLoadedWar'
import { useGoHome } from '../../router/useGoHome'
import { paths } from '../../router/paths'
import { getPlayerName } from '../../domain/war'
import { usePodiumConfetti } from './usePodiumConfetti'
import type { PlayerId, War } from '../../domain/warTypes'
import type { PlayerScoreBreakdown, ScoringResult } from '../../domain/scoring'

const RANK_MEDALS = ['🥇', '🥈', '🥉'] as const

/** Every player's commander is public knowledge by the time the war
 * concludes (revealed back on the scoring screen) — safe to use as the
 * PlayerBadge portrait everywhere on this page. */
function commanderImageFor(war: War, playerId: PlayerId): string | null {
  return war.players.find((p) => p.playerId === playerId)?.commander?.imageUrl ?? null
}

/** The trophy spotlight up top: one or more co-winners, each shown big. */
function WinnerSpotlight({ war, winners }: { war: War; winners: PlayerScoreBreakdown[] }) {
  const { t } = useTranslation()
  return (
    <Panel ornate className="text-center">
      <PanelTitle className="text-center">
        {winners.length > 1 ? t('podium.coWinners') : t('podium.winner')}
      </PanelTitle>
      <div className="flex flex-wrap items-center justify-center gap-10 py-2">
        {winners.map((winner) => (
          <div key={winner.playerId} className="flex flex-col items-center gap-2">
            <span className="animate-float text-5xl" aria-hidden="true">
              🏆
            </span>
            <PlayerBadge
              playerId={winner.playerId}
              name={getPlayerName(war.config.players, winner.playerId)}
              commanderImageUrl={commanderImageFor(war, winner.playerId)}
              size="lg"
            />
            <span className="font-display text-4xl font-bold text-royal-700 text-shadow-title">
              {winner.total}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide text-wood-500">
              {t('podium.totalLabel')}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function BreakdownStat({ value, label }: { value: number; label: string }) {
  return (
    // Reading/DOM order stays semantically dt-then-dd (label, then value —
    // "Win Bonus: 2" reads more sensibly than "2: Win Bonus" for assistive
    // tech); `flex-col-reverse` flips only the *visual* order so sighted
    // users see the big number first.
    <div className="flex flex-col-reverse rounded-lg bg-wood-500/10 py-1.5">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-wood-500">{label}</dt>
      <dd className="font-heading text-base font-bold text-wood-900">{value}</dd>
    </div>
  )
}

function RankedRow({
  breakdown,
  place,
  playerName,
  commanderImageUrl,
  isWinner,
}: {
  breakdown: PlayerScoreBreakdown
  place: number
  playerName: string
  commanderImageUrl: string | null
  isWinner: boolean
}) {
  const { t } = useTranslation()
  const medal = RANK_MEDALS[place - 1] as string | undefined

  return (
    <li
      className={`rounded-xl border-2 p-4 transition ${
        isWinner
          ? 'border-royal-400 bg-royal-400/10 shadow-card'
          : 'border-wood-300/40 bg-parchment-50/50'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-8 shrink-0 text-center font-heading text-lg font-bold text-wood-700">
            {medal ? (
              <>
                <span aria-hidden="true">{medal}</span>
                <span className="sr-only">{t('podium.rank', { place })}</span>
              </>
            ) : (
              t('podium.rank', { place })
            )}
          </span>
          <PlayerBadge
            playerId={breakdown.playerId}
            name={playerName}
            commanderImageUrl={commanderImageUrl}
            size="md"
          />
        </div>
        <span className="font-display text-2xl font-bold text-royal-600">{breakdown.total}</span>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <BreakdownStat value={breakdown.winPoints} label={t('podium.winBonusLabel')} />
        <BreakdownStat
          value={breakdown.votePoints}
          label={t('podium.votesReceived', { count: breakdown.votesReceived })}
        />
        <BreakdownStat value={breakdown.scoreCardPoints} label={t('podium.scoreCardBonusLabel')} />
      </dl>
    </li>
  )
}

function RankedList({
  war,
  finalScore,
  winnerIds,
}: {
  war: War
  finalScore: ScoringResult
  winnerIds: Set<PlayerId>
}) {
  const { t } = useTranslation()
  return (
    <Panel>
      <PanelTitle>{t('podium.finalScore')}</PanelTitle>
      <ol className="flex flex-col gap-3">
        {finalScore.ranked.map((breakdown, index) => (
          <RankedRow
            key={breakdown.playerId}
            breakdown={breakdown}
            place={index + 1}
            playerName={getPlayerName(war.config.players, breakdown.playerId)}
            commanderImageUrl={commanderImageFor(war, breakdown.playerId)}
            isWinner={winnerIds.has(breakdown.playerId)}
          />
        ))}
      </ol>
    </Panel>
  )
}

function PodiumActions() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  // See router/useGoHome.ts for why leaving safely needs more than a plain
  // navigate() — the race this sidesteps was originally discovered here.
  const handleBackToLanding = useGoHome()

  return (
    <div className="flex flex-wrap justify-center gap-4 pb-4">
      <Button type="button" variant="secondary" size="lg" onClick={handleBackToLanding}>
        {t('podium.backToLanding')}
      </Button>
      <Button type="button" variant="primary" size="lg" onClick={() => navigate(paths.newWar)}>
        ⚔️ {t('podium.newWar')}
      </Button>
    </div>
  )
}

/**
 * The final podium: `war.finalScore` was frozen by the `CONCLUDE_WAR`
 * reducer case the instant the war left the scoring phase, so it is read
 * directly here rather than recomputed — historical results never
 * silently change if the scoring engine evolves later.
 */
export function PodiumPage() {
  const { t } = useTranslation()
  const { war, status } = useLoadedWar('concluded')

  // Called unconditionally (rules-of-hooks) using an optional-chained,
  // safe-by-construction `active` value — the loading guard below returns
  // early from the *render*, not from calling this hook.
  usePodiumConfetti(Boolean(war?.finalScore && war.finalScore.winners.length > 0))

  if (status === 'loading' || !war || !war.finalScore) return <LoadingScreen />

  const finalScore = war.finalScore
  const winnerIds = new Set(finalScore.winners.map((w) => w.playerId))

  return (
    <PageShell title={t('podium.title')}>
      <WinnerSpotlight war={war} winners={finalScore.winners} />
      <RankedList war={war} finalScore={finalScore} winnerIds={winnerIds} />
      <PodiumActions />
    </PageShell>
  )
}
