# Cursor-Style Oz Chat: Aesthetic Spec

The right-side Oz assistant panel borrows its visual language from Cursor's chat. This file documents what we are mimicking, what we are intentionally dropping, and how the implementation maps to those choices.

## Direction

Cursor's chat panel is quiet, dense, and code-tool-shaped. Almost everything is white-on-zinc with thin borders and small text. The interface gets out of the way of the content. We carry that mood directly into the Oz assistant rail.

## What We Mimic

### Surface

- **Background**: pure white panel against the zinc-50 app canvas. No gradients, no inner cards around messages.
- **Borders**: 1px `border-zinc-200` on the panel boundary and on subsections (header bar, composer top edge, context strip). No shadows.
- **Width**: fixed at 360px on desktop. Always present. Never collapses.

### Header Bar

- Thin row at the top, ~44px tall, with a bottom border.
- Left: model/identity pill. We render `Oz` followed by a small chevron, mirroring Cursor's model selector. No real model switching for the demo, but the chevron implies it exists.
- Right: a small `New chat` action (plus icon + label) and an icon-only overflow button. Both are subtle ghost buttons; no fill until hovered.
- No avatars, no eyebrows like "Persistent copilot". The product name in the header is enough.

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

### Context Pills

- Right above the composer, a horizontally scrolling row of small pills with an `@` icon and a short label. They look like Cursor's `@File`, `@Symbol`, or `@Doc` chips: `rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs`.
- The first pill is `+ Add context` and is the only pill that opens an action. Other pills are mocked badges that show what context is currently in scope (e.g. `@call-mining`, `@Russin Lumber`).

### Composer

- Wrapped in a thin `rounded-xl border border-zinc-200 bg-white` block — Cursor's composer feels like a floating card that the rest of the panel respects.
- Inside the wrapper:
  - Auto-resizing textarea (1-6 lines), no inner border, no outline ring on focus, just a placeholder `Ask Oz…`.
  - Bottom row: model picker pill on the left (`oz-prompt` with chevron), keyboard hint (`↵ to send · ⇧↵ for newline`) in the middle, and a small icon-only **send** button on the right.
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

### Always Present

- The right-side rail is fixed at 360px on screens wider than the breakpoint. Below the breakpoint it is hidden by the shell, not collapsed by the user.
- No localStorage flag. No collapse button. The shell composes the chat panel unconditionally on every page that wants it.

### Sending Messages

- Typing in the composer enables the send button.
- Pressing send (or `Enter`) appends a `user` message immediately and shows a `Thinking…` placeholder under the assistant role.
- After ~700ms the placeholder is replaced with a scripted assistant response. Responses are demo-grade: they reference the current page context summary if available, otherwise they use a generic acknowledgement.
- Up arrow on an empty composer recalls the most recent user message for editing, matching Cursor's shell-style history.

### Suggested Prompts

- Three small prompts under the composer act as quick-fire inputs. Clicking one sends it as if typed.
- Suggestions are page-scoped and come from `assistantProps.suggestedPrompts`. If absent, fall back to a small global default.

### Mode Tabs

- Visual only for the demo. Clicking does not change behavior. Tooltip explains the demo limitation.

## Implementation Notes

- File: `frontend/src/shared/ui/OzAssistantPanel.tsx`. Rewrites the existing panel to manage its own message state internally. The `messages` prop seeds the initial transcript; user-sent turns and scripted replies are appended to local state from there.
- File: `frontend/src/shared/ui/OzWorkflowShell.tsx`. Drops the right-rail collapse button and `assistantCollapsed` state. The rail is always rendered when an assistant is provided.
- File: `frontend/src/shared/ui/icons.tsx`. Adds `ArrowUpIcon`, `AtSignIcon`, `PlusIcon`, `MoreHorizontalIcon`, `SparklesIcon` for chat affordances.
- The `OzAssistantPanelProps` API is preserved so existing call sites (`App.tsx`) keep working.

## Acceptance

The panel feels like Cursor's chat:

- Quiet white surface with a thin top header.
- Small role labels above each message, no bubbles around the assistant.
- Context pills above a clean composer.
- Send is an arrow icon, not a button with a word.
- The user can actually type and receive a scripted reply.
- The rail is always visible on every page.
