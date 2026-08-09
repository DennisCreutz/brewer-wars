import { useEffect, useRef } from 'react'

/**
 * Returns a debounced version of `callback`. Used to coalesce rapid-fire
 * input events (e.g. a number spinner's onChange firing per keystroke)
 * into a single call after `delayMs` of quiet — necessary now that each
 * call ultimately triggers a full-document network write (see
 * store/warStore.ts's dispatch). Exposes `flush` so callers can force an
 * immediate call on blur, guaranteeing the final value is never lost to a
 * pending timer if the user navigates away quickly.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs: number,
): { call: (...args: Args) => void; flush: () => void } {
  const callbackRef = useRef(callback)
  callbackRef.current = callback
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingArgsRef = useRef<Args | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  function flush() {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (pendingArgsRef.current) {
      const args = pendingArgsRef.current
      pendingArgsRef.current = null
      callbackRef.current(...args)
    }
  }

  function call(...args: Args) {
    pendingArgsRef.current = args
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flush, delayMs)
  }

  return { call, flush }
}
