/**
 * localStorage-backed WarRepository for the local-only v1. Every war is its
 * own key (`bw:war:<id>`); the war list is derived by scanning for that
 * prefix rather than maintaining a separate index, so there's no index to
 * ever fall out of sync.
 */
import type { War } from '../domain/warTypes'
import { toSummary, type WarRepository, type WarSummary } from './WarRepository'

const KEY_PREFIX = 'bw:war:'

export class LocalWarRepository implements WarRepository {
  async list(): Promise<WarSummary[]> {
    const summaries: WarSummary[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(KEY_PREFIX)) continue
      const raw = localStorage.getItem(key)
      if (!raw) continue
      try {
        summaries.push(toSummary(JSON.parse(raw) as War))
      } catch {
        // Skip corrupted entries rather than failing the whole list.
        console.warn(`Skipping unreadable war record at "${key}"`)
      }
    }
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async load(id: string): Promise<War | null> {
    const raw = localStorage.getItem(KEY_PREFIX + id)
    if (!raw) return null
    return JSON.parse(raw) as War
  }

  async save(war: War): Promise<void> {
    localStorage.setItem(KEY_PREFIX + war.id, JSON.stringify(war))
  }

  async remove(id: string): Promise<void> {
    localStorage.removeItem(KEY_PREFIX + id)
  }

  async removeAll(): Promise<void> {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(KEY_PREFIX)) keysToRemove.push(key)
    }
    for (const key of keysToRemove) localStorage.removeItem(key)
  }
}
