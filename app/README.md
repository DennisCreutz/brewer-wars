# Brewer Wars

A digital companion for **Brewer Wars** — a physical Magic: The Gathering Commander variant
where players draw random "modifier" cards that constrain how they must build their deck, then
score points across several categories after playing a real game of Commander.

This app runs the whole out-of-game loop: configuring a war, drawing modifiers, picking
commanders (with live legality checking against Scryfall), and scoring the results — so the
table can spend its time playing Magic, not bookkeeping.

## Status

Deployed to AWS: wars persist to DynamoDB via an API-Gateway/Lambda backend, and every screen is
gated behind Cognito sign-in (no self-serve signup — accounts are admin-created). Only creating
or resetting wars requires the `admins` Cognito group; everyone else can play. The Scryfall
commander pool is still fetched and cached client-side (IndexedDB), since it's public data that
doesn't need to round-trip the backend. The production frontend (S3 + CloudFront) is currently
blocked on a pending AWS CloudFront account-verification support case — see
`infrastructure/live/eu-central-1/prod/backend/terragrunt.hcl` for the temporary fallback this
forced (Cognito's hosted auth domain instead of the custom one).

## Quick start

```bash
npm install
npm run dev       # http://localhost:5173
```

```bash
npm run build     # production build to dist/
npm run test      # vitest, run once
npm run test:watch
npm run lint      # oxlint
npm run format    # prettier --write
```

## How a war works

1. **Wizard** — configure players, how many Global / Personal / Score modifiers to draw, game
   mode (Normal or Custom, with draft/hidden/non-shared-deck toggles), and the win/vote point
   values.
2. **Preparation** — the Global and Score modifier decks are drawn for the whole table. A live
   "potential commanders" counter appears here and stays visible through commander selection.
3. **Personal Draw** — every player draws their own personal modifiers on their own device,
   concurrently; there's no passing a shared device or waiting for a fixed turn order. Whoever
   isn't due to act sees a waiting screen instead. Drawing a card that would conflict with one you
   already hold — or that would zero out your live commander count — is automatically discarded
   and replaced; you see the whole "what just happened" sequence, not just the final result.
4. **Commander Selection** (always hidden from other players) — an EDHREC-style browsable,
   searchable grid of every commander that satisfies your active modifiers, backed by the real
   Scryfall pool cached in IndexedDB. Rules Scryfall can't check (artwork/flavor conditions) are
   listed as an honour-system checklist instead.
5. **Overview** — a read-only battle-reference screen before the physical game begins.
6. **Scoring & Voting** — after the game, everything hidden earlier is revealed, points are
   assigned per the drawn Score modifiers plus the win bonus and best-brewer vote, with a live
   running total.
7. **Podium** — final ranked results (co-winners are a first-class outcome, not an edge case),
   with a confetti celebration.

## Architecture

```
src/
  domain/     Pure TypeScript — zero React, zero fetch. Card data, the seeded-RNG draw engine
              (exclusion rules, solo cards, draft mode), the war state machine/reducer, the
              scoring engine, and warCodec.ts (dehydrates a War to card ids for persistence —
              see "Persistence" below). Fully unit tested (vitest) independent of the UI.
  data/       Scryfall commander pool fetch + IndexedDB cache, and the bundled EDHREC deck-count
              dataset. The only layer that talks to third-party APIs directly.
  auth/       Cognito/OIDC session (react-oidc-context), the RequireAuth route guard, the
              /auth/callback landing page, and admin/current-user claim helpers.
  store/      Zustand store wiring domain + repository + data layer together for the UI, with
              optimistic dispatch (UI updates immediately; a failed save rolls back and surfaces
              `saveError` instead of blocking on every click).
  repository/ WarRepository port, a localStorage implementation (used pre-auth-boot and in
              tests), and ApiWarRepository — the real adapter, backed by API Gateway + Lambda +
              DynamoDB (see backend/ and infrastructure/ at the repo root).
  router/     react-router-dom routes, one per war phase, plus the shared hook that loads the war
              named in the URL, redirects if the phase doesn't match, and short-polls it while
              mounted so a waiting screen notices it's become its viewer's turn without a manual
              refresh.
  ui/         Shared design-system primitives (Button, Panel, ModifierCardView, CommanderCounter,
              TurnGate, ...).
  features/   One folder per screen, composed from the above.
  i18n/       react-i18next setup. English only today; see src/i18n/index.ts for how to add a
              language (card *text* is not yet translatable — see "Known limitations" below).
tools/        Re-runnable Node scripts (via tsx) that regenerate the bundled data:
                npm run tools:import-cards        # original/brewers-wars/Cards.html -> cards.json
                npm run tools:build-edhrec-data    # crawls EDHREC -> edhrec-deck-counts.json
                npm run tools:generate-card-art    # AI-generates placeholder card art
```

**Why a seeded RNG everywhere?** Every war stores a numeric seed, and the entire draw sequence
(global, score, and every player's personal draws) is a pure function of `(seed, config,
actions)`. That makes the draw engine deterministic and testable, and means the backend could
re-simulate/verify a client's draw without trusting the client (not currently done, but the
property is preserved end to end).

**Persistence.** Every `Player` is bound to a real signed-in Cognito account (`Player.userId`), so
several members can genuinely be mid-turn at once, each only ever seeing their own action screen —
`ui/TurnGate.tsx` picks which subtree to render per viewer instead of enforcing a fixed pass-the-
device order. A hydrated 8-player war with non-shared decks embeds the full 233-card catalog once
per player and can serialize to ~550 KB, over DynamoDB's 400 KB item limit; `domain/warCodec.ts`
swaps every embedded `ModifierCard` for its id before a save and looks ids back up against the
bundled catalog on load, bringing a typical war down to ~8 KB. Writes carry an optimistic-
concurrency version (`ApiWarRepository` + `backend/src/handlers/putWar.ts`); a conflicting
concurrent write surfaces as a 412 the caller can reload-and-retry from.

## Card data notes

The 233 modifier cards are imported from `original/brewers-wars/Cards.html` (see
`tools/import-cards.ts` for the full, commented classification logic). A few things worth
knowing:

- The original spreadsheet's numeric "Type" column has two incompatible readings (an exclusion
  category vs. a difficulty rating) — the importer resolves this by deriving exclusion
  categories from each card's *name* instead, and keeps the original number as a purely cosmetic
  `difficulty` (1–5) rarity ramp.
- Running the importer prints a data-quality report: the source sheet has one exact-duplicate
  card and is missing 4 of the 5 possible four-colour combinations (their slots instead hold
  redundant three-colour duplicates). Nothing is silently invented or dropped — every physical
  card is imported faithfully; disambiguated by id where names collide.
- `commanderCheck` metadata (which of the 57 Commander-target cards are machine-checkable, and
  how) is derived automatically from each card's own text at import time.

## Known limitations / next steps

- **Frontend hosting is pending AWS CloudFront account verification.** dns, database, and backend
  are live and smoke-tested (auth, CRUD, optimistic concurrency); the S3 + CloudFront frontend
  module is blocked on a support case, so `brewer-wars.com` isn't serving the SPA yet.
- **No self-serve signup.** Accounts are admin-created in the Cognito user pool
  (`aws cognito-idp admin-create-user` / `admin-update-user-attributes` for `preferred_username`);
  there's no in-app registration flow.
- **Card text is English-only.** UI chrome is fully wired through i18next; translating the 233
  cards themselves would mean adding a parallel `cards.<lang>.json` keyed by card id.
- **EDHREC data is a snapshot**, not live — re-run `npm run tools:build-edhrec-data` periodically
  to refresh it. Commanders outside the crawled ~2,700 fall back to a conservative "fewer decks
  than the lowest observed count" assumption (see `src/data/edhrecDeckCounts.ts`).
- **Deck-list validation is out of scope.** Only Commander-target modifiers get real-time
  checking (via the live Scryfall pool); Deck- and Game-target modifiers (rarity, price, salt,
  themes, etc.) are shown as rules text for players to self-enforce while actually building their
  99 other cards.
- No export/import of a war as JSON yet (straightforward to add given `WarRepository`).
