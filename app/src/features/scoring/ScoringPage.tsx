import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { PageShell } from '../../ui/PageShell'
import { LoadingScreen } from '../../ui/LoadingScreen'
import { Panel, PanelTitle } from '../../ui/Panel'
import { Button } from '../../ui/Button'
import { ModifierCardView } from '../../ui/ModifierCardView'
import { PlayerBadge } from '../../ui/PlayerBadge'
import { HotSeatGate } from '../../ui/HotSeatGate'
import { useLoadedWar } from '../../router/useLoadedWar'
import { paths } from '../../router/paths'
import { useWarStore } from '../../store/warStore'
import { computeScoring } from '../../domain/scoring'
import { getPlayerName } from '../../domain/war'
import type { ModifierCard } from '../../domain/cardTypes'
import type { PlayerId, PlayerWarState, War } from '../../domain/warTypes'

const INPUT_CLASSES =
  'rounded-lg border-2 border-wood-300 bg-parchment-50 px-2 py-1 text-sm text-wood-900 ' +
  'focus:border-royal-400 focus:outline-none'

/** Every player's commander is fully revealed on this page by design (see
 * `PlayerRevealCard` below) regardless of `hiddenPersonalModifiers` — safe
 * to use as any `PlayerBadge`'s portrait anywhere on this screen. Takes a
 * bare `playerId` for the spots (scoring breakdown rows, vote targets)
 * where only the id is in hand, not the full `PlayerWarState`. */
function commanderImageFor(war: War, playerId: PlayerId): string | null {
  return war.players.find((p) => p.playerId === playerId)?.commander?.imageUrl ?? null
}

/** One player's fully-revealed commander + personal modifiers. Nothing on
 * this page stays hidden, regardless of `hiddenPersonalModifiers` — that
 * option only hides things *before* scoring, per the confirmed design.
 * The commander portrait is deliberately the visual star of this card
 * (product feedback: "commanders should be much larger and more the
 * highlight") — personal modifiers stay secondary, at their usual small
 * size, underneath. */
function PlayerRevealCard({ player, playerName }: { player: PlayerWarState; playerName: string }) {
  const { t } = useTranslation()
  const commander = player.commander

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-wood-300/50 bg-parchment-50/60 p-4">
      <PlayerBadge
        playerId={player.playerId}
        name={playerName}
        size="md"
        commanderImageUrl={commander?.imageUrl}
      />

      {commander && (
        <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-wood-700 bg-gradient-to-b from-wood-600 to-wood-800 p-3 shadow-card">
          {commander.imageUrl ? (
            <img
              src={commander.imageUrl}
              alt={commander.name}
              className="aspect-[5/7] w-full max-w-sm rounded-lg border-2 border-royal-400 object-cover shadow-card-hover"
            />
          ) : (
            <div className="flex aspect-[5/7] w-full max-w-sm items-center justify-center rounded-lg border-2 border-royal-400 bg-wood-900 p-4">
              <span aria-hidden="true" className="text-5xl">
                👑
              </span>
            </div>
          )}
          <p className="text-center font-heading text-xl font-bold text-parchment-50 text-shadow-title">
            {t('scoring.revealedCommander', { name: commander.name })}
          </p>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-wood-600">
          {t('scoring.revealedModifiers')}
        </p>
        {player.personalModifiers.length === 0 ? (
          <p className="text-xs text-wood-500">—</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {player.personalModifiers.map((card) => (
              <ModifierCardView key={card.id} card={card} size="sm" />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function RevealPanel({ war }: { war: War }) {
  const { t } = useTranslation()
  return (
    <Panel>
      <PanelTitle>{t('scoring.revealTitle')}</PanelTitle>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {war.players.map((player) => (
          <PlayerRevealCard
            key={player.playerId}
            player={player}
            playerName={getPlayerName(war.config.players, player.playerId)}
          />
        ))}
      </div>
    </Panel>
  )
}

/** "Who won the game?" — a fieldset of radio pills (one per player), plus
 * an explicit "no one yet" clear option so the field can validly be unset. */
function GameWinnerPanel({ war }: { war: War }) {
  const { t } = useTranslation()
  const dispatch = useWarStore((s) => s.dispatch)

  return (
    <Panel>
      <PanelTitle>{t('scoring.gameWinner')}</PanelTitle>
      <p className="mb-4 text-sm font-semibold text-royal-600">
        {t('scoring.winBonusHint', { points: war.config.winPoints })}
      </p>
      <fieldset className="flex flex-wrap items-center gap-3">
        <legend className="sr-only">{t('scoring.gameWinner')}</legend>
        {war.players.map((player) => {
          const name = getPlayerName(war.config.players, player.playerId)
          const checked = war.scoring.gameWinnerId === player.playerId
          return (
            <label
              key={player.playerId}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border-2 px-3 py-2 transition ${
                checked
                  ? 'border-royal-400 bg-royal-400/20 shadow-card'
                  : 'border-wood-300/50 bg-parchment-50/50 hover:bg-parchment-50'
              }`}
            >
              <input
                type="radio"
                name="game-winner"
                className="h-4 w-4 accent-royal-500"
                checked={checked}
                onChange={() =>
                  void dispatch({ type: 'SET_GAME_WINNER', playerId: player.playerId })
                }
              />
              <PlayerBadge
                playerId={player.playerId}
                name={name}
                size="sm"
                commanderImageUrl={player.commander?.imageUrl}
              />
            </label>
          )
        })}
        <button
          type="button"
          onClick={() => void dispatch({ type: 'SET_GAME_WINNER', playerId: null })}
          className="rounded-xl border-2 border-transparent px-3 py-2 text-xs font-semibold text-wood-500 hover:underline"
        >
          {t('scoring.winnerNone')}
        </button>
      </fieldset>
    </Panel>
  )
}

function ScoreCardRow({ war, card }: { war: War; card: ModifierCard }) {
  const { t } = useTranslation()
  const dispatch = useWarStore((s) => s.dispatch)

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-wood-300/40 bg-parchment-50/40 p-4 sm:flex-row">
      <ModifierCardView card={card} size="sm" className="shrink-0" />
      <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {war.players.map((player) => {
          const name = getPlayerName(war.config.players, player.playerId)
          const times = war.scoring.scoreCardTally[card.id]?.[player.playerId] ?? 0
          const label = t('scoring.scoreCardInputLabel', { cardName: card.name, name })
          return (
            <div
              key={player.playerId}
              className="flex flex-col items-center gap-1.5 rounded-lg border border-wood-300/50 bg-parchment-50/70 px-2 py-2"
            >
              <PlayerBadge
                playerId={player.playerId}
                name={name}
                size="sm"
                commanderImageUrl={player.commander?.imageUrl}
              />
              {card.repeatable ? (
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={10}
                  step={1}
                  value={times}
                  aria-label={label}
                  onChange={(e) => {
                    const raw = e.target.valueAsNumber
                    const next = Number.isNaN(raw) ? 0 : Math.min(10, Math.max(0, Math.round(raw)))
                    void dispatch({
                      type: 'SET_SCORE_CARD_TALLY',
                      cardId: card.id,
                      playerId: player.playerId,
                      times: next,
                    })
                  }}
                  className={`w-16 text-center ${INPUT_CLASSES}`}
                />
              ) : (
                <input
                  type="checkbox"
                  checked={times > 0}
                  aria-label={label}
                  onChange={(e) =>
                    void dispatch({
                      type: 'SET_SCORE_CARD_TALLY',
                      cardId: card.id,
                      playerId: player.playerId,
                      times: e.target.checked ? 1 : 0,
                    })
                  }
                  className="h-4 w-4 accent-royal-500"
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ScoreCardsPanel({ war }: { war: War }) {
  const { t } = useTranslation()
  return (
    <Panel>
      <PanelTitle>{t('scoring.scoreCards')}</PanelTitle>
      {war.activeScoreModifiers.length === 0 ? (
        <p className="text-sm text-wood-600">{t('scoring.noScoreCards')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {war.activeScoreModifiers.map((card) => (
            <ScoreCardRow key={card.id} war={war} card={card} />
          ))}
        </div>
      )}
    </Panel>
  )
}

/** One player's private hot-seat turn: pick exactly one *other* player as
 * best deck brewer, then confirm. Rendered inside `HotSeatGate`, and keyed
 * by `voter.playerId` from the parent so `selectedId` resets fresh every
 * time the curtain flips to a new voter (same recipe as
 * `PlayerCommanderPicker` in CommanderSelectionPage.tsx). */
function BestBrewerVoteBooth({ war, voter }: { war: War; voter: PlayerWarState }) {
  const { t } = useTranslation()
  const dispatch = useWarStore((s) => s.dispatch)
  const [selectedId, setSelectedId] = useState<PlayerId | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // The reducer itself throws on a self-vote — filtered out client-side
  // too so it's never even offered as a choice (same intent as the old
  // dropdown's exclusion, just expressed as an omitted button instead of
  // an omitted <option>).
  const candidates = war.players.filter((p) => p.playerId !== voter.playerId)

  async function handleConfirm() {
    if (!selectedId) return
    setIsSubmitting(true)
    try {
      await dispatch({
        type: 'SET_BEST_BREWER_VOTE',
        voterId: voter.playerId,
        votedForId: selectedId,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-5 py-2 text-center">
      <p className="max-w-sm font-heading text-lg font-semibold text-wood-800">
        {t('scoring.voteBestBrewerPrompt')}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {candidates.map((candidate) => {
          const name = getPlayerName(war.config.players, candidate.playerId)
          const selected = selectedId === candidate.playerId
          return (
            <button
              key={candidate.playerId}
              type="button"
              aria-pressed={selected}
              aria-label={t('scoring.voteForCandidate', { name })}
              onClick={() => setSelectedId(candidate.playerId)}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 px-4 py-3 transition hover:-translate-y-0.5 ${
                selected
                  ? 'border-royal-400 bg-royal-400/20 shadow-card'
                  : 'border-wood-300/50 bg-parchment-50/50 hover:bg-parchment-50'
              }`}
            >
              <PlayerBadge
                playerId={candidate.playerId}
                name={name}
                size="md"
                commanderImageUrl={candidate.commander?.imageUrl}
              />
            </button>
          )
        })}
      </div>
      <Button
        type="button"
        variant="primary"
        disabled={!selectedId || isSubmitting}
        onClick={() => void handleConfirm()}
      >
        🗳️ {t('scoring.voteConfirm')}
      </Button>
    </div>
  )
}

/** Shown once every player has cast a vote: a full "who voted for whom"
 * log (transparency is a nice-to-have per the brief) plus a per-player
 * vote tally and the resulting bonus points each earned — "and after that
 * it shows all points for that". `LiveTotalPanel` further down folds the
 * same votes into the war's grand total; this is a smaller summary
 * scoped to just this panel. */
function BestBrewerResults({ war }: { war: War }) {
  const { t } = useTranslation()

  const tally = new Map<PlayerId, number>()
  for (const p of war.players) {
    if (p.bestBrewerVoteFor)
      tally.set(p.bestBrewerVoteFor, (tally.get(p.bestBrewerVoteFor) ?? 0) + 1)
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="flex items-center gap-2 font-heading text-base font-semibold text-verdant-700">
        <span aria-hidden="true">✅</span> {t('scoring.votingComplete')}
      </p>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-wood-600">
          {t('scoring.voteLogHeading')}
        </p>
        <ul className="flex flex-col gap-2">
          {war.players.map((voter) => {
            const voterName = getPlayerName(war.config.players, voter.playerId)
            const votedForId = voter.bestBrewerVoteFor
            const votedForName = votedForId
              ? getPlayerName(war.config.players, votedForId)
              : t('scoring.voteForPlaceholder')
            return (
              <li
                key={voter.playerId}
                aria-label={t('scoring.votedFor', { voter: voterName, votedFor: votedForName })}
                className="flex flex-wrap items-center gap-2 rounded-lg bg-parchment-50/50 px-2.5 py-1.5"
              >
                <PlayerBadge
                  playerId={voter.playerId}
                  name={voterName}
                  size="sm"
                  commanderImageUrl={voter.commander?.imageUrl}
                />
                <span aria-hidden="true" className="text-wood-400">
                  →
                </span>
                {votedForId ? (
                  <PlayerBadge
                    playerId={votedForId}
                    name={votedForName}
                    size="sm"
                    commanderImageUrl={commanderImageFor(war, votedForId)}
                  />
                ) : (
                  <span className="text-sm text-wood-500">{votedForName}</span>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-wood-600">
          {t('scoring.voteTallyHeading')}
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {war.players.map((player) => {
            const name = getPlayerName(war.config.players, player.playerId)
            const votes = tally.get(player.playerId) ?? 0
            return (
              <div
                key={player.playerId}
                className="flex flex-col items-center gap-1 rounded-lg border border-wood-300/50 bg-parchment-50/70 px-3 py-2.5"
              >
                <PlayerBadge
                  playerId={player.playerId}
                  name={name}
                  size="sm"
                  commanderImageUrl={player.commander?.imageUrl}
                />
                <span className="font-heading text-lg font-bold text-royal-600">
                  {t('scoring.voteTally', { count: votes })}
                </span>
                <span className="text-xs font-semibold text-wood-500">
                  {t('scoring.voteBonusEarned', { points: votes * war.config.votePoints })}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Best Deck Brewer vote: a hot-seat mini-game in the same panel/position
 * this vote has always lived in. One player at a time — whoever hasn't
 * voted yet — gets a private `HotSeatGate` turn to pick their champ;
 * that's derived straight from existing state (`bestBrewerVoteFor !==
 * null` means "has voted"), no new domain state needed, exactly like
 * `getActivePersonalDrawPlayer`/`getActiveCommanderSelectionPlayer` pick
 * the active hot-seat turn elsewhere (domain/war.ts) — just computed
 * inline here since this progress is presentation-only. Once everyone's
 * voted, `BestBrewerResults` reveals the tally in this same panel. */
function BestBrewerPanel({ war }: { war: War }) {
  const { t } = useTranslation()
  const currentVoter = war.players.find((p) => p.bestBrewerVoteFor === null) ?? null

  return (
    <Panel>
      <PanelTitle>{t('scoring.bestBrewer')}</PanelTitle>
      <p className="mb-4 text-sm text-wood-600">
        {t('scoring.bestBrewerHint')}{' '}
        <span className="font-semibold text-royal-600">
          {t('scoring.voteBonusHint', { points: war.config.votePoints })}
        </span>
      </p>

      {currentVoter ? (
        <HotSeatGate
          playerId={currentVoter.playerId}
          playerName={getPlayerName(war.config.players, currentVoter.playerId)}
        >
          <BestBrewerVoteBooth key={currentVoter.playerId} war={war} voter={currentVoter} />
        </HotSeatGate>
      ) : (
        <BestBrewerResults war={war} />
      )}
    </Panel>
  )
}

/** Recomputed from scratch every render (cheap and pure — see
 * domain/scoring.ts) so the leaderboard is always in perfect lockstep with
 * whatever was just clicked, with zero extra state to keep in sync. */
function LiveTotalPanel({ war }: { war: War }) {
  const { t } = useTranslation()

  const bestBrewerVotes: Partial<Record<PlayerId, PlayerId>> = {}
  for (const p of war.players) {
    if (p.bestBrewerVoteFor) bestBrewerVotes[p.playerId] = p.bestBrewerVoteFor
  }
  const liveScore = computeScoring({
    players: war.players.map((p) => p.playerId),
    winPoints: war.config.winPoints,
    gameWinnerId: war.scoring.gameWinnerId,
    votePoints: war.config.votePoints,
    bestBrewerVotes,
    scoreCards: war.activeScoreModifiers,
    scoreCardTally: war.scoring.scoreCardTally,
  })

  return (
    <Panel>
      <PanelTitle>{t('scoring.liveTotal')}</PanelTitle>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead>
            <tr className="border-b border-wood-300/60 text-xs font-semibold uppercase tracking-wide text-wood-600">
              <th className="py-2 pr-2">{t('common.player')}</th>
              <th className="px-2 py-2 text-right">{t('scoring.colWin')}</th>
              <th className="px-2 py-2 text-right">{t('scoring.colVotes')}</th>
              <th className="px-2 py-2 text-right">{t('scoring.colCards')}</th>
              <th className="py-2 pl-2 text-right">{t('scoring.colTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {liveScore.ranked.map((b) => (
              <tr key={b.playerId} className="border-b border-wood-200/40 last:border-0">
                <td className="py-2 pr-2">
                  <PlayerBadge
                    playerId={b.playerId}
                    name={getPlayerName(war.config.players, b.playerId)}
                    size="sm"
                    commanderImageUrl={commanderImageFor(war, b.playerId)}
                  />
                </td>
                <td className="px-2 py-2 text-right text-wood-800">{b.winPoints}</td>
                <td className="px-2 py-2 text-right text-wood-800">{b.votePoints}</td>
                <td className="px-2 py-2 text-right text-wood-800">{b.scoreCardPoints}</td>
                <td className="py-2 pl-2 text-right font-heading text-lg font-bold text-royal-600">
                  {b.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

/** Gated on a declared game winner: a war that concludes with no winner
 * would score its win bonus to nobody everywhere, which is a legal but
 * odd result to lock in by accident, so this is a UX nudge rather than a
 * hard domain rule (the reducer itself has no such requirement). */
function ConcludeSection({ war }: { war: War }) {
  const { t } = useTranslation()
  const dispatch = useWarStore((s) => s.dispatch)
  const navigate = useNavigate()
  const [isConcluding, setIsConcluding] = useState(false)
  const canConclude = war.scoring.gameWinnerId !== null

  async function handleConclude() {
    setIsConcluding(true)
    try {
      await dispatch({ type: 'CONCLUDE_WAR' })
      navigate(paths.war(war.id, 'concluded'))
    } finally {
      setIsConcluding(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2 pb-4">
      {!canConclude && <p className="text-xs text-wood-400">{t('scoring.concludeHint')}</p>}
      <Button
        type="button"
        variant="primary"
        size="lg"
        disabled={!canConclude || isConcluding}
        onClick={() => void handleConclude()}
      >
        🏆 {t('common.buttons.conclude')}
      </Button>
    </div>
  )
}

/** Scoring & voting phase: everything gets revealed here (personal
 * modifiers and commanders alike, regardless of the wizard's hidden-mode
 * settings), points get assigned from the just-finished physical game,
 * and "Conclude War" freezes the official `finalScore` for the podium. */
export function ScoringPage() {
  const { t } = useTranslation()
  const { war, status } = useLoadedWar('scoring')
  if (status === 'loading' || !war) return <LoadingScreen />

  return (
    <PageShell title={t('scoring.title')}>
      <RevealPanel war={war} />
      <GameWinnerPanel war={war} />
      <ScoreCardsPanel war={war} />
      <BestBrewerPanel war={war} />
      <LiveTotalPanel war={war} />
      <ConcludeSection war={war} />
    </PageShell>
  )
}
