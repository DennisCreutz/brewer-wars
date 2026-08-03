---
name: ui-design-review
description: Checklist-driven audit of React/TSX UI code against accessibility, forms, animation, typography, performance, and interaction-design best practices. Use when asked to "review my UI", "audit accessibility", "check design", "review UX", "check my site/component against best practices", or before shipping a new feature screen in src/features/ or src/ui/.
---

# UI Design Review

Adapted from the community-maintained Web Interface Guidelines
(vercel-labs/web-interface-guidelines), trimmed to what applies to a
Vite + React + TypeScript SPA with no server framework. Rules embedded below
so the review works fully offline — do not fetch a remote copy.

## How to use this skill

1. Identify the file(s) to review. If none were specified, ask the user for a
   file or glob (commonly `src/features/<phase>/*.tsx` or `src/ui/*.tsx`).
2. Read each file in full.
3. Check every rule below that applies to the file's content.
4. Output findings grouped by file using the terse format at the bottom.
   Skip rules that don't apply (no forms in the file -> skip Forms section).
5. Do not silently "fix" things while reviewing — report first, then only
   apply fixes if asked.

## Rules

### Accessibility

- Icon-only buttons need `aria-label`
- Form controls need `<label>` or `aria-label`
- Interactive elements need keyboard handlers (`onKeyDown`/`onKeyUp`) if they
  aren't a native `<button>`/`<a>`/`<input>`
- `<button>` for actions, `<a>`/`<Link>` for navigation — never `<div onClick>`
- Images need `alt` (or `alt=""` if purely decorative)
- Decorative icons/SVGs need `aria-hidden="true"`
- Async updates (toasts, validation, live totals) need `aria-live="polite"`
- Use semantic HTML (`<button>`, `<a>`, `<label>`, `<table>`) before reaching
  for ARIA roles
- Headings hierarchical `<h1>`–`<h6>`, not skipped for visual sizing reasons

### Focus States

- Interactive elements need a visible focus style (`focus-visible` ring or
  equivalent) — this repo has no Tailwind, so check hand-written CSS/CSS
  modules for a `:focus-visible` rule
- Never remove `outline` without providing a focus replacement
- Prefer `:focus-visible` over `:focus` so focus rings don't appear on mouse
  click, only keyboard nav
- Group focus with `:focus-within` for compound controls (a card that wraps
  an input, etc.)

### Forms

- Inputs need `autoComplete` and a meaningful `name`
- Use the correct `type` (`email`, `tel`, `url`, `number`) and `inputMode`
- Never block paste (`onPaste` + `preventDefault`)
- Labels clickable: `htmlFor` pointing at the input's `id`, or wrap the input
- Submit/confirm buttons stay enabled until the action starts; show a
  pending/disabled state during the action, not before
- Validation errors inline next to the field; focus the first invalid field
  on submit
- Placeholders end with `…` and show an example pattern, not a repeat of the
  label

### Animation

- Honor `prefers-reduced-motion` for anything beyond a subtle hover — provide
  a reduced-motion variant or skip the animation entirely
- Animate `transform`/`opacity` only (compositor-friendly); avoid animating
  `width`/`height`/`top`/`left`
- Never `transition: all` — list properties explicitly
- Animations should be interruptible (don't block user input mid-animation)

### Typography

- `…` not `...`
- Curly quotes `"` `"` not straight `"` in copy/i18n strings
- Loading states end with `…`: `"Loading…"`, `"Saving…"`
- Use tabular figures (`font-variant-numeric: tabular-nums`) for numeric
  columns/comparisons — relevant for score tables in `src/features/scoring/`
- Prevent heading widows with `text-wrap: balance` where supported

### Content Handling

- Text containers that can overflow (player names, card titles) handle long
  content: `text-overflow: ellipsis`/`line-clamp`, or explicit wrapping
- Flex children that need to truncate need `min-width: 0`
- Handle empty states explicitly — don't render broken/blank UI for an empty
  war, zero players, or zero drawn cards
- Anticipate short, average, and very long user-entered player names

### Images

- `<img>` (card art, `PlaceholderArt`) needs explicit `width`/`height` to
  avoid layout shift
- Below-fold images: `loading="lazy"`

### Performance

- Large lists (the 233-card catalog, full commander pool) should avoid
  rendering all rows unfiltered/unvirtualized at once
- No layout reads in render (`getBoundingClientRect`, `offsetHeight`,
  `scrollTop`) — do these in effects/handlers only
- Prefer uncontrolled inputs where practical; controlled inputs must stay
  cheap per keystroke (relevant to commander search filtering — see AGENTS.md
  note about no per-keystroke network calls)

### Navigation & State

- URL reflects state for anything meaningful to bookmark/share/back-button
  (this repo already does this via `react-router-dom` phase routes — flag any
  new feature state that lives only in local component state when it should
  survive a refresh)
- Links use `<a>`/`<Link>`, not `onClick` + `navigate()`, so Cmd/Ctrl-click and
  middle-click keep working
- Destructive actions (discard a war, redraw, conclude) need confirmation or
  an undo window — never fire immediately on a single click

### Touch & Interaction

- `touch-action: manipulation` on custom tap targets to avoid double-tap zoom
  delay
- `overscroll-behavior: contain` on any modal/drawer/sheet-like overlay
- During drag interactions, disable text selection on the dragged element

### Dark Mode & Theming (if the file touches theme/color)

- `color-scheme` set appropriately on the root if a dark theme exists
- Native `<select>` needs explicit `background-color`/`color` if custom
  themed, otherwise it can look broken in OS dark mode

### Hydration Safety

- N/A for pure client-rendered Vite SPA — skip this section unless the file
  does SSR-like environment detection (`typeof window`)

### Hover & Interactive States

- Buttons/links need a `:hover` state for visual feedback
- Interactive states (hover/active/focus) should read as more prominent than
  the resting state, not less

### Content & Copy (i18n strings in `src/i18n/locales/en.json`)

- Active voice: "Draw a card" not "A card will be drawn"
- Specific button labels: "Save Player Name" not "Continue" where the action
  is otherwise ambiguous
- Error messages state the fix/next step, not just the problem
- Numerals for counts: "3 commanders" not "three commanders"

### Anti-patterns (always flag these)

- `user-scalable=no` or `maximum-scale=1` disabling pinch-zoom
- `onPaste` with `preventDefault`
- `transition: all`
- `outline: none` / `outline-none` without a focus-visible replacement
- `<div>`/`<span>` with a click handler that should be a `<button>`
- `<img>` without dimensions
- Large `.map()` over an unfiltered/unpaginated large array in render
- Form inputs without labels
- Icon buttons without `aria-label`
- `autoFocus` without clear justification (fine for a single hot-seat PIN/name
  entry, questionable elsewhere)

## Output Format

Group by file. Use `file:line` format (clickable in most editors/terminals).
Terse findings, state the issue and skip the explanation unless the fix is
non-obvious.

```text
## src/features/scoring/ScoringPage.tsx

src/features/scoring/ScoringPage.tsx:42 - icon button missing aria-label
src/features/scoring/ScoringPage.tsx:88 - "..." → "…"
src/features/scoring/ScoringPage.tsx:120 - transition: all → list properties

## src/ui/PlayerBadge.tsx

✓ pass
```

Do not add a preamble before the findings. If everything passes, say so
plainly per file.
