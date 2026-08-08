import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MAX_PLAYERS, MIN_PLAYERS, type Player } from '../../../domain/warTypes'
import { fetchAllUsers, type UserSummary } from '../../../data/usersApi'
import { Identicon } from '../../../ui/Identicon'

interface PlayersStepProps {
  players: Player[]
  onChange: (players: Player[]) => void
}

/**
 * Step 1: pick which real accounts are playing this war, hero-select-grid
 * style — one card per Cognito account (fetched via GET /users, admin-only),
 * with a generated identicon. Selecting a card adds it as a `Player`
 * (selection order becomes player order); selecting an already-picked card
 * again removes it. Replaces the old free-text name entry: every player is
 * now a real signed-in account so members can see and act on their own
 * turn from their own device (see ui/TurnGate.tsx).
 */
export function PlayersStep({ players, onChange }: PlayersStepProps) {
  const { t } = useTranslation()
  const [users, setUsers] = useState<UserSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchAllUsers()
      .then((list) => {
        if (!cancelled) setUsers(list)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedUserIds = new Set(players.map((p) => p.userId))

  function toggleUser(user: UserSummary) {
    if (selectedUserIds.has(user.sub)) {
      onChange(players.filter((p) => p.userId !== user.sub))
      return
    }
    if (players.length >= MAX_PLAYERS) return
    onChange([...players, { id: crypto.randomUUID(), name: user.email, userId: user.sub }])
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-wood-600">
        {t('wizard.players.minMaxHint', { min: MIN_PLAYERS, max: MAX_PLAYERS })}
      </p>

      {error && (
        <p role="alert" className="text-sm font-semibold text-ember-600">
          {error}
        </p>
      )}

      {!users && !error && <p className="text-sm text-wood-500">{t('common.loading')}</p>}

      {users && users.length === 0 && (
        <p className="text-sm text-wood-500">{t('wizard.players.noAccounts')}</p>
      )}

      {users && users.length > 0 && (
        <ul
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
          aria-label={t('wizard.players.title')}
        >
          {users.map((user) => {
            const index = players.findIndex((p) => p.userId === user.sub)
            const selected = index !== -1
            const disabled = !selected && players.length >= MAX_PLAYERS
            return (
              <li key={user.sub}>
                <button
                  type="button"
                  onClick={() => toggleUser(user)}
                  disabled={disabled}
                  aria-pressed={selected}
                  className={`group relative flex w-full flex-col items-center gap-2 rounded-xl border-2 p-3 text-center transition-all ${
                    selected
                      ? 'border-royal-400 bg-royal-400/20 shadow-[0_0_0_3px_rgba(99,102,241,0.35)]'
                      : disabled
                        ? 'cursor-not-allowed border-wood-300/40 bg-parchment-50/40 opacity-50'
                        : 'border-wood-300 bg-parchment-50 hover:border-royal-300 hover:bg-royal-400/10'
                  }`}
                >
                  {selected && (
                    <span
                      className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-royal-400 text-xs font-bold text-wood-900"
                      aria-hidden="true"
                    >
                      {index + 1}
                    </span>
                  )}
                  <Identicon seed={user.sub} size={56} className="rounded-lg" />
                  <span className="w-full truncate text-xs font-semibold text-wood-800">
                    {user.email}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
