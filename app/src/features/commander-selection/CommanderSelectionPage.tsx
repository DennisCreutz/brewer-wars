import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageShell } from '../../ui/PageShell'
import { LoadingScreen } from '../../ui/LoadingScreen'
import { Panel, PanelTitle } from '../../ui/Panel'
import { Button } from '../../ui/Button'
import { WaitingPanel } from '../../ui/WaitingPanel'
import { CommanderCounter } from '../../ui/CommanderCounter'
import { useCommanderFilter } from '../../ui/useCommanderFilter'
import { useLoadedWar } from '../../router/useLoadedWar'
import { useWarStore } from '../../store/warStore'
import { warPhasePath } from '../../router/paths'
import { useCurrentUserId } from '../../auth/useIsAdmin'
import {
  activeCommanderConstraintsFor,
  getMyPlayerId,
  getPlayerName,
  isCommanderSelectionComplete,
} from '../../domain/war'
import { splitAllModifiersForDisplay } from '../../domain/commanderCheck'
import {
  applyCommanderSearchFilters,
  sortCommanders,
  type ColorFilterMode,
  type CommanderSearchFilters,
  type CommanderSortKey,
  type ManaValueOperator,
} from '../../domain/commanderSearch'
import type { PlayerId, War } from '../../domain/warTypes'
import type { CommanderCheck, ModifierCard } from '../../domain/cardTypes'
import type { CommanderSummary } from '../../domain/commanderCheck'

/** How many commanders to render at once — the full pool can be ~3,300
 * entries when few/no constraints apply, so we window it client-side
 * instead of rendering everything (see "Load More" button below). */
const PAGE_SIZE = 60

/** Shared styling for the small filter controls (selects/number input) —
 * mirrors the search input's look at a more compact size. */
const FILTER_CONTROL_CLASSES =
  'rounded-lg border-2 border-wood-300 bg-parchment-50 px-3 py-2 text-sm text-wood-900 ' +
  'focus:border-royal-400 focus:outline-none focus:ring-2 focus:ring-royal-400/40'

const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G'] as const
type CommanderColor = (typeof COLOR_ORDER)[number]

/** Approximate official MTG mana colours — deliberately hex-literal rather
 * than reaching for Tailwind's default red/blue/green shades, since this
 * project's theme only guarantees its own custom `--color-*` tokens. */
const COLOR_SWATCH_CLASSES: Record<CommanderColor, string> = {
  W: 'bg-[#f8f6d8] text-wood-900',
  U: 'bg-[#0e68ab] text-white',
  B: 'bg-[#150b00] text-parchment-100',
  R: 'bg-[#d3202a] text-white',
  G: 'bg-[#00733e] text-white',
}

const COLOR_MODES: readonly ColorFilterMode[] = ['atLeast', 'exact']
const MANA_VALUE_OPERATORS: readonly ManaValueOperator[] = ['eq', 'lte', 'gte']
const SORT_KEYS: readonly CommanderSortKey[] = ['edhrec', 'manaValueAsc', 'manaValueDesc', 'name']

/** A single browsable commander tile: real Scryfall art when available,
 * falling back to a plain name box (no artwork exists for a "no image"
 * commander, unlike ModifierCard's PlaceholderArt which is keyed to card
 * ids, not Scryfall ids). Sized generously (per product feedback that
 * cards were too small everywhere) while still fitting several per row. */
function CommanderTile({
  commander,
  selected,
  onSelect,
}: {
  commander: CommanderSummary
  selected: boolean
  onSelect: () => void
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group flex flex-col overflow-hidden rounded-xl border-2 bg-wood-700 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover ${
        selected ? 'border-royal-400 ring-4 ring-royal-400/70' : 'border-wood-600'
      }`}
    >
      <div className="aspect-[5/7] w-full overflow-hidden bg-wood-800">
        {commander.imageUrl ? (
          <img
            src={commander.imageUrl}
            alt={commander.name}
            loading="lazy"
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-3 text-center">
            <span className="font-heading text-base font-semibold text-parchment-100">
              {commander.name}
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 px-3 py-2.5">
        {/* Only repeat the name here when it isn't already shown in the
         * image fallback above, so each commander's name renders once. */}
        {commander.imageUrl && (
          <span
            className="truncate font-heading text-base font-semibold text-parchment-50"
            title={commander.name}
          >
            {commander.name}
          </span>
        )}
        <span className="truncate text-xs capitalize tracking-wide text-parchment-200/60">
          {commander.rarity} • CMC {commander.cmc}
        </span>
        <span className="truncate text-xs tracking-wide text-parchment-200/60">
          {commander.edhrecRank !== null
            ? `EDHREC #${commander.edhrecRank}`
            : t('commanderSelection.edhrecRankUnknown')}
          {' • '}
          {commander.numDecks !== null
            ? t('commanderSelection.edhrecDeckCount', { count: commander.numDecks })
            : t('commanderSelection.edhrecDeckCountUnknown')}
        </span>
      </div>
    </button>
  )
}

/** One side ("Global" or "Personal") of the commander-target modifier
 * breakdown — each side lists its own auto-checked rules (✓, already
 * folded into the live filter/counter) and manual honour-system rules
 * (checkbox, never blocks selection) as two sub-groups. */
function ModifierRulesPanel({
  title,
  checkable,
  uncheckable,
  manualChecks,
  onToggleManual,
}: {
  title: string
  checkable: { card: ModifierCard; check: CommanderCheck }[]
  uncheckable: ModifierCard[]
  manualChecks: Record<string, boolean>
  onToggleManual: (cardId: string) => void
}) {
  const { t } = useTranslation()
  const isEmpty = checkable.length === 0 && uncheckable.length === 0

  return (
    <Panel>
      <PanelTitle className="text-lg">{title}</PanelTitle>
      {isEmpty ? (
        <p className="text-sm text-wood-600">{t('commanderSelection.noModifiers')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {checkable.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-wood-600">
                {t('commanderSelection.checkedRules')}
              </h3>
              <ul className="flex flex-col gap-1.5 text-sm text-wood-700">
                {checkable.map(({ card }) => (
                  <li key={card.id} className="flex items-center gap-2">
                    <span aria-hidden="true" className="font-bold text-verdant-600">
                      ✓
                    </span>
                    <span>{t('commanderSelection.appliedRule', { name: card.name })}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {uncheckable.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-wood-600">
                {t('commanderSelection.manualRules')}
              </h3>
              <ul className="flex flex-col gap-2.5">
                {uncheckable.map((card) => (
                  <li key={card.id}>
                    <label className="flex cursor-pointer items-start gap-2 text-sm text-wood-800">
                      <input
                        type="checkbox"
                        checked={Boolean(manualChecks[card.id])}
                        onChange={() => onToggleManual(card.id)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-royal-500"
                      />
                      <span>
                        <span className="font-semibold">{card.name}</span>
                        <span className="block text-xs text-wood-600">{card.description}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}

/** The optional, player-driven browsing refinements row: colour identity,
 * mana value, and sort order — layered on top of (never loosening) the
 * mandatory modifier-filtered pool. See domain/commanderSearch.ts. */
function CommanderFilterControls({
  filters,
  manaValueOperator,
  sortKey,
  onColorModeChange,
  onToggleColor,
  onManaValueOperatorChange,
  onManaValueChange,
  onSortKeyChange,
  onClear,
}: {
  filters: CommanderSearchFilters
  manaValueOperator: ManaValueOperator
  sortKey: CommanderSortKey
  onColorModeChange: (mode: ColorFilterMode) => void
  onToggleColor: (color: string) => void
  onManaValueOperatorChange: (operator: ManaValueOperator) => void
  onManaValueChange: (raw: string) => void
  onSortKeyChange: (key: CommanderSortKey) => void
  onClear: () => void
}) {
  const { t } = useTranslation()
  // The name-query text input itself lives in the parent (right above this
  // row, alongside the "showing N of M" count) — this component only needs
  // to know whether *any* filter (including name) is active, to decide
  // whether "Clear filters" should render.
  const selectedColors = filters.color?.colors ?? []
  const colorMode = filters.color?.mode ?? 'atLeast'
  const hasActiveFilters =
    Boolean(filters.nameQuery?.trim()) || selectedColors.length > 0 || Boolean(filters.manaValue)

  return (
    <div className="mb-5 flex flex-col gap-4 rounded-xl border border-wood-300/60 bg-parchment-200/40 p-4 lg:flex-row lg:flex-wrap lg:items-end lg:gap-6">
      {/* Colour identity */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-wood-600">
          {t('commanderSelection.filters.colorLabel')}
        </span>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex gap-3 text-xs text-wood-700">
            {COLOR_MODES.map((mode) => (
              <label key={mode} className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  name="commander-color-mode"
                  checked={colorMode === mode}
                  onChange={() => onColorModeChange(mode)}
                  className="h-3.5 w-3.5 accent-royal-500"
                />
                {t(`commanderSelection.filters.colorMode.${mode}`)}
              </label>
            ))}
          </div>
          <div className="flex gap-1.5">
            {COLOR_ORDER.map((code) => {
              const active = selectedColors.includes(code)
              return (
                <button
                  key={code}
                  type="button"
                  aria-pressed={active}
                  aria-label={t(`commanderSelection.filters.colorNames.${code}`)}
                  title={t(`commanderSelection.filters.colorNames.${code}`)}
                  onClick={() => onToggleColor(code)}
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-wood-800 font-heading text-sm font-bold shadow-card transition ${COLOR_SWATCH_CLASSES[code]} ${
                    active
                      ? 'ring-2 ring-royal-400 ring-offset-2 ring-offset-parchment-100'
                      : 'opacity-40 hover:opacity-75'
                  }`}
                >
                  {code}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Mana value */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-wood-600">
          {t('commanderSelection.filters.manaValueLabel')}
        </span>
        <div className="flex items-center gap-2">
          <select
            value={manaValueOperator}
            aria-label={t('commanderSelection.filters.manaValueOperatorAria')}
            onChange={(e) => onManaValueOperatorChange(e.target.value as ManaValueOperator)}
            className={FILTER_CONTROL_CLASSES}
          >
            {MANA_VALUE_OPERATORS.map((op) => (
              <option key={op} value={op}>
                {t(`commanderSelection.filters.manaValueOperators.${op}`)}
              </option>
            ))}
          </select>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={filters.manaValue?.value ?? ''}
            onChange={(e) => onManaValueChange(e.target.value)}
            placeholder={t('commanderSelection.filters.manaValuePlaceholder')}
            aria-label={t('commanderSelection.filters.manaValueLabel')}
            className={`w-20 ${FILTER_CONTROL_CLASSES}`}
          />
        </div>
      </div>

      {/* Sort order */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="commander-sort-key"
          className="text-xs font-semibold uppercase tracking-wide text-wood-600"
        >
          {t('commanderSelection.filters.sortLabel')}
        </label>
        <select
          id="commander-sort-key"
          value={sortKey}
          onChange={(e) => onSortKeyChange(e.target.value as CommanderSortKey)}
          className={FILTER_CONTROL_CLASSES}
        >
          {SORT_KEYS.map((key) => (
            <option key={key} value={key}>
              {t(`commanderSelection.filters.sortOptions.${key}`)}
            </option>
          ))}
        </select>
      </div>

      {hasActiveFilters && (
        <Button variant="secondary" onClick={onClear} className="lg:ml-auto">
          ✕ {t('commanderSelection.filters.clearFilters')}
        </Button>
      )}
    </div>
  )
}

/** The active player's actual selection UI — split out from the page so
 * `useCommanderFilter`'s hooks stay unconditional while the outer page can
 * still branch on "no active player left" without violating hook rules.
 * Remounts fresh (new local state) every time `playerId` changes, since
 * it only ever exists inside `HotSeatGate`'s revealed subtree. */
function PlayerCommanderPicker({ war, playerId }: { war: War; playerId: PlayerId }) {
  const { t } = useTranslation()
  const dispatch = useWarStore((s) => s.dispatch)
  const poolStage = useWarStore((s) => s.commanderPoolStatus.stage)

  const [filters, setFilters] = useState<CommanderSearchFilters>({})
  const [manaValueOperator, setManaValueOperator] = useState<ManaValueOperator>('eq')
  const [sortKey, setSortKey] = useState<CommanderSortKey>('edhrec')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [manualChecks, setManualChecks] = useState<Record<string, boolean>>({})
  const [isLocking, setIsLocking] = useState(false)

  const player = war.players.find((p) => p.playerId === playerId) ?? null

  // The mandatory, modifier-derived legality constraints — the union of
  // global + this player's personal Commander-target modifiers (see
  // domain/war.ts's activeCommanderConstraintsFor). Everything below only
  // ever narrows `filtered` further for browsing; it can never widen it.
  const constraints = useMemo(() => activeCommanderConstraintsFor(war, playerId), [war, playerId])
  const { filtered, scryfallUrl } = useCommanderFilter(constraints)

  // The full set of active modifiers (any target — deck/commander/game),
  // split for display purposes only: `checkable` mirrors the live
  // filter/counter (commander-target with a programmatic check),
  // `uncheckable` is everything else the player still needs to keep in
  // mind while choosing (deck-target, game-target, and commander-target
  // cards with no programmatic check) — see domain/commanderCheck.ts's
  // splitAllModifiersForDisplay docblock for why this is deliberately wider
  // than the commander-only constraints used to actually filter the pool.
  const globalSplit = useMemo(
    () => splitAllModifiersForDisplay(war.activeGlobalModifiers),
    [war.activeGlobalModifiers],
  )
  const personalSplit = useMemo(
    () => splitAllModifiersForDisplay(player?.personalModifiers ?? []),
    [player],
  )

  // Optional player-driven browsing refinements (name/colour/mana value,
  // then sort) applied on top of the mandatory `filtered` pool.
  const results = useMemo(() => {
    if (!filtered) return null
    return sortCommanders(applyCommanderSearchFilters(filtered, filters), sortKey)
  }, [filtered, filters, sortKey])

  // Still loading the Scryfall pool (either the initial fetch, or the tiny
  // window between the store's status flipping to "ready" and the pool
  // array itself landing) — defensively show the same loading screen
  // rather than rendering an empty/broken grid.
  if (poolStage !== 'ready' || !filtered || !results) {
    return <LoadingScreen />
  }

  const visible = results.slice(0, visibleCount)
  // Deliberately looked up in `filtered` (the mandatory pool), not
  // `results` (the narrowed/sorted browsing view) — so a player's in-
  // progress pick survives them tweaking search/filters/sort afterwards.
  const selected = selectedId ? (filtered.find((c) => c.id === selectedId) ?? null) : null
  const hasMore = visible.length < results.length

  function resetPage() {
    setVisibleCount(PAGE_SIZE)
  }

  function handleNameQueryChange(value: string) {
    setFilters((f) => ({ ...f, nameQuery: value }))
    resetPage()
  }

  function handleColorModeChange(mode: ColorFilterMode) {
    setFilters((f) => ({ ...f, color: { mode, colors: f.color?.colors ?? [] } }))
    resetPage()
  }

  function handleToggleColor(color: string) {
    setFilters((f) => {
      const colors = f.color?.colors ?? []
      const nextColors = colors.includes(color)
        ? colors.filter((c) => c !== color)
        : [...colors, color]
      return { ...f, color: { mode: f.color?.mode ?? 'atLeast', colors: nextColors } }
    })
    resetPage()
  }

  function handleManaValueOperatorChange(operator: ManaValueOperator) {
    setManaValueOperator(operator)
    setFilters((f) => (f.manaValue ? { ...f, manaValue: { ...f.manaValue, operator } } : f))
    resetPage()
  }

  function handleManaValueChange(raw: string) {
    if (raw.trim() === '') {
      setFilters((f) => ({ ...f, manaValue: undefined }))
    } else {
      const parsed = Number(raw)
      if (Number.isFinite(parsed)) {
        setFilters((f) => ({ ...f, manaValue: { operator: manaValueOperator, value: parsed } }))
      }
    }
    resetPage()
  }

  function handleSortKeyChange(key: CommanderSortKey) {
    setSortKey(key)
    resetPage()
  }

  function handleClearFilters() {
    setFilters({})
    setManaValueOperator('eq')
    resetPage()
  }

  function handleToggleManualCheck(cardId: string) {
    setManualChecks((prev) => ({ ...prev, [cardId]: !prev[cardId] }))
  }

  async function handleLockIn() {
    if (!selected) return
    setIsLocking(true)
    try {
      await dispatch({
        type: 'SELECT_COMMANDER',
        playerId,
        commander: {
          scryfallId: selected.id,
          name: selected.name,
          imageUrl: selected.imageUrl ?? undefined,
        },
      })
    } finally {
      setIsLocking(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-28">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CommanderCounter modifiers={constraints} />
        <div className="flex flex-col items-end gap-1.5">
          <a
            href={scryfallUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border-2 border-wood-600 bg-parchment-200 px-4 py-2 font-heading text-sm font-semibold text-wood-900 shadow-card transition hover:bg-parchment-100"
          >
            🔗 {t('common.buttons.openInScryfall')}
          </a>
          {/* Always visible, not just a hover tooltip — same caveat as the
           * one inside <CommanderCounter>, shown next to this page's own,
           * separate Scryfall link. */}
          <p className="max-w-xs text-right text-[11px] leading-snug text-parchment-200/60">
            ⚠️ {t('commanderCounter.scryfallNote')}
          </p>
        </div>
      </div>

      <p className="text-sm text-parchment-200/80">{t('commanderSelection.instructions')}</p>

      {/* Global modifiers on the left, this player's own personal ones on
       * the right (product decision) — shown up-front, before the browsing
       * grid, so the rules a player needs to keep in mind while picking
       * are never missed by scrolling past them. Each side is further
       * split into its own auto-checked vs. verify-yourself sub-groups. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ModifierRulesPanel
          title={t('commanderSelection.globalRulesTitle')}
          checkable={globalSplit.checkable}
          uncheckable={globalSplit.uncheckable}
          manualChecks={manualChecks}
          onToggleManual={handleToggleManualCheck}
        />
        <ModifierRulesPanel
          title={t('commanderSelection.personalRulesTitle')}
          checkable={personalSplit.checkable}
          uncheckable={personalSplit.uncheckable}
          manualChecks={manualChecks}
          onToggleManual={handleToggleManualCheck}
        />
      </div>

      <Panel>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="search"
            value={filters.nameQuery ?? ''}
            onChange={(e) => handleNameQueryChange(e.target.value)}
            placeholder={t('commanderSelection.searchPlaceholder')}
            aria-label={t('commanderSelection.searchPlaceholder')}
            className="w-full rounded-xl border-2 border-wood-400 bg-parchment-50 px-4 py-2.5 text-sm text-wood-900 placeholder:text-wood-500 focus:border-royal-400 focus:outline-none focus:ring-2 focus:ring-royal-400/50 sm:max-w-xs"
          />
          <span className="shrink-0 text-xs font-semibold text-wood-600">
            {t('commanderSelection.showingCount', {
              shown: visible.length,
              total: results.length,
            })}
          </span>
        </div>

        <CommanderFilterControls
          filters={filters}
          manaValueOperator={manaValueOperator}
          sortKey={sortKey}
          onColorModeChange={handleColorModeChange}
          onToggleColor={handleToggleColor}
          onManaValueOperatorChange={handleManaValueOperatorChange}
          onManaValueChange={handleManaValueChange}
          onSortKeyChange={handleSortKeyChange}
          onClear={handleClearFilters}
        />

        {results.length === 0 ? (
          <p className="py-10 text-center text-sm text-wood-600">
            {t('commanderSelection.noResults')}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {visible.map((commander) => (
                <CommanderTile
                  key={commander.id}
                  commander={commander}
                  selected={commander.id === selectedId}
                  onSelect={() =>
                    setSelectedId((prev) => (prev === commander.id ? null : commander.id))
                  }
                />
              ))}
            </div>
            {hasMore && (
              <div className="mt-5 flex justify-center">
                <Button variant="secondary" onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}>
                  {t('commanderSelection.loadMore', {
                    count: Math.min(PAGE_SIZE, results.length - visible.length),
                  })}
                </Button>
              </div>
            )}
          </>
        )}
      </Panel>

      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-10 flex justify-center px-4 pb-4">
          <div className="flex w-full max-w-3xl flex-col items-center gap-3 rounded-xl border-2 border-royal-400 bg-wood-800/95 p-4 shadow-card-hover backdrop-blur sm:flex-row sm:justify-between">
            <div className="flex items-center gap-3">
              {selected.imageUrl ? (
                <img
                  src={selected.imageUrl}
                  alt={selected.name}
                  className="h-16 w-auto rounded-md border border-royal-300"
                />
              ) : (
                <span className="text-3xl" aria-hidden="true">
                  👑
                </span>
              )}
              <div>
                <p className="font-heading text-lg font-bold text-parchment-50">{selected.name}</p>
                <p className="text-xs text-parchment-200/70">
                  {t('commanderSelection.confirmWarning')}
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              size="lg"
              disabled={isLocking}
              onClick={() => void handleLockIn()}
            >
              👑 {t('commanderSelection.confirmCommander')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Hot-seat commander selection: always-hidden per player (unlike personal
 * draw, this has no custom-option toggle — product decision is that
 * choosing a commander is always private until everyone's locked in). */
export function CommanderSelectionPage() {
  const { war, status } = useLoadedWar('commander-selection')
  const { t } = useTranslation()
  const navigate = useNavigate()
  const dispatch = useWarStore((s) => s.dispatch)
  const commanderPool = useWarStore((s) => s.commanderPool)
  const ensureCommanderPool = useWarStore((s) => s.ensureCommanderPool)
  const myUserId = useCurrentUserId()
  const [isAdvancing, setIsAdvancing] = useState(false)

  // Defensive: Preparation normally warms this cache first, but a direct
  // navigation/refresh straight into this phase should still work.
  useEffect(() => {
    if (commanderPool === null) void ensureCommanderPool()
  }, [commanderPool, ensureCommanderPool])

  if (status === 'loading' || !war) return <LoadingScreen />

  if (isCommanderSelectionComplete(war)) {
    async function handleAdvance() {
      if (!war) return
      setIsAdvancing(true)
      try {
        await dispatch({ type: 'ADVANCE_TO_OVERVIEW' })
        navigate(warPhasePath(war.id, 'overview'))
      } finally {
        setIsAdvancing(false)
      }
    }

    return (
      <PageShell title={t('commanderSelection.title')}>
        <Panel ornate className="flex flex-col items-center gap-6 py-10 text-center">
          <span className="text-5xl" aria-hidden="true">
            👑
          </span>
          <PanelTitle>{t('commanderSelection.allDone')}</PanelTitle>
          <Button
            variant="primary"
            size="lg"
            disabled={isAdvancing}
            onClick={() => void handleAdvance()}
          >
            {t('commanderSelection.continueToOverview')}
          </Button>
        </Panel>
      </PageShell>
    )
  }

  // Concurrent, not queued: several members can genuinely still be picking
  // at once now that everyone has their own device (see ui/TurnGate.tsx) —
  // there's no single "active" player to hand a curtain to any more.
  const pendingPlayers = war.players
    .filter((p) => !p.commanderLocked)
    .map((p) => ({ id: p.playerId, name: getPlayerName(war.config.players, p.playerId) }))

  const myPlayerId = getMyPlayerId(war.config.players, myUserId)
  const myPlayer = myPlayerId ? war.players.find((p) => p.playerId === myPlayerId) : undefined
  const isMyTurn = !!myPlayer && !myPlayer.commanderLocked

  if (!isMyTurn) {
    return (
      <PageShell title={t('commanderSelection.title')}>
        <WaitingPanel
          heading={
            myPlayer ? t('commanderSelection.waitingForOthers') : t('commanderSelection.notAPlayer')
          }
          pendingPlayers={pendingPlayers}
        />
      </PageShell>
    )
  }

  return (
    <PageShell title={t('commanderSelection.title')}>
      <PlayerCommanderPicker key={myPlayer.playerId} war={war} playerId={myPlayer.playerId} />
    </PageShell>
  )
}
