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

/** Trace payload for first agent iteration (`runtime_summary` / sandbox availability). */
export function getOzChatSandboxTraceDetails(): Record<string, unknown> | undefined {
  if (!startupChecked) return undefined
  return {
    sandbox_startup_ok: startupOk,
    sandbox_startup_runtime_ms: startupRuntimeMs,
    ...(startupImageTag ? { sandbox_image: startupImageTag } : {}),
    ...(isOzSandboxToolsUnavailable() ? { tools_unavailable: ['run_python'] as const } : {}),
  }
}
