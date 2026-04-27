const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Awaits `work` and keeps the result, but only resolves after at least `minMs`
 * (so a “searching the web” UI can stay visible for a believable moment).
 */
export async function withMinDuration<T>(work: Promise<T>, minMs: number): Promise<T> {
  const t0 = performance.now()
  const out = await work
  const d = performance.now() - t0
  if (d < minMs) await sleep(minMs - d)
  return out
}

/** How long each checklist line stays “active” in CompetitorSearchInterstitial. */
export const COMPETITOR_SEARCH_CHECKLIST_STEP_MS = 3_200

/** Checklist line count in CompetitorSearchInterstitial — full pass before the table replaces it. */
export const COMPETITOR_SEARCH_CHECKLIST_STEPS = 3

/**
 * Time for one full loop of the interstitial’s slowest typing dot (stagger + animation duration).
 * Keep in sync with `.competitor-search-interstitial__typing-dots` in `index.css` (1s + 2.85s).
 */
const COMPETITOR_TYPING_DOTS_WAVE_MS = 1_000 + 2_850

const COMPETITOR_SEARCH_CHECKLIST_FULL_PASS_MS =
  COMPETITOR_SEARCH_CHECKLIST_STEP_MS * COMPETITOR_SEARCH_CHECKLIST_STEPS

/**
 * Min time the competitor search interstitial is shown: long enough to highlight all checklist
 * lines and for the bottom “typing” dots to complete at least one full wave.
 */
export const COMPETITOR_SEARCH_MIN_DISPLAY_MS = Math.max(
  COMPETITOR_SEARCH_CHECKLIST_FULL_PASS_MS,
  COMPETITOR_TYPING_DOTS_WAVE_MS,
)
