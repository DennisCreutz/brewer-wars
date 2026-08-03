import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchCommanderPool } from '../commanderPool'

vi.mock('../edhrecDeckCounts', () => ({
  getEdhrecDeckCount: vi.fn(() => 13545),
  getEdhrecRank: vi.fn(() => 146),
}))

function scryfallCard(overrides: Record<string, unknown> = {}) {
  return {
    id: 'abc-123',
    name: 'Test Commander',
    color_identity: ['W', 'U'],
    type_line: 'Legendary Creature — Human Wizard',
    keywords: ['Flying'],
    flavor_text: 'A flavorful test.',
    rarity: 'rare',
    cmc: 3,
    scryfall_uri: 'https://scryfall.com/card/abc-123',
    image_uris: { art_crop: 'https://img/art.jpg', normal: 'https://img/normal.jpg' },
    ...overrides,
  }
}

describe('fetchCommanderPool', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.useRealTimers()
  })

  it('fetches a single page and transforms cards into CommanderSummary', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [scryfallCard()],
        has_more: false,
        total_cards: 1,
      }),
    }) as unknown as typeof fetch

    const pool = await fetchCommanderPool()
    expect(pool).toHaveLength(1)
    expect(pool[0]).toMatchObject({
      id: 'abc-123',
      name: 'Test Commander',
      colorIdentity: ['W', 'U'],
      hasFlavorText: true,
      keywords: ['Flying'],
    })
  })

  it('follows has_more/next_page across multiple pages', async () => {
    const page1 = {
      data: [scryfallCard({ id: '1', name: 'Card One' })],
      has_more: true,
      next_page: 'https://api.scryfall.com/cards/search?page=2',
      total_cards: 2,
    }
    const page2 = {
      data: [scryfallCard({ id: '2', name: 'Card Two' })],
      has_more: false,
      total_cards: 2,
    }
    let call = 0
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      call++
      return { ok: true, json: async () => (call === 1 ? page1 : page2) }
    }) as unknown as typeof fetch

    const promise = fetchCommanderPool()
    await vi.runAllTimersAsync()
    const pool = await promise

    expect(pool.map((c) => c.name)).toEqual(['Card One', 'Card Two'])
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('reports progress after each page', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [scryfallCard()], has_more: false, total_cards: 1 }),
    }) as unknown as typeof fetch

    const progressUpdates: { loaded: number; total: number }[] = []
    await fetchCommanderPool((p) => progressUpdates.push(p))
    expect(progressUpdates).toEqual([{ loaded: 1, total: 1 }])
  })

  it('throws on a non-ok HTTP response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch
    await expect(fetchCommanderPool()).rejects.toThrow(/503/)
  })

  it('detects flavor text on double-faced cards via card_faces', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          scryfallCard({
            flavor_text: undefined,
            card_faces: [{ flavor_text: 'Front face flavor' }, {}],
          }),
        ],
        has_more: false,
        total_cards: 1,
      }),
    }) as unknown as typeof fetch

    const pool = await fetchCommanderPool()
    expect(pool[0].hasFlavorText).toBe(true)
  })

  it('falls back to the front face image_uris for double-faced cards (regression)', async () => {
    // Scryfall never puts image_uris at the top level for DFC/MDFC/split
    // cards — only card_faces[].image_uris. Missing this means every such
    // commander silently has no art (blank tile in the selection grid, and
    // PlayerBadge falls back to a plain letter avatar on the scoring/podium
    // screens instead of showing their portrait).
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          scryfallCard({
            name: 'Kefka, Court Mage // Kefka, Ruler of Ruin',
            image_uris: undefined,
            card_faces: [
              { image_uris: { normal: 'https://img/kefka-front.jpg', art_crop: 'https://img/kefka-front-art.jpg' } },
              { image_uris: { normal: 'https://img/kefka-back.jpg', art_crop: 'https://img/kefka-back-art.jpg' } },
            ],
          }),
        ],
        has_more: false,
        total_cards: 1,
      }),
    }) as unknown as typeof fetch

    const pool = await fetchCommanderPool()
    expect(pool[0].imageUrl).toBe('https://img/kefka-front.jpg')
    expect(pool[0].artCropUrl).toBe('https://img/kefka-front-art.jpg')
  })

  it('prefers top-level image_uris when present (normal single-faced card)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [scryfallCard({ image_uris: { normal: 'https://img/normal.jpg', art_crop: 'https://img/art.jpg' } })],
        has_more: false,
        total_cards: 1,
      }),
    }) as unknown as typeof fetch

    const pool = await fetchCommanderPool()
    expect(pool[0].imageUrl).toBe('https://img/normal.jpg')
  })

  it("uses EDHREC's own commander-specific rank/deck count, not Scryfall's global edhrec_rank", async () => {
    // Regression: this dataset's rank (e.g. "Rank 146" on a commander's own
    // EDHREC page) is what players expect to see — not Scryfall's
    // `edhrec_rank` field, which ranks every card EDHREC has ever indexed
    // (tens of thousands of entries) and would show a wildly misleading
    // number for a genuinely popular commander.
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [scryfallCard({ name: 'Marchesa, the Black Rose' })],
        has_more: false,
        total_cards: 1,
      }),
    }) as unknown as typeof fetch

    const pool = await fetchCommanderPool()
    expect(pool[0].edhrecRank).toBe(146)
    expect(pool[0].numDecks).toBe(13545)
  })
})
