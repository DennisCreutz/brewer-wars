import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWarStore } from '../store/warStore'
import { paths } from './paths'

/**
 * Safely navigates to the landing page and clears the currently-loaded war
 * from the store, without racing react-router-dom v7's
 * `startTransition`-scheduled navigation. `navigate()` doesn't take effect
 * on the render that calls it — it's applied on a later, lower-priority
 * pass. Clearing the store synchronously alongside it (the naive approach)
 * would race that: `useLoadedWar`'s reactive "the store's war is null but
 * the URL still names this war" effect can commit *before* the route
 * change does, and "self-heals" by reloading the very war being exited —
 * undoing the exit entirely. Deferring the store clear to this hook's own
 * unmount (which only happens once the route has actually changed away)
 * sidesteps the race completely instead of guessing at scheduling/timing.
 *
 * Originally solved once, ad hoc, in features/podium/PodiumPage.tsx's
 * `PodiumActions` — generalized here so every screen can leave safely, not
 * just the podium. Safe to call from a page with no war loaded (e.g. the
 * wizard): `exitToLanding()` setting an already-null `war` to null again
 * is a harmless no-op.
 */
export function useGoHome(): () => void {
  const navigate = useNavigate()
  const exitToLanding = useWarStore((s) => s.exitToLanding)
  const exitOnUnmount = useRef(false)

  useEffect(
    () => () => {
      if (exitOnUnmount.current) exitToLanding()
    },
    [exitToLanding],
  )

  return () => {
    exitOnUnmount.current = true
    navigate(paths.landing)
  }
}
