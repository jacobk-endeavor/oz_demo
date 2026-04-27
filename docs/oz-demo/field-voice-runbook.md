# Field App voice demo — runbook

Single linear demo. You tap the orb once and walk through the scripted queue. Each turn: read your line aloud, pause, Oz plays the next line, mic re-opens. Repeat until done.

A **Skip to next script →** button appears under the status line once the run starts. Tap it to stop the current Oz line, jump past the rest of the active script, and land in `listening` at the first turn of the next script. Disabled on the final script.

**Double-click anywhere on the surface (orb or background)** to hide every piece of UI except the orb — header, mic-setup card, error banner, step counter, status line, and the skip button all disappear, leaving just the sphere on a clean gradient. Double-click again to bring everything back. Useful for screenshots and demos where the chrome is distracting.

## Before you go on stage

1. Open `#/field-app` in the browser (phone or laptop is fine).
2. Allow microphone access when prompted. The orb won't move until the mic is live.
3. Make sure the page is on a connection that can hit `/api/oz/elevenlabs/tts` (dev or preview server with `ELEVENLABS_API_KEY` in `.env`). Without that, every turn surfaces a `Voice failed:` banner and stays in `listening` — playable but silent.

## The flow

| Phase | What you see | What you do |
| --- | --- | --- |
| **Idle** | Dim, still orb. Status: *Tap the orb to start the demo.* | Tap the orb. |
| **Listening** | Orb pulses to your mic level. Status: *Read the next line aloud.* | Read your line. |
| **Speaking** | Orb pulses heavily as you talk. Status: *Listening — keep going.* | Finish your line; stop talking. |
| **Oz** | Orb pulses on its own, speech-like rhythm. Status: *Oz is speaking…* | Wait. The mic is paused; the orb's motion comes from a synthesized envelope, not your voice. |
| **(loop)** | *Listening* / *Speaking* for the next queue step — same status lines and orb as above. | Read the next line; pause to advance. |
| **Done** | Dim orb. Status: *All lines played. Tap the orb to run the demo again.* | Tap to restart, or navigate away. |

The advance trigger is a 1-second silence after you've actually been speaking (linear-RMS VAD with **0.015 / 0.01** speech/silence thresholds by default; tunable in [`fieldVoiceTurnTaking.ts`](../../frontend/src/features/fieldApp/fieldVoiceTurnTaking.ts)). If the room is loud and Oz won't advance, step closer to the mic; if Oz advances too eagerly (noisy room), raise `speechThreshold` slightly or increase `silenceMs` — and avoid ≥1s pauses mid-line.

## The steps (queue)

The counter shows **Step *n* of 14** on the Field home orb. The demo arc: Scripts **1–4** — customer history (Kenny Hills) → recommend & cross-sell → field memo (canned save on the same VAD as other turns) → **Summit Ridge lumber package** on the Job Cost Recap sheet.

### Script 1 — Customer history (Kenny Hills visit prep)

| # | You say (read aloud) | Oz plays |
| --- | --- | --- |
| 1 | *"I'm about to visit contractor Kenny Hills — what have we sold them, and what notes are on the account?"* | *"I've got you, Sami. I'm opening Kenny Hills now—you'll get recent orders, value bands, and the field and service notes so you're not walking in cold."* |
| 2 | *"Read me the audio summary."* (or any short prompt — the system only listens for you to stop) | *"Kenny Hills Contracting is a reliable customer that is currently focusing on selling pool deck lines. In November, they bought a heavy lift cap composite resurfacing option, and it's the biggest dollar item on the account. From there, they've bought Westbury Rail to match their pool deck collection and have been looking for hidden fasteners of different types to make their orders pop for their customers. They are really pushing for clean surfaces with no screws showing."* |

### Script 2 — Recommend & cross-sell

| # | You say (read aloud) | Oz plays |
| --- | --- | --- |
| 3 | *"What products should I recommend?"* | *"Last time at Kenny Hills they had to call back a day later to add Apex Hidden Fasteners. Lead with your quoted capped composite line, then place Apex hidden fasteners in the conversation now so they do not leave without them. If they are stepping up, the deck drainage pitch still plays well on wet sites."* |
| 4 | *"What are some use cases for it?"* | *"Coastal decks, pool surrounds, and anywhere you want a clean face with no top screws. Min one-quarter inch gapping for drainage in wet climates."* |
| 5 | *"For Kenny Hills, what do accounts usually add when they buy what I am recommending, plus the fasteners?"* | *"For accounts like Kenny Hills, when buyers take your primary deck recommendation together with Apex hidden fasteners, history shows a third add: color-matched fascia or a riser bundle on long runs. Position that third line as the typical completion package."* |
| 6 | *"Ok send me the product specs to my email."* | *"Ok, sending."* |

### Script 3 — Field memo (Sami’s line, written to Field Notes)

**Canned text** written to the Field Notes row (Rep line) is word-for-word from `SAMI_FIELD_MEMO_CANNED_TEXT` in [`fieldDemoVoiceCopy.ts`](../../frontend/src/features/fieldApp/fieldDemoVoiceCopy.ts)):

> *"Just wrapped a walkthrough with Summit Ridge on site. They're in a good place — upbeat about the job, easy to talk to, and it feels like they trust us. I'd call the tone collaborative and the opportunity hot. No red flags on the relationship side."*

**Voice demo:** After *"Ok, recording,"* the UI is the same *waiting for the next line* flow as everywhere else: *Read the next line aloud* → *Listening — keep going* while you talk → *Oz is speaking…* for the thank-you. Pausing (VAD) saves the canned row to **Field Notes** in the same moment Oz plays thanks.

| # | You say (read aloud) | Oz plays |
| --- | --- | --- |
| 7 | *"Hey, I want to record a field memo."* (pause so Oz can play *"Ok, recording"*) | *"Ok, recording."* |
| 8 | Say anything short, then **pause** (VAD) — the memo saves automatically. | *"Ok, I saved your field note — thanks!"* |

Open `#/field-notes` after the thank-you to see the row; **View conversation** shows **Rep** = the paragraph above, **System** lines = recording ack and saved line. There is no live dictation in this path.

### Script 4 — Summit Ridge lumber package (one-by-one Q&A → Job Cost Recap sheet)

The voice walkthrough fills the same **Q26-0601-LB** / **Q25-4420-LUM** sheet you see on `#/quotes-ready` and `#/quote-automation`. Each turn covers one block of the JCR template; expected answers below match the seeded demo data — say them as listed and the sheet stays in sync. The **lumber P-O** is **auto-generated** when the sheet first renders (date-stamped slug from the customer name, e.g. `PO-SummitRidgeFraming-YYYYMMDD-XXXX`), so you don't dictate one — Oz says so on turn 8 and asks for **customer + deal**. You can edit the P-O cell later if the buyer emails a real number.

| # | You say (read aloud) | Oz plays |
| --- | --- | --- |
| 8 | *"Let's quote Summit Ridge's lumber package — multi-family framing, SPF and engineered, three-drop delivery."* | *"Got it, Sami. The lumber P-O will auto-generate on the sheet — you can edit it if they email you a real purchase order number. First, who is the customer and what's the deal we're quoting?"* |
| 9 | *"Customer is Summit Ridge Framing. The deal is a full framing-and-sheathing package for their Marshall Court job — twelve units, wood frame, lifts tied to their crane schedule."* | *"Locked. Next — give me a one-line job description and the order total on the cover."* |
| 10 | *"SPF dimensional and engineered floor system, OSB wall and roof sheathing, hardware bundle, three flatbed drops to the Marshall Court site. Order value two hundred eighty-five thousand."* | *"Got it. Material buckets — dimensional lumber and studs, engineered lumber, then treated or specialty stock if any."* |
| 11 | *"Thirty-eight thousand five hundred dimensional and stud packs, sixty-two thousand LVL and I-joists, no treated specialty on this phase."* | *"Labor next. Takeoff and yard time — layout and lift plan first, then crew staging and delivery alignment. We'll keep our standard rates: sixty-eight an hour for design, sixty-one for assembly."* |
| 12 | *"One twenty on takeoff and lift plan, eighty on engineered-lumber coordination, two forty yard crew and staging hours, one sixty delivery-alignment hours."* | *"Last block — indirect labor, travel, shipping, any sales commission, and the payment schedule. Walk me through it."* |
| 13 | *"Sixty-five hundred indirect, forty-two hundred travel, twenty-eight hundred shipping, no commission. Payment schedule: half on lumber P-O acceptance, half Net thirty after final delivery."* | *"Locked in. Summit Ridge's Job Cost Recap is staged — total cost about one hundred fifty-six thousand, profit one hundred twenty-eight thousand, around forty-five percent margin. Open the sheet to review and queue the invoice."* |

Immediately after turn 13’s Oz line finishes, Oz plays *"Okay, generating the quote."* with **no rep line** — then the run completes.

The saved Field Notes row from Script 3’s (2/3) rep turn includes a **System** line ending with *`— general`* when applicable.

After that, the orb dims and the status reads *All 14 lines played. Tap the orb to run the demo again.* (The step counter tracks every orchestrated queue item, including auto-only Oz lines, not only rep turns.)

## If something goes wrong

- **Orb won't advance after I stop talking.** Background noise may stay above the silence threshold (linear RMS **0.01**). Move closer to the mic, reduce fan noise, or bump `silenceMs` in [`fieldVoiceTurnTaking.ts`](../../frontend/src/features/fieldApp/fieldVoiceTurnTaking.ts) up from 1000 ms. Conversely, if it advances mid-sentence, you probably paused for ≥1 s or the room is lifting the RMS.
- **TTS doesn't play.** A `Voice failed: …` banner appears under the orb and the run drops back to `listening` — speak again to retry. Common causes: missing `ELEVENLABS_API_KEY`, the dev server isn't proxying `/api/oz/elevenlabs/tts`, or the request hit the 90 s timeout. Restart the server after fixing.
- **After “Ok, recording”** the mic opens like any other turn: speak, then **pause** so VAD can fire. If you use **Skip to next script →** from the “say something / pause” turn, you leave Script 3 (including the thank-you line) and jump to Script 4.
- **Mic permission was denied.** The mic-setup card stays expanded with the error. Click *Allow microphone* again or pick a different input.
- **Wrong voice / accent.** Set `ELEVENLABS_VOICE_ID` and `ELEVENLABS_MODEL_ID` in `.env`. Default is "Rachel" + `eleven_multilingual_v2`.

## Where the lines live

- The Oz strings for the queue are in [`fieldDemoVoiceCopy.ts`](../../frontend/src/features/fieldApp/fieldDemoVoiceCopy.ts) and [`fieldDemoKennyData.ts`](../../frontend/src/features/fieldApp/fieldDemoKennyData.ts) (`KENNY_TTS_AUDIO_BRIEF`). The **Sami** memo body (saved on the Script 3 pause) is `SAMI_FIELD_MEMO_CANNED_TEXT` in the same file.
- The order — and which turns belong to which script (used by the **Skip to next script** button) — is the queue in [`fieldDemoScriptQueue.ts`](../../frontend/src/features/fieldApp/fieldDemoScriptQueue.ts).
- The Summit Ridge / lumber package demo data the Script 4 answers must match is in [`jobCostEstimateRecap.ts`](../../frontend/src/features/fieldApp/jobCostEstimateRecap.ts) (`JCR_JSON_EXAMPLE_DEFAULTS`). Change the seed values there if you want the rep to read different numbers.
- To rewrite a line, edit the constant. To reorder turns, edit the queue. Tag each step with the right `scriptIndex` so Skip jumps to the correct boundary.
- To add or remove a turn, edit the queue and (if it's a new constant) the corresponding voice-copy file.

## Why it's built this way

- **Tap-to-start, silence-to-advance** drives the whole demo, including Script 3: after *"Ok, recording,"* the same VAD that advances other turns also saves the **canned** Sami memo to Field Notes and then plays the thank-you TTS.
- On every rep turn, as long as you pause to advance and the TTS lines match the queue, the run stays in sync.
- **The orb pulses speech-like while Oz is speaking** so the demo doesn't visually stall while audio plays. The motion is synthesized from three sines (syllable / phrase / flutter) — see `useSpeechLikePulse` in [`FieldAppView.tsx`](../../frontend/src/features/fieldApp/FieldAppView.tsx).
