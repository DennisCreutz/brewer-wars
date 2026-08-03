import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { PlayerBadge } from './PlayerBadge'
import { Button } from './Button'

/**
 * Full-screen privacy curtain shown before revealing a hot-seat player's
 * turn (personal draw, commander selection). Resets automatically whenever
 * `playerId` changes, so passing the device to the next player always
 * re-shows the curtain — including after a refresh, since this is
 * deliberately local component state, never persisted.
 */
export function HotSeatGate({
  playerId,
  playerName,
  children,
}: {
  playerId: string
  playerName: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  const [revealed, setRevealed] = useState(false)
  const [lastPlayerId, setLastPlayerId] = useState(playerId)

  // "Adjusting state when a prop changes" — resets the curtain the instant
  // the active player changes, without needing an effect.
  if (playerId !== lastPlayerId) {
    setLastPlayerId(playerId)
    setRevealed(false)
  }

  if (revealed) return <>{children}</>

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
      <PlayerBadge playerId={playerId} name={playerName} size="lg" />
      <p className="max-w-sm font-heading text-2xl text-parchment-50 text-shadow-title">
        {t('common.hotSeat.prompt', { name: playerName })}
      </p>
      <p className="max-w-xs text-sm text-parchment-200/70">{t('common.hotSeat.reveal')}</p>
      <Button variant="primary" size="lg" onClick={() => setRevealed(true)}>
        🃏 {t('common.buttons.continue')}
      </Button>
    </div>
  )
}
