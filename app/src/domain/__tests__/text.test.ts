import { describe, it, expect } from 'vitest'
import { normalizeCardName, frontFaceName, edhrecCommanderSlug } from '../text'

describe('normalizeCardName', () => {
  it('trims and lowercases', () => {
    expect(normalizeCardName('  Atraxa, Praetors Voice  ')).toBe('atraxa, praetors voice')
  })

  it('collapses internal whitespace runs', () => {
    expect(normalizeCardName('The   Ur-Dragon')).toBe('the ur-dragon')
  })
})

describe('frontFaceName', () => {
  it('returns the name unchanged for a single-faced card', () => {
    expect(frontFaceName('The Ur-Dragon')).toBe('The Ur-Dragon')
  })

  it('takes only the front face of a double-faced/split/MDFC card', () => {
    expect(frontFaceName('Birgi, God of Storytelling // Harnfel, Horn of Bounty')).toBe(
      'Birgi, God of Storytelling',
    )
  })
})

describe('edhrecCommanderSlug', () => {
  it('lowercases and hyphenates', () => {
    expect(edhrecCommanderSlug('The Ur-Dragon')).toBe('the-ur-dragon')
  })

  it('strips apostrophes without leaving a stray hyphen', () => {
    expect(edhrecCommanderSlug("Atraxa, Praetors' Voice")).toBe('atraxa-praetors-voice')
  })

  it('transliterates diacritics to their plain-ASCII letter', () => {
    expect(edhrecCommanderSlug('Bartolomé del Presidio')).toBe('bartolome-del-presidio')
  })

  it('takes only the front face before slugifying a DFC card', () => {
    expect(edhrecCommanderSlug('Birgi, God of Storytelling // Harnfel, Horn of Bounty')).toBe(
      'birgi-god-of-storytelling',
    )
  })

  it('handles a name with an apostrophe AND a comma together', () => {
    expect(edhrecCommanderSlug("Lae'zel, Vlaakith's Champion")).toBe('laezel-vlaakiths-champion')
  })

  it('removes a possessive apostrophe by joining the letters, not hyphenating them (regression)', () => {
    // "Gorion's Ward" must become "gorions-ward", NOT "gorion-s-ward" — an
    // earlier version of this function treated the lone apostrophe as its
    // own "non-alphanumeric run" (since it isn't immediately followed by
    // a space like "Praetors' Voice" is), turning it into a stray hyphen
    // and 403ing against every possessive commander name on EDHREC.
    expect(edhrecCommanderSlug("Abdel Adrian, Gorion's Ward")).toBe('abdel-adrian-gorions-ward')
    expect(edhrecCommanderSlug("Amber Gristle O'Maul")).toBe('amber-gristle-omaul')
    expect(edhrecCommanderSlug("Drizzt Do'Urden")).toBe('drizzt-dourden')
  })
})
