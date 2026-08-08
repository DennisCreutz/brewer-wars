/**
 * API Gateway + Lambda + DynamoDB backed WarRepository. Dehydrates/
 * rehydrates via domain/warCodec.ts (see that file for why: DynamoDB's
 * 400 KB item limit is smaller than a hydrated War can be).
 *
 * The backend tracks an optimistic-concurrency `version` per war
 * (see backend/src/handlers/putWar.ts) that never appears on the `War`
 * domain type itself — it is purely an adapter-internal concern, tracked
 * here in an in-memory map keyed by war id.
 */
import type { War } from '../domain/warTypes'
import { dehydrateWar, rehydrateWar, type DehydratedWar } from '../domain/warCodec'
import { ALL_CARDS } from '../data/allCards'
import { toSummary, type WarRepository, type WarSummary } from './WarRepository'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** The war was changed by someone else since it was last loaded (HTTP 412).
 * The caller should reload and retry, or surface a merge conflict to the
 * user — see the store's optimistic-dispatch rollback path. */
export class WarConflictError extends ApiError {
  constructor() {
    super(412, 'This war was changed elsewhere. Reload it and try again.')
  }
}

export class NotAuthorizedError extends ApiError {
  constructor(message = 'You are not allowed to perform this action.') {
    super(403, message)
  }
}

export interface AccessTokenProvider {
  (): string | null
}

export class ApiWarRepository implements WarRepository {
  private readonly versions = new Map<string, number>()
  private readonly apiBaseUrl: string
  private readonly getAccessToken: AccessTokenProvider

  constructor(apiBaseUrl: string, getAccessToken: AccessTokenProvider) {
    this.apiBaseUrl = apiBaseUrl
    this.getAccessToken = getAccessToken
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const token = this.getAccessToken()
    if (!token) {
      throw new NotAuthorizedError('No active session. Please sign in again.')
    }
    const res = await fetch(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
    })
    if (res.status === 403) {
      const body = await res.json().catch(() => ({}) as { message?: string })
      throw new NotAuthorizedError(body.message)
    }
    if (res.status === 412) {
      throw new WarConflictError()
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}) as { message?: string })
      throw new ApiError(res.status, body.message ?? `Request failed with status ${res.status}`)
    }
    return res
  }

  async list(): Promise<WarSummary[]> {
    const res = await this.request('/wars', { method: 'GET' })
    const body = (await res.json()) as { wars: WarSummary[] }
    return body.wars
  }

  async load(id: string): Promise<War | null> {
    let res: Response
    try {
      res = await this.request(`/wars/${id}`, { method: 'GET' })
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null
      throw err
    }
    const body = (await res.json()) as { war: DehydratedWar; version: number }
    this.versions.set(id, body.version)
    return rehydrateWar(body.war, ALL_CARDS)
  }

  async create(war: War): Promise<void> {
    const res = await this.request('/wars', {
      method: 'POST',
      body: JSON.stringify(dehydrateWar(war)),
    })
    const body = (await res.json()) as { version: number }
    this.versions.set(war.id, body.version)
  }

  async save(war: War): Promise<void> {
    const expectedVersion = this.versions.get(war.id)
    const res = await this.request(`/wars/${war.id}`, {
      method: 'PUT',
      body: JSON.stringify(dehydrateWar(war)),
      headers: expectedVersion !== undefined ? { 'If-Match': String(expectedVersion) } : {},
    })
    const body = (await res.json()) as { version: number }
    this.versions.set(war.id, body.version)
  }

  async remove(id: string): Promise<void> {
    await this.request(`/wars/${id}`, { method: 'DELETE' })
    this.versions.delete(id)
  }

  async removeAll(): Promise<void> {
    await this.request('/wars', { method: 'DELETE' })
    this.versions.clear()
  }
}

// Re-exported so callers that only need the summary shape don't have to
// reach into WarRepository directly.
export { toSummary }
