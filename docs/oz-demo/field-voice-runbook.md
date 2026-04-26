# Field App voice demo — runbook

Single linear demo. You tap the orb once and walk through fourteen turns. Each turn: read your line aloud, pause, Oz plays the next line, mic re-opens. Repeat until done.

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
| **(loop)** | Orb returns to mic-driven pulse. | Read the next line. |
| **Done** | Dim orb. Status: *All 14 lines played. Tap the orb to run the demo again.* | Tap to restart, or navigate away. |

The advance trigger is a 1-second silence after you've actually been speaking (linear-RMS VAD with 0.04 / 0.025 thresholds; tunable in [`fieldVoiceTurnTaking.ts`](../../frontend/src/features/fieldApp/fieldVoiceTurnTaking.ts)). If the room is loud and Oz won't advance, step closer to the mic or speak a bit louder; if Oz advances too eagerly, slow down — make sure you don't have ≥1s pauses mid-line.

## The fourteen turns

Read the **You say** column aloud. Oz answers with the **Oz says** column verbatim. The demo arc is Scripts 1–5: customer history (Kenny Hills) → recommend & cross-sell → **field-meeting voice memo (lands in Field Notes)** → **Sammy Carter quote (one-by-one Q&A on the Job Cost Recap sheet)** → background quote handoff. Script 3 is the voice-memo turn that runs **before** the quote build so the dictated context is in Field Notes by the time the quote work starts. Script 4 (the quote Q&A) is six turns covering one logical block of the Q26-0002-04 / Q25-1102 sheet each.

### Script 1 — Customer history (Kenny Hills visit prep)

| # | You say (read aloud) | Oz plays |
| --- | --- | --- |
| 1 | *"I'm about to visit contractor Kenny Hills — what have we sold them, and what notes are on the account?"* | *"I've got you, Alex. I'm opening Kenny Hills now—you'll get recent orders, value bands, and the field and service notes so you're not walking in cold."* |
| 2 | *"Read me the audio summary."* (or any short prompt — the system only listens for you to stop) | *"Kenny Hills Contracting is a reliable customer that is currently focusing on selling pool deck lines. In November, they bought a heavy lift cap composite resurfacing option, and it's the biggest dollar item on the account. From there, they've bought Westbury Rail to match their pool deck collection and have been looking for hidden fasteners of different types to make their orders pop for their customers. They are really pushing for clean surfaces with no screws showing."* |

### Script 2 — Recommend & cross-sell

| # | You say (read aloud) | Oz plays |
| --- | --- | --- |
| 3 | *"What products should I recommend?"* | *"Last time at Kenny Hills they had to call back a day later to add Apex Hidden Fasteners. Lead with your quoted capped composite line, then place Apex hidden fasteners in the conversation now so they do not leave without them. If they are stepping up, the deck drainage pitch still plays well on wet sites."* |
| 4 | *"What are some use cases for it?"* | *"Coastal decks, pool surrounds, and anywhere you want a clean face with no top screws. Min one-quarter inch gapping for drainage in wet climates."* |
| 5 | *"For Kenny Hills, what do accounts usually add when they buy what I am recommending, plus the fasteners?"* | *"For accounts like Kenny Hills, when buyers take your primary deck recommendation together with Apex hidden fasteners, history shows a third add: color-matched fascia or a riser bundle on long runs. Position that third line as the typical completion package."* |
| 6 | *"Ok send me the product specs to my email."* | *"Ok, sending."* |

### Script 3 — Field-meeting voice memo

A short non-quote turn. Oz acks the recording, the rep dictates a free-form memo about the meeting they just left, and the demo automatically saves the memo to **Field Notes → Incoming voice memos** at `#/field-notes`. The dictation below is the canned demo memo for the Sammy Carter walkthrough; in a real run you'd say whatever the meeting needs — the orb advances on silence, no transcription.

| # | You say (read aloud) | Oz plays |
| --- | --- | --- |
| 7 | *"Just left Sammy Carter's fab shop. Walked the floor with Sammy and his maintenance lead Mike. Sammy wants to upgrade the second packaging line — manual case packing is the bottleneck, about an hour a day on changeover. Robotic pick cell with vision and P-L-C, install before Q3, open to leasing if cap-ex is tight. Action items: pull the Q twenty-five dash eleven oh two spec, get the floor envelope from Mike, walk back with the cost recap."* | *"Cool, recording."* |

After this turn, open `#/field-notes` and you'll see the memo at the top of the **Incoming voice memos** table (customer "Sammy Carter", salesman "Alex"). Click *View conversation* to see the full dictation.

### Script 4 — Sammy Carter quote (one-by-one Q&A → Job Cost Recap sheet)

The voice walkthrough fills the same Q26-0002-04 / Q25-1102 sheet you see on `#/quotes-ready` and `#/quote-automation`. Each turn covers one block of the JCR template; expected answers below match the seeded demo data — say them as listed and the sheet stays in sync. The customer P-O is **auto-generated** when the sheet first renders (date-stamped, format `PO-SammyCarter-YYYYMMDD-XXXX`), so you don't dictate one — Oz tells you that on turn 8, and you can edit cell B8 later if Sammy supplies a real PO.

| # | You say (read aloud) | Oz plays |
| --- | --- | --- |
| 8 | *"Let's spec out Sammy Carter's quote — the automation cell upgrade at his fab shop."* | *"Got it, Alex. First — give me the project basics for Sammy Carter's automation cell upgrade: what project number, which existing quote we're tying to, and which P-M leads on our side? I'll auto-generate the P-O on the sheet — you can edit it after if Sammy supplies a real one."* |
| 9 | *"Project Q twenty-six dash zero zero zero two dash zero four, ref quote Q twenty-five dash eleven oh two, James leads on our side."* | *"Locked. Next — give me a one-line job description and the order value Sammy sees on the cover."* |
| 10 | *"Robotic cell — conveyor integration, P-L-C controls, safety guarding, vision pick verification, on-site commissioning at Sammy's shop. Order value two hundred eighty-five thousand."* | *"Got it. Component costs — break it down: electrical, commercial mechanical, manufactured mechanical."* |
| 11 | *"Thirty-eight thousand five hundred electrical, sixty-two thousand commercial mechanical, no manufactured mechanical."* | *"Labor next. Design hours and assembly hours — mechanical first, then electrical. We'll keep our standard rates: sixty-eight an hour for design, sixty-one for assembly."* |
| 12 | *"One twenty mechanical design, eighty electrical design, two forty mechanical assembly, one sixty electrical assembly."* | *"Last block — indirect labor, travel, shipping, any sales commission, and the payment schedule. Walk me through it."* |
| 13 | *"Sixty-five hundred indirect, forty-two hundred travel, twenty-eight hundred shipping, no commission. Payment schedule: half on P-O acceptance, half Net thirty after F-A-T."* | *"Locked in. Sammy's Job Cost Recap is staged — total cost about one hundred fifty-six thousand, profit one hundred twenty-eight thousand, around forty-five percent margin. Open the sheet to review and queue the invoice."* |

### Script 5 — Background quote

| # | You say (read aloud) | Oz plays |
| --- | --- | --- |
| 14 | *"Queue a background quote for me while I drive."* | *"Sounds good. I'm queuing a background quote to the web team—you'll get a handoff, not the full five-question visit note."* |

After turn 14, the orb dims and the status reads *All 14 lines played. Tap the orb to run the demo again.*

## If something goes wrong

- **Orb won't advance after I stop talking.** The room may be louder than the silence threshold (linear RMS 0.025). Move closer to the mic, speak louder, or bump `silenceMs` in [`fieldVoiceTurnTaking.ts`](../../frontend/src/features/fieldApp/fieldVoiceTurnTaking.ts) up from 1000 ms. Conversely, if it advances mid-sentence, you probably paused for ≥1 s.
- **TTS doesn't play.** A `Voice failed: …` banner appears under the orb and the run drops back to `listening` — speak again to retry. Common causes: missing `ELEVENLABS_API_KEY`, the dev server isn't proxying `/api/oz/elevenlabs/tts`, or the request hit the 90 s timeout. Restart the server after fixing.
- **Mic permission was denied.** The mic-setup card stays expanded with the error. Click *Allow microphone* again or pick a different input.
- **Wrong voice / accent.** Set `ELEVENLABS_VOICE_ID` and `ELEVENLABS_MODEL_ID` in `.env`. Default is "Rachel" + `eleven_multilingual_v2`.

## Where the lines live

- All thirteen Oz strings are constants in [`fieldDemoVoiceCopy.ts`](../../frontend/src/features/fieldApp/fieldDemoVoiceCopy.ts) (Scripts 1, 2, 3 turns 1–6, and 4) and [`fieldDemoKennyData.ts`](../../frontend/src/features/fieldApp/fieldDemoKennyData.ts) (`KENNY_TTS_AUDIO_BRIEF`).
- The order — and which turns belong to which script (used by the **Skip to next script** button) — is the queue in [`fieldDemoScriptQueue.ts`](../../frontend/src/features/fieldApp/fieldDemoScriptQueue.ts).
- The Sammy Carter / TSP RC Cell Build demo data the Script 3 answers must match is in [`jobCostEstimateRecap.ts`](../../frontend/src/features/fieldApp/jobCostEstimateRecap.ts) (`JCR_JSON_EXAMPLE_DEFAULTS`). Change the seed values there if you want the rep to read different numbers.
- To rewrite a line, edit the constant. To reorder turns, edit the queue. Tag each step with the right `scriptIndex` so Skip jumps to the correct boundary.
- To add or remove a turn, edit the queue and (if it's a new constant) the corresponding voice-copy file.

## Why it's built this way

- **Tap-to-start, silence-to-advance** is the only reliable phone-friendly way to drive the demo: one big touch target, no keyboard, no router. Hotkeys were removed for the same reason.
- **No STT or LLM in the loop.** The system never tries to understand what you say. It only watches the mic envelope. As long as you read the right lines in order, every turn fires correctly.
- **The orb pulses speech-like while Oz is speaking** so the demo doesn't visually stall while audio plays. The motion is synthesized from three sines (syllable / phrase / flutter) — see `useSpeechLikePulse` in [`FieldAppView.tsx`](../../frontend/src/features/fieldApp/FieldAppView.tsx).
