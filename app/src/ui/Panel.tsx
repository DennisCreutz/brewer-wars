import type { HTMLAttributes, ReactNode } from 'react'

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  /** Renders a slightly more ornate border, for hero/callout panels. */
  ornate?: boolean
}

/** The carved-wood-and-parchment container used for every content block:
 * wizard steps, card overview sections, scoring tables, etc. */
export function Panel({ children, className = '', ornate = false, ...rest }: PanelProps) {
  return (
    <div
      className={`rounded-2xl border-2 bg-gradient-to-b from-wood-500/60 to-wood-700/60 p-px shadow-card ${
        ornate ? 'border-royal-400/70' : 'border-wood-300/40'
      } ${className}`}
      {...rest}
    >
      <div className="bg-parchment-texture h-full rounded-[15px] bg-parchment-100/95 p-6 text-wood-900">
        {children}
      </div>
    </div>
  )
}

export function PanelTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`mb-4 font-heading text-2xl font-semibold text-wood-800 text-shadow-title ${className}`}>
      {children}
    </h2>
  )
}
