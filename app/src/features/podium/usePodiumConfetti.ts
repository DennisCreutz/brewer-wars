/**
 * Fireworks-style celebration burst for the podium's winner reveal.
 *
 * Uses canvas-confetti's default, lazily-created canvas instance rather
 * than managing our own <canvas> ref: the library appends it to
 * `document.body` on first fire and removes it again once every particle
 * has finished animating, so there is nothing for this hook to mount or
 * tear down itself beyond stopping the animation loop.
 *
 * Two independent guards keep this from ever being a nuisance or a crash:
 *  - `prefers-reduced-motion` is checked explicitly (via framer-motion's
 *    `useReducedMotion`, already a dependency elsewhere in this app) and
 *    skips firing entirely when set. The app-wide CSS rule that collapses
 *    animation durations for reduced motion (see index.css) does NOT catch
 *    this, since canvas-confetti draws via JS/canvas, not CSS transitions.
 *  - A real 2D canvas context is confirmed to be available before firing
 *    anything, so this is a silent no-op in environments that lack one
 *    (e.g. jsdom in tests, which has no `canvas` package installed)
 *    instead of throwing from inside a `requestAnimationFrame` callback.
 */
import { useEffect } from 'react'
import { useReducedMotion } from 'framer-motion'
import confetti from 'canvas-confetti'

const CELEBRATION_COLORS = ['#f7b420', '#ffcb4d', '#fdf9ee', '#6c6bff', '#45b358']
const BURST_DURATION_MS = 2500

function supportsCanvas2D(): boolean {
  if (typeof document === 'undefined') return false
  try {
    return Boolean(document.createElement('canvas').getContext('2d'))
  } catch {
    return false
  }
}

/**
 * Fires ~2.5s of side-cannon streamers plus a big center burst the instant
 * `active` becomes (or already is) `true`. Never re-fires on its own —
 * flipping `active` false then true again would fire it a second time,
 * but the podium never does that across its own lifetime.
 */
export function usePodiumConfetti(active: boolean): void {
  const prefersReducedMotion = useReducedMotion()

  useEffect(() => {
    if (!active || prefersReducedMotion || !supportsCanvas2D()) return

    let cancelled = false
    const end = Date.now() + BURST_DURATION_MS

    void confetti({
      particleCount: 140,
      spread: 100,
      startVelocity: 45,
      origin: { y: 0.6 },
      colors: CELEBRATION_COLORS,
      disableForReducedMotion: true,
    })

    const frame = () => {
      if (cancelled) return
      void confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: CELEBRATION_COLORS,
        disableForReducedMotion: true,
      })
      void confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: CELEBRATION_COLORS,
        disableForReducedMotion: true,
      })
      if (Date.now() < end) requestAnimationFrame(frame)
    }
    const rafId = requestAnimationFrame(frame)

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      confetti.reset()
    }
  }, [active, prefersReducedMotion])
}
