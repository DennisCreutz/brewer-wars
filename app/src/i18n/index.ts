/**
 * i18n bootstrap. Only English ships today, but every string in the app
 * flows through react-i18next so adding a language later is just:
 *   1. Add `src/i18n/locales/<code>.json` (copy en.json's keys).
 *   2. Import it and add it to `resources` below.
 *   3. Add it to `SUPPORTED_LANGUAGES` so the selector picks it up.
 *
 * Card *text* (name/description) is intentionally out of scope for
 * translation right now — it lives in data/generated/cards.json as
 * English-only content authored from the original design sheet. A future
 * locale could add a parallel `cards.<code>.json` keyed by card id.
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'

export const SUPPORTED_LANGUAGES = [{ code: 'en', label: 'English' }] as const

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
})

export default i18n
