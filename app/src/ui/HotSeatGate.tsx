import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { PlayerBadge } from './PlayerBadge'
import { Button } from './Button'

/**
 * Full-screen privacy curtain shown before revealing a hot-seat player's
 * turn (personal draw, commander selection, scoring's best-brewer vote).
 * Resets automatically whenever `playerId` changes, so passing the device
 * to the next player always re-shows the curtain — including after a
 * refresh, since this is deliberately local component state, never
 * persisted.
 *
 * `variant` controls text colour, since this renders in two different
 * contexts: directly on the dark page background ('page', the default —
 * personal draw/commander selection use the curtain as their entire page
 * content) vs. nested inside a light `<Panel>` ('panel' — scoring's
 * best-brewer vote lives inside its own panel alongside other scoring
 * UI). Getting this wrong is exactly the same class of bug as
 * PlayerBadge's old hardcoded-white-text issue: near-white text is
 * unreadable against a light parchment panel background.
 */
export function HotSeatGate({
  playerId,
  playerName,
  variant = 'page',
  children,
}: {
  playerId: string
  playerName: string
  variant?: 'page' | 'panel'
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

  const headingClasses =
    variant === 'panel'
      ? 'max-w-sm font-heading text-2xl text-wood-900'
      : 'max-w-sm font-heading text-2xl text-parchment-50 text-shadow-title'
  const subClasses =
    variant === 'panel' ? 'max-w-xs text-sm text-wood-600' : 'max-w-xs text-sm text-parchment-200/70'

  const containerClasses =
    variant === 'panel'
      ? 'flex min-h-[30vh] flex-col items-center justify-center gap-6 py-6 text-center'
      : 'flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center'

  return (
    <div className={containerClasses}>
      <PlayerBadge playerId={playerId} name={playerName} size="lg" />
      <p className={headingClasses}>{t('common.hotSeat.prompt', { name: playerName })}</p>
      <p className={subClasses}>{t('common.hotSeat.reveal')}</p>
      <Button variant="primary" size="lg" onClick={() => setRevealed(true)}>
        🃏 {t('common.buttons.continue')}
      </Button>
    </div>
  )
}
