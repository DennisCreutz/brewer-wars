/**
 * Shared "load the war named in the URL, and make sure we're on the route
 * matching its current phase" hook used by every phase page. Keeping this
 * in one place means refreshing mid-war, deep-linking, or another
 * browser tab having advanced the phase all resolve to the same safe
 * behaviour: load from the repository, then redirect if the URL and the
 * war's actual phase disagree.
 *
 * Also short-polls the war while mounted (see POLL_INTERVAL_MS below) —
 * every member is now on their own device (no more physical hand-off, see
 * ui/TurnGate.tsx), so a waiting/summary screen needs some way to notice
 * it has become its viewer's turn without a manual refresh. A plain
 * re-fetch on an interval was chosen over WebSocket push for cost/
 * simplicity at this app's scale (see AGENTS.md).
 */
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useWarStore } from '../store/warStore'
import type { Phase, War } from '../domain/warTypes'
import { warPhasePath } from './paths'

export type LoadedWarStatus = 'loading' | 'ready' | 'not-found'

const POLL_INTERVAL_MS = 4000

export interface UseLoadedWarResult {
  war: War | null
  status: LoadedWarStatus
}

export function useLoadedWar(expectedPhase?: Phase): UseLoadedWarResult {
  const { warId } = useParams<{ warId: string }>()
  const navigate = useNavigate()
  const war = useWarStore((s) => s.war)
  const loadWar = useWarStore((s) => s.loadWar)
  const [status, setStatus] = useState<LoadedWarStatus>(war?.id === warId ? 'ready' : 'loading')

  useEffect(() => {
    if (!warId) {
      setStatus('not-found')
      return
    }
    if (war?.id === warId) {
      setStatus('ready')
      return
    }
    let cancelled = false
    setStatus('loading')
    loadWar(warId)
      .then((loaded) => {
        if (cancelled) return
        setStatus(loaded ? 'ready' : 'not-found')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.error(`Failed to load war "${warId}"`, err)
        setStatus('not-found')
      })
    return () => {
      cancelled = true
    }
  }, [warId, war?.id, loadWar])

  const current = war?.id === warId ? war : null

  // Background poll: skips a tick if the previous one is still in flight
  // (e.g. a slow connection) rather than piling up overlapping requests.
  // Failures are swallowed — a transient network blip on a poll shouldn't
  // flip the page into an error state; the next tick just tries again.
  useEffect(() => {
    if (!warId || status !== 'ready') return
    let cancelled = false
    let inFlight = false
    const id = window.setInterval(() => {
      if (inFlight || cancelled) return
      inFlight = true
      loadWar(warId)
        .catch(() => undefined)
        .finally(() => {
          inFlight = false
        })
    }, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [warId, status, loadWar])

  useEffect(() => {
    if (!current || !expectedPhase) return
    if (current.phase !== expectedPhase) {
      navigate(warPhasePath(current.id, current.phase), { replace: true })
    }
  }, [current, expectedPhase, navigate])

  useEffect(() => {
    if (status !== 'not-found') return
    navigate('/', { replace: true })
  }, [status, navigate])

  return { war: current, status }
}
