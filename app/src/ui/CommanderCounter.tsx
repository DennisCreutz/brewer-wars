import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useCommanderFilter } from './useCommanderFilter'
import type { ModifierCard } from '../domain/cardTypes'

export function CommanderCounter({
  modifiers,
  label,
}: {
  modifiers: readonly ModifierCard[]
  label?: string
}) {
  const { t } = useTranslation()
  const { count, scryfallUrl } = useCommanderFilter(modifiers)

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border-2 border-royal-400/60 bg-wood-800/80 px-4 py-2.5 shadow-card">
      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden="true">
          🃏
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-parchment-200/70">
            {label ?? t('preparation.commanderCounter')}
          </span>
          <AnimatePresence mode="wait">
            {count === null ? (
              <motion.span
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="font-heading text-lg text-parchment-100"
              >
                {t('common.loading')}
              </motion.span>
            ) : (
              <motion.span
                key={count}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.25 }}
                className="font-heading text-lg font-bold text-royal-200"
                title={t('commanderCounter.tooltip') ?? undefined}
              >
                {t('commanderCounter.label', { count })}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <a
          href={scryfallUrl}
          target="_blank"
          rel="noreferrer"
          className="ml-auto shrink-0 rounded-lg border border-parchment-100/30 px-2 py-1 text-xs font-semibold text-parchment-100 transition hover:bg-parchment-100/10"
        >
          {t('common.buttons.openInScryfall')} ↗
        </a>
      </div>
      {/* Always visible, not just a hover tooltip — easy to miss a caveat
       * this important if it only shows up on mouseover. */}
      <p className="text-[11px] leading-snug text-parchment-200/60">⚠️ {t('commanderCounter.scryfallNote')}</p>
    </div>
  )
}
