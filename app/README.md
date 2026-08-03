# Brewer Wars

A digital companion for **Brewer Wars** — a physical Magic: The Gathering Commander variant
where players draw random "modifier" cards that constrain how they must build their deck, then
score points across several categories after playing a real game of Commander.

This app runs the whole out-of-game loop: configuring a war, drawing modifiers, picking
commanders (with live legality checking against Scryfall), and scoring the results — so the
table can spend its time playing Magic, not bookkeeping.

## Status

Local-only v1: everything (game state, Scryfall commander cache) lives in the browser
(`localStorage` + IndexedDB). No backend yet — see [Architecture](#architecture) for the planned
AWS migration path this was built to support.

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
3. **Personal Draw** (hot seat) — each player draws their personal modifiers in turn, with a
   privacy curtain between turns. Drawing a card that would conflict with one you already hold —
   or that would zero out your live commander count — is automatically discarded and replaced;
   you see the whole "what just happened" sequence, not just the final result.
4. **Commander Selection** (hot seat, always hidden) — an EDHREC-style browsable, searchable grid
   of every commander that satisfies your active modifiers, backed by the real Scryfall pool
   cached in IndexedDB. Rules Scryfall can't check (artwork/flavor conditions) are listed as an
   honour-system checklist instead.
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
              (exclusion rules, solo cards, draft mode), the war state machine/reducer, and the
              scoring engine. Fully unit tested (vitest) independent of the UI.
  data/       Scryfall commander pool fetch + IndexedDB cache, and the bundled EDHREC deck-count
              dataset. The only layer that talks to the network.
  store/      Zustand store wiring domain + repository + data layer together for the UI.
  repository/ WarRepository port + a localStorage implementation. Designed so the planned AWS
              version (API Gateway + Lambda + DynamoDB) is a new adapter behind the same
              interface, not a rewrite.
  router/     react-router-dom routes, one per war phase, plus the shared "load the war named in
              the URL and redirect if the phase doesn't match" hook.
  ui/         Shared design-system primitives (Button, Panel, ModifierCardView, CommanderCounter,
              HotSeatGate, ...).
  features/   One folder per screen, composed from the above.
  i18n/       react-i18next setup. English only today; see src/i18n/index.ts for how to add a
              language (card *text* is not yet translatable — see "Known limitations" below).
tools/        Re-runnable Node scripts (via tsx) that regenerate the bundled data:
                npm run tools:import-cards        # original/brewers-wars/Cards.html -> cards.json
                npm run tools:build-edhrec-data    # crawls EDHREC -> edhrec-deck-counts.json
```

**Why a seeded RNG everywhere?** Every war stores a numeric seed, and the entire draw sequence
(global, score, and every player's personal draws) is a pure function of `(seed, config,
actions)`. That makes the draw engine deterministic and testable, and means a future backend
could re-simulate/verify a client's draw without trusting the client.

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

- **No backend yet.** `src/repository/LocalWarRepository.ts` is the only `WarRepository`
  implementation. Swapping in an API-Gateway/Lambda/DynamoDB-backed one is the intended next
  step and shouldn't require touching anything above the repository layer.
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
