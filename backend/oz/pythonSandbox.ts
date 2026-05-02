/**
 * Python sandbox orchestration: resolve server-side refs into /sandbox/inputs,
 * run an isolated container via SandboxBackend, harvest /sandbox/outputs with
 * inline image caps and optional Spaces upload. See docs/code-sandbox-and-artifact-generation.md §2.1, §12.1.1.
 */
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

// --- Shared types (tool result channel) ------------------------------------

export type SandboxFailureReason =
  | 'timeout'
  | 'oom'
  | 'nonzero_exit'
  | 'sandbox_unavailable'
  | 'egress_denied'
  | 'call_cap_exceeded'
  | 'ref_expired'

export type DataRef = { kind: string; id: string }

export type PythonSandboxError = {
  ok: false
  reason: SandboxFailureReason
  stdout: string
  stderr: string
  exit_code: number | null
  runtime_ms: number
  /** When reason === ref_expired */
  id?: string
  /** Partial artifacts if the run produced files before failing */
  artifacts?: HarvestedArtifact[]
  inline_figures?: InlineFigure[]
  artifacts_not_uploaded?: SkippedArtifact[]
}

export type InlineFigure = {
  filename: string
  mime: 'image/png' | 'image/jpeg'
  base64: string
}

export type HarvestedArtifact = {
  id: string
  kind: string
  signed_url: string
  filename: string
  size_bytes: number
}

export type SkippedArtifact = {
  filename: string
  size_bytes: number
  message: string
}

export type PythonSandboxOk = {
  ok: true
  stdout: string
  stderr: string
  exit_code: number
  runtime_ms: number
  inline_figures: InlineFigure[]
  artifacts: HarvestedArtifact[]
  artifacts_not_uploaded: SkippedArtifact[]
}

export type PythonSandboxResult = PythonSandboxOk | PythonSandboxError

/** 1 MB inline cap per docs §12.2.4 */
export const SANDBOX_INLINE_IMAGE_MAX_BYTES = 1024 * 1024

export const SANDBOX_DEFAULT_TIMEOUT_MS = 30_000

// --- Low-level Docker runner -------------------------------------------------

export type SandboxHostRunSpec = {
  image: string
  hostInputDir: string
  hostOutputDir: string
  hostMainPy: string
  timeoutMs: number
}

export type SandboxBackendOk = {
  ok: true
  stdout: string
  stderr: string
  exitCode: number
  runtimeMs: number
}

export type SandboxBackendErr = {
  ok: false
  reason: 'timeout' | 'oom' | 'sandbox_unavailable'
  stdout: string
  stderr: string
  exitCode: number | null
  runtimeMs: number
}

export type SandboxBackendResult = SandboxBackendOk | SandboxBackendErr

/**
 * Pluggable sandbox execution (Local Docker, remote runner, or test mocks).
 */
export interface SandboxBackend {
  run(spec: SandboxHostRunSpec): Promise<SandboxBackendResult>
}

export type LocalDockerBackendOptions = {
  /**
   * Optional gVisor / custom runtime (e.g. `runsc`). Omit for default Docker runtime.
   * Can be set via env `OZ_SANDBOX_DOCKER_RUNTIME`.
   */
  dockerRuntime?: string
  memory?: string
  cpus?: string
  pidsLimit?: number
}

function dockerCli(): string {
  return process.platform === 'win32' ? 'docker.exe' : 'docker'
}

function classifyOOM(exitCode: number | null, stderr: string): boolean {
  if (exitCode === 137 || exitCode === 247) return true
  return /out of memory|cannot allocate memory|oom/i.test(stderr)
}

/**
 * Spawn `docker run` with hardened defaults: `--network=none`, CPU/RAM/pids caps,
 * read-only inputs, writable outputs. Uses `--read-only` on the container root where supported.
 */
export class LocalDockerBackend implements SandboxBackend {
  private readonly dockerRuntime: string | undefined
  private readonly memory: string
  private readonly cpus: string
  private readonly pidsLimit: number

  constructor(opts: LocalDockerBackendOptions = {}) {
    const envRt = process.env.OZ_SANDBOX_DOCKER_RUNTIME?.trim()
    this.dockerRuntime = opts.dockerRuntime ?? (envRt || undefined)
    this.memory = opts.memory ?? '512m'
    this.cpus = opts.cpus ?? '1.0'
    this.pidsLimit = opts.pidsLimit ?? 128
  }

  async run(spec: SandboxHostRunSpec): Promise<SandboxBackendResult> {
    const started = Date.now()
    const input = path.resolve(spec.hostInputDir)
    const output = path.resolve(spec.hostOutputDir)
    const mainPy = path.resolve(spec.hostMainPy)

    const args = [
      'run',
      '--rm',
      ...(this.dockerRuntime ? ['--runtime', this.dockerRuntime] : []),
      '--network',
      'none',
      '-m',
      this.memory,
      '--cpus',
      this.cpus,
      '--pids-limit',
      String(this.pidsLimit),
      '-v',
      `${input}:/sandbox/inputs:ro`,
      '-v',
      `${output}:/sandbox/outputs:rw`,
      '-v',
      `${mainPy}:/sandbox/main.py:ro`,
      spec.image,
      'python',
      '/sandbox/main.py',
    ]

    return await new Promise<SandboxBackendResult>((resolve) => {
      let stdout = ''
      let stderr = ''
      let finished = false

      const child = spawn(dockerCli(), args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      })

      const timer = setTimeout(() => {
        if (finished) return
        finished = true
        child.kill('SIGKILL')
        resolve({
          ok: false,
          reason: 'timeout',
          stdout,
          stderr,
          exitCode: null,
          runtimeMs: Date.now() - started,
        })
      }, spec.timeoutMs)

      child.stdout?.on('data', (c: Buffer) => {
        stdout += c.toString('utf8')
      })
      child.stderr?.on('data', (c: Buffer) => {
        stderr += c.toString('utf8')
      })

      child.on('error', (err: NodeJS.ErrnoException) => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        resolve({
          ok: false,
          reason: 'sandbox_unavailable',
          stdout,
          stderr: stderr + (err.message ? `\n${err.message}` : ''),
          exitCode: null,
          runtimeMs: Date.now() - started,
        })
      })

      child.on('close', (code, signal) => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        const runtimeMs = Date.now() - started
        if (signal === 'SIGKILL' && runtimeMs >= spec.timeoutMs) {
          resolve({
            ok: false,
            reason: 'timeout',
            stdout,
            stderr,
            exitCode: null,
            runtimeMs,
          })
          return
        }
        if (classifyOOM(code, stderr)) {
          resolve({
            ok: false,
            reason: 'oom',
            stdout,
            stderr,
            exitCode: code,
            runtimeMs,
          })
          return
        }
        const dockerCliBroken =
          (code === 125 || code === 126 || code === 127) &&
          /docker|image|pull|Cannot connect|daemon|permission denied/i.test(stderr)
        if (dockerCliBroken) {
          resolve({
            ok: false,
            reason: 'sandbox_unavailable',
            stdout,
            stderr,
            exitCode: code,
            runtimeMs,
          })
          return
        }
        resolve({
          ok: true,
          stdout,
          stderr,
          exitCode: code ?? (signal ? 1 : 0),
          runtimeMs,
        })
      })
    })
  }
}

// --- Input path mapping (§12.2.1) -------------------------------------------

export function inputFilenameForDataRef(kind: string, id: string): string {
  const safeKind = kind.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200)
  return `${safeKind}__${safeId}.json`
}

export function inputFilenameForUpload(index: string | number, originalName: string): string {
  const base = path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file'
  return `upload_${index}__${base}`
}

export type ResolveDataRefFn = (ref: DataRef) => Promise<{ json: unknown } | null>
export type ResolveUploadFn = (uploadId: string) => Promise<{ filename: string; bytes: Buffer } | null>

export type PutArtifactFn = (input: {
  bytes: Buffer
  filename: string
  kind: string
}) => Promise<{ id: string; signed_url: string; kind: string; size_bytes: number }>

export type RunPythonSandboxParams = {
  code: string
  dataRefs?: DataRef[]
  uploadIds?: string[]
  timeoutMs?: number
  /** When true, short-circuit before Docker (tool surface enforces per-turn cap). */
  callCapExceeded?: boolean
  backend: SandboxBackend
  resolveDataRef: ResolveDataRefFn
  resolveUpload?: ResolveUploadFn
  putArtifact?: PutArtifactFn
  /** Full image ref, e.g. `python:3.12-slim` or `oz-sandbox@sha256:…` */
  image: string
  /** Max bytes read per output file (default 64 MB per §12.2.3) */
  maxOutputFileBytes?: number
}

function extKind(file: string): { kind: string; mime: string | null } {
  const lower = file.toLowerCase()
  if (lower.endsWith('.png')) return { kind: 'png', mime: 'image/png' }
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return { kind: 'jpeg', mime: 'image/jpeg' }
  if (lower.endsWith('.csv')) return { kind: 'csv', mime: null }
  if (lower.endsWith('.xlsx')) return { kind: 'xlsx', mime: null }
  if (lower.endsWith('.pdf')) return { kind: 'pdf', mime: null }
  if (lower.endsWith('.docx')) return { kind: 'docx', mime: null }
  return { kind: 'other', mime: null }
}

async function* walkFiles(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) yield* walkFiles(full)
    else yield full
  }
}

async function harvestOutputs(params: {
  outputDir: string
  putArtifact?: PutArtifactFn
  maxFileBytes: number
}): Promise<{ inline_figures: InlineFigure[]; artifacts: HarvestedArtifact[]; artifacts_not_uploaded: SkippedArtifact[] }> {
  const inline_figures: InlineFigure[] = []
  const artifacts: HarvestedArtifact[] = []
  const artifacts_not_uploaded: SkippedArtifact[] = []

  try {
    await stat(params.outputDir)
  } catch {
    return { inline_figures, artifacts, artifacts_not_uploaded }
  }

  for await (const filePath of walkFiles(params.outputDir)) {
    const st = await stat(filePath)
    if (!st.isFile()) continue
    const rel = path.relative(params.outputDir, filePath)
    const size = st.size
    if (size > params.maxFileBytes) {
      artifacts_not_uploaded.push({
        filename: rel,
        size_bytes: size,
        message: `File exceeds maxOutputFileBytes (${params.maxFileBytes})`,
      })
      continue
    }
    const buf = await readFile(filePath)
    const { kind, mime } = extKind(filePath)
    if (mime && (mime === 'image/png' || mime === 'image/jpeg')) {
      if (size <= SANDBOX_INLINE_IMAGE_MAX_BYTES) {
        inline_figures.push({
          filename: rel,
          mime,
          base64: buf.toString('base64'),
        })
        continue
      }
      if (params.putArtifact) {
        const uploaded = await params.putArtifact({
          bytes: buf,
          filename: rel,
          kind,
        })
        artifacts.push({
          id: uploaded.id,
          kind: uploaded.kind,
          signed_url: uploaded.signed_url,
          filename: rel,
          size_bytes: uploaded.size_bytes,
        })
      } else {
        artifacts_not_uploaded.push({
          filename: rel,
          size_bytes: size,
          message: 'Image exceeds inline cap and artifactStorage is not configured',
        })
      }
      continue
    }
    if (params.putArtifact) {
      const uploaded = await params.putArtifact({
        bytes: buf,
        filename: rel,
        kind,
      })
      artifacts.push({
        id: uploaded.id,
        kind: uploaded.kind,
        signed_url: uploaded.signed_url,
        filename: rel,
        size_bytes: uploaded.size_bytes,
      })
    } else {
      artifacts_not_uploaded.push({
        filename: rel,
        size_bytes: size,
        message: 'artifactStorage not configured for non-inline output',
      })
    }
  }

  return { inline_figures, artifacts, artifacts_not_uploaded }
}

function emptyErr(reason: SandboxFailureReason, runtime_ms: number, id?: string): PythonSandboxError {
  return {
    ok: false,
    reason,
    stdout: '',
    stderr: '',
    exit_code: null,
    runtime_ms,
    ...(id ? { id } : {}),
  }
}

/**
 * Resolve refs, write `/sandbox` host mirrors, run the backend, harvest outputs.
 * This is the integration point for `run_python` on the tool surface.
 */
export async function runPythonSandbox(params: RunPythonSandboxParams): Promise<PythonSandboxResult> {
  if (params.callCapExceeded) {
    return emptyErr('call_cap_exceeded', 0)
  }

  const timeoutMs = params.timeoutMs ?? SANDBOX_DEFAULT_TIMEOUT_MS
  const maxOut = params.maxOutputFileBytes ?? 64 * 1024 * 1024
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'oz-sandbox-'))
  const inputDir = path.join(tmpRoot, 'inputs')
  const outputDir = path.join(tmpRoot, 'outputs')
  const mainPy = path.join(tmpRoot, 'main.py')

  try {
    await mkdir(inputDir, { recursive: true })
    await mkdir(outputDir, { recursive: true })

    const refs = params.dataRefs ?? []
    for (const ref of refs) {
      const resolved = await params.resolveDataRef(ref)
      if (resolved === null) {
        return { ...emptyErr('ref_expired', 0, ref.id), id: ref.id }
      }
      const name = inputFilenameForDataRef(ref.kind, ref.id)
      await writeFile(path.join(inputDir, name), JSON.stringify(resolved.json), 'utf8')
    }

    const uploads = params.uploadIds ?? []
    if (uploads.length > 0 && !params.resolveUpload) {
      return {
        ok: false,
        reason: 'sandbox_unavailable',
        stdout: '',
        stderr: 'resolveUpload is required when uploadIds are provided',
        exit_code: null,
        runtime_ms: 0,
      }
    }
    let uIdx = 0
    for (const uploadId of uploads) {
      uIdx += 1
      const u = await params.resolveUpload!(uploadId)
      if (u === null) {
        return { ...emptyErr('ref_expired', 0, uploadId), id: uploadId }
      }
      const name = inputFilenameForUpload(uIdx, u.filename)
      await writeFile(path.join(inputDir, name), u.bytes)
    }

    await writeFile(mainPy, params.code, 'utf8')

    const run = await params.backend.run({
      image: params.image,
      hostInputDir: inputDir,
      hostOutputDir: outputDir,
      hostMainPy: mainPy,
      timeoutMs,
    })

    if (!run.ok) {
      const reason: SandboxFailureReason =
        run.reason === 'timeout' ? 'timeout' : run.reason === 'oom' ? 'oom' : 'sandbox_unavailable'
      const harvested = await harvestOutputs({
        outputDir,
        putArtifact: params.putArtifact,
        maxFileBytes: maxOut,
      })
      return {
        ok: false,
        reason,
        stdout: run.stdout,
        stderr: run.stderr,
        exit_code: run.exitCode,
        runtime_ms: run.runtimeMs,
        ...(harvested.artifacts.length ? { artifacts: harvested.artifacts } : {}),
        ...(harvested.inline_figures.length ? { inline_figures: harvested.inline_figures } : {}),
        ...(harvested.artifacts_not_uploaded.length ? { artifacts_not_uploaded: harvested.artifacts_not_uploaded } : {}),
      }
    }

    const harvested = await harvestOutputs({
      outputDir,
      putArtifact: params.putArtifact,
      maxFileBytes: maxOut,
    })

    if (run.exitCode !== 0) {
      return {
        ok: false,
        reason: 'nonzero_exit',
        stdout: run.stdout,
        stderr: run.stderr,
        exit_code: run.exitCode,
        runtime_ms: run.runtimeMs,
        artifacts: harvested.artifacts,
        inline_figures: harvested.inline_figures,
        artifacts_not_uploaded: harvested.artifacts_not_uploaded,
      }
    }

    return {
      ok: true,
      stdout: run.stdout,
      stderr: run.stderr,
      exit_code: run.exitCode,
      runtime_ms: run.runtimeMs,
      inline_figures: harvested.inline_figures,
      artifacts: harvested.artifacts,
      artifacts_not_uploaded: harvested.artifacts_not_uploaded,
    }
  } finally {
    await rm(tmpRoot, { recursive: true, force: true })
  }
}

/**
 * Pick sandbox image: explicit env, then digest-based name from config, then dev default.
 */
export function resolveSandboxImage(config?: { imageDigest?: string }): string {
  const envImg = process.env.OZ_SANDBOX_IMAGE?.trim()
  if (envImg) return envImg
  const digest = config?.imageDigest?.trim()
  if (digest) {
    const d = digest.startsWith('sha256:') ? digest : `sha256:${digest}`
    return `oz-sandbox@${d}`
  }
  return 'python:3.12-slim'
}
