import { useTranslation } from 'react-i18next'
import { MAX_PLAYERS, MIN_PLAYERS, type Player } from '../../../domain/warTypes'
import { Button } from '../../../ui/Button'

interface PlayersStepProps {
  players: Player[]
  onChange: (players: Player[]) => void
}

/**
 * Step 1: add/remove/rename players. Enforces MIN_PLAYERS..MAX_PLAYERS
 * here (Add/Remove buttons disable themselves at the boundary); non-empty
 * trimmed name validation is left to the parent's Next-button gating so
 * that rule lives in exactly one place.
 */
export function PlayersStep({ players, onChange }: PlayersStepProps) {
  const { t } = useTranslation()

  function updateName(id: string, name: string) {
    onChange(players.map((p) => (p.id === id ? { ...p, name } : p)))
  }

  function addPlayer() {
    if (players.length >= MAX_PLAYERS) return
    onChange([...players, { id: crypto.randomUUID(), name: '' }])
  }

  function removePlayer(id: string) {
    if (players.length <= MIN_PLAYERS) return
    onChange(players.filter((p) => p.id !== id))
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-wood-600">
        {t('wizard.players.minMaxHint', { min: MIN_PLAYERS, max: MAX_PLAYERS })}
      </p>
      <ul className="flex flex-col gap-2">
        {players.map((player, index) => (
          <li key={player.id} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-right text-sm text-wood-500" aria-hidden="true">
              {index + 1}.
            </span>
            <input
              type="text"
              value={player.name}
              onChange={(e) => updateName(player.id, e.target.value)}
              placeholder={t('wizard.players.namePlaceholder', { index: index + 1 })}
              aria-label={t('wizard.players.namePlaceholder', { index: index + 1 })}
              className="flex-1 rounded-lg border-2 border-wood-300 bg-parchment-50 px-3 py-2 text-wood-900 placeholder:text-wood-400 focus:border-royal-400 focus:outline-none"
            />
            <Button
              type="button"
              variant="danger"
              className="px-3 py-1.5 text-xs"
              onClick={() => removePlayer(player.id)}
              disabled={players.length <= MIN_PLAYERS}
            >
              {t('wizard.players.removePlayer')}
            </Button>
          </li>
        ))}
      </ul>
      <div>
        <Button
          type="button"
          variant="secondary"
          onClick={addPlayer}
          disabled={players.length >= MAX_PLAYERS}
        >
          + {t('wizard.players.addPlayer')}
        </Button>
      </div>
    </div>
  )
}
