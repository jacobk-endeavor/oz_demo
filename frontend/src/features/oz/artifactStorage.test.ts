import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sendMock = vi.fn().mockResolvedValue({})
const getSignedUrlMock = vi.fn().mockResolvedValue('https://signed.example.test/object')

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(function MockS3Client(this: { send: typeof sendMock }) {
    this.send = sendMock
  }),
  PutObjectCommand: class PutObjectCommand {
    constructor(public input: Record<string, unknown>) {}
  },
  GetObjectCommand: class GetObjectCommand {
    constructor(public input: Record<string, unknown>) {}
  },
}))

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrlMock(...args),
}))

import {
  createSpacesArtifactClient,
  formatArtifactDateSegment,
  formatArtifactObjectKey,
  loadSpacesArtifactEnv,
  resolveSignedUrlTtlSeconds,
} from '../../../../backend/oz/artifactStorage'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../../../..')

describe('formatArtifactDateSegment', () => {
  it('formats UTC yyyymmdd', () => {
    const d = new Date(Date.UTC(2026, 4, 1, 12, 0, 0))
    expect(formatArtifactDateSegment(d)).toBe('20260501')
  })
})

describe('formatArtifactObjectKey', () => {
  it('builds tenant/date/art.ext', () => {
    const d = new Date(Date.UTC(2026, 0, 9, 0, 0, 0))
    expect(
      formatArtifactObjectKey({ tenant: 'acme', artId: 'art-1', ext: 'png', date: d }),
    ).toBe('acme/20260109/art-1.png')
  })

  it('strips leading dot from ext and trims tenant slashes', () => {
    expect(formatArtifactObjectKey({ tenant: '/t/', artId: 'x', ext: '.pdf' })).toMatch(/^t\/\d{8}\/x\.pdf$/)
  })
})

describe('loadSpacesArtifactEnv', () => {
  const prev: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of [
      'DO_SPACES_KEY',
      'DO_SPACES_SECRET',
      'DO_SPACES_ENDPOINT',
      'DO_SPACES_BUCKET',
      'DO_SPACES_REGION',
      'OZ_SPACES_SIGNED_URL_TTL_SECONDS',
    ]) {
      prev[k] = process.env[k]
      delete process.env[k]
    }
  })

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('returns null when any required var is missing', () => {
    process.env.DO_SPACES_KEY = 'k'
    process.env.DO_SPACES_SECRET = 's'
    process.env.DO_SPACES_ENDPOINT = 'https://nyc3.digitaloceanspaces.com'
    process.env.DO_SPACES_BUCKET = 'oz-artifacts-dev'
    expect(loadSpacesArtifactEnv()).toBeNull()
  })

  it('returns config when all vars are set', () => {
    process.env.DO_SPACES_KEY = 'keyid'
    process.env.DO_SPACES_SECRET = 'secret'
    process.env.DO_SPACES_ENDPOINT = 'https://nyc3.digitaloceanspaces.com'
    process.env.DO_SPACES_BUCKET = 'oz-artifacts-dev'
    process.env.DO_SPACES_REGION = 'nyc3'
    expect(loadSpacesArtifactEnv()).toEqual({
      accessKeyId: 'keyid',
      secretAccessKey: 'secret',
      endpoint: 'https://nyc3.digitaloceanspaces.com',
      bucket: 'oz-artifacts-dev',
      region: 'nyc3',
    })
  })
})

describe('resolveSignedUrlTtlSeconds', () => {
  const prev = process.env.OZ_SPACES_SIGNED_URL_TTL_SECONDS
  afterEach(() => {
    if (prev === undefined) delete process.env.OZ_SPACES_SIGNED_URL_TTL_SECONDS
    else process.env.OZ_SPACES_SIGNED_URL_TTL_SECONDS = prev
  })

  it('uses env when set to a positive integer', async () => {
    process.env.OZ_SPACES_SIGNED_URL_TTL_SECONDS = '7200'
    await expect(resolveSignedUrlTtlSeconds(REPO_ROOT)).resolves.toBe(7200)
  })

  it('defaults to 3600 when env omits TTL', async () => {
    delete process.env.OZ_SPACES_SIGNED_URL_TTL_SECONDS
    await expect(resolveSignedUrlTtlSeconds(REPO_ROOT)).resolves.toBe(3600)
  })
})

describe('createSpacesArtifactClient', () => {
  beforeEach(() => {
    sendMock.mockClear()
    getSignedUrlMock.mockClear()
  })

  it('putObject sends PutObjectCommand with bucket and key', async () => {
    const client = createSpacesArtifactClient(
      {
        accessKeyId: 'k',
        secretAccessKey: 's',
        endpoint: 'https://nyc3.digitaloceanspaces.com',
        bucket: 'b',
        region: 'nyc3',
      },
      { signedUrlTtlSeconds: 60 },
    )
    const body = Buffer.from('hello')
    await client.putObject({ key: 't/20260101/a.png', body, contentType: 'image/png' })
    expect(sendMock).toHaveBeenCalledTimes(1)
    const call = sendMock.mock.calls[0][0] as { input: Record<string, unknown> }
    expect(call.input.Bucket).toBe('b')
    expect(call.input.Key).toBe('t/20260101/a.png')
    expect(call.input.ContentType).toBe('image/png')
  })

  it('presignGetObject calls getSignedUrl with expiresIn from options', async () => {
    const client = createSpacesArtifactClient(
      {
        accessKeyId: 'k',
        secretAccessKey: 's',
        endpoint: 'https://nyc3.digitaloceanspaces.com',
        bucket: 'b',
        region: 'nyc3',
      },
      { signedUrlTtlSeconds: 120 },
    )
    const url = await client.presignGetObject('key/z')
    expect(url).toBe('https://signed.example.test/object')
    expect(getSignedUrlMock).toHaveBeenCalled()
    const expiresArg = getSignedUrlMock.mock.calls[0][2] as { expiresIn?: number }
    expect(expiresArg.expiresIn).toBe(120)
  })
})
