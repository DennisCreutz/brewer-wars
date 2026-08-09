import cardsData from './generated/cards.json'
import type { ModifierCard } from '../domain/cardTypes'

/** The full 233-card catalog, bundled at build time. Shared by the store
 * (to build a new war) and ApiWarRepository (to rehydrate a dehydrated war
 * loaded from the API — see domain/warCodec.ts). */
export const ALL_CARDS = cardsData as ModifierCard[]
