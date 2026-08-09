import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { PlayerBadge } from './PlayerBadge'

/**
 * Shared "nothing to do right now" summary screen shown by TurnGate's
 * `waiting` slot. Lists whichever players still have something pending
 * (there can be more than one at once now that turns aren't serialized —
 * see ui/TurnGate.tsx) plus an optional headline override for the "it's
 * specifically me who's already finished" case.
 */
export function WaitingPanel({
  heading,
  pendingPlayers,
  variant = 'page',
  extra,
}: {
  heading: string
  pendingPlayers: readonly { id: string; name: string }[]
  variant?: 'page' | 'panel'
  extra?: ReactNode
}) {
  const { t } = useTranslation()

  const headingClasses =
    variant === 'panel'
      ? 'max-w-sm font-heading text-2xl text-wood-900'
      : 'max-w-sm font-heading text-2xl text-parchment-50 text-shadow-title'
  const subClasses =
    variant === 'panel'
      ? 'max-w-xs text-sm text-wood-600'
      : 'max-w-xs text-sm text-parchment-200/70'
  const containerClasses =
    variant === 'panel'
      ? 'flex min-h-[30vh] flex-col items-center justify-center gap-4 py-6 text-center'
      : 'flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center'

  return (
    <div className={containerClasses}>
      <p className={headingClasses}>{heading}</p>
      {pendingPlayers.length > 0 && (
        <>
          <p className={subClasses}>{t('common.waitingOn.subheading')}</p>
          <div className="flex flex-wrap justify-center gap-3">
            {pendingPlayers.map((p) => (
              <PlayerBadge key={p.id} playerId={p.id} name={p.name} size="sm" />
            ))}
          </div>
        </>
      )}
      {extra}
    </div>
  )
}
