import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ALL_CARDS } from '../../../store/warStore'
import type { ModifierCard, ModifierKind } from '../../../domain/cardTypes'
import type { WizardLimits } from '../../../domain/validation'
import { Button } from '../../../ui/Button'
import { NumberField } from '../NumberField'

const MODIFIER_ORDER: readonly ModifierKind[] = ['global', 'personal', 'score']

interface CardGroup {
  modifier: ModifierKind
  category: string
  cards: ModifierCard[]
}

function buildGroups(cards: readonly ModifierCard[]): CardGroup[] {
  const groups = new Map<string, CardGroup>()
  for (const card of cards) {
    const key = `${card.modifier}:${card.category}`
    const existing = groups.get(key)
    if (existing) existing.cards.push(card)
    else groups.set(key, { modifier: card.modifier, category: card.category, cards: [card] })
  }
  return [...groups.values()].sort((a, b) => {
    const kindDiff = MODIFIER_ORDER.indexOf(a.modifier) - MODIFIER_ORDER.indexOf(b.modifier)
    return kindDiff !== 0 ? kindDiff : a.category.localeCompare(b.category)
  })
}

// ALL_CARDS is a static import (233 cards today) — grouping never changes
// at runtime, so it's computed once at module scope instead of on every
// render/keystroke.
const ALL_GROUPS = buildGroups(ALL_CARDS)

interface ModifiersStepProps {
  globalCount: number
  personalCount: number
  scoreCount: number
  onGlobalCountChange: (count: number) => void
  onPersonalCountChange: (count: number) => void
  onScoreCountChange: (count: number) => void
  limits: WizardLimits
  scoreDisabledByGameMode: boolean
  disabledCardIds: Set<string>
  onToggleCard: (id: string) => void
  onSetCardsDisabled: (ids: string[], disabled: boolean) => void
}

/** Step 2: the three deck-size steppers, plus a collapsed-by-default
 * "advanced" per-card browser grouped by modifier then category. */
export function ModifiersStep({
  globalCount,
  personalCount,
  scoreCount,
  onGlobalCountChange,
  onPersonalCountChange,
  onScoreCountChange,
  limits,
  scoreDisabledByGameMode,
  disabledCardIds,
  onToggleCard,
  onSetCardsDisabled,
}: ModifiersStepProps) {
  const { t } = useTranslation()
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [filter, setFilter] = useState('')

  const filterLower = filter.trim().toLowerCase()
  const visibleGroups = useMemo(() => {
    if (!filterLower) return ALL_GROUPS
    return ALL_GROUPS.map((group) => ({
      ...group,
      cards: group.cards.filter((c) => c.name.toLowerCase().includes(filterLower)),
    })).filter((group) => group.cards.length > 0)
  }, [filterLower])

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <NumberField
          id="global-count"
          label={t('wizard.modifiers.globalCount')}
          hint={t('wizard.modifiers.maxHint', { max: limits.global })}
          value={globalCount}
          min={0}
          max={limits.global}
          onChange={onGlobalCountChange}
        />
        <NumberField
          id="personal-count"
          label={t('wizard.modifiers.personalCount')}
          hint={t('wizard.modifiers.maxHint', { max: limits.personal })}
          value={personalCount}
          min={0}
          max={limits.personal}
          onChange={onPersonalCountChange}
        />
        <NumberField
          id="score-count"
          label={t('wizard.modifiers.scoreCount')}
          hint={
            scoreDisabledByGameMode
              ? t('wizard.modifiers.scoreDisabledByCustomMode')
              : t('wizard.modifiers.maxHint', { max: limits.score })
          }
          value={scoreCount}
          min={0}
          max={limits.score}
          onChange={onScoreCountChange}
          disabled={scoreDisabledByGameMode}
        />
      </div>
      <p className="text-xs text-wood-500">{t('wizard.modifiers.disabledHint')}</p>

      <div className="border-t border-wood-300/40 pt-4">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setAdvancedOpen((open) => !open)}
          aria-expanded={advancedOpen}
        >
          {advancedOpen ? '▾' : '▸'} {t('wizard.modifiers.advancedToggle')}
        </Button>
        {!advancedOpen && (
          <p className="mt-2 text-xs text-wood-500">{t('wizard.modifiers.allEnabledByDefault')}</p>
        )}

        {advancedOpen && (
          <div className="mt-4 flex flex-col gap-4">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                // This lives inside the wizard's <form> — don't let Enter
                // here advance/submit the wizard while the user is just
                // filtering the card list.
                if (e.key === 'Enter') e.preventDefault()
              }}
              placeholder={t('wizard.modifiers.filterPlaceholder')}
              aria-label={t('wizard.modifiers.filterPlaceholder')}
              className="rounded-lg border-2 border-wood-300 bg-parchment-50 px-3 py-2 text-sm text-wood-900 placeholder:text-wood-400 focus:border-royal-400 focus:outline-none"
            />
            <div className="flex max-h-[28rem] flex-col gap-4 overflow-y-auto pr-1">
              {visibleGroups.map((group) => (
                <CardGroupPanel
                  key={`${group.modifier}:${group.category}`}
                  group={group}
                  disabledCardIds={disabledCardIds}
                  onToggleCard={onToggleCard}
                  onSetCardsDisabled={onSetCardsDisabled}
                />
              ))}
              {visibleGroups.length === 0 && (
                <p className="text-sm text-wood-500">{t('wizard.modifiers.noCardsMatch')}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CardGroupPanel({
  group,
  disabledCardIds,
  onToggleCard,
  onSetCardsDisabled,
}: {
  group: CardGroup
  disabledCardIds: Set<string>
  onToggleCard: (id: string) => void
  onSetCardsDisabled: (ids: string[], disabled: boolean) => void
}) {
  const { t } = useTranslation()
  const ids = group.cards.map((c) => c.id)
  const enabledCount = group.cards.length - ids.filter((id) => disabledCardIds.has(id)).length

  return (
    <div className="rounded-xl border border-wood-300/50 bg-parchment-50/70 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-heading text-sm font-semibold text-wood-800">
          {t(`wizard.modifiers.kind.${group.modifier}`)}
          {group.category !== 'untyped' && (
            <span className="font-normal text-wood-600"> · {group.category}</span>
          )}
          <span className="ml-2 text-xs font-normal text-wood-500">
            {t('wizard.modifiers.enabledOfTotal', {
              enabled: enabledCount,
              total: group.cards.length,
            })}
          </span>
        </h4>
        <div className="flex gap-3 text-xs">
          <button
            type="button"
            className="text-arcane-600 underline hover:text-arcane-500"
            onClick={() => onSetCardsDisabled(ids, false)}
          >
            {t('wizard.modifiers.selectAll')}
          </button>
          <button
            type="button"
            className="text-wood-500 underline hover:text-wood-700"
            onClick={() => onSetCardsDisabled(ids, true)}
          >
            {t('wizard.modifiers.selectNone')}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {group.cards.map((card) => (
          <label
            key={card.id}
            className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-parchment-200/60"
          >
            <input
              type="checkbox"
              checked={!disabledCardIds.has(card.id)}
              onChange={() => onToggleCard(card.id)}
              className="h-4 w-4 accent-royal-500"
            />
            <span className="truncate text-wood-800">{card.name}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
