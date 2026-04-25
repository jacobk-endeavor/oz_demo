# Cursor-Style Oz Chat: Aesthetic Spec

The right-side Oz assistant panel borrows its visual language from Cursor's chat. This file documents what we are mimicking, what we are intentionally dropping, and how the implementation maps to those choices.

## Direction

Cursor's chat panel is quiet, dense, and code-tool-shaped. Almost everything is white-on-zinc with thin borders and small text. The interface gets out of the way of the content. We carry that mood directly into the Oz assistant rail.

## What We Mimic

### Surface

- **Background**: pure white panel against the zinc-50 app canvas. No gradients, no inner cards around messages.
- **Borders**: 1px `border-zinc-200` on the panel boundary and on subsections (header bar, composer top edge, context strip). No shadows.
- **Width**: fixed at 360px on desktop. Always present. Never collapses.

### Header Bar (with inline tabs)

- Single thin row, ~44px tall, with a bottom border. Everything fits in this row — there is no separate tab strip below.
- Left: the **`Oz` wordmark** in quiet zinc-900 text, separated from the rest by a thin vertical divider.
- Middle: the **chat tab strip** flowing horizontally, scrollable when there are many open chats. Each tab shows a leading icon, the chat title (truncated to ~160px), and a close button that appears on hover or while active. The active tab uses a white background; inactive tabs are zinc-50 and lighten on hover. Tabs are separated by 1px zinc-200 dividers, like a code editor's tab strip.
- Right: a locked action cluster behind a vertical divider — `+` (new chat), the **clock** (history), and the overflow `⋯`. The `+` is anchored next to the clock so the chat surface always has a stable place to spawn a new tab, no matter how the tab strip scrolls.
- When a chat has a pending Oz reply, its tab swaps the leading icon for an animated **spinner** so the user can see what's running across tabs at a glance. The same spinner appears next to the sticky title and in the history dropdown row.

### Sticky Title (First Prompt)

- The first user message of an active conversation is promoted to a **sticky title bar** at the top of the conversation column, just below the mode tabs.
- It uses a slightly heavier zinc-900 weight, truncates to two lines with ellipsis, and stays pinned while the rest of the conversation scrolls below it. Cursor uses this exact pattern: the title summarizes the chat and is always visible.
- It only appears once at least one user message has been sent. Before that, the column shows the empty state instead.
- The first user message is **not duplicated** in the conversation flow. The Oz reply renders directly under the title.

### Empty State

- The empty state has **no greeting copy in the conversation column**. The seeded greeting that used to read "Pick a workflow on the left, or ask me what to do next." was loud and made the chat feel like a marketing surface; it's removed.
- On every workflow page **except the Oz home**, the panel renders the **PulseOrb** (the same blue pulsating Oz voice orb used on the Oz home) centered in the conversation area. The chat empty state and the assistant home now read as the same artifact, not a separate sparkle tile. It hides as soon as the user sends the first message and disappears entirely on the Oz home, where the page itself already shows the orb.
- The Try chips above the composer remain available so the user always has a one-tap way in.
- Once the user sends the first prompt, the empty state disappears and the sticky title takes over.

The panel exposes a `showFloatingMark` boolean prop. `App.tsx` sets it to `page !== 'oz'`.

### Sessions / Multi-Chat

- The chat supports **multiple concurrent sessions**, surfaced as the tab strip described above. Tabs are the primary way to move between chats.
- The **clock-icon history dropdown** in the header is the secondary surface: it lists every session sorted by most recent, with title, message count, and relative timestamp. Sessions that are currently generating a reply show a small spinner in the right-hand metadata.
- Clicking a row in history switches to that session and scrolls its tab into view if needed. Clicking a tab does the same thing more directly.
- `+` in the right action cluster creates a fresh empty session. If the active tab is already empty, a second `+` is a no-op (no piled-up empties).
- Closing a tab is always allowed. Closing the **last** open tab spawns a fresh empty chat in its place, so the surface is never tab-less.
- Each session tracks its own pending reply. Switching tabs while Oz is "thinking" does not cancel the pending reply; when it resolves, the originating tab updates and its spinner clears.
- Sessions are panel-local (not persisted across reloads). They reset when the seeded `messages` prop changes — each page has its own chat history.

### Mode Pill (composer-level)

- The `Ask` / `Agent` / `Edit` selector is no longer a row of segmented tabs near the top of the panel. It now lives **inside the composer footer as a single compact pill** — `[icon] Mode ⌄`. This matches Cursor's `∞ Agent ⌄` pill in its composer. The mode pill is the only affordance in the bottom-left of the composer; the placeholder `oz-prompt` model picker is gone since the demo doesn't switch models.
- Each mode has its own icon: `Ask` uses a chat bubble, `Agent` uses an infinity glyph, `Edit` uses a pencil.
- Clicking the pill opens an upward menu listing the three modes with descriptions. `Ask` is the only functional mode in the demo; the others have explanatory tooltips and copy in the menu.

### Mode Tabs

- Below the header, a compact segmented control with `Ask` / `Agent` / `Edit`. Cursor's chat has these; we keep them as a visual cue even though the demo only runs `Ask`.
- Active tab gets a soft zinc-100 background and zinc-900 text. Inactive tabs are zinc-500 on transparent.

### Messages

- Vertical conversation, no individual cards or borders around messages.
- Role labels are small uppercase eyebrow text (10-11px, zinc-500). The content sits flush below.
- User and assistant messages are visually distinct only by alignment and a soft tint:
  - **Assistant**: full-width text, no background, zinc-900 body.
  - **User**: indented from the left rail, very subtle zinc-100 background block with a `rounded-lg` 8-12px radius. Cursor leans on alignment and tint, not on heavy bubbles.
- Generous vertical spacing between turns (`gap-4`).
- Inline code uses `bg-zinc-100 text-zinc-800` mono. Code blocks use `bg-zinc-950 text-zinc-100` with subtle padding. Optional in this demo.
- **Streaming/thinking** state: a three-dot pulse with the role label `Oz · Thinking…`. We use a CSS pulse on three small dots.

### Add Context Affordance

- The previous full-width `+ Add context` strip with `@`-prefixed context chips is gone. The strip added another row of chrome between the conversation and the composer, and the chips were demo decoration.
- It's replaced by a **small paperclip icon** sitting inside the composer footer, immediately after the mode pill. The paperclip is a low-emphasis ghost button (no fill until hovered) and its `aria-label` is "Add context"; tooltip notes the demo limitation.
- The chip-based context vocabulary (`@File`, `@Symbol`) can come back later if it earns its keep, but for the demo the paperclip is the only attach affordance.

### Composer

- Wrapped in a thin `rounded-xl border border-zinc-200 bg-white` block — Cursor's composer feels like a floating card that the rest of the panel respects.
- Inside the wrapper:
  - Auto-resizing textarea (1-6 lines), no inner border, no outline ring on focus, just a placeholder `Ask Oz…`.
  - Bottom row: mode pill on the left (`[icon] Mode ⌄`), an inline paperclip Add-context button next to it, and a small icon-only **send** button on the right. No keyboard hint, no model picker.
- **Send button**: 28px square, rounded, blue-600 fill when input has content, zinc-300 when empty. Icon is an upward arrow. No "Send" label.
- Submit on `Enter`. Newline on `Shift+Enter`. Up arrow recalls the last user message into the textarea.

### Color Palette (light mode)

| Token | Value | Used for |
|---|---|---|
| canvas | `#fafafa` (`bg-zinc-50`) | Main app outside the panel |
| panel | `#ffffff` (`bg-white`) | The chat surface |
| border | `#e4e4e7` (`border-zinc-200`) | Section dividers, composer outline |
| body text | `#18181b` (`text-zinc-900`) | Message body |
| muted text | `#71717a` (`text-zinc-500`) | Role label, hints, timestamps |
| accent | `#2563eb` (`bg-blue-600`) | Send button, primary action |
| user tint | `#f4f4f5` (`bg-zinc-100`) | User message background block |
| inline code | `#f4f4f5` / `#27272a` | Inline code background and text |

### Motion

- Subtle fade-in on new messages (`opacity 0 → 1` over 120ms).
- Thinking-dot pulse cycles at 1.4s.
- No layout shift when messages stream in: textarea height transitions are non-jarring, panel maintains `min-height: 0` for a smooth scroll.
- All motion respects `prefers-reduced-motion` and falls back to no animation.

## What We Drop

- **Pulse orb at the top of the panel**: removed. The chat is the focus; the orb belongs to other surfaces (Field Notes voice flow). Cursor doesn't put an avatar in its panel, neither do we.
- **Heavy context cards** (the `Mode | System | Workflow` chip grid). Replaced by the inline context pills.
- **Always-visible suggested-prompt cluster at the bottom**. Moved to a single `Suggestions` reveal under the composer that defaults to a small `Try…` row with three short prompts. Less chrome.
- **`Persistent copilot` eyebrow text**, action button stack, and `Oz Assistant` heading. The header bar carries identity.
- **Collapse/expand handle on the right rail**: removed. The panel is always present. The user explicitly asked for this.

## Behavior

### Always Present, Toggleable

- The right-side rail is fixed at 360px when open. It is **toggleable** via a small panel-right icon button anchored to the absolute top-right of the shell (fixed position, ~8px from each edge).
- The toggle is anchored — not tucked inside any flex container — so it does not move when the chat opens or closes. Open or closed, the user always finds it in the same screen position.
- When the chat is open, the toggle floats over the chat header's right slot (the chat header reserves padding so the clock/history icons don't sit underneath it). When the chat is closed, the toggle floats over the workflow header's right slot. Same coordinates either way.
- Closed state is persisted in `localStorage` (`oz-demo-assistant-collapsed`).
- Pages that explicitly opt out via `hideAssistant` get neither the rail nor the toggle.

### Sending Messages

- Typing in the composer enables the send button.
- Pressing send (or `Enter`) appends a `user` message immediately and shows a `Thinking…` placeholder under the assistant role.
- After ~700ms the placeholder is replaced with a scripted assistant response. Responses are demo-grade: they reference the current page context summary if available, otherwise they use a generic acknowledgement.
- Up arrow on an empty composer recalls the most recent user message for editing, matching Cursor's shell-style history.

### Suggested Prompts

- Three short prompts surface as **floating Try chips just above the @ Add context strip**, not under the composer. They sit between the conversation and the context row, giving the user a one-tap way to ask Oz the most useful question for the current page.
- They look like Cursor's suggestion chips: `rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs`, with a small `Try` eyebrow above them.
- Clicking one sends it as if typed. They are visible whether the conversation is empty or has messages, since Cursor keeps them present so users can pivot quickly.
- Suggestions are page-scoped and come from `assistantProps.suggestedPrompts`. If absent, fall back to a small global default.

### Mode Pill Behavior

- The active mode is a label-only switch in the demo: clicking another mode updates the pill and the send button's tooltip but does not change the scripted reply behavior. Tooltip copy explains the demo limitation.

## Implementation Notes

- File: `frontend/src/shared/ui/OzAssistantPanel.tsx`. Rewrites the existing panel to manage its own message state internally. The `messages` prop seeds the initial transcript; user-sent turns and scripted replies are appended to local state from there.
- File: `frontend/src/shared/ui/OzWorkflowShell.tsx`. Drops the right-rail collapse button and `assistantCollapsed` state. The rail is always rendered when an assistant is provided.
- File: `frontend/src/shared/ui/icons.tsx`. Adds `ArrowUpIcon`, `AtSignIcon`, `PlusIcon`, `MoreHorizontalIcon`, `SparklesIcon` for chat affordances.
- The `OzAssistantPanelProps` API is preserved so existing call sites (`App.tsx`) keep working.

## Acceptance

The panel feels like Cursor's chat:

- Quiet white surface with a thin top header carrying a clock icon for history.
- Browser-style chat tabs below the header, each with a per-tab spinner when its reply is in flight.
- Small role labels above each message, no bubbles around the assistant.
- The first user prompt sticks at the top of the column once a chat has started, replacing the seeded greeting.
- Try chips float just above the @ Add context strip.
- The mode selector is a single composer-level pill (`[icon] Mode ⌄`) opening an upward menu, not a row of segmented tabs.
- Send is an arrow icon, not a button with a word.
- The user can actually type and receive a scripted reply.
- The rail is always visible on every page.
