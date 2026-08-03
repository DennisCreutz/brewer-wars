/**
 * Thin accessor over the bundled EDHREC deck-count dataset (see
 * tools/build-edhrec-data.ts for how it's produced).
 */
import edhrecData from './generated/edhrec-deck-counts.json'
import { frontFaceName, normalizeCardName } from '../domain/text'

interface EdhrecDataset {
  generatedAt: string
  totalCommandersQueried: number
  totalCommandersFound: number
  commanders: Record<string, { name: string; numDecks: number }>
}

const dataset = edhrecData as EdhrecDataset

export const EDHREC_DATASET_META = {
  generatedAt: dataset.generatedAt,
  totalCommandersQueried: dataset.totalCommandersQueried,
  totalCommandersFound: dataset.totalCommandersFound,
}

/** Returns the known EDHREC deck count for a commander name, or `null` if
 * it wasn't found (this dataset is built from an exact per-commander lookup
 * for every current Scryfall commander, so `null` should be rare — mostly
 * "Background" cards, which EDHREC doesn't track as commanders in their own
 * right, or a card too new to be indexed yet; see
 * domain/commanderCheck.ts for how callers treat that conservatively).
 * Double-faced/split cards are matched on their front face only, matching
 * how they were crawled (see tools/build-edhrec-data.ts). */
export function getEdhrecDeckCount(cardName: string): number | null {
  return dataset.commanders[normalizeCardName(frontFaceName(cardName))]?.numDecks ?? null
}
