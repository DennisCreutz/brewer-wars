/** Small text-normalisation helpers shared between the data tools and the
 * runtime app (e.g. matching a Scryfall commander name against the bundled
 * EDHREC deck-count dataset). */

/** Normalises a card name for cross-dataset lookups (case/whitespace only —
 * deliberately NOT stripping punctuation, since MTG card names can differ
 * meaningfully by a comma or apostrophe). */
export function normalizeCardName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * EDHREC indexes double-faced, modal-DFC, split, and adventure cards under
 * their *front face only* (e.g. Scryfall's "Birgi, God of Storytelling //
 * Harnfel, Horn of Bounty" is just "Birgi, God of Storytelling" on EDHREC).
 * Both the data-tools crawler and the runtime lookup must apply this same
 * transform before normalising/matching, or every such commander silently
 * fails to match.
 */
export function frontFaceName(name: string): string {
  return name.split(' // ')[0]
}

/**
 * Builds the URL slug EDHREC uses for a commander's dedicated page
 * (`json.edhrec.com/pages/commanders/<slug>.json`): front face only,
 * lowercased, diacritics stripped to their closest ASCII letter (EDHREC's
 * own slugs do this — e.g. "Bartolomé del Presidio" -> "bartolome-del-...",
 * not "bartolom-del-..."), apostrophes removed outright rather than turned
 * into a hyphen (EDHREC's slugs join the letters together — "Gorion's
 * Ward" -> "gorions-ward", NOT "gorion-s-ward"; get this wrong and every
 * possessive name, e.g. anything "'s", silently 403s), then any remaining
 * non-alphanumeric run collapsed to a single hyphen.
 */
export function edhrecCommanderSlug(name: string): string {
  const ascii = frontFaceName(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  return ascii
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

