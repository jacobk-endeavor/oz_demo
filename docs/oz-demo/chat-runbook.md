# Oz chat demo — runbook

Single linear demo. You type prompts into the right-rail Oz chat and the workspace responds — a lead grid opens, a competitor board appears, a dashboard slides in, a background agent gets saved. Nothing here is a real LLM at the steering wheel; every interactive turn is a regex matcher in the frontend that looks for one of the seed phrases below and triggers a canned reply plus a panel open.

## Before you go on stage

1. Open `#/oz` in the browser. The chat rail renders centered on the page with a single welcome line and an empty composer.
2. (Optional, only for the lumberyard analytics turn) set `OPENAI_API_KEY` in `.env` so the lumberyard panel's analytics replies can be LLM-generated. Without it, the table opens but follow-up Q&A stays silent.
3. (Optional, only for the competitor product turn's web sources) set `BRAVE_API_KEY` to attach real competitor links. Without it, competitor offers still appear but are seeded from local mock data.
4. Confirm the welcome message reads: *"Hey—I'm Oz. Try asking for Milwaukee distributors to open the lead grid, or tell me what you want to do next in plain language. I'll stay in the thread with you."* If it says anything else, you're on the wrong page or chat history was already populated — refresh.

## The flow

| Phase | What you see | What you do |
| --- | --- | --- |
| **Idle** | Empty thread, welcome line, composer placeholder *Ask Oz…* | Type the next prompt. |
| **Thinking** | Your message lands in the thread; Oz turns into a typing indicator | Wait. Pure cosmetic — the matcher already ran. |
| **Speaking** | Oz reply streams character-by-character into the thread; the workspace panel on the right opens or updates in parallel | Read the reply. Click into the panel if you want to interact. |
| **Idle** | Composer re-enabled, focus returns | Type the next prompt. |

The chat is **only wired on `#/oz`, `#/tables`, and `#/lead-generation`**. Other pages may render the chat panel for visual consistency, but typing into it does nothing — `onUserMessage` is not connected. Stay on `#/oz` for the full demo arc; the chat reaches every panel from there.

## The eight turns

Read the **You type** column verbatim. The matchers are case-insensitive but the seed phrasing here is the most reliable; reword at your own risk. Each turn is independent — you can replay any one of them by typing it again.

### Script 1 — Lead grid

| # | You type | What happens |
| --- | --- | --- |
| 1 | *"give me Milwaukee distributors"* | Lead table opens on the right; filters/sorts reset to defaults. Oz says: *"Pulling the Milwaukee distributor grid — I'm phasing it in on the right. Ask to narrow, sort, or sub-sort (e.g. by source, then by industry or location)."* |

### Script 2 — Customer activity → competitor scan → likely buyers

| # | You type | What happens |
| --- | --- | --- |
| 2 | *"what have my customers been requesting"* | The lumberyard call-log opens on the right with mock customer requests. Oz says: *"The call log is open on the right. Set OPENAI_API_KEY in your `.env` to ask about products, revenue mix (synthetic), and competitor listings on the web (when a search key is set)."* |
| 3 | *"who else sells these products — search the web for the top 5"* | A *Searching the web…* interstitial plays, then a competitor × product board appears built from the top 5 activity rows (with Brave-sourced links if `BRAVE_API_KEY` is set, otherwise mock). Oz says: *"Here's a competitor × product board from the top five activity rows. Click any row to open links. Next: ask who is likely to buy if you stock those lines."* |
| 4 | *"if I stock up on those, who is likely to buy?"* | The lead table re-opens, filtered to **engaged** accounts whose company description matches the product needles from turn 3. Sort defaults to industry/name. Oz says: *"Opened likely buyers on the right: engaged accounts whose company blurbs match [product needle], using product lines from your last competitor run. This is a buyer lens — not 'Milwaukee distributors only.'"* |

### Script 3 — Dashboards

| # | You type | What happens |
| --- | --- | --- |
| 5 | *"build a dashboard of the products customers are requesting"* | The Customer Demand context panel opens on the right with a bar chart of requested products (demand index). Oz says: *"Opened Customer demand beside the chat: Products requested (demand index)."* |
| 6 | *"add a chart for profit by product"* | The same panel extends with a synthetic P&L table and realized-profit bars. Oz says: *"Opened Customer demand and P&L beside the chat: Products requested (demand index) plus a synthetic P&L table and realized profit bars."* |

### Script 4 — Background agent

| # | You type | What happens |
| --- | --- | --- |
| 7 | *"create a background agent to email me a weekly summary of new competitor offers every Monday at 9am"* | A connection toast appears, then a card lands in **Workflows → Background agents** with the parsed task title, schedule (Mondays 9 am), and outcome line. Oz says: *"[Task title] is saved. Schedule: weekly, Mondays 9 am. Outcome: emailed competitor-offer summary. Open Workflows → Background agents to see the full card, Connections logos, and schedule details."* |

### Reset turn (optional)

| # | You type | What happens |
| --- | --- | --- |
| 8 | *(refresh the page or navigate to `#/oz`)* | Chat history clears (it's React state, not localStorage). Workspace panels close. Background agents persist (see [reset mechanics](#reset--re-run-mechanics)). |

## If something goes wrong

- **Nothing happens when I type.** You are probably on a route that does not wire `onUserMessage`. Confirm the URL hash is `#/oz`, `#/tables`, or `#/lead-generation`. The chat panel renders on other pages but the input there is decorative.
- **The intent didn't match.** Type the literal seed phrase from the table. The matchers use ANDed keyword groups (e.g. `milwaukee` AND one of `distributors|dealers|leads|accounts|pipeline|grid`). If your phrase is missing one of those tokens, Oz falls through to a generic *"thinking…"* reply with no panel.
- **Competitor offers panel says "no results."** Either the lumberyard call grid wasn't opened first (turn 2 must precede turn 3), or `BRAVE_API_KEY` is missing and the local mock list ran out — top up `competitorOffersFixture` in [`competitorProductIntents.ts`](../../frontend/src/features/lumberyard/competitorProductIntents.ts).
- **Lead grid re-opens with the Milwaukee filter when I asked for likely buyers.** The two intents share the same table but apply different filters. If you typed turn 4 *before* turn 3 ran, the buyer filter has no product needle to use and falls back to the engaged-only view. Run turn 3 first.
- **Background agent didn't save.** Open DevTools → Application → Local Storage and check for the `oz-demo-background-agents` key. If the JSON is malformed, clear that single key and rerun turn 7. (The matcher heuristically parses cadence + outcome; if it can't, it still saves a card with the raw input as the title.)
- **Welcome message is missing.** The thread state is non-empty. Refresh the page — chat history is React-only and resets on reload.

## Where the lines and matchers live

- **Welcome message + composer placeholder** — [`OzAssistantPanel.tsx`](../../frontend/src/shared/ui/OzAssistantPanel.tsx) (`Hey—I'm Oz...` and `Ask Oz…`).
- **Chat orchestration (`onUserMessage` dispatcher, intent ordering, panel state)** — [`App.tsx`](../../frontend/src/App.tsx) (`isLeadTableChatPage`, `onUserMessage`).
- **Milwaukee lead grid** — [`leadGenTableModel.ts`](../../frontend/src/features/leadGen/leadGenTableModel.ts) (`matchMilwaukeeLeadGridIntent`).
- **Likely buyers from competitor stock** — [`stockUpBuyerIntents.ts`](../../frontend/src/features/leadGen/stockUpBuyerIntents.ts).
- **Lumberyard call log + analytics** — [`lumberyardIntents.ts`](../../frontend/src/features/lumberyard/lumberyardIntents.ts) (`matchLumberyardTableIntent`, `matchLumberyardAnalyticsOrResearchIntent`).
- **Competitor × product board** — [`competitorProductIntents.ts`](../../frontend/src/features/lumberyard/competitorProductIntents.ts).
- **Customer demand dashboard** — [`productRequestDashboardIntent.ts`](../../frontend/src/features/dashboardGenerator/productRequestDashboardIntent.ts).
- **Profit-by-product / warehouse backfill P&L** — [`profitGraphIntent.ts`](../../frontend/src/features/dashboardGenerator/profitGraphIntent.ts) (`matchProfitByProductGraphIntent`, `matchWarehouseBackfillPnlIntent`).
- **Background agents** — [`backgroundAgentModel.ts`](../../frontend/src/features/backgroundAgents/backgroundAgentModel.ts) (`matchBackgroundAgentIntent`, storage key `oz-demo-background-agents`).
- **Optional API keys** — `OPENAI_API_KEY` (lumberyard analytics replies), `BRAVE_API_KEY` (real competitor web links). Documented in [`10-environment-and-assets.md`](./10-environment-and-assets.md).

To rewrite a reply, edit the canned string next to the matching intent's branch in `App.tsx`. To add a new intent, write a `match…Intent` predicate beside an existing one and append a new branch in the `onUserMessage` switch — order matters because the first match wins.

## Reset / re-run mechanics

- **Chat thread:** lives in React state on the App component; refreshing the page or navigating away clears it. There is no "clear chat" button.
- **Workspace panels** (lead table view, lumberyard, competitor offers, dashboard P&L): each is React state too — closing the route or navigating to a different `#/page` resets them.
- **Background agents:** persist in `localStorage['oz-demo-background-agents']`. Either delete that key in DevTools or use the trash icon on each card under **Workflows → Background agents**.
- **Re-run a single intent:** type the seed phrase again — every matcher is idempotent; running it twice replaces the relevant panel state with a fresh open.

## Why it's built this way

- **No LLM in the loop for routing.** Every panel-opening turn is a deterministic regex matcher. The demo plays the same way on a flaky network and never wanders into hallucinated UI.
- **One chat for the whole demo arc.** The same panel opens lead grids, dashboards, background agents — so the operator can keep a single thread visible to the audience instead of route-switching.
- **Streamed replies, not instant ones.** The text streams in for the same reason the orb pulses speech-like in the field demo: it covers the moment between matcher firing and panel mount, and it reads as a real assistant rather than a switch statement.
