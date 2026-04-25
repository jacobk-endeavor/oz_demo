# Chat UI Handoff

This document captures where the Oz right-rail chat lives, what's been built, what design decisions are baked in, and what to watch out for when working on adjacent surfaces (sidebar, workflow pages, dashboard generator). The chat itself is in a stable state; the next sessions will move on to the sidebar and other components.

## Status

The chat UI is considered **done for now**. No outstanding chat work is queued. The sidebar and other workflow surfaces are the next areas of focus.

## Where Things Live

```
frontend/src/shared/ui/
  OzAssistantPanel.tsx          ← The chat itself
  OzAssistantPanel.test.tsx     ← Behavior tests
  OzWorkflowShell.tsx           ← Hosts the chat rail and the floating toggle
  OzWorkflowShell.contract.ts   ← Sidebar nav contract (Oz / Nebula / Workflows)
  PulseOrb.tsx                  ← Blue pulsating Oz orb (also used in chat empty state)
  icons.tsx                     ← All inline-SVG icons (paperclip, clock, etc.)
  visualSystem.ts               ← Design tokens (palette, surfaces, tones, joinClasses)
  Modal.tsx                     ← Generic modal used by the publish flow
  BackgroundTaskRail.tsx        ← Task-rail primitive (used inside workflow pages)

docs/oz-demo/
  11-cursor-chat-aesthetic.md   ← Cursor-style chat spec (source of truth)
  12-chat-ui-handoff.md         ← This document
```

## What the Chat Surface Does

A right-rail chat panel that mirrors Cursor's chat. Always toggleable from a fixed-position button in the top-right of the shell.

### Chrome

| Region | Contents |
|---|---|
| Header (44px, single row) | `Oz` wordmark · chat tabs (browser-style, scroll horizontally) · vertical divider · `+` (new chat) · clock (history) |
| Sticky title | First user prompt of the active session, pinned with a backdrop-blur once a chat has started |
| Conversation | Borderless messages with small uppercase role labels above each turn; user turns get a soft `bg-zinc-100` block, assistant turns are plain text |
| Try chips | Floating row of suggested prompts above the composer, with a small `Try` eyebrow |
| Composer card | `rounded-xl border border-zinc-200`, autoresizing textarea, `Mode ⌄` pill on the bottom-left, paperclip Add-context button next to it, `↑` send button on the bottom-right |
| Floating toggle | Fixed `top: 10px right: 10px`, anchored to the shell so it never moves between open/closed |

### Sessions / Tabs

- Multi-session: each tab has its own message history, sticky title, and pending state.
- `+` next to the clock spawns a new tab. Closing the last tab spawns a fresh empty one (the rail always has at least one tab).
- The clock-icon History dropdown lists every session by recency, with title, message count, and a relative timestamp; running sessions show a spinner.
- Tabs scroll horizontally when there are too many; the right cluster (`+`, clock) is anchored behind a vertical divider so it stays in place.

### Mode pill

- `Ask` / `Agent` / `Edit`, each with its own icon (chat bubble / infinity / pencil).
- Lives inside the composer footer, opening an upward menu with all three modes and tooltip copy.
- Demo-only: changing the mode updates the pill but does not change reply behavior.

### Empty state

- No seeded greeting copy in the conversation column.
- On every page except `oz`, the panel renders the **PulseOrb** (same blue pulsating orb as the Oz home) centered in the conversation area. Empty chat and Oz home now read as the same artifact.
- Try chips remain available so users always have a one-tap entry.

### Behavior

- Submit on `Enter`, newline on `Shift+Enter`. `ArrowUp` recalls the last user message into the textarea.
- Sending appends a `user` turn, shows `Oz · Thinking` with a 3-dot pulse, then resolves (~700ms) to a scripted reply that loosely picks copy from the input or page context.
- Each session tracks its own `pendingMessageId`. Switching tabs while Oz is thinking does not cancel; the originating tab updates and clears its spinner when the reply lands.
- Sessions reset whenever `assistantProps.messages` changes (i.e., when navigating between pages — each page surface gets its own chat history).
- Toggle state persists in `localStorage` (`oz-demo-assistant-collapsed`).

## Design System Notes

### Tokens

`visualSystem.ts` is the source of truth for surfaces, tones, and the palette used across the entire app. Always import from there instead of hardcoding hex values.

```ts
tokens.surface.canvas        // bg-zinc-50  (page canvas)
tokens.surface.raised        // bg-white    (cards)
tokens.surface.sunken        // bg-zinc-100 (subtle wells)
tokens.text.primary          // text-zinc-900
tokens.text.secondary        // text-zinc-600
tokens.text.muted            // text-zinc-500
tokens.text.accent           // text-blue-600
tokens.radius.sm | md | lg | pill
tokens.shadow.sm | card | pop
```

`surfaces.card`, `surfaces.cardMuted`, `surfaces.inset` are reusable container classNames.

### Tones

`Tag` and `BackgroundTaskRail` consume `Tone = 'blue' | 'red' | 'amber' | 'emerald' | 'zinc'`. Map all status colors to one of these tones; do not invent new ones in feature pages.

### Composition

Use `joinClasses(...args)` to compose Tailwind class strings. It filters out falsy values cleanly and is the project standard.

### Light-mode commitment

The whole app is light-mode. There is intentionally no dark-mode token set yet. Do not introduce dark backgrounds in new components without explicit direction.

## Layout Anatomy

```
┌──────────────────────────────────────────────────────────────────────┐
│ [sidebar zinc-50] │ [workflow header bg-white                        ⨉]
│  Oz               │ ────────────────────────────────────────────────  │
│  Nebula           │ [workflow main mx-auto max-w-[1400px]]            │
│  Workflows ▾      │                                                   │
│   • Field Notes   │                                                   │
│   • Call Mining   │                                                   │
│   • Dashboards    │                                                   │
│   ...             │                                                   │
│                   │                                                   │
└───────────────────┴───────────────────────────────────────────────────┘
                                                    ▲
                                  toggle button anchored at top: 10px right: 10px
                                  (lives outside both the workflow header and the
                                  chat header, so it never moves)
```

When the chat is open, a 360px white aside slides in on the right with the Cursor-style chat described above. The toggle button overlays both the chat header (when open) and the workflow header (when closed) at the same screen coordinate.

## Sidebar Pointer

The sidebar contract is `OzWorkflowShell.contract.ts`:

- Groups without a `label` and a single item render as flat top-level entries (Oz, Nebula).
- Groups with a `label` render as labeled sections with sub-items (Workflows).
- Active sub-items inside a labeled group get a white card + shadow + ring; the active group itself gets a soft `bg-zinc-200/60` wrapper card.
- Collapse state persists in `localStorage` (`oz-demo-sidebar-collapsed`).

If you change the nav structure, update both `navGroups` and the `OzWorkflowNavId` union, and add the new id to `App.tsx`'s `pageMeta` and routing switch.

## API Reference for the Chat

```ts
interface OzAssistantPanelProps {
  title?: string                   // Defaults to "Oz"
  contextSummary: string           // Used to seed scripted replies
  messages: OzAssistantMessage[]   // Reset trigger; not rendered
  suggestedPrompts?: OzSuggestedPrompt[]
  showFloatingMark?: boolean       // Show the PulseOrb in the empty state
  onPromptSelect?: (prompt: OzSuggestedPrompt) => void
}
```

`App.tsx` sets `showFloatingMark: page !== 'oz'` so the orb never doubles up on the Oz home.

`assistantProps.messages` doubles as a session-reset signal — the panel clears its sessions whenever this prop changes (i.e., on page navigation). Keep it stable per page or sessions will reset unexpectedly.

## Tests

Run from the repo root:

```bash
npm run test
```

The chat is covered by `frontend/src/shared/ui/OzAssistantPanel.test.tsx` (11 tests). High-signal cases:

- Header chrome, mode pill open + select, history dropdown
- Tab open/switch/close, last-tab close spawns a fresh chat
- Per-tab spinner appearing while a reply is pending
- Empty state with vs. without `showFloatingMark`
- Sticky title pin and seeded-greeting drop after first send

`App.test.tsx` also covers the toggle (`Hide Oz chat` / `Show Oz chat`), the collapsible sidebar, and routing.

When changing chat chrome, prefer testing through visible affordances (`screen.getByRole('button', { name: 'New chat' })`) instead of structural selectors so the tests survive design tweaks.

## Local Launch

From the repo root:

```bash
npm run dev          # Vite on http://localhost:5173
npm run build
npm run typecheck
npm run lint
npm run test
```

No backend required — the demo is hard-coded in the React app. The `.env.example` lists the keys (ElevenLabs, OpenAI/Anthropic, Resend/SendGrid, DigitalOcean Spaces) for the day live integrations land. Map provider keys are intentionally absent: the route map is mocked.

## Pitfalls Worth Knowing

- **Always import from `shared/ui`** for primitives. Do not reach into individual files (the index re-exports are the public API).
- **`assistantProps.messages` resets sessions**. If a feature page accidentally creates a new array on every render, the chat will throw away its tabs. Memoize or pass a stable reference.
- **The floating toggle is anchored absolutely on the shell**. If you add a fixed-position element near the top-right of the screen (e.g., a status pill on a workflow page), give it `pr-12` or check it doesn't collide with the toggle.
- **Mode and model selectors are demo-only**. They have tooltips that say so. Do not wire them to anything until live AI/ElevenLabs is decided.
- **Chat panel is browser-only**. It uses `window.localStorage` and `window.setTimeout`; the helpers guard with try/catch but the panel as a whole assumes a DOM. Do not render it during SSR if the project ever moves to Next.

## What's Next

Per the user's note, upcoming work focuses on the **sidebar and other components**. Things to consider:

- The Ramp-style sidebar already supports both flat top-level entries and labeled groups with sub-items. Adding a new top-level item is one entry in `navGroups` plus a route case in `App.tsx`.
- The `Workflows` group has six sub-items today (Field Notes, Call Mining, Dashboards, Quote Automation, Lead Generation, Reports). If a new workflow is added, add it under the `workflows` group, extend `OzWorkflowNavId`, and wire `pageMeta` + the route render switch.
- Workflow pages (Field Notes, Call Mining, Dashboards, Quote Automation, Lead Generation, Reports) all live in `frontend/src/features/<name>/`. Each page reuses the shared `Panel`, `Tag`, `Button`, and design tokens. When polishing them, reuse `surfaces.card` and `Tag` tones rather than introducing new color systems.
- The dashboard generator has its own templates folder (`frontend/src/features/dashboardGenerator/templates/`) for custom layouts (Investor Command, Company Finder). New "designed" dashboard layouts go there with a `customLayoutId` on the template.

## Quick Links

- Visual + behavior spec: `docs/oz-demo/11-cursor-chat-aesthetic.md`
- Sidebar/IA spec: `docs/oz-demo/03-information-architecture.md`
- Visual system spec: `docs/oz-demo/02-visual-and-interaction-system.md`
- Product architecture: `docs/oz-demo/01-product-architecture.md`
- Environment + assets: `docs/oz-demo/10-environment-and-assets.md`
