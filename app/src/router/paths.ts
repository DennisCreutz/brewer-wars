import type { Phase } from '../domain/warTypes'

/** Maps a war phase to its URL segment. `concluded` intentionally renders
 * at `/podium` (nicer URL than `/concluded`). */
const PHASE_SEGMENT: Record<Phase, string> = {
  preparation: 'preparation',
  'personal-draw': 'personal-draw',
  'commander-selection': 'commander-selection',
  overview: 'overview',
  scoring: 'scoring',
  concluded: 'podium',
}

export function warPhasePath(warId: string, phase: Phase): string {
  return `/war/${warId}/${PHASE_SEGMENT[phase]}`
}

export const paths = {
  landing: '/',
  newWar: '/new',
  war: warPhasePath,
}
