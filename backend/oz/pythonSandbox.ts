/**
 * Python sandbox runner abstraction: {@link SandboxBackend} with a local Docker +
 * gVisor (`runsc`) implementation and a remote stub for future production routing.
 *
 * Security posture (§5 / §12.2.3): `--network=none` by default, read-only rootfs,
 * tmpfs `/tmp`, bind-mounted inputs (ro) + outputs (rw), cgroup limits aligned with
 * `ozConfig` defaults. Same flags in dev and prod; only the transport differs once
 * {@link RemoteSandboxBackend} is implemented.
 *
 * Orchestration layer ({@link runPythonSandbox}): resolves data_refs/uploads into
 * `/sandbox/inputs`, writes `main.py`, runs via {@link LocalDockerBackend}, harvests outputs.
 */
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

/** Mirrors defaults in docs/code-sandbox-and-artifact-generation.md §12.2.3 / ozConfig. */
export const SANDBOX_DEFAULT_MEMORY = '512m'
export const SANDBOX_DEFAULT_CPUS = 1.0
export const SANDBOX_DEFAULT_PIDS = 128
export const SANDBOX_TMPFS_TMP_SIZE = '64m'
/** Writable sandbox root (inputs/outputs are bind mounts over this tmpfs). */
export const SANDBOX_TMPFS_ROOT_SIZE = '512m'

export type SandboxNetworkMode = 'none' | 'allow'

export type SandboxRunSpec = {
  /** Immutable image reference (`repo:tag` or `repo@sha256:…`). */
  image: string
  /** Host path mounted read-only at `/sandbox/inputs`. */
  inputsDir: string
  /** Host path mounted read-write at `/sandbox/outputs`. */
  outputsDir: string
  /** argv executed inside the container (e.g. `['python', '/sandbox/inputs/main.py']`). */
  argv: string[]
  /** Wall-clock limit in milliseconds. */
  timeoutMs: number
  network?: SandboxNetworkMode
  memory?: string
  cpus?: number
  pidsLimit?: number
}

export type SandboxOutputFile = {
  relativePath: string
  hostPath: string
  sizeBytes: number
}

export type SandboxRunResult = {
  stdout: string
  stderr: string
  exitCode: number | null
  runtimeMs: number
  outputFiles: SandboxOutputFile[]
  killedByTimeout?: boolean
}

export interface SandboxBackend {
  run(spec: SandboxRunSpec): Promise<SandboxRunResult>
}

export class SandboxUnavailableError extends Error {
  readonly code: 'remote_not_implemented' | 'docker_missing'

  constructor(message: string, code: SandboxUnavailableError['code']) {
    super(message)
    this.name = 'SandboxUnavailableError'
    this.code = code
  }
}

/** Strips tag/digest from OCI image ref and pins `sha256:…` from config/oz.yaml. */
export function pinImageByDigest(image: string, digest: string): string {
  const d = digest.trim()
  if (!d.startsWith('sha256:')) {
    throw new Error(`pinImageByDigest: expected sha256 digest, got ${digest.slice(0, 12)}…`)
  }
  const at = image.indexOf('@')
  const base = at === -1 ? image : image.slice(0, at)
  const slash = base.lastIndexOf('/')
  const afterSlash = slash === -1 ? base : base.slice(slash + 1)
  const colon = afterSlash.lastIndexOf(':')
  const looksLikeTag = colon > 0 && !afterSlash.slice(colon + 1).includes('/')
  const repo =
    looksLikeTag && slash >= 0
      ? base.slice(0, slash + 1 + colon)
      : looksLikeTag
        ? base.slice(0, colon)
        : base
  return `${repo}@${d}`
}

/**
 * Default image for `docker run` when `OZ_SANDBOX_IMAGE` is unset (local `docker build -t oz-sandbox:latest`).
 * In CI/prod, set `OZ_SANDBOX_IMAGE=ghcr.io/org/repo/oz-sandbox:latest` and pin digest via {@link pinImageByDigest}.
 */
export function defaultOzSandboxImageFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const v = env.OZ_SANDBOX_IMAGE?.trim()
  return v && v.length > 0 ? v : 'oz-sandbox:latest'
}

export type LocalDockerBackendOptions = {
  /** Docker CLI binary (default `docker`). */
  dockerBin?: string
  /**
   * Container runtime passed to `docker run --runtime=…` (default `runsc` / gVisor).
   * Set to empty string to omit `--runtime` (e.g. Docker Desktop without gVisor).
   */
  containerRuntime?: string
  /** Cap captured stdout/stderr to avoid runaway memory (default 64 MiB each). */
  maxCaptureBytes?: number
}

export type DockerArgvParts = {
  prependedArgs: string[]
  imageAndCommand: string[]
}

/**
 * Builds `docker run … image argv…` for tests and inspection. Does not touch disk or Docker.
 */
export function buildLocalDockerRunParts(spec: SandboxRunSpec, opts: LocalDockerBackendOptions = {}): DockerArgvParts {
  const memory = spec.memory ?? SANDBOX_DEFAULT_MEMORY
  const cpus = spec.cpus ?? SANDBOX_DEFAULT_CPUS
  const pids = spec.pidsLimit ?? SANDBOX_DEFAULT_PIDS
  const network = spec.network ?? 'none'
  const netFlag = network === 'allow' ? 'bridge' : 'none'

  const runtime =
    opts.containerRuntime !== undefined
      ? opts.containerRuntime
      : (process.env.OZ_SANDBOX_DOCKER_RUNTIME ?? 'runsc')

  const prependedArgs: string[] = [
    'run',
    '--rm',
    '--init',
    '--read-only',
    `--network=${netFlag}`,
    '--tmpfs',
    `/tmp:rw,nosuid,nodev,size=${SANDBOX_TMPFS_TMP_SIZE}`,
    '--tmpfs',
    `/sandbox:rw,nosuid,nodev,size=${SANDBOX_TMPFS_ROOT_SIZE}`,
    '-v',
    `${spec.inputsDir}:/sandbox/inputs:ro`,
    '-v',
    `${spec.outputsDir}:/sandbox/outputs:rw`,
    '--memory',
    memory,
    '--cpus',
    String(cpus),
    '--pids-limit',
    String(pids),
  ]

  if (runtime.length > 0) {
    prependedArgs.splice(1, 0, '--runtime', runtime)
  }

  return {
    prependedArgs,
    imageAndCommand: [spec.image, ...spec.argv],
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function collectOutputFiles(outputsRoot: string, dir: string = outputsRoot): Promise<SandboxOutputFile[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const out: SandboxOutputFile[] = []
  for (const ent of entries) {
    const abs = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      out.push(...(await collectOutputFiles(outputsRoot, abs)))
    } else if (ent.isFile()) {
      const st = await stat(abs)
      const rel = path.relative(outputsRoot, abs)
      out.push({ relativePath: rel.split(path.sep).join('/'), hostPath: abs, sizeBytes: st.size })
    }
  }
  return out
}

function truncateCapture(label: 'stdout' | 'stderr', buf: Buffer, maxBytes: number): string {
  if (buf.length <= maxBytes) return buf.toString('utf8')
  const slice = buf.subarray(0, maxBytes)
  return `${slice.toString('utf8')}\n[${label} truncated after ${maxBytes} bytes]\n`
}

/**
 * Runs user code in an ephemeral container via the local Docker CLI.
 * Uses gVisor (`runsc`) when available; override with `OZ_SANDBOX_DOCKER_RUNTIME=` to omit or swap runtime.
 */
export class LocalDockerBackend implements SandboxBackend {
  private readonly dockerBin: string
  private readonly containerRuntime?: string
  private readonly maxCaptureBytes: number

  constructor(opts: LocalDockerBackendOptions = {}) {
    this.dockerBin = opts.dockerBin ?? 'docker'
    this.containerRuntime = opts.containerRuntime
    this.maxCaptureBytes = opts.maxCaptureBytes ?? 64 * 1024 * 1024
  }

  async run(spec: SandboxRunSpec): Promise<SandboxRunResult> {
    const started = Date.now()
    if (!(await pathExists(spec.inputsDir))) {
      throw new Error(`LocalDockerBackend: inputsDir does not exist: ${spec.inputsDir}`)
    }
    await mkdir(spec.outputsDir, { recursive: true })

    const parts = buildLocalDockerRunParts(spec, { containerRuntime: this.containerRuntime })
    const args = [...parts.prependedArgs, ...parts.imageAndCommand]

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let exitCode: number | null = null
    let timedOut = false
    const maxCap = this.maxCaptureBytes

    const pushChunk = (chunks: Buffer[], accumRef: { n: number }, buf: Buffer) => {
      if (accumRef.n >= maxCap) return
      const remain = maxCap - accumRef.n
      const slice = buf.length > remain ? buf.subarray(0, remain) : buf
      chunks.push(slice)
      accumRef.n += slice.length
    }

    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.dockerBin, args, { stdio: 'pipe' })

      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGKILL')
      }, spec.timeoutMs)

      const outAccum = { n: 0 }
      const errAccum = { n: 0 }

      child.stdout?.on('data', (b: Buffer) => pushChunk(stdoutChunks, outAccum, b))
      child.stderr?.on('data', (b: Buffer) => pushChunk(stderrChunks, errAccum, b))

      child.on('error', (err) => {
        clearTimeout(timer)
        const msg = err instanceof Error ? err.message : String(err)
        if (/ENOENT/u.test(msg)) {
          reject(
            new SandboxUnavailableError(
              `Docker CLI not found or not executable (${this.dockerBin}).`,
              'docker_missing',
            ),
          )
          return
        }
        reject(err)
      })

      child.on('close', (code) => {
        clearTimeout(timer)
        exitCode = code
        resolve()
      })
    })

    const runtimeMs = Date.now() - started
    const stdoutBuf = Buffer.concat(stdoutChunks)
    const stderrBuf = Buffer.concat(stderrChunks)
    const stdout = truncateCapture('stdout', stdoutBuf, this.maxCaptureBytes)
    const stderr = truncateCapture('stderr', stderrBuf, this.maxCaptureBytes)

    const outputFiles = await collectOutputFiles(spec.outputsDir)

    return {
      stdout,
      stderr,
      exitCode,
      runtimeMs,
      outputFiles,
      killedByTimeout: timedOut,
    }
  }
}

/**
 * Production-oriented stub: same {@link SandboxBackend} contract; callers should prefer
 * {@link LocalDockerBackend} until mTLS + HTTPS dispatch is implemented.
 */
export class RemoteSandboxBackend implements SandboxBackend {
  constructor(readonly baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  async run(_spec: SandboxRunSpec): Promise<SandboxRunResult> {
    void _spec
    throw new SandboxUnavailableError(
      `RemoteSandboxBackend (${this.baseUrl}) is not implemented yet; use LocalDockerBackend.`,
      'remote_not_implemented',
    )
  }
}

// --- Tool-result channel types (§12.1.1) ------------------------------------

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
  id?: string
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

function classifyOOM(exitCode: number | null, stderr: string): boolean {
  if (exitCode === 137 || exitCode === 247) return true
  return /\bout of memory\b|\bcannot allocate memory\b/i.test(stderr)
}

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
  callCapExceeded?: boolean
  backend: SandboxBackend
  resolveDataRef: ResolveDataRefFn
  resolveUpload?: ResolveUploadFn
  putArtifact?: PutArtifactFn
  image: string
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
 * Resolve refs, write host input dir, run {@link SandboxBackend}, harvest outputs.
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

    await writeFile(path.join(inputDir, 'main.py'), params.code, 'utf8')

    let run: SandboxRunResult
    try {
      run = await params.backend.run({
        image: params.image,
        inputsDir: inputDir,
        outputsDir: outputDir,
        argv: ['python', '/sandbox/inputs/main.py'],
        timeoutMs,
      })
    } catch (err) {
      if (err instanceof SandboxUnavailableError) {
        return {
          ok: false,
          reason: 'sandbox_unavailable',
          stdout: '',
          stderr: err.message,
          exit_code: null,
          runtime_ms: 0,
        }
      }
      throw err
    }

    const harvested = await harvestOutputs({
      outputDir,
      putArtifact: params.putArtifact,
      maxFileBytes: maxOut,
    })

    if (run.killedByTimeout) {
      return {
        ok: false,
        reason: 'timeout',
        stdout: run.stdout,
        stderr: run.stderr,
        exit_code: run.exitCode,
        runtime_ms: run.runtimeMs,
        ...(harvested.artifacts.length ? { artifacts: harvested.artifacts } : {}),
        ...(harvested.inline_figures.length ? { inline_figures: harvested.inline_figures } : {}),
        ...(harvested.artifacts_not_uploaded.length ? { artifacts_not_uploaded: harvested.artifacts_not_uploaded } : {}),
      }
    }

    if (classifyOOM(run.exitCode, run.stderr)) {
      return {
        ok: false,
        reason: 'oom',
        stdout: run.stdout,
        stderr: run.stderr,
        exit_code: run.exitCode,
        runtime_ms: run.runtimeMs,
        ...(harvested.artifacts.length ? { artifacts: harvested.artifacts } : {}),
        ...(harvested.inline_figures.length ? { inline_figures: harvested.inline_figures } : {}),
        ...(harvested.artifacts_not_uploaded.length ? { artifacts_not_uploaded: harvested.artifacts_not_uploaded } : {}),
      }
    }

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
      exit_code: run.exitCode ?? 0,
      runtime_ms: run.runtimeMs,
      inline_figures: harvested.inline_figures,
      artifacts: harvested.artifacts,
      artifacts_not_uploaded: harvested.artifacts_not_uploaded,
    }
  } finally {
    await rm(tmpRoot, { recursive: true, force: true })
  }
}

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
