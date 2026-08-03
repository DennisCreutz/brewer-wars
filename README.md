# Brewer Wars

Digital companion for **Brewer Wars**, a physical Magic: The Gathering Commander variant where
players draw random "modifier" cards that constrain deck-building, then score points after
playing a real game. Whoever has the most points wins.

This repo holds the game's source content alongside the web app that runs the out-of-game
bookkeeping loop: configuring a war, drawing modifiers, picking commanders (with live legality
checking against Scryfall), and scoring the results.

## Repo layout

```
brewers-wars/
  original/brewers-wars/   Source of truth for game content: Rules.html and Cards.html are
                            Google-Sheets HTML exports (single-line, must be parsed, not read
                            directly — see app/tools/import-cards.ts).
  app/                      The actual application — a Vite + React + TypeScript SPA. See
                            app/README.md for the full project description, the war-lifecycle
                            walkthrough, and architecture notes.
```

## Getting started

All tooling lives under `app/`:

```bash
cd app
npm install
npm run dev       # http://localhost:5173
```

See [`app/README.md`](app/README.md) for the full quick start, architecture, and known
limitations, and [`AGENTS.md`](AGENTS.md) for contributor/agent-facing conventions (commands,
verification order, and non-obvious gotchas).
