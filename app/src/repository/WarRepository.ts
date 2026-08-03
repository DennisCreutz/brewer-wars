/**
 * Storage port for War persistence. The local-only v1 implementation is
 * backed by localStorage (see LocalWarRepository); the AWS phase swaps in
 * an ApiWarRepository (API Gateway + Lambda + DynamoDB) that satisfies the
 * exact same interface, so no application code above this layer needs to
 * change.
 */
import type { War, Phase } from '../domain/warTypes'

export interface WarSummary {
  id: string
  createdAt: string
  updatedAt: string
  phase: Phase
  playerNames: string[]
}

export interface WarRepository {
  list(): Promise<WarSummary[]>
  load(id: string): Promise<War | null>
  save(war: War): Promise<void>
  remove(id: string): Promise<void>
  /** Deletes every stored war. Used by the landing page's "Reset Games"
   * button — a full wipe, not a per-war delete. */
  removeAll(): Promise<void>
}

export function toSummary(war: War): WarSummary {
  return {
    id: war.id,
    createdAt: war.createdAt,
    updatedAt: war.updatedAt,
    phase: war.phase,
    playerNames: war.config.players.map((p) => p.name),
  }
}
