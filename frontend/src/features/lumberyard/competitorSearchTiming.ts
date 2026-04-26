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

/** Default minimum time the competitor internet-search interstitial is shown. */
export const COMPETITOR_SEARCH_MIN_DISPLAY_MS = 1_600
