# Oz demo runbook (Q&A only)

## Prompt cookbook — what the system answers well

Routes are decided in order (special intents first, then lead-table interpretation, then transcript RAG on conversational fallback). See `docs/chat-routing-oz-demo-and-sauron.md` for detail.

### A — Transcript **RAG** (Russin call excerpts, pgvector)

**When it runs:** `#/oz`, OpenAI + DB configured, your line does **not** match lumberyard / Milwaukee / competitor / dashboards / background-agent intents, and the lead-table interpreter treats the turn as generic (`usedConversationalFallback`).

**Use the scope control** next to the logo: **Admin** = all reps in retrieval; a **name** = only that rep’s chunks (don’t ask to compare to another rep unless scope matches).

**Strong prompts (stay concrete; avoid “customer demand dashboard” phrasing):**

| Scope | Example prompts |
|-------|-----------------|
| **Rep** | “Where did **freight** or **trucking** constraints come up?” · “What **cedar** or **fir** lines showed up in these calls?” · “Any mentions of **written quote** vs verbal?” · “Did buyers ask for **rush** or **same-week** timing?” · “What **substitutions** were discussed?” |
| **Admin** | “Which **call_id** excerpts mention **lead times** for siding?” · “Where do conversations mention **credit** or **terms**?” · “Give two examples of **delivery windows** from different reps’ excerpts in this batch.” |

**Weaker / wrong tool:** Broad “lead list,” “Milwaukee distributors,” or “what my customers are requesting” patterns are routed to **activity / lead / CRM demos**, not RAG.

---

### B — **Lumberyard** call mining (full file corpus + optional web)

**When it runs:** Phrases that match **customer activity** / **call mining** intents (e.g. products + calls/transcripts/competitors/revenue mix — see `frontend/src/features/lumberyard/lumberyardIntents.ts`), not RAG-only.

**Strong prompts:** Product and outcome questions tied to **your customer activity** narrative in the runbook below (e.g. *what have my customers been requesting* opens the panel; follow-ups about products, revenue mix, competitors once the grid is in context).

---

### C — **Competitor web → likely buyers** (two-step)

1. *Who else sells these products — search the web for the top 5* (needs activity rows).
2. *If I stock up on those, who is likely to buy?* (uses product lines from the prior competitor run.)

---

### D — **Milwaukee distributor lead grid** + natural-language **table** commands

**Open grid:** *Give me Milwaukee distributors* (and close variants — see `leadGenTableModel`).

**Strong table prompts:** *Sort by location* · *Only people we’ve met* · *Find more leads* · *Source: Apollo* · *Employees > 1000* · *Only in pharma* · *Help* (lists commands).

Oz then **polishes** replies using the table snapshot + distributor context (`buildOzGptSystemPrompt`).

---

### E — **Customer demand / P&L** panels

- *Build a dashboard of the products customers are requesting*
- *Add a chart for profit by product* (opens demand + synthetic P&L)

---

### F — **Background agents**

- *Create a background agent to email me a weekly summary … every Monday at 9am* (and similar; completes via heuristics + optional LLM).

---

## Chat — `#/oz`

1. **You type:** *what have my customers been requesting*
   **Oz says:** *The call log is open on the right. Set `OPENAI_API_KEY` in your `.env` to ask about products, revenue mix (synthetic), and competitor listings on the web (when a search key is set).*

2. **You type:** *who else sells these products — search the web for the top 5*
   **Oz says:** *Here's a competitor × product board from the top five activity rows. Click any row to open links. Next: ask who is likely to buy if you stock those lines.*

3. **You type:** *if I stock up on those, who is likely to buy?*
   **Oz says:** *Opened likely buyers on the right: engaged accounts whose company blurbs match [product needle], using product lines from your last competitor run. This is a buyer lens—tighten with sort, the source column, or clear filters in chat.*

4. **You type:** *build a dashboard of the products customers are requesting*
   **Oz says:** *Opened Customer demand beside the chat: Products requested (demand index).*

5. **You type:** *add a chart for profit by product*
   **Oz says:** *Opened Customer demand and P&L beside the chat: Products requested (demand index) plus a synthetic P&L table and realized profit bars.*

6. **You type:** *create a background agent to email me a weekly summary of new competitor offers every Monday at 9am*
   **Oz says:** *[Task title] is saved. Schedule: weekly, Mondays 9 am. Outcome: emailed competitor-offer summary. Open Workflows → Background agents to see the full card, Connections logos, and schedule details.*

## Voice — `#/field-app`

1. **You say:** *I'm about to visit contractor Kenny Hills — what have we sold them, and what notes are on the account?*
   **Oz says:** *I've got you, Sami. I'm opening Kenny Hills now—you'll get recent orders, value bands, and the field and service notes so you're not walking in cold.*

2. **You say:** *Read me the audio summary.*
   **Oz says:** *Kenny Hills Contracting is a reliable customer that is currently focusing on selling pool deck lines. In November, they bought a heavy lift cap composite resurfacing option, and it's the biggest dollar item on the account. From there, they've bought Westbury Rail to match their pool deck collection and have been looking for hidden fasteners of different types to make their orders pop for their customers. They are really pushing for clean surfaces with no screws showing.*

3. **You say:** *What products should I recommend?*
   **Oz says:** *Last time at Kenny Hills they had to call back a day later to add Apex Hidden Fasteners. Lead with your quoted capped composite line, then place Apex hidden fasteners in the conversation now so they do not leave without them. If they are stepping up, the deck drainage pitch still plays well on wet sites.*

4. **You say:** *What are some use cases for it?*
   **Oz says:** *Coastal decks, pool surrounds, and anywhere you want a clean face with no top screws. Min one-quarter inch gapping for drainage in wet climates.*

5. **You say:** *For Kenny Hills, what do accounts usually add when they buy what I am recommending, plus the fasteners?*
   **Oz says:** *For accounts like Kenny Hills, when buyers take your primary deck recommendation together with Apex hidden fasteners, history shows a third add: color-matched fascia or a riser bundle on long runs. Position that third line as the typical completion package.*

6. **You say:** *Ok send me the product specs to my email.*
   **Oz says:** *Ok, sending.*

7. **You say:** *Hey, I want to record a field memo.* — then dictate your memo after Oz says *Ok, recording.* (saved to Field Notes via transcription).
   **Oz says:** *Ok, recording.*

   After a successful save, **Oz says:** *Ok, I saved your field note — thanks!* (no rep line). In Field Notes, the memo’s last **System** line is *Memo saved to Field Notes. — general*.

8. **You say:** *Let's do a quote for Summit Ridge.*
   **Oz says:** *Got it, Sami. The lumber P-O will auto-generate on the sheet — you can edit it if they email you a real purchase order number. First, who is the customer and what's the deal we're quoting?*

9. **You say:** *Customer is Summit Ridge Framing. We are quoting the Marshall Court job — twelve wood-frame units over podium, full lumber-and-sheathing package, three flatbed drops locked to their crane picks and a PO reference that matches their release schedule.*
   **Oz says:** *Locked. Next — give me a one-line job description and the order total on the cover.*

10. **You say:** *Cover line: Marshall Court multi-family wood frame for Summit Ridge. Order value on the cover is two hundred eighty-five thousand dollars even, before tax.*
    **Oz says:** *Got it. Material buckets — dimensional lumber and studs, engineered lumber, then treated or specialty stock if any.*

11. **You say:** *Buckets for the sheet: thirty-eight thousand five hundred in dimensional and stud packs — long SPF, plates, and jack studs off the issued framing schedule. Sixty-two thousand in engineered — LVL beams and I-joist runs for the floor system they approved last week. Zero in treated or specialty stock on this phase — nothing exotic on the commodity side.*
    **Oz says:** *Last block — indirect labor, travel, shipping, any sales commission, and the payment schedule. Walk me through it.*

12. **You say:** *Wrap-up costs: sixty-five hundred indirect for PM and document control, forty-two hundred travel for site pulls and sign-offs, twenty-eight hundred freight on the three staged flatbeds. No rep commission booked on this one. Payment is fifty percent on lumber PO acceptance and the balance net-thirty after final delivery — use PO-SR-MARSHALL-0426 when they release so finance can tie the draw.*
    **Oz says:** *Locked in. Summit Ridge's Job Cost Recap is staged — total cost about one hundred fifty-six thousand, profit one hundred twenty-eight thousand, around forty-five percent margin. Open the sheet to review and queue the invoice.*

13. *(No rep line.)* After the Script 4 close, Oz automatically says: *Okay, generating the quote.* — then the Field home voice run ends. (Use **Workspace → Field App → Background quote** if you still want the separate drive-time workflow panel.)
