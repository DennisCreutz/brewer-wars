/**
 * Deterministic, dependency-free RNG utilities.
 *
 * The entire draw engine is a pure function of (warSeed, config, actions).
 * That gives us:
 *  - Reproducible wars for testing (same seed -> same draws).
 *  - Independent, non-correlated random streams per sub-system (global
 *    draw, score draw, each player's personal draw, draft shuffles) derived
 *    from one root seed via `deriveSeed`, so e.g. redrawing Player 2's
 *    modifiers can never influence Player 3's shuffle order.
 *  - A foundation for the future AWS backend to re-verify or replay a
 *    client-submitted draw server-side without trusting the client.
 */

export type RandomFn = () => number

/** cyrb53 string hash -> 53-bit non-cryptographic hash, used to turn human
 * seeds / composite keys into numeric RNG seeds. Good distribution, fast,
 * no dependencies. */
export function hashSeed(...parts: (string | number)[]): number {
  const str = parts.join('::')
  let h1 = 0xdeadbeef ^ str.length
  let h2 = 0x41c6ce57 ^ str.length
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  // Combine both 32-bit halves into a single unsigned 32-bit seed.
  return (h1 ^ h2) >>> 0
}

/** Derives a new deterministic 32-bit seed from a root seed plus any number
 * of scoping keys, e.g. `deriveSeed(war.seed, 'personal', playerId)`. */
export function deriveSeed(rootSeed: number, ...scope: (string | number)[]): number {
  return hashSeed(rootSeed, ...scope) >>> 0
}

/** mulberry32 PRNG — tiny, fast, decent statistical quality for game use
 * (not cryptographic). Returns a generator function producing floats in
 * [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Creates a fresh seed suitable for a new war (not itself used for
 * reproducibility once the war exists, only to pick the root seed). */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0
}

/** Fisher-Yates shuffle using a provided RNG function. Pure — returns a new
 * array, does not mutate the input. */
export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
