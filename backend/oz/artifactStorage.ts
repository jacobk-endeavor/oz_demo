/**
 * DigitalOcean Spaces (S3-compatible) helpers for chat artifacts: PutObject and presigned GetObject.
 * Credentials and bucket come from env (see `.env.example`). Optional TTL from `config/oz.yaml` + env.
 */
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { loadOzConfig } from './ozConfig'

const DEFAULT_SIGNED_URL_TTL_SECONDS = 3600

export type SpacesArtifactEnv = {
  accessKeyId: string
  secretAccessKey: string
  endpoint: string
  bucket: string
  region: string
}

export type PutArtifactObjectInput = {
  /** Full object key within the bucket (no leading slash). */
  key: string
  body: Buffer | Uint8Array | string
  contentType?: string
  cacheControl?: string
}

export type SpacesArtifactClient = {
  readonly bucket: string
  putObject(input: PutArtifactObjectInput): Promise<void>
  /** True when the object exists in Spaces (HTTP 200-class HEAD). False when missing (404). Throws on other errors. */
  headObjectExists(key: string): Promise<boolean>
  /** Time-limited HTTPS URL for GET; suitable for browser download when bucket CORS allows the app origin. */
  presignGetObject(key: string): Promise<string>
  /** Server-side fetch — reads the object body into a Buffer. Throws on missing object. */
  getObjectBytes(key: string): Promise<Buffer>
}

function isS3NotFound(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } }
  return e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404
}

/** UTC date folder segment `yyyymmdd` per docs/infra/oz-artifacts-spaces.md */
export function formatArtifactDateSegment(date: Date = new Date()): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

/**
 * Object key under the bucket: `<tenant>/<yyyymmdd>/<art_id>.<ext>`
 * (bucket already encodes env, e.g. oz-artifacts-dev).
 */
export function formatArtifactObjectKey(params: {
  tenant: string
  artId: string
  ext: string
  date?: Date
}): string {
  const safeTenant = params.tenant.replace(/^\/+|\/+$/g, '')
  const safeExt = params.ext.replace(/^\./, '')
  const segment = formatArtifactDateSegment(params.date)
  return `${safeTenant}/${segment}/${params.artId}.${safeExt}`
}

function trimEnv(name: string): string | undefined {
  const v = process.env[name]
  if (v == null || v === '') return undefined
  const t = v.trim()
  return t.length ? t : undefined
}

/**
 * Reads DO Spaces settings from the environment. Returns null if any required variable is missing.
 * Maps `DO_SPACES_KEY` → access key id and `DO_SPACES_SECRET` → secret (see `.env.example`).
 */
export function loadSpacesArtifactEnv(): SpacesArtifactEnv | null {
  const accessKeyId = trimEnv('DO_SPACES_KEY')
  const secretAccessKey = trimEnv('DO_SPACES_SECRET')
  const endpoint = trimEnv('DO_SPACES_ENDPOINT')
  const bucket = trimEnv('DO_SPACES_BUCKET')
  const region = trimEnv('DO_SPACES_REGION')
  if (!accessKeyId || !secretAccessKey || !endpoint || !bucket || !region) return null
  return { accessKeyId, secretAccessKey, endpoint, bucket, region }
}

function parseEnvTtlSeconds(): number | undefined {
  const raw = trimEnv('OZ_SPACES_SIGNED_URL_TTL_SECONDS')
  if (!raw) return undefined
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return undefined
  return Math.floor(n)
}

/**
 * Presigned GET lifetime in seconds: env `OZ_SPACES_SIGNED_URL_TTL_SECONDS` if valid, else
 * `artifacts.signedUrlTtlSeconds` from `config/oz.yaml`, else 3600.
 */
export async function resolveSignedUrlTtlSeconds(repoRoot: string): Promise<number> {
  const fromEnv = parseEnvTtlSeconds()
  if (fromEnv != null) return fromEnv
  const cfg = await loadOzConfig(repoRoot)
  const fromYaml = cfg.artifacts?.signedUrlTtlSeconds
  if (fromYaml != null && fromYaml > 0) return fromYaml
  return DEFAULT_SIGNED_URL_TTL_SECONDS
}

function buildS3Client(env: SpacesArtifactEnv): S3Client {
  const options: S3ClientConfig = {
    region: env.region,
    endpoint: env.endpoint,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
    forcePathStyle: false,
  }
  return new S3Client(options)
}

/**
 * S3 client for artifact bucket operations. `signedUrlTtlSeconds` controls presigned GET expiry
 * (defaults to {@link resolveSignedUrlTtlSeconds} when omitted — pass a number to avoid async load).
 */
export function createSpacesArtifactClient(
  env: SpacesArtifactEnv,
  options?: { signedUrlTtlSeconds?: number },
): SpacesArtifactClient {
  const client = buildS3Client(env)
  const ttl =
    options?.signedUrlTtlSeconds ??
    parseEnvTtlSeconds() ??
    DEFAULT_SIGNED_URL_TTL_SECONDS

  return {
    bucket: env.bucket,
    async putObject(input: PutArtifactObjectInput): Promise<void> {
      await client.send(
        new PutObjectCommand({
          Bucket: env.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          CacheControl: input.cacheControl,
        }),
      )
    },
    async headObjectExists(key: string): Promise<boolean> {
      try {
        await client.send(
          new HeadObjectCommand({
            Bucket: env.bucket,
            Key: key,
          }),
        )
        return true
      } catch (err) {
        if (isS3NotFound(err)) return false
        throw err
      }
    },
    async presignGetObject(key: string): Promise<string> {
      const cmd = new GetObjectCommand({
        Bucket: env.bucket,
        Key: key,
      })
      return getSignedUrl(client, cmd, { expiresIn: ttl })
    },
    async getObjectBytes(key: string): Promise<Buffer> {
      const out = await client.send(
        new GetObjectCommand({
          Bucket: env.bucket,
          Key: key,
        }),
      )
      const body = out.Body as
        | { transformToByteArray?: () => Promise<Uint8Array> }
        | undefined
      if (!body || typeof body.transformToByteArray !== 'function') {
        throw new Error('Unsupported S3 GetObject body shape (expected Uint8Array stream).')
      }
      const bytes = await body.transformToByteArray()
      return Buffer.from(bytes)
    },
  }
}

/**
 * Convenience: env loader + client. Returns null if Spaces env is incomplete.
 * If `signedUrlTtlSeconds` is omitted, uses env-only TTL (not async yaml); pass a number from
 * {@link resolveSignedUrlTtlSeconds} when you need yaml.
 */
export function tryCreateSpacesArtifactClientFromEnv(options?: {
  signedUrlTtlSeconds?: number
}): SpacesArtifactClient | null {
  const env = loadSpacesArtifactEnv()
  if (!env) return null
  return createSpacesArtifactClient(env, options)
}
