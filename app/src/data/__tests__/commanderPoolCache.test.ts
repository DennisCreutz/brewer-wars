import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { getOrFetchCommanderPool, readCachedPool } from '../commanderPoolCache'

describe('commanderPoolCache', () => {
  beforeEach(() => {
    // Fresh IndexedDB per test so caches never leak between them.
    ;(globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches from the network on a cold cache and writes it back', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [], has_more: false, total_cards: 0 }),
    }) as unknown as typeof fetch

    const statuses: string[] = []
    await getOrFetchCommanderPool((s) => statuses.push(s.stage))

    expect(statuses[0]).toBe('reading-cache')
    expect(statuses).toContain('fetching')
    expect(statuses.at(-1)).toBe('ready')
    const cached = await readCachedPool()
    expect(cached).not.toBeNull()
  })

  it('serves from cache without hitting the network when fresh', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'x', name: 'Card X', color_identity: [], type_line: 'Creature', keywords: [] }],
        has_more: false,
        total_cards: 1,
      }),
    }) as unknown as typeof fetch

    // Prime the cache once.
    await getOrFetchCommanderPool()
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)

    // Second call should be served entirely from IndexedDB.
    const pool = await getOrFetchCommanderPool()
    expect(globalThis.fetch).toHaveBeenCalledTimes(1) // still 1, no new network call
    expect(pool).toBeDefined()
  })

  it('refetches when the cache is older than maxAgeMs', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [], has_more: false, total_cards: 0 }),
    }) as unknown as typeof fetch

    await getOrFetchCommanderPool()
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)

    // Rather than faking global system time (which fights with
    // fake-indexeddb's internal use of real timers), simply ask for a
    // cache no older than 0ms — any real cache entry is already "stale".
    await getOrFetchCommanderPool(undefined, { maxAgeMs: 0 })
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('forceRefresh bypasses a fresh cache', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [], has_more: false, total_cards: 0 }),
    }) as unknown as typeof fetch

    await getOrFetchCommanderPool()
    await getOrFetchCommanderPool(undefined, { forceRefresh: true })
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('caches the actual pool contents, not just an empty placeholder', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: '1', name: 'A', color_identity: [], type_line: 'Creature', keywords: [] }],
        has_more: false,
        total_cards: 1,
      }),
    }) as unknown as typeof fetch

    const pool = await getOrFetchCommanderPool()
    expect(pool).toHaveLength(1)
    expect(pool[0].name).toBe('A')

    const cached = await readCachedPool()
    expect(cached?.pool).toHaveLength(1)
  })
})
