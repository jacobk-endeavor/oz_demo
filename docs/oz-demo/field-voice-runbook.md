# Field App voice demo — runbook

Single linear demo. You tap the orb once and walk through eight turns. Each turn: read your line aloud, pause, Oz plays the next line, mic re-opens. Repeat until done.

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
| **Done** | Dim orb. Status: *All 8 lines played. Tap the orb to run the demo again.* | Tap to restart, or navigate away. |

The advance trigger is a 1-second silence after you've actually been speaking (linear-RMS VAD with 0.04 / 0.025 thresholds; tunable in [`fieldVoiceTurnTaking.ts`](../../frontend/src/features/fieldApp/fieldVoiceTurnTaking.ts)). If the room is loud and Oz won't advance, step closer to the mic or speak a bit louder; if Oz advances too eagerly, slow down — make sure you don't have ≥1s pauses mid-line.

## The eight turns

Read the **You say** column aloud. Oz answers with the **Oz says** column verbatim. The demo arc is Scripts 1–4 (formerly Scripts 1–5; old Scripts 2 and 3 are now merged into one "Recommend & cross-sell" script that ends on the email-the-specs handoff).

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

### Script 3 — Prospect Q&A

| # | You say (read aloud) | Oz plays |
| --- | --- | --- |
| 7 | *"Run a visit note for this order — capture who they are, what we are ordering, and where it ships."* | *"Okay, cool. One: Who was the customer, who were you speaking to, and what were they trying to buy? Name any specific products or line items. Two: Who else are they trying to purchase from, and who have they already spoken to? Three: What insights do we have from the call, how was the interaction, and anything else that matters for the note? Four: What are we ordering: parts, SKUs, and quantities, including any alternates you talked through? Five: Where is it shipping: full address, and any job site or delivery notes? I will line your answers up in the order background and your note."* |

### Script 4 — Background quote

| # | You say (read aloud) | Oz plays |
| --- | --- | --- |
| 8 | *"Queue a background quote for me while I drive."* | *"Sounds good. I'm queuing a background quote to the web team—you'll get a handoff, not the full five-question visit note."* |

After turn 8, the orb dims and the status reads *All 8 lines played. Tap the orb to run the demo again.*

## If something goes wrong

- **Orb won't advance after I stop talking.** The room may be louder than the silence threshold (linear RMS 0.025). Move closer to the mic, speak louder, or bump `silenceMs` in [`fieldVoiceTurnTaking.ts`](../../frontend/src/features/fieldApp/fieldVoiceTurnTaking.ts) up from 1000 ms. Conversely, if it advances mid-sentence, you probably paused for ≥1 s.
- **TTS doesn't play.** A `Voice failed: …` banner appears under the orb and the run drops back to `listening` — speak again to retry. Common causes: missing `ELEVENLABS_API_KEY`, the dev server isn't proxying `/api/oz/elevenlabs/tts`, or the request hit the 90 s timeout. Restart the server after fixing.
- **Mic permission was denied.** The mic-setup card stays expanded with the error. Click *Allow microphone* again or pick a different input.
- **Wrong voice / accent.** Set `ELEVENLABS_VOICE_ID` and `ELEVENLABS_MODEL_ID` in `.env`. Default is "Rachel" + `eleven_multilingual_v2`.

## Where the lines live

- All eight Oz strings are constants in [`fieldDemoVoiceCopy.ts`](../../frontend/src/features/fieldApp/fieldDemoVoiceCopy.ts), [`fieldDemoKennyData.ts`](../../frontend/src/features/fieldApp/fieldDemoKennyData.ts) (`KENNY_TTS_AUDIO_BRIEF`), and [`prospectNotesData.ts`](../../frontend/src/features/fieldApp/prospectNotesData.ts) (`buildProspectOpeningTtsText()`).
- The order — and which turns belong to which script (used by the **Skip to next script** button) — is the queue in [`fieldDemoScriptQueue.ts`](../../frontend/src/features/fieldApp/fieldDemoScriptQueue.ts).
- To rewrite a line, edit the constant. To reorder turns, edit the queue. Tag each step with the right `scriptIndex` so Skip jumps to the correct boundary.
- To add or remove a turn, edit the queue and (if it's a new constant) the corresponding voice-copy file.

## Why it's built this way

- **Tap-to-start, silence-to-advance** is the only reliable phone-friendly way to drive the demo: one big touch target, no keyboard, no router. Hotkeys were removed for the same reason.
- **No STT or LLM in the loop.** The system never tries to understand what you say. It only watches the mic envelope. As long as you read the right lines in order, every turn fires correctly.
- **The orb pulses speech-like while Oz is speaking** so the demo doesn't visually stall while audio plays. The motion is synthesized from three sines (syllable / phrase / flutter) — see `useSpeechLikePulse` in [`FieldAppView.tsx`](../../frontend/src/features/fieldApp/FieldAppView.tsx).
