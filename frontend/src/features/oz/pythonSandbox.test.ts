import { describe, expect, it, vi } from 'vitest'
import {
  RemoteSandboxBackend,
  SandboxUnavailableError,
  buildLocalDockerRunParts,
  defaultOzSandboxImageFromEnv,
  pinImageByDigest,
} from '../../../../backend/oz/pythonSandbox'

describe('pinImageByDigest', () => {
  it('pins ghcr-style refs', () => {
    expect(pinImageByDigest('ghcr.io/acme/oz-demo/oz-sandbox:latest', 'sha256:abcdef')).toBe(
      'ghcr.io/acme/oz-demo/oz-sandbox@sha256:abcdef',
    )
  })

  it('replaces existing digest', () => {
    expect(
      pinImageByDigest('ghcr.io/acme/oz-sandbox@sha256:olddeadbeef', 'sha256:newbeefdead'),
    ).toBe('ghcr.io/acme/oz-sandbox@sha256:newbeefdead')
  })

  it('strips tag from bare repo name', () => {
    expect(pinImageByDigest('oz-sandbox:latest', 'sha256:x')).toBe('oz-sandbox@sha256:x')
  })

  it('rejects non-sha256 digest prefix', () => {
    expect(() => pinImageByDigest('a:latest', 'sha1:nope')).toThrow(/sha256/)
  })
})

describe('defaultOzSandboxImageFromEnv', () => {
  it('prefers OZ_SANDBOX_IMAGE', () => {
    expect(defaultOzSandboxImageFromEnv({ OZ_SANDBOX_IMAGE: 'my.registry/sbx:dev' })).toBe('my.registry/sbx:dev')
  })

  it('falls back to local tag', () => {
    expect(defaultOzSandboxImageFromEnv({})).toBe('oz-sandbox:latest')
  })
})

describe('buildLocalDockerRunParts', () => {
  const baseSpec = {
    image: 'oz-sandbox:latest',
    inputsDir: '/tmp/in',
    outputsDir: '/tmp/out',
    argv: ['python', '-c', 'print(1)'],
    timeoutMs: 30_000,
  }

  it('uses runsc, none network, read-only, limits, and bind mounts', () => {
    vi.stubEnv('OZ_SANDBOX_DOCKER_RUNTIME', 'runsc')
    const { prependedArgs, imageAndCommand } = buildLocalDockerRunParts(baseSpec, {})
    expect(prependedArgs).toEqual([
      'run',
      '--runtime',
      'runsc',
      '--rm',
      '--init',
      '--read-only',
      '--network=none',
      '--tmpfs',
      '/tmp:rw,nosuid,nodev,size=64m',
      '-v',
      '/tmp/in:/sandbox/inputs:ro',
      '-v',
      '/tmp/out:/sandbox/outputs:rw',
      '--memory',
      '512m',
      '--cpus',
      '1',
      '--pids-limit',
      '128',
    ])
    expect(imageAndCommand).toEqual(['oz-sandbox:latest', 'python', '-c', 'print(1)'])
    vi.unstubAllEnvs()
  })

  it('uses bridge when network allow', () => {
    vi.stubEnv('OZ_SANDBOX_DOCKER_RUNTIME', 'runsc')
    const { prependedArgs } = buildLocalDockerRunParts({ ...baseSpec, network: 'allow' }, {})
    expect(prependedArgs.includes('--network=bridge')).toBe(true)
    vi.unstubAllEnvs()
  })

  it('omits --runtime when containerRuntime is empty string', () => {
    const { prependedArgs } = buildLocalDockerRunParts(baseSpec, { containerRuntime: '' })
    expect(prependedArgs.some((x) => x === '--runtime')).toBe(false)
  })
})

describe('RemoteSandboxBackend', () => {
  it('throws SandboxUnavailableError', async () => {
    const r = new RemoteSandboxBackend('https://sandbox.example')
    await expect(
      r.run({
        image: 'x',
        inputsDir: '/in',
        outputsDir: '/out',
        argv: ['true'],
        timeoutMs: 1,
      }),
    ).rejects.toThrow(SandboxUnavailableError)
  })
})
