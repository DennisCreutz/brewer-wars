/**
 * Shared "load the war named in the URL, and make sure we're on the route
 * matching its current phase" hook used by every phase page. Keeping this
 * in one place means refreshing mid-war, deep-linking, or another
 * browser tab having advanced the phase all resolve to the same safe
 * behaviour: load from the repository, then redirect if the URL and the
 * war's actual phase disagree.
 */
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useWarStore } from '../store/warStore'
import type { Phase, War } from '../domain/warTypes'
import { warPhasePath } from './paths'

export type LoadedWarStatus = 'loading' | 'ready' | 'not-found'

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
    loadWar(warId).then((loaded) => {
      if (cancelled) return
      setStatus(loaded ? 'ready' : 'not-found')
    })
    return () => {
      cancelled = true
    }
  }, [warId, war?.id, loadWar])

  const current = war?.id === warId ? war : null

  useEffect(() => {
    if (!current || !expectedPhase) return
    if (current.phase !== expectedPhase) {
      navigate(warPhasePath(current.id, current.phase), { replace: true })
    }
  }, [current, expectedPhase, navigate])

  return { war: current, status }
}
