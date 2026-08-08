import { HttpError } from './auth.js'

export const MAX_DOC_BYTES = 350_000

export interface WarSummaryFields {
  id: string
  phase: string
  createdAt: string
  updatedAt: string
  playerNames: string[]
}

interface RawWarShape {
  id?: unknown
  phase?: unknown
  createdAt?: unknown
  updatedAt?: unknown
  config?: {
    players?: Array<{ name?: unknown }>
  }
}

export function extractSummaryFields(war: unknown): WarSummaryFields {
  const raw = war as RawWarShape
  if (
    typeof raw?.id !== 'string' ||
    typeof raw?.phase !== 'string' ||
    typeof raw?.createdAt !== 'string' ||
    typeof raw?.updatedAt !== 'string' ||
    !Array.isArray(raw?.config?.players)
  ) {
    throw new HttpError(400, 'War document is missing required fields (id, phase, createdAt, updatedAt, config.players)')
  }
  const playerNames = raw.config!.players!.map((p) => (typeof p.name === 'string' ? p.name : ''))
  return {
    id: raw.id,
    phase: raw.phase,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    playerNames,
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
