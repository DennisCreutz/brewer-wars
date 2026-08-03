import { useTranslation } from 'react-i18next'

export function LoadingScreen({ label, sublabel }: { label?: string; sublabel?: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <div className="animate-float text-6xl" aria-hidden="true">
        🔮
      </div>
      <p className="font-heading text-xl text-parchment-50">{label ?? t('common.loading')}</p>
      {sublabel && <p className="text-sm text-parchment-200/70">{sublabel}</p>}
    </div>
  )
}
