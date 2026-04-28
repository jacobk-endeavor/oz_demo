# Voice & chat demo runbook

Quick reference for the Field App orb demo (`#/field-app`) and Home chat (`#/oz`). For architecture and file pointers, see the bottom of this doc.

---

## Oz (voice )Maintenence

- don't leave the Oz page on your phone or it'll restart the conversation
- if you do you can skip to the start of a script 
- if you double tap it'll remove the human queues or add them back

## Demo hotkey: **P** (by page)

- on field notes Page - press P to have your voice memo from Oz script 3 appear 
- on Voice Quote Automation - press P to have the voice quote appear.

---

## Voice — **I say** → **Oz says** (orb queue)

Read the **I say** cell aloud (or any short line where noted), pause to advance; **Oz says** is the next TTS line.

### Script 1 — Customer history (Kenny Hills)


| I say                                                                                                  | Oz says                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I’m about to visit contractor Kenny Hills — what have we sold them, and what notes are on the account? | I’ve got you, Sami. I’m opening Kenny Hills now—you’ll get recent orders, value bands, and the field and service notes so you’re not walking in cold.                                                                                                                                                                                                                                                                                                                                      |
| Read me the audio summary. *(or any short line; VAD only cares that you stop)*                         | Kenny Hills Contracting is a reliable customer that is currently focusing on selling pool deck lines. In November, they bought a heavy lift cap composite resurfacing option, and it’s the biggest dollar item on the account. From there, they’ve bought Westbury Rail to match their pool deck collection and have been looking for hidden fasteners of different types to make their orders pop for their customers. They are really pushing for clean surfaces with no screws showing. |


### Script 2 — Recommend & cross-sell


| I say                                                                                                   | Oz says                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What products should I recommend?                                                                       | Last time at Kenny Hills they had to call back a day later to add Apex Hidden Fasteners. Lead with your quoted capped composite line, then place Apex hidden fasteners in the conversation now so they do not leave without them. If they are stepping up, the deck drainage pitch still plays well on wet sites. |
| What are some use cases for it?                                                                         | Coastal decks, pool surrounds, and anywhere you want a clean face with no top screws. Min one-quarter inch gapping for drainage in wet climates.                                                                                                                                                                  |
| For Kenny Hills, what do accounts usually add when they buy what I am recommending, plus the fasteners? | For accounts like Kenny Hills, when buyers take your primary deck recommendation together with Apex hidden fasteners, history shows a third add: color-matched fascia or a riser bundle on long runs. Position that third line as the typical completion package.                                                 |
| Ok send me the product specs to my email.                                                               | Ok, sending. *(side effect: canned product-specs email via dev SMTP proxy)*                                                                                                                                                                                                                                       |


### Script 3 — Field memo (canned save)

There is **no live transcription** on this turn: whatever you say only drives VAD. The **Rep** line stored in Field Notes is **always** the canned string below (`SAMI_FIELD_MEMO_CANNED_TEXT` in `fieldDemoVoiceCopy.ts`)—read it word-for-word so the demo matches **View conversation**. On `**#/field-notes`**, press **P** to append the same row without running this orb turn.


| I say                                                                                                                                                                                                                                                   | Oz says                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Hey, I want to record a field memo. *(pause after Oz’s ack before the next turn)*                                                                                                                                                                       | Ok, recording.                        |
| Just wrapped a walkthrough with Summit Ridge on site. They're in a good place — upbeat about the job, easy to talk to, and it feels like they trust us. I'd call the tone collaborative and the opportunity hot. No red flags on the relationship side. | Ok, I saved your field note — thanks! |


### Script 4 — Summit Ridge lumber package (Job Cost Recap)

Answers you speak should match the seeded JCR demo so the sheet stays consistent. After the scripted Q&A, Oz plays **Okay, generating the quote.** with **no** rep line; the run then ends and the lumber handoff can seed **Quotes Ready** (or use **P** on `**#/quotes-ready`** as above).


| I say                                                                                                                                                                                       | Oz says                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Let’s do a quote for Summit Ridge.                                                                                                                                                         | Got it, Sami. The lumber P-O will auto-generate on the sheet — you can edit it if they email you a real purchase order number. First, who is the customer and what’s the deal we’re quoting?                                      |
| Customer is Summit Ridge Framing. We are quoting the Marshall Court job — twelve wood-frame units over podium, full lumber-and-sheathing package, three flatbed drops locked to their crane picks and a PO reference that matches their release schedule. | Locked. Next — give me a one-line job description and the order total on the cover.                                                                                                                                               |
| Cover line: Marshall Court multi-family wood frame for Summit Ridge. Order value on the cover is two hundred eighty-five thousand dollars even, before tax. | Got it. Material buckets — dimensional lumber and studs, engineered lumber, then treated or specialty stock if any.                                                                                                               |
| Buckets for the sheet: thirty-eight thousand five hundred in dimensional and stud packs — long SPF, plates, and jack studs off the issued framing schedule. Sixty-two thousand in engineered — LVL beams and I-joist runs for the floor system they approved last week. Zero in treated or specialty stock on this phase — nothing exotic on the commodity side. | Last block — indirect labor, travel, shipping, any sales commission, and the payment schedule. Walk me through it.                                                                                                                |
| Wrap-up costs: sixty-five hundred indirect for PM and document control, forty-two hundred travel for site pulls and sign-offs, twenty-eight hundred freight on the three staged flatbeds. No rep commission booked on this one. Payment is fifty percent on lumber P-O acceptance and the balance net-thirty after final delivery — use P-O hyphen S-R hyphen Marshall hyphen zero-four-two-six when they release so finance can tie the draw. | Locked in. Summit Ridge’s Job Cost Recap is staged — total cost about one hundred fifty-six thousand, profit one hundred twenty-eight thousand, around forty-five percent margin. Open the sheet to review and queue the invoice. |
| *(automatic — do not speak)*                                                                                                                                                                | Okay, generating the quote.                                                                                                                                                                                                       |


## Chat — exact messages to paste (`#/oz`)

Send each line **verbatim** (copy/paste). Follow this **demo order** so panels have the right context; after **Customer activity** loads, you can **click rows** in the right-hand tables (call log, competitor board, lead grid, etc.) to open detail or links where the UI makes rows interactive—use that during the walkthrough without retyping.

**Demo order**


| Step                                                    | Paste exactly                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Customer activity (opens call / request table)          | `What have my customers been requesting lately?`                                           |
| Competitor scan (Click on a row to add it to chat)      | `Search the web for which competitors sell the same products on the top 5 activity rows.`  |
| Likely buyers (send right after the competitor message) | `If we stock these product lines, who is likely to buy?`                                   |
| Customer demand dashboard                               | `Show a chart of product requests from my customers`                                       |
| Demand + profit bars                                    | `Show a bar chart of expected profit by product line`                                      |
| Dashboards build (`**#/dashboards`**, not Home chat)    | `Bar chart of lead sources and a line chart of monthly demand`                             |
| Background agent                                        | `Create a background agent to email me a weekly summary of new leads every Monday at 9am.` |


---

