---
name: visual-design-direction
description: Design-lead workflow for making intentional, non-templated visual and interaction design decisions before writing UI code — color, typography, layout, motion, and copy. Use when asked to design, redesign, restyle, or improve the look/feel/UX of a screen, component, or the app as a whole, especially phrases like "make this look better", "redesign", "improve the UI/UX", or "this looks generic/AI-generated". Not for pure accessibility/best-practice audits of existing code — see the ui-design-review skill for that.
---

# Visual Design Direction

Adapted from Anthropic's `frontend-design` skill. The goal is to stop and
make deliberate design choices before touching code, so the result doesn't
read as a templated AI default. Use this before implementing, and pair it
with the `Expert React Frontend Engineer` agent (or
`.opencode/agents/frontend-engineer.agent.md`) for the actual React/TS build.

## Ground it in this app, not a generic brief

This is **Brewer Wars**: a physical Commander (MTG) variant's digital
companion. It's a hot-seat, phase-based flow (preparation → personal draw →
commander selection → overview → scoring → concluded) used at the table
while people are actively playing cards, drawing modifiers, and tallying a
war. The tone should read as "tabletop game companion", not "generic SaaS
dashboard" or "corporate admin panel". Lean on the actual subject matter —
modifier cards, commanders, draws, wars, score sheets — for design language,
not abstract defaults.

Before touching visuals, check what already exists:

- `src/ui/` — the shared design-system primitives (`Button`, `Panel`,
  `ModifierCardView`, `CommanderCounter`, `HotSeatGate`, `PlaceholderArt`,
  ...). A new design direction should evolve these, not fork a parallel
  set of one-off components inside a feature folder.
- `src/i18n/locales/en.json` — existing copy voice/tone for this app.
- `.prettierrc.json` — no semicolons, single quotes, ~100 col width; this
  applies to any code you sketch, not just prose.

## Design principles

**The hero is a thesis.** For any screen, lead with the thing that screen is
actually about: the drawn card during personal draw, the live score total
during scoring, the podium moment at conclusion. Don't default to a generic
header + subtext + CTA row if the screen's real content can lead instead.

**Typography carries personality.** Pick a deliberate pairing (a characterful
display face used with restraint + a plain, legible body face) rather than
reaching for whatever the last project used. Set a clear type scale on
purpose — modifier card titles, player names, and score numbers should each
read at a distinct, intentional weight/size, not all default `<p>` sizing.

**Structure should encode real information.** Numbered steps, dividers,
labels, and badges (draw order, categories: Commander/Deck/Game/Score/Solo)
are only justified if they encode something true — e.g. draw order is a real
sequence, so numbering it is earned. Don't add decorative numbering or
progress dots that don't correspond to anything real.

**Motion should be deliberate, not default.** Consider a single orchestrated
moment per screen transition (e.g. a card reveal on draw, a podium
confetti moment already implemented via `canvas-confetti`) rather than
scattering hover/entrance effects everywhere. Always respect
`prefers-reduced-motion` (see `ui-design-review` skill for the mechanics).

**Match complexity to the vision.** A maximalist "MTG board game" aesthetic
(card frames, foil/rarity glows tied to the existing `difficulty` 1-5 rating,
parchment/ink textures) needs careful, consistent execution across every
screen it touches. A minimal, clean-app aesthetic needs precision in spacing
and restraint instead. Pick one and hold the line — don't mix "gamey card
frame" chrome on one screen with "flat SaaS card" chrome on the next.

## Process: brainstorm -> plan -> critique -> build -> critique again

1. **Brainstorm a compact token plan** before writing any component code:
   - *Color*: 4-6 named hex values (background, surface, primary accent,
     one or two category/rarity accent colors, text).
   - *Type*: 2 roles — a display face for card names/titles/scores used
     with restraint, and a body face for everything else.
   - *Layout*: one-sentence prose + a rough ASCII sketch of the screen's
     structure, reusing `Panel`/`ModifierCardView` composition where
     possible instead of inventing new containers.
   - *Signature*: the one memorable element this specific screen should be
     remembered for (e.g. the way a drawn modifier card animates in,
     the way the live score total updates).

2. **Critique the plan against the brief** before building: would this same
   plan come out of any generic "card game app" prompt, or is it actually
   specific to Brewer Wars' rules and content? Revise anything generic.

3. **Build**, following the revised plan, reusing `src/ui/` primitives and
   respecting the layering rules in `AGENTS.md` (domain -> data -> store ->
   repository -> router -> ui -> features -> i18n).

4. **Self-critique before finishing**: does it work down to mobile (this is
   used hot-seat, likely on a phone or tablet at the table)? Is keyboard
   focus visible? Is motion reduced-motion safe? Is there exactly one bold,
   deliberate signature element, with everything else quiet around it?

## On copy

Copy is design material. Match the existing i18n voice: plain, active voice,
second person, specific labels ("Draw Modifier", not "Continue"), and error/
empty states that say what to do next rather than just what went wrong. Any
new user-facing string belongs in `src/i18n/locales/en.json`, not hardcoded
in a component (per this repo's i18n convention).

## Handoff

Once the plan and critique above are settled, either implement it directly
following React 19 / this repo's conventions, or hand the token plan +
component-level plan to a frontend engineering agent to implement — don't
skip straight to code without the plan step above.
