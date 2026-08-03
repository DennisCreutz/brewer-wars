import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export function PageShell({
  children,
  title,
  right,
}: {
  children: ReactNode
  title?: string
  right?: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 sm:px-6">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="font-display text-sm uppercase tracking-[0.2em] text-royal-300">{t('common.appName')}</p>
          {title && <h1 className="font-heading text-3xl font-bold text-parchment-50 text-shadow-title">{title}</h1>}
        </div>
        {right}
      </header>
      <main className="flex flex-1 flex-col gap-6">{children}</main>
    </div>
  )
}
