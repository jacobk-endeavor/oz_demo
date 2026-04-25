# Visual And Interaction System

## Visual Direction

The UI should feel like a space-grade sales operating system:

- Black background.
- Deep navy surfaces.
- Red, white, and electric blue light.
- Orbital gradients and parallax.
- Glassy rounded panels.
- Shimmering loading states.
- Pulsating dot mesh as Oz's speaking identity.

Use `assets/take-sales-to-space-reference.png` as the broad brand mood and `assets/oz-speaking-orb-reference.png` as the Oz orb reference.

## Opinionated Decision

Make the Oz orb the primary brand asset, not a decorative illustration.

## Defense

The orb gives the app a memorable identity and communicates “voice intelligence” immediately. It should be used as the central state indicator for listening, thinking, speaking, and running workflows. A generic chat bubble would make the product feel like every other AI wrapper.

## Color System

- `space-black`: `#030407`
- `panel-black`: `#080A12`
- `deep-navy`: `#07172F`
- `electric-blue`: `#23B8FF`
- `nebula-blue`: `#0674FF`
- `signal-red`: `#E10600`
- `hot-red-orange`: `#FF3B00`
- `starlight-white`: `#F5F7FF`
- `muted-slate`: `#8B93A7`
- `glass-border`: `rgba(255,255,255,0.14)`

## Typography

- Hero display should use an elegant serif or serif-like treatment for the “Take sales to space” feeling.
- Product UI should use a clean sans-serif for dense tables, dashboards, and assistant panels.
- Numbers in dashboards should be large, tabular, and high contrast.

## Layout Rules

- Desktop-first for demo.
- Minimum recommended demo canvas: 1440 x 900.
- Left sidebar fixed width: 72-260px depending on collapsed state.
- Right Oz assistant fixed width: 360-420px.
- Main canvas fills the middle and should never look empty.
- Use rounded cards with subtle borders and soft glows.

## Oz Orb States

### Idle

- Orb floats softly.
- Low-amplitude pulse.
- Sparse particles drift around edge.
- Suggested prompts appear below it.

### Listening

- Orb expands slightly.
- Outer particles brighten.
- Subtle waveform ring appears.
- “Listening...” state is visible but not dominant.

### Thinking

- Orb contracts and rotates.
- Blue/purple mesh shifts more actively.
- Shimmer cards or task rail show work in progress.

### Speaking

- Orb pulses in synced waves.
- White-blue highlights ripple outward.
- Assistant text streams in the right panel.

### Action Running

- Orb anchors to Oz panel.
- Main canvas shows workflow-specific progress.
- Background task rail displays deterministic steps.

## Motion Rules

- Motion should imply intelligence, not chaos.
- All key workflow loading states should be staged and readable.
- Parallax should be subtle: card movement, starfield drift, background light sweep.
- Do not animate every component. Reserve heavy motion for Oz, hero backgrounds, and background task moments.

## Component Style

- Buttons: black/glass base, red primary action, blue secondary action.
- Tables: dense, dark, high-contrast, with highlighted insights.
- Cards: translucent panels over black/navy gradients.
- Status pills: red for urgency, blue for discovery, white for completed/verified.
- Charts: luminous lines/bars on dark panels.

## Interaction Principle

The UI should always show why Oz is confident: source snippets, ranked evidence, task steps, or linked records. The demo may be hard-coded, but the interface should imply traceability.
