/**
 * IndexedDB-backed cache for the Scryfall commander pool, so a new war only
 * pays the ~3,300-card fetch cost once (typically on first-ever use), not
 * on every "Start War". Read/filtered in real time entirely client-side
 * once loaded — see domain/commanderCheck.ts.
 */
import { openDB, type IDBPDatabase } from 'idb'
import type { CommanderSummary } from '../domain/commanderCheck'
import { fetchCommanderPool, type FetchProgress } from './commanderPool'
import { EDHREC_DATASET_META } from './edhrecDeckCounts'

const DB_NAME = 'brewer-wars'
const DB_VERSION = 1
const STORE_NAME = 'commander-pool'
const CACHE_KEY = 'pool'

/** How long a cached pool is trusted before we transparently refetch. Every
 * new war (i.e. every time Preparation mounts and calls
 * `ensureCommanderPool`) re-checks this, so a 1-day window means the pool
 * — and the bundled EDHREC deck-count snapshot cards are checked against —
 * effectively resyncs at most once per day rather than on every war. */
export const DEFAULT_MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000 // 1 day

interface CachedPool {
  fetchedAt: string
  pool: CommanderSummary[]
  /** The bundled EDHREC dataset's `generatedAt` at the time this pool was
   * fetched (see data/edhrecDeckCounts.ts). Every `CommanderSummary` bakes
   * in a snapshot of `numDecks`/`edhrecRank` from whatever dataset was
   * bundled into the app at fetch time — so if a *new build* ships an
   * updated dataset (re-crawled EDHREC ranks/counts), a still-cached pool
   * from an older build must be treated as stale immediately, regardless
   * of how young it is by the 1-day age check alone. Without this, a
   * player who cached the pool before a data fix would keep seeing
   * outdated ranks/counts for up to a full day after upgrading. */
  edhrecDatasetGeneratedAt: string
}

function db(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME)
      }
    },
  })
}

export async function readCachedPool(): Promise<CachedPool | null> {
  const database = await db()
  const cached = (await database.get(STORE_NAME, CACHE_KEY)) as CachedPool | undefined
  return cached ?? null
}

async function writeCachedPool(pool: CommanderSummary[]): Promise<void> {
  const database = await db()
  const entry: CachedPool = {
    fetchedAt: new Date().toISOString(),
    pool,
    edhrecDatasetGeneratedAt: EDHREC_DATASET_META.generatedAt,
  }
  await database.put(STORE_NAME, entry, CACHE_KEY)
}

export type CommanderPoolStage = 'reading-cache' | 'fetching' | 'ready'

export interface CommanderPoolLoadStatus {
  stage: CommanderPoolStage
  progress?: FetchProgress
}

/**
 * Returns the commander pool, using the IndexedDB cache when it's fresh
 * enough and otherwise fetching from Scryfall and re-caching. Reports
 * coarse-grained stage updates via `onStatus` so the "Start War" loading
 * screen has something meaningful to show.
 */
export async function getOrFetchCommanderPool(
  onStatus?: (status: CommanderPoolLoadStatus) => void,
  options: { maxAgeMs?: number; forceRefresh?: boolean; signal?: AbortSignal } = {},
): Promise<CommanderSummary[]> {
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_CACHE_AGE_MS

  onStatus?.({ stage: 'reading-cache' })
  if (!options.forceRefresh) {
    const cached = await readCachedPool()
    if (cached) {
      const age = Date.now() - new Date(cached.fetchedAt).getTime()
      const datasetMatches = cached.edhrecDatasetGeneratedAt === EDHREC_DATASET_META.generatedAt
      if (age <= maxAgeMs && datasetMatches && cached.pool.length > 0) {
        onStatus?.({ stage: 'ready' })
        return cached.pool
      }
    }
  }

  onStatus?.({ stage: 'fetching', progress: { loaded: 0, total: 0 } })
  const pool = await fetchCommanderPool((progress) => {
    onStatus?.({ stage: 'fetching', progress })
  }, options.signal)

  await writeCachedPool(pool)
  onStatus?.({ stage: 'ready' })
  return pool
}
