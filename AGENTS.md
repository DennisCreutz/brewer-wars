# Brewer Wars

Digital companion for **Brewer Wars**, a physical Magic: The Gathering Commander variant where
players draw random "modifier" cards that constrain deck-building, then score points after
playing a real game. Whoever has the most points wins.

## Repo layout

```
brewers-wars/
  original/brewers-wars/   Source of truth for game content: Rules.html and Cards.html are
                            Google-Sheets HTML exports (single-line, must be parsed, not read
                            directly — see tools/import-cards.ts in app/).
  app/                      The actual application. Everything below is rooted here.
```

**Always `cd app` (or pass `workdir: app` to the bash tool) before running any command below** —
there is no build tooling at the repo root.

## Commands (run from `app/`)

```bash
npm run dev              # vite dev server
npm run build            # tsc -b && vite build — the authoritative "does it compile" check
npm test                 # vitest run (alias: npx vitest run)
npm run test:watch
npx tsc -b               # typecheck only, faster than a full build
npx oxlint                # linter (one pre-existing accepted warning in src/ui/PlayerBadge.tsx
                          # about a non-component export — not a bug, don't "fix" it)
npm run format            # prettier --write .
npm run tools:import-cards        # regenerate src/data/generated/cards.json from
                                    # ../original/brewers-wars/Cards.html
npm run tools:build-edhrec-data    # re-crawl EDHREC -> src/data/generated/edhrec-deck-counts.json
```

**Verification order for any change:** `npx tsc -b` → `npx oxlint` → `npx vitest run` → `npm run
build`. All four must be clean before considering a change done. The project currently sits at
167 passing tests across 20 files; if your change legitimately adds/removes tests, expect that
number to move, but no existing test should start failing.

There is no E2E test suite configured (no Playwright/Cypress in the project). Manual end-to-end
verification during development used a throwaway Playwright script run against `npm run dev`
outside the repo (in `/tmp`) — not part of the codebase or CI.

## Architecture

Strict layering, each layer only depends on the ones above it in this list:

1. **`src/domain/`** — pure TypeScript. Zero React imports, zero `fetch`, zero I/O. Card types,
   a seeded RNG (`rng.ts`), the draw engine (`draw.ts`: exclusion rules, solo cards, draft
   mode), the war state machine/reducer (`war.ts`, `warTypes.ts`), the scoring engine
   (`scoring.ts`), and commander-eligibility predicates (`commanderCheck.ts`). This layer is
   exhaustively unit tested and is the thing to read first to understand game rules — it's more
   authoritative than any prose description, including this file.
2. **`src/data/`** — the only layer allowed to touch the network/IndexedDB. Scryfall commander
   pool fetch + cache (`commanderPool.ts`, `commanderPoolCache.ts`), bundled EDHREC deck-count
   lookups (`edhrecDeckCounts.ts`).
3. **`src/store/`** — one Zustand store (`warStore.ts`) wiring domain + repository + data
   together for the UI. `ALL_CARDS` (the full 233-card catalog) is exported from here.
4. **`src/repository/`** — `WarRepository` port + `LocalWarRepository` (localStorage). Designed
   so a future AWS backend (API Gateway + Lambda + DynamoDB) is a new adapter satisfying the same
   interface, not a rewrite of anything above it.
5. **`src/router/`** — react-router-dom routes, one per war phase
   (`preparation → personal-draw → commander-selection → overview → scoring → concluded`), plus
   `useLoadedWar(expectedPhase?)`, the hook every phase page uses to load-from-URL and
   auto-redirect if the war's actual phase disagrees with the route.
6. **`src/ui/`** — shared design-system primitives (`Button`, `Panel`, `ModifierCardView`,
   `CommanderCounter`, `HotSeatGate`, `PlaceholderArt`, ...). Reuse these; don't create competing
   one-offs inside a feature folder.
7. **`src/features/<phase>/`** — one folder per screen, composed from everything above.
8. **`src/i18n/`** — react-i18next. English only (`locales/en.json`); UI chrome is fully wired
   through translation keys, card *text* is not (see "Known limitations" in `app/README.md`).

`tools/` holds re-runnable Node scripts (via `tsx`, not compiled) that regenerate the two bundled
JSON datasets under `src/data/generated/` — see the Commands section above. These are the only
scripts that read `original/brewers-wars/`.

## Non-obvious conventions and gotchas

- **No semicolons, single quotes, ~100 col width.** Enforced by `.prettierrc.json`; run `npm run
  format` rather than hand-matching style.
- **Everything is seeded/deterministic.** Every `War` stores a numeric RNG seed; the entire draw
  sequence is a pure function of `(seed, config, actions)`. Never introduce `Math.random()` or
  wall-clock-dependent logic into `src/domain/` — derive any new randomness via
  `domain/rng.ts`'s `deriveSeed`/`mulberry32` so wars stay reproducible and testable.
- **The exclusion rule** ("two modifiers of the same deck + category can't both be active") is
  implemented in `domain/draw.ts`'s `cardsConflict`. Untyped cards (`category === 'untyped'`)
  never conflict with anything, including each other — this is intentional and is what lets all
  drawn Score cards coexist. Don't "fix" this into always-conflicting.
- **The original card sheet's numeric "Type" column is NOT the exclusion key.** It's kept as a
  cosmetic `difficulty` (1–5) rarity-glow rating only. The actual exclusion `category` is derived
  from each card's *name* in `tools/import-cards.ts`'s `classify()` — read that function's
  docblock before touching card categorization; the reasoning is non-obvious and previously
  documented at length in project history.
- **The "auto-redraw when a card would zero out the live commander pool" mechanic** (decision:
  always auto-redraw, never let a player get stuck at 0 valid commanders) needs live Scryfall
  data, which the pure `domain/war.ts` reducer deliberately has no access to. It's implemented as
  an orchestration layer in `src/features/personal-draw/usePersonalDrawEngine.ts`, dispatching a
  dedicated `REDRAW_ZERO_COMMANDER_MODIFIER` action. UI code must go through this hook (or the
  equivalent draft-mode path) for personal draws — never dispatch `DRAW_PERSONAL_MODIFIER`/
  `PICK_DRAFT_CARD` directly from a component, or the safety net is silently skipped.
- **Commander selection has a real race condition to be aware of**: `REDRAW_ZERO_COMMANDER_MODIFIER`
  transiently flips a player's `personalDrawComplete` `true → false → true` while it corrects a
  card mid-draw. `PersonalDrawPage.tsx` "pins" the on-screen player in local state rather than
  reactively following `getActivePersonalDrawPlayer(war)` on every render, specifically to avoid
  the curtain flashing to the next player mid-turn. Follow that pattern for any similar hot-seat
  UI, don't revert to naive reactive selection.
- **`CONCLUDE_WAR` freezes `war.finalScore`** by calling `computeScoring` once, inside the
  reducer. The Podium page reads `war.finalScore` directly and must never recompute it — that
  guarantees historical results don't silently change if the scoring engine evolves later. The
  Scoring page's own live-total display, in contrast, *does* recompute on every render (cheap,
  pure, intentional — it's meant to track in-progress edits).
- **`react-router-dom` v7 schedules `navigate()` via `startTransition` internally.** Calling
  store-clearing code (e.g. `exitToLanding()`) synchronously before/alongside a `navigate()` call
  can race the route change and get silently undone by `useLoadedWar`'s reactive self-heal. See
  the documented fix in `src/features/podium/PodiumPage.tsx`'s `PodiumActions` (defer the store
  clear to this component's own unmount) before reintroducing similar "leave this war" actions
  elsewhere.
- **The Scryfall commander pool (~3,300 cards) is fetched once and IndexedDB-cached** (7-day
  TTL) via `getOrFetchCommanderPool`. It is never re-filtered server-side; all filtering
  (`domain/commanderCheck.ts`'s `filterCommanders`) runs client-side against the cached array.
  Don't add per-keystroke network calls to the commander search/filter UI.
- **Only Commander-target modifiers get real-time programmatic checking.** Deck-target and
  Game-target modifiers (rarity, price, salt, themes, most artwork rules) are descriptive-only —
  players self-enforce them while building the other 99 cards of their physical deck. This is a
  deliberate scope boundary, not a missing feature.
- **The source `Cards.html` has known data-quality issues** (one exact-duplicate card, and only
  1 of 5 possible four-colour combinations present — see `tools/import-cards.ts`'s console
  output when re-run). The importer imports every row faithfully rather than silently fixing or
  dropping anything; don't "clean up" the source data without flagging it, since the physical
  card set is the ground truth this app mirrors.
- **Testing IndexedDB** requires `import 'fake-indexeddb/auto'` (already wired into
  `src/test/setup.ts` globally) — jsdom has no native IndexedDB support.
- **`canvas-confetti` (Podium page)** logs a harmless jsdom "Not implemented: HTMLCanvasElement's
  getContext()" console notice during tests. This is expected, not a regression — the hook
  feature-detects canvas support and no-ops rather than throwing.
- No git repository has been initialized for this project. Don't assume `git` commands work
  here unless/until one exists.

## What's genuinely missing (don't assume these exist)

- No backend (`ApiWarRepository`/AWS) — local-only, `LocalWarRepository` is the only adapter.
- No export/import of a war as JSON.
- No card-text localization (only UI chrome is translated).
- No dedicated accessibility audit tool was run (a reasonable baseline of aria-labels/roles/
  semantic HTML exists throughout, added ad hoc while building each screen).

See `app/README.md` for the user-facing project description and the full war-lifecycle walkthrough.
