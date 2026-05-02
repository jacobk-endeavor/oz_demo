/**
 * Oz-Demo-bwn: minimal sandbox smoke (`print("ok")`) using the same backend path as real runs.
 */
import {
  LocalDockerBackend,
  resolveSandboxImage,
  runPythonSandbox,
  type SandboxBackend,
} from './pythonSandbox'
import { loadOzConfig } from './ozConfig'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')

export async function runOzSandboxStartupSmoke(options?: {
  repoRoot?: string
  backend?: SandboxBackend
}): Promise<{ ok: boolean; runtimeMs: number; image: string }> {
  const root = options?.repoRoot ?? REPO_ROOT
  let image = resolveSandboxImage()
  try {
    const cfg = await loadOzConfig(root)
    const digest = cfg.sandbox?.imageDigest?.trim()
    image = digest ? resolveSandboxImage({ imageDigest: digest }) : resolveSandboxImage()
  } catch {
    image = resolveSandboxImage()
  }

  const backend = options?.backend ?? new LocalDockerBackend()
  const started = Date.now()
  try {
    const result = await runPythonSandbox({
      code: 'print("oz_sandbox_smoke_ok")',
      backend,
      resolveDataRef: async () => null,
      image,
      timeoutMs: 45_000,
    })
    const ok = result.ok === true && String(result.stdout).includes('oz_sandbox_smoke_ok')
    return { ok, runtimeMs: Date.now() - started, image }
  } catch {
    return { ok: false, runtimeMs: Date.now() - started, image }
  }
}
