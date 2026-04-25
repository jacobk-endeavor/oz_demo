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
- Right: a `History` button (chevron-down + label or count) that opens the session list dropdown, a small `New chat` action (plus icon + label), and an icon-only overflow button. All ghost buttons.
- No avatars, no eyebrows like "Persistent copilot". The product name in the header is enough.

### Sticky Title (First Prompt)

- The first user message of an active conversation is promoted to a **sticky title bar** at the top of the conversation column, just below the mode tabs.
- It uses a slightly heavier zinc-900 weight, truncates to two lines with ellipsis, and stays pinned while the rest of the conversation scrolls below it. Cursor uses this exact pattern: the title summarizes the chat and is always visible.
- It only appears once at least one user message has been sent. Before that, the column shows the empty state instead.
- The first user message is **not duplicated** in the conversation flow. The Oz reply renders directly under the title.

### Empty State

- Before the first message, the conversation area shows the seeded greeting (passed as `assistantProps.messages`) as quiet ambient text — not as a "real" message.
- The empty state also surfaces the suggested prompts more prominently so the user knows what to ask.
- Once the user sends the first prompt, the empty state disappears and the sticky title takes over.

### Sessions / Multi-Chat

- The chat supports **multiple sessions**, like Cursor's chat history.
- A `History` dropdown in the header lists all sessions for the current page surface. Each row shows the session title (= first user prompt or `New chat` when empty) and a relative timestamp.
- Clicking a row switches to that session. The composer, conversation, and sticky title all swap to that session's state.
- `New chat` creates a fresh empty session and switches to it. The previous session is preserved in history.
- Sessions are panel-local (not persisted across reloads). They reset when the seeded `messages` prop changes (i.e., when the user navigates between pages — each page has its own chat history).

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

- Three short prompts surface as **floating Try chips just above the @ Add context strip**, not under the composer. They sit between the conversation and the context row, giving the user a one-tap way to ask Oz the most useful question for the current page.
- They look like Cursor's suggestion chips: `rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs`, with a small `Try` eyebrow above them.
- Clicking one sends it as if typed. They are visible whether the conversation is empty or has messages, since Cursor keeps them present so users can pivot quickly.
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
- The first user prompt sticks at the top of the column once a chat has started, replacing the seeded greeting.
- Try chips float just above the @ Add context strip.
- A History dropdown in the header switches between multiple sessions; New chat starts a fresh one without losing prior chats for the page.
- Send is an arrow icon, not a button with a word.
- The user can actually type and receive a scripted reply.
- The rail is always visible on every page.
