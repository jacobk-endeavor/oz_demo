# Demo scripts — exact inputs and expected results

Use this file to run the demo step by step. Tick or edit lines as you validate each case.

**Prerequisites (assumed for scripted chat/voice):** `OPENAI_API_KEY` in `.env`, dev server running, browser on the app. For Field voice: mic permission; optional Eleven Labs for TTS. For web-backed competitor text: `BRAVE_API_KEY` or `BRAVE_SEARCH_API_KEY` optional.

**Reference for routes and intent detail:** `a.md` (unchanged).

---

## Teleprompter voice: what you say vs what Oz says (target behavior)

**Goal (not built yet):** A **scripted Field voice** mode where the app **does not record the microphone and does not run speech-to-text** on the presenter. The presenter **reads the “You” line** from a prompt (or tap **Done / Next**), and the app **assumes** that line was read. **Immediately after** (or on Done), **Oz speaks the “Oz” line** (fixed TTS) and the UI advances—same as “when I’m done talking, the robot reads the next part,” without using audio input.

| Today | Future scripted mode (see [To-do: scripted voice mode](#to-do-scripted-voice-mode-no-code-yet) below) |
| --- | --- |
| Orb records audio → Whisper → LLM `reply` + `workflowId` → TTS of variable `reply` | No STT/LLM for routing: play fixed **Oz** copy below, open workflow, chain fixed TTS in order |
| TTS on buttons uses fixed strings in code (already) | Unchanged; those strings are the “Oz” lines for those beats |

**Routing replies** in the table below are **canonical demo copy** to standardize in product (today the live app may differ because the router uses an LLM). **Button and prospect opening** text is **exact** from the codebase where noted.

**Field App TTS:** Each Run panel has on-screen **Hear / Play** buttons that fire the canonical Eleven Labs lines (constants in `fieldDemoVoiceCopy.ts` / `fieldDemoKennyData.ts`). Tap the same button while it is playing to stop.

### Script 1 — Customer history (initial route)

| Turn | You read aloud (exact) | Hotkey | Oz says (TTS, exact target copy) |
| --- | --- | --- | --- |
| 1 | `I'm about to visit contractor Kenny Hills — what have we sold them, and what notes are on the account?` | **1** | `I’ve got you, Sami. I’m opening Kenny Hills now—you’ll get recent orders, value bands, and the field and service notes so you’re not walking in cold.` |
| 2 (optional, button) | (Use **Hear a quick audio summary**; you do not speak.) | **2** | *Exact app copy from `KENNY_TTS_AUDIO_BRIEF` in `fieldDemoKennyData.ts`:* `Kenny Hills Contracting is a reliable customer that is currently focusing on selling pool deck lines. In November, they bought a heavy lift cap composite resurfacing option, and it's the biggest dollar item on the account. From there, they've bought Westbury Rail to match their pool deck collection and have been looking for hidden fasteners of different types to make their orders pop for their customers. They are really pushing for clean surfaces with no screws showing.` |

*Extra (customer-history run, not in table above):* **3** = after-audio-summary line (`SCRIPT1_AFTER_AUDIO_SUMMARY`). **x** = customer-history LLM fallback (`CUSTOMER_HISTORY_VOICE_FALLBACK`).

### Script 2 — What to recommend (initial route + in-run TTS)

| Turn | You read aloud (exact) | Hotkey | Oz says (TTS, exact target copy) |
| --- | --- | --- | --- |
| 1 | `What products should I recommend?` | **4** | `On it. I’m opening the What to recommend run—start from the visit signal, then you can go deeper on specs and use cases on screen.` |
| 2 | (You do not speak. Advance after Oz 1, then tap **Play visit signal** / **Play** on the visit-signal control.) | **5** | *From `TTS_RECOMMEND` in `FieldWorkflowRunPanels.tsx`:* `Last time at Kenny Hills they had to call back a day later to add Apex Hidden Fasteners. Lead with your quoted capped composite line, then place Apex hidden fasteners in the conversation now so they do not leave without them. If they are stepping up, the deck drainage pitch still plays well on wet sites.` |
| 3 | (You do not speak. Tap **Do you want any specific info on this product?**) | **6** *(optional;* `SCRIPT2_SPEC_BRIDGE` *)* | (UI only in this script; **6** plays the spec-bridge TTS in the app if you want a spoken beat.) |
| 4 | (You do not speak. Tap **What are some use cases for it?**) | **7** | (On-screen *From the spec* paragraph; same text is also TTS via **7:** `Coastal decks, pool surrounds, and anywhere you want a clean face with no top screws. Min one-quarter inch gapping for drainage in wet climates.` — matches the current card copy in `FieldWorkflowRunPanels.tsx`.) |

*Extra (product run):* **0** = email handoff (`SCRIPT2_EMAIL_REPLY`). **z** = stale hint (`SCRIPT2_PRODUCT_STALE_HINT`).

### Script 3 — Upsell & cross-sell (initial route + bundle TTS)

| Turn | You read aloud (exact) | Hotkey | Oz says (TTS, exact target copy) |
| --- | --- | --- | --- |
| 1 | `For Kenny Hills, what do accounts usually add when they buy what I am recommending, plus the fasteners?` | **8** | `Makes sense. I’m opening upsell and cross-sell for Kenny—you’ll get the usual bundle pattern: lead line, paired fasteners, then the common third add.` |
| 2 | (You do not speak. Tap **Hear the bundle**.) | **9** | *From `TTS_UPSELL` in `FieldWorkflowRunPanels.tsx`:* `For accounts like Kenny Hills, when buyers take your primary deck recommendation together with Apex hidden fasteners, history shows a third add: color-matched fascia or a riser bundle on long runs. Position that third line as the typical completion package.` |

### Script 4 — Prospect Q&A + notes (initial route; opening TTS is long)

| Turn | You read aloud (exact) | Hotkey | Oz says (TTS, exact) |
| --- | --- | --- | --- |
| 1 | `Run a visit note for this order — capture who they are, what we are ordering, and where it ships.` | **p** | *From `buildProspectOpeningTtsText()` in `prospectNotesData.ts` (single spoken block):* `Okay, cool. One: Who was the customer, who were you speaking to, and what were they trying to buy? Name any specific products or line items. Two: Who else are they trying to purchase from, and who have they already spoken to? Three: What insights do we have from the call, how was the interaction, and anything else that matters for the note? Four: What are we ordering: parts, SKUs, and quantities, including any alternates you talked through? Five: Where is it shipping: full address, and any job site or delivery notes? I will line your answers up in the order background and your note.` |
| 2+ | (Typed/voice follow-ups as you choose; not prescribed here.) | **a** … **j** | (Live app: follow-up LLM; scripted `PROSPECT_OZ_TTS` lines map to **a**=1st, **s**=2nd, **d**=3rd, **f**=4th, **g**=5th, **h**=6th, **j**=7th.) |

### Script 5 — Background quote (initial route; then UI, not extra TTS)

| Turn | You read aloud (exact) | Hotkey | Oz says (TTS, exact target copy) |
| --- | --- | --- | --- |
| 1 | `Queue a background quote for me while I drive.` | **c** | `Sounds good. I’m queuing a background quote to the web team—you’ll get a handoff, not the full five-question visit note.` |
| 2 | (You do not speak. Wait for demo timer ~3s.) | — | (On screen only: `Generating quote…` then `Ready for review in Quote Automation (mock)` — from `RunBackgroundQuote` in `FieldWorkflowRunPanels.tsx`.) |

---

## To-do: scripted voice mode (no code yet)

Use this as the implementation checklist when you are ready to build **teleprompter** behavior in `FieldAppView` (or a dedicated demo flag). **No implementation is required for a manual demo today**—read the “You / Oz” table aloud and use the live app, or a recording.

- [ ] **Add a “Scripted / teleprompter” mode** (e.g. env flag, query param, or internal demo toggle) for Field App home and/or per `field-mw--*` route.
- [ ] **Do not start the media recorder** in that mode; **do not** run live STT for routing or for scripted turns.
- [ ] **Show the next “You read aloud” line** on the presenter UI; **on Done/Next** (or short timer), set state as if the user had spoken that string (or skip STT entirely and advance `turnIndex`).
- [ ] **Play Oz lines** with **fixed** strings: use the “Oz says” column in this file (or import from a shared `fieldDemoScript.ts` module aligned with the table).
- [ ] For **turn 1** only, still **navigate to the right workflow** (same as today’s `goRun(workflowId)`) by **mapping** script id → `workflowId` (no LLM) or by reading `workflowId` from the same script table.
- [ ] Reuse **existing** TTS for lines already in code (`KENNY_TTS_AUDIO_BRIEF`, `TTS_RECOMMEND`, `TTS_UPSELL`, `buildProspectOpeningTtsText()`); add constants only where the table uses “target” copy that is not in code yet.
- [ ] **Chat scripts** (6–11) are **out of scope** for this item unless you add a similar “typewriter + send fixed message” mode on Home (optional, separate to-do).

---

## Script 1 — Customer history (Field, voice)

| Step | You do | Expected result |
| --- | --- | --- |
| 1 | Navigate: `#/field-app` (or `Workspace → Field App`). | Field App home with pulse orb. |
| 2 | Tap orb, hold, **speak** (word-for-word): `I'm about to visit contractor Kenny Hills — what have we sold them, and what notes are on the account?` Stop recording. | Oz **speaks** a short TTS line; the **Customer history** run view opens. |
| 3 | (No new voice required for demo proof.) | On screen: heading/readout for **Kenny Hills**; section **Recent sales to this account** (table with dates/products); **Past notes (field + service)**; button **Hear a quick audio summary (Eleven Labs)**. |

**Alt entry (skip voice routing test):** `#/field-mw--customer-interactions` → you should see the same run panel.

---

## Script 2 — What to recommend (Field, voice + taps)

| Step | You do | Expected result |
| --- | --- | --- |
| 1 | Navigate: `#/field-mw--product-recommend` | **What to recommend** run panel; **Visit signal** card (Apex / capped composite). |
| 2 | **Speak** on home orb first (if testing router from `#/field-app`): `What products should I recommend?` | Routes to this workflow; TTS; same panel. |
| 3 | Tap **Play visit signal** (or **Hear** control on visit signal). | TTS plays recommendation script (fasteners / composite line). |
| 4 | Tap **Do you want any specific info on this product?** | Step advances to “spec / use cases” prompt. |
| 5 | Tap **What are some use cases for it?** | **From the spec (spoken summary)** text appears (coastal decks, pool surrounds, gapping, etc.). |

---

## Script 3 — Upsell & cross-sell (Field, voice)

| Step | You do | Expected result |
| --- | --- | --- |
| 1 | Navigate: `#/field-mw--upsell-cross-sell` | **Upsell & cross-sell** intro copy referencing **Kenny Hills**. |
| 2 | **Speak** from `#/field-app` orb: `For Kenny Hills, what do accounts usually add when they buy what I am recommending, plus the fasteners?` | TTS; **Upsell & cross-sell** run view. |
| 3 | Tap **Hear the bundle** | TTS plays upsell bundle line. |
| 4 | — | Three cards visible: **Your primary line**; **Fasteners (paired)**; **Third item (typical add)** (each with a kicker line). |

---

## Script 4 — Prospect Q&A + notes (Field, voice + typing optional)

| Step | You do | Expected result |
| --- | --- | --- |
| 1 | Navigate: `#/field-mw--prospect-notes` | Five numbered questions; **Hear the questions (Eleven Labs)**; **Download PDF** / **Log visit to Field notes**. |
| 2 | **Speak** from `#/field-app` orb: `Run a visit note for this order — capture who they are, what we are ordering, and where it ships.` | TTS; **Prospect Q&A** run view. |
| 3 | Fill the five inputs (typed or via voice, depending on your demo): any non-empty text for each line, OR focus on: **customer / line items / ship-to** for quote-ready strip. | When customer + line items + ship-to are filled: green strip **Ready for quote generation** appears. |
| 4 | Click **Download PDF** | PDF downloads; a **QRV-…** review code is associated (see app copy). |
| 5 | Click **Log visit to Field notes** | Modal: **Generate a quote from this visit?** with **Open Quote Automation** (optional). |

---

## Script 5 — Background quote (Field, voice)

| Step | You do | Expected result |
| --- | --- | --- |
| 1 | Navigate: `#/field-mw--background-quote` | **Background quote** panel. |
| 2 | **Speak** from `#/field-app` orb: `Queue a background quote for me while I drive.` | TTS; **background-quote** run view (not the five-question prospect flow). |
| 3 | Wait ~3 seconds. | **Generating quote…** then **Ready for review in Quote Automation (mock)**. |

---

## Script 6 — What are my customers ordering? (Home, chat)

| Step | You do | Expected result |
| --- | --- | --- |
| 1 | Navigate: `#/oz` | Centered or rail chat; **no** right panel until intent fires. |
| 2 | **Type** (exact): `What have my customers been requesting lately?` | Right panel opens: **customer activity** (lumberyard) **calls table** loads (after fetch). |
| 3 | Read Oz reply. | With API key: natural answer about requests/calls; without key: copy may say to set `OPENAI_API_KEY` for full intel. |

---

## Script 7 — Who would buy if we resell? (Home, chat — two messages)

| Step | You do | Expected result |
| --- | --- | --- |
| 1 | Ensure you are on `#/oz` and **activity** can load (Script 6 once, or any message that opened the call list). | Calls exist in the grid on the right when activity is shown. |
| 2 | **Type** (exact): `Search the web for which competitors sell the same products on the top 5 activity rows.` | Interstitial “searching” then **competitor offers** table; Oz message lists **Products considered: …** |
| 3 | **Type** (exact): `If we stock these product lines, who is likely to buy?` | **Competitor** table closes; **lead grid** (distributors) opens: **engaged** filter, description filter from step 2 product terms; sort industry then name. |
| 4 | If step 2 failed (no products): | Oz says to run a **competitor product search** on activity first — repeat step 2, then 3. |

---

## Script 8 — Customer demand (generated dashboard) — Home, chat

| Step | You do | Expected result |
| --- | --- | --- |
| 1 | Navigate: `#/oz` | Chat ready. |
| 2 | **Type** (exact): `Show a dashboard of product requests from my customers` | Right panel: **Customer demand** (demand index chart/table path via `CustomerDemandAndProfitContextPanel` **without** P&L). |
| 3 | Read Oz reply. | Confirms **Customer demand** opened; may mention **Export to Dashboards**. |

---

## Script 9 — Customer demand + P&L — Home, chat

| Step | You do | Expected result |
| --- | --- | --- |
| 1 | On `#/oz` **Type** (exact): `Show a bar chart of expected profit by product line` | Same right panel with **P&L** / profit bars **on** (includePnl true). |
| 2 | Use **Export** in that panel (if you demo handoff to Dashboards). | A chip appears under **Your charts (queued for Dashboards)**. |

---

## Script 10 — Dashboards page — build prompt (separate from Home)

| Step | You do | Expected result |
| --- | --- | --- |
| 1 | Navigate: `#/dashboards` | Hero prompt field; **Starter** chart group. |
| 2 | **Type** in the build form (suggested exact): `Bar chart of lead sources and a line chart of monthly demand` | New group appears; **last build** line names added charts. |
| 3 | (Optional) Open `#/dashboards` after Script 8/9 **Export** | Imported **From chat** (or similar) group may appear. |

---

## Script 11 — Background agent (Home, chat)

| Step | You do | Expected result |
| --- | --- | --- |
| 1 | Navigate: `#/oz` | Chat ready. |
| 2 | **Type** (exact one-liner): `Create a background agent to email me a weekly summary of new leads every Monday at 9am.` | If parsing + AI pass: save confirmation, **connecting** toast, reply points to **Workflows → Background agents**. |
| 3 | Navigate: `#/background-agents` | New card lists the agent with **schedule** and **scope** text. |
| 4 | If Oz asks for more detail: | Reply in **next message** with any missing *what* or *when* in plain English. |

---

## Run order (suggested for one dry run)

1. Script 1 → 2 → 3 (Field — voice strip)  
2. Script 4 → 5 (Field)  
3. Script 6 → 7 (Home — ordering then resell)  
4. Script 8 → 9 → 10 (demand, P&L, Dashboards)  
5. Script 11 (background agent)

**Note:** If voice routing misfires, use the direct `#/field-mw--…` links in Script 1–5; the **expected on-screen** results stay the same.
