# Brewer Wars

Digital companion for **Brewer Wars**, a physical Magic: The Gathering Commander variant where
players draw random "modifier" cards that constrain deck-building, then score points after
playing a real game. Whoever has the most points wins.

This repo holds the game's source content, the web app that runs the out-of-game bookkeeping
loop (configuring a war, drawing modifiers, picking commanders with live legality checking
against Scryfall, and scoring the results), the AWS backend that persists wars, and the
Terraform/Terragrunt infrastructure that hosts all of it.

## Repo layout

```
brewers-wars/
  original/brewers-wars/   Source of truth for game content: Rules.html and Cards.html are
                            Google-Sheets HTML exports (single-line, must be parsed, not read
                            directly — see app/tools/import-cards.ts).
  app/                      The web app — a Vite + React + TypeScript SPA, Cognito-authenticated,
                            backed by the API below. See app/README.md for the full project
                            description, the war-lifecycle walkthrough, and architecture notes.
  backend/                  Lambda handlers (Node 22/ARM64, esbuild-bundled) behind API Gateway:
                            list/create/get/put/delete/reset war routes plus a Cognito
                            listUsers endpoint, with admin-only enforcement and optimistic
                            concurrency on writes.
  infrastructure/           Terraform modules (dns, database, backend, frontend, monitoring) +
                            Terragrunt live config for eu-central-1/prod, and the frontend deploy
                            script.
```

## Getting started

App tooling lives under `app/`; the backend and infrastructure are only relevant if you're
touching persistence or deployment:

```bash
cd app
npm install
npm run dev       # http://localhost:5173
```

Every route except `/auth/callback` is gated behind a Cognito sign-in (see `app/src/auth/`), so
`npm run dev` against the checked-in `app/public/config.json` template (placeholder Cognito
values) will redirect to a login page that can't authenticate anything. Point it at a real
deployed user pool (`terragrunt output` in `infrastructure/live/eu-central-1/prod/backend`) to
sign in locally, or work at the component level with the test suite's `FakeAuthProvider`
(`app/src/test/FakeAuthProvider.tsx`) instead.

See [`app/README.md`](app/README.md) for the full quick start, architecture, and known
limitations, and [`AGENTS.md`](AGENTS.md) for contributor/agent-facing conventions (commands,
verification order, and non-obvious gotchas).
