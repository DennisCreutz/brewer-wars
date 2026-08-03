import { describe, it, expect } from 'vitest'
import { mulberry32, hashSeed, deriveSeed, shuffle, randomSeed } from '../rng'

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const seqA = Array.from({ length: 10 }, () => a())
    const seqB = Array.from({ length: 10 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    const seqA = Array.from({ length: 10 }, () => a())
    const seqB = Array.from({ length: 10 }, () => b())
    expect(seqA).not.toEqual(seqB)
  })

  it('always returns values in [0, 1)', () => {
    const rand = mulberry32(12345)
    for (let i = 0; i < 1000; i++) {
      const v = rand()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('hashSeed / deriveSeed', () => {
  it('is deterministic', () => {
    expect(hashSeed('war-1', 'personal', 'alice')).toBe(hashSeed('war-1', 'personal', 'alice'))
  })

  it('distinguishes different scopes', () => {
    const alice = deriveSeed(1000, 'personal', 'alice')
    const bob = deriveSeed(1000, 'personal', 'bob')
    expect(alice).not.toBe(bob)
  })

  it('distinguishes different root seeds with the same scope', () => {
    const a = deriveSeed(1, 'global')
    const b = deriveSeed(2, 'global')
    expect(a).not.toBe(b)
  })

  it('always returns a non-negative 32-bit integer', () => {
    for (let i = 0; i < 200; i++) {
      const h = hashSeed('x', i, 'y')
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThanOrEqual(0xffffffff)
    }
  })
})

describe('shuffle', () => {
  it('is deterministic for a given rand function seed', () => {
    const items = Array.from({ length: 50 }, (_, i) => i)
    const shuffledA = shuffle(items, mulberry32(7))
    const shuffledB = shuffle(items, mulberry32(7))
    expect(shuffledA).toEqual(shuffledB)
  })

  it('does not mutate the input array', () => {
    const items = [1, 2, 3, 4, 5]
    const copy = [...items]
    shuffle(items, mulberry32(1))
    expect(items).toEqual(copy)
  })

  it('preserves all elements (a permutation, not a resample)', () => {
    const items = Array.from({ length: 30 }, (_, i) => i)
    const shuffled = shuffle(items, mulberry32(99))
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items)
  })

  it('produces a different order than the input for a reasonably large array', () => {
    const items = Array.from({ length: 30 }, (_, i) => i)
    const shuffled = shuffle(items, mulberry32(99))
    expect(shuffled).not.toEqual(items)
  })
})

describe('randomSeed', () => {
  it('returns a value in the 32-bit unsigned range', () => {
    for (let i = 0; i < 20; i++) {
      const s = randomSeed()
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(0xffffffff)
    }
  })
})
