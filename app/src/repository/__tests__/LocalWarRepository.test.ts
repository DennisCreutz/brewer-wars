import { describe, it, expect, beforeEach } from 'vitest'
import { LocalWarRepository } from '../LocalWarRepository'
import { createWar } from '../../domain/war'
import { DEFAULT_CUSTOM_OPTIONS, DEFAULT_VOTE_POINTS, DEFAULT_WIN_POINTS, type WarConfig } from '../../domain/warTypes'
import cardsData from '../../data/generated/cards.json'
import type { ModifierCard } from '../../domain/cardTypes'

const cards = cardsData as ModifierCard[]

function config(): WarConfig {
  return {
    players: [
      { id: 'alice', name: 'Alice' },
      { id: 'bob', name: 'Bob' },
    ],
    disabledCardIds: [],
    globalCount: 2,
    personalCount: 2,
    scoreCount: 3,
    gameMode: 'normal',
    customOptions: DEFAULT_CUSTOM_OPTIONS,
    winPoints: DEFAULT_WIN_POINTS,
    votePoints: DEFAULT_VOTE_POINTS,
  }
}

describe('LocalWarRepository', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns an empty list when nothing is saved', async () => {
    const repo = new LocalWarRepository()
    expect(await repo.list()).toEqual([])
  })

  it('saves and loads a war by id', async () => {
    const repo = new LocalWarRepository()
    const war = createWar(config(), cards, 1)
    await repo.save(war)
    const loaded = await repo.load(war.id)
    expect(loaded).toEqual(war)
  })

  it('returns null for an unknown id', async () => {
    const repo = new LocalWarRepository()
    expect(await repo.load('does-not-exist')).toBeNull()
  })

  it('lists saved wars as summaries, most recently updated first', async () => {
    const repo = new LocalWarRepository()
    const warA = createWar(config(), cards, 1)
    const warB = { ...createWar(config(), cards, 2), updatedAt: new Date(Date.now() + 1000).toISOString() }
    await repo.save(warA)
    await repo.save(warB)

    const list = await repo.list()
    expect(list.map((w) => w.id)).toEqual([warB.id, warA.id])
    expect(list[0].playerNames).toEqual(['Alice', 'Bob'])
  })

  it('removes a war', async () => {
    const repo = new LocalWarRepository()
    const war = createWar(config(), cards, 1)
    await repo.save(war)
    await repo.remove(war.id)
    expect(await repo.load(war.id)).toBeNull()
  })

  it('skips corrupted entries when listing instead of throwing', async () => {
    const repo = new LocalWarRepository()
    localStorage.setItem('bw:war:corrupt', '{ not valid json')
    const war = createWar(config(), cards, 1)
    await repo.save(war)
    const list = await repo.list()
    expect(list).toHaveLength(1)
  })

  it('removeAll wipes every saved war (landing page "Reset Games")', async () => {
    const repo = new LocalWarRepository()
    await repo.save(createWar(config(), cards, 1))
    await repo.save(createWar(config(), cards, 2))
    await repo.save(createWar(config(), cards, 3))
    expect(await repo.list()).toHaveLength(3)

    await repo.removeAll()
    expect(await repo.list()).toEqual([])
  })

  it('removeAll leaves unrelated localStorage keys untouched', async () => {
    const repo = new LocalWarRepository()
    localStorage.setItem('some-other-app-key', 'keep me')
    await repo.save(createWar(config(), cards, 1))

    await repo.removeAll()

    expect(localStorage.getItem('some-other-app-key')).toBe('keep me')
    expect(await repo.list()).toEqual([])
  })
})
