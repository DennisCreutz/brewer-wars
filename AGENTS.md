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
  app/                      The frontend SPA. Everything in "Commands"/"Architecture" below is
                            rooted here unless stated otherwise.
  backend/                  Lambda handlers (API Gateway backend). `npm run build` (esbuild via
                            build.mjs) / `npm run typecheck` (tsc --noEmit), run from backend/.
  infrastructure/           Terraform modules + Terragrunt live config (eu-central-1/prod) and
                            the frontend deploy script. Applied with `terragrunt apply` from each
                            `infrastructure/live/eu-central-1/prod/<module>/` directory, in
                            dependency order (dns → database → backend → frontend → monitoring).
```

**Always `cd app` (or pass `workdir: app` to the bash tool) before running any app command below**
— there is no build tooling at the repo root. `backend/` and `infrastructure/` are separate npm/
Terragrunt projects with their own working directories.

## Commands (run from `app/`)

```bash
npm run dev              # vite dev server
npm run build            # tsc -b && vite build — the authoritative "does it compile" check
npm test                 # vitest run (alias: npx vitest run)
npm run test:watch
npm run test:ui
npx tsc -b               # typecheck only, faster than a full build
npm run lint              # oxlint (alias: npx oxlint) — 4 pre-existing accepted warnings, all
                          # react(only-export-components) on files that intentionally export a
                          # helper alongside a component (src/ui/PlayerBadge.tsx,
                          # src/ui/PlayerAvatar.tsx x2, src/test/FakeAuthProvider.tsx) — not bugs,
                          # don't "fix" them by splitting files just to silence the linter
npm run format            # prettier --write .
npm run format:check
npm run tools:import-cards        # regenerate src/data/generated/cards.json from
                                    # ../original/brewers-wars/Cards.html
npm run tools:build-edhrec-data    # re-crawl EDHREC -> src/data/generated/edhrec-deck-counts.json
npm run tools:generate-card-art    # AI-generate placeholder card art (--test/--random/--count
                                    # flags — see tools/generate-card-art.ts)
```

**Verification order for any change:** `npx tsc -b` → `npm run lint` → `npx vitest run` → `npm run
build`. All four must be clean before considering a change done. The project currently sits at
244 passing tests across 24 files; if your change legitimately adds/removes tests, expect that
number to move, but no existing test should start failing.

There is no E2E test suite configured (no Playwright/Cypress in the project). Manual end-to-end
verification during development used a throwaway Playwright script run against `npm run dev`
outside the repo (in `/tmp`) — not part of the codebase or CI. Note that every route except
`/auth/callback` is gated behind Cognito sign-in (`src/auth/RequireAuth.tsx`), so a manual E2E
script needs either real credentials against a deployed user pool or to drive the app at a layer
below `RequireAuth`.

## Architecture

Strict layering, each layer only depends on the ones above it in this list:

1. **`src/domain/`** — pure TypeScript. Zero React imports, zero `fetch`, zero I/O. Card types,
   a seeded RNG (`rng.ts`), the draw engine (`draw.ts`: exclusion rules, solo cards, draft
   mode), the war state machine/reducer (`war.ts`, `warTypes.ts`), the scoring engine
   (`scoring.ts`), and commander-eligibility predicates (`commanderCheck.ts`). This layer is
   exhaustively unit tested and is the thing to read first to understand game rules — it's more
   authoritative than any prose description, including this file.
2. **`src/data/`** — the only layer allowed to touch third-party APIs directly. Scryfall
   commander pool fetch + cache (`commanderPool.ts`, `commanderPoolCache.ts`), bundled EDHREC
   deck-count lookups (`edhrecDeckCounts.ts`).
3. **`src/auth/`** — Cognito/OIDC session via `react-oidc-context` (`AuthProvider.tsx`), the
   `RequireAuth` route guard (gates every route except `/auth/callback`), `AuthCallbackPage.tsx`,
   and claim-reading hooks (`useIsAdmin`, `useCurrentUserId`, `useAccessToken`).
4. **`src/store/`** — one Zustand store (`warStore.ts`) wiring domain + repository + data
   together for the UI. `ALL_CARDS` (the full 233-card catalog) is exported from here. `dispatch`
   applies the reducer optimistically and persists in the background; a failed save rolls the
   store back to the pre-dispatch war and sets `saveError` rather than blocking the UI on every
   click.
5. **`src/repository/`** — `WarRepository` port, `LocalWarRepository` (localStorage — used before
   auth boot completes and in tests), and `ApiWarRepository`, the real adapter (API Gateway +
   Lambda + DynamoDB, see `backend/` and `infrastructure/` at the repo root). `AuthProvider.tsx`
   swaps the store's repository to `ApiWarRepository` once runtime config and a token provider are
   both available — it can't happen at module-eval time.
6. **`src/router/`** — react-router-dom routes, one per war phase
   (`preparation → personal-draw → commander-selection → overview → scoring → concluded`), plus
   `useLoadedWar(expectedPhase?)`, the hook every phase page uses to load-from-URL, auto-redirect
   if the war's actual phase disagrees with the route, and short-poll (every 4s) while mounted so
   a waiting screen notices it's become its viewer's turn without a manual refresh.
7. **`src/ui/`** — shared design-system primitives (`Button`, `Panel`, `ModifierCardView`,
   `CommanderCounter`, `TurnGate`, `WaitingPanel`, `PlaceholderArt`, ...). Reuse these; don't
   create competing one-offs inside a feature folder.
8. **`src/features/<phase>/`** — one folder per screen, composed from everything above.
9. **`src/i18n/`** — react-i18next. English only (`locales/en.json`); UI chrome is fully wired
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
- **There is no more single-device "pass the phone" hot seat.** Every `Player` carries a real
  `userId` bound to a signed-in Cognito account (`domain/war.ts`'s `getMyPlayerId` maps the
  signed-in `sub` to a `PlayerId`), everyone has their own device, and nothing in the domain
  reducer enforces a fixed turn order. `ui/TurnGate.tsx` replaced the old `HotSeatGate`: it just
  picks which of two subtrees to render for the current viewer (their action screen vs. a
  `WaitingPanel` summarizing who's still pending) — several members can genuinely be mid-turn at
  once. `REDRAW_ZERO_COMMANDER_MODIFIER` still transiently flips a player's
  `personalDrawComplete` `true → false → true` while correcting a card mid-draw, but since each
  player only ever renders their own screen there's no cross-player "curtain" to keep pinned
  against that blip.
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
- **A hydrated `War` can exceed DynamoDB's 400 KB item limit** — an 8-player non-shared-deck war
  embeds the full 233-card catalog once per player and serializes to ~550 KB. `ApiWarRepository`
  always goes through `domain/warCodec.ts`'s `dehydrateWar`/`rehydrateWar` (swap every embedded
  `ModifierCard` for its id, look ids back up against `ALL_CARDS` on load) to bring that down to
  ~8 KB. Any new place in `War` that starts embedding `ModifierCard` objects directly must update
  `warCodec.ts` too, or persistence will silently drop/corrupt that field.
- **Writes are optimistic-concurrency-checked, not last-write-wins.** `backend/src/handlers/
  putWar.ts` requires an `If-Match` version and returns 412 on a stale write; `ApiWarRepository`
  surfaces that as `WarConflictError`, which `warStore.ts`'s `dispatch` turns into a rolled-back
  `war` plus a `saveError` for the UI to show, rather than silently overwriting a concurrent
  edit from another device.
- **Admin gating is enforced twice, and only one enforcement counts.** `useIsAdmin()`
  (`src/auth/useIsAdmin.ts`, reading the `cognito:groups` ID-token claim) only drives UI
  affordances like hiding the "New War" button — `backend/src/lib/auth.ts`'s `requireAdmin` on
  the actual Lambda handlers (create/reset war, list users) is the real enforcement point. Don't
  treat a client-side admin check as sufficient authorization for a new privileged action; wire
  the server check first.
- **The frontend reads Cognito pool/API URLs from `/config.json` at runtime**, not from Vite
  build-time env vars (`src/config/runtimeConfig.ts`) — those values are only known after a
  Terraform apply, and baking them in would force a rebuild per environment/deploy. The checked-in
  `app/public/config.json` has placeholder values; `infrastructure/scripts/deploy-frontend.sh`
  overwrites it with real Terraform outputs as part of every deploy.
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

## What's genuinely missing (don't assume these exist)

- No production frontend hosting yet — dns/database/backend are live and smoke-tested, but the
  S3 + CloudFront frontend module is blocked on a pending AWS CloudFront account-verification
  support case (see `infrastructure/live/eu-central-1/prod/backend/terragrunt.hcl`'s
  `use_custom_auth_domain` comment).
- No self-serve signup — Cognito accounts are admin-created, there's no in-app registration flow.
- No export/import of a war as JSON.
- No card-text localization (only UI chrome is translated).
- No dedicated accessibility audit tool was run (a reasonable baseline of aria-labels/roles/
  semantic HTML exists throughout, added ad hoc while building each screen).

See `README.md` (repo root) for a short project overview and `app/README.md` for the
user-facing project description and the full war-lifecycle walkthrough.
