/**
 * Python sandbox runner abstraction: {@link SandboxBackend} with a local Docker +
 * gVisor (`runsc`) implementation and a remote stub for future production routing.
 *
 * Security posture (§5 / §12.2.3): `--network=none` by default, read-only rootfs,
 * tmpfs `/tmp`, bind-mounted inputs (ro) + outputs (rw), cgroup limits aligned with
 * `ozConfig` defaults. Same flags in dev and prod; only the transport differs once
 * {@link RemoteSandboxBackend} is implemented.
 */
import { spawn } from 'node:child_process'
import { mkdir, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

/** Mirrors defaults in docs/code-sandbox-and-artifact-generation.md §12.2.3 / ozConfig. */
export const SANDBOX_DEFAULT_MEMORY = '512m'
export const SANDBOX_DEFAULT_CPUS = 1.0
export const SANDBOX_DEFAULT_PIDS = 128
export const SANDBOX_TMPFS_TMP_SIZE = '64m'

export type SandboxNetworkMode = 'none' | 'allow'

export type SandboxRunSpec = {
  /** Immutable image reference (`repo:tag` or `repo@sha256:…`). */
  image: string
  /** Host path mounted read-only at `/sandbox/inputs`. */
  inputsDir: string
  /** Host path mounted read-write at `/sandbox/outputs`. */
  outputsDir: string
  /** argv executed inside the container (e.g. `['python', '/sandbox/main.py']`). */
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
  const repo = looksLikeTag && slash >= 0 ? base.slice(0, slash + 1 + colon) : looksLikeTag ? base.slice(0, colon) : base
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
