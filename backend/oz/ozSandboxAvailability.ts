/**
 * Sandbox readiness for `run_python` (startup smoke + tools_unavailable signal).
 * Oz-Demo-bwn: one-off check on backend boot; failures gate the tool surface.
 */

let startupOk = true
let startupRuntimeMs = 0
let startupChecked = false
let startupImageTag = ''

export function setOzSandboxStartupResult(result: {
  ok: boolean
  runtimeMs: number
  image?: string
}): void {
  startupOk = result.ok
  startupRuntimeMs = result.runtimeMs
  startupChecked = true
  startupImageTag = result.image?.trim() ?? ''
}

export function markSandboxStartupSkipped(): void {
  startupChecked = true
}

export function ozSandboxStartupHealth(): {
  ok: boolean
  runtime_ms: number
  checked: boolean
  image?: string
} {
  return {
    ok: startupOk,
    runtime_ms: startupRuntimeMs,
    checked: startupChecked,
    ...(startupImageTag ? { image: startupImageTag } : {}),
  }
}

export function isOzSandboxToolsUnavailable(): boolean {
  return startupChecked && !startupOk
}

/** Emitted in `trace` `details` when `run_python` is gated (startup smoke failed). */
export type OzChatSandboxTraceDetails = {
  tools_unavailable: string[]
  reason: 'runner_unreachable' | 'feature_disabled'
}

/**
 * When non-null, emit an early `trace` (`runtime_summary` / `decision: 'availability'`) so the
 * client can show a banner only for `reason: 'runner_unreachable'`.
 */
export function getOzChatSandboxTraceDetails(): OzChatSandboxTraceDetails | null {
  if (!isOzSandboxToolsUnavailable()) return null
  return {
    tools_unavailable: ['run_python'],
    reason: 'runner_unreachable',
  }
}
