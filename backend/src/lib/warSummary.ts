import { HttpError } from './auth.js'

export const MAX_DOC_BYTES = 350_000

export interface WarSummaryFields {
  id: string
  phase: string
  createdAt: string
  updatedAt: string
  playerNames: string[]
  memberUserIds: string[]
}

interface RawWarShape {
  id?: unknown
  phase?: unknown
  createdAt?: unknown
  updatedAt?: unknown
  hostUserId?: unknown
  config?: {
    players?: Array<{ name?: unknown; userId?: unknown }>
  }
}

export function extractSummaryFields(war: unknown): WarSummaryFields {
  const raw = war as RawWarShape
  if (
    typeof raw?.id !== 'string' ||
    typeof raw?.phase !== 'string' ||
    typeof raw?.createdAt !== 'string' ||
    typeof raw?.updatedAt !== 'string' ||
    typeof raw?.hostUserId !== 'string' ||
    !Array.isArray(raw?.config?.players)
  ) {
    throw new HttpError(
      400,
      'War document is missing required fields (id, phase, createdAt, updatedAt, hostUserId, config.players)',
    )
  }
  const playerNames = raw.config!.players!.map((p) => (typeof p.name === 'string' ? p.name : ''))
  const memberUserIds = Array.from(
    new Set([
      raw.hostUserId,
      ...raw.config!.players!.map((p) => (typeof p.userId === 'string' ? p.userId : '')).filter(Boolean),
    ]),
  )
  return {
    id: raw.id,
    phase: raw.phase,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    playerNames,
    memberUserIds,
  }
}

export function assertWithinSizeLimit(doc: string): void {
  const bytes = Buffer.byteLength(doc, 'utf-8')
  if (bytes > MAX_DOC_BYTES) {
    throw new HttpError(
      413,
      `War document is ${bytes} bytes, exceeding the ${MAX_DOC_BYTES} byte limit. This should not happen if the client dehydrates card references correctly.`,
    )
  }
}
