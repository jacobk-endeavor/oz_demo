// @vitest-environment node
/**
 * Test tiers (Oz-Demo-vk6):
 * (a) Unit + mocked {@link SandboxBackend} — this file, default CI.
 * (b) Integration — real local Docker; opt-in with OZ_RUN_SANDBOX_INTEGRATION=1 on PRs that touch pythonSandbox or sandboxTemplates.
 * (c) E2E — prod image digest in nightly CI (outside Vitest).
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SANDBOX_INLINE_IMAGE_MAX_BYTES,
  inputFilenameForDataRef,
  inputFilenameForUpload,
  runPythonSandbox,
  resolveSandboxImage,
  type SandboxBackend,
  type SandboxRunResult,
  type SandboxRunSpec,
} from '../../../../backend/oz/pythonSandbox'

describe('pythonSandbox tier (a) unit + mocked backend', () => {
describe('pythonSandbox helpers', () => {
  it('maps data refs to stable input filenames', () => {
    expect(inputFilenameForDataRef('catalog_list_result', 'trc_abc')).toBe(
      'catalog_list_result__trc_abc.json',
    )
  })

  it('maps uploads with index and sanitized basename', () => {
    expect(inputFilenameForUpload(1, '../../etc/passwd')).toBe('upload_1__passwd')
  })

  it('resolveSandboxImage prefers env then digest then dev default', () => {
    const prev = process.env.OZ_SANDBOX_IMAGE
    try {
      delete process.env.OZ_SANDBOX_IMAGE
      expect(resolveSandboxImage()).toBe('python:3.12-slim')
      expect(resolveSandboxImage({ imageDigest: 'deadbeef' })).toBe('oz-sandbox@sha256:deadbeef')
      process.env.OZ_SANDBOX_IMAGE = 'custom:tag'
      expect(resolveSandboxImage()).toBe('custom:tag')
    } finally {
      if (prev === undefined) delete process.env.OZ_SANDBOX_IMAGE
      else process.env.OZ_SANDBOX_IMAGE = prev
    }
  })
})

function mockBackend(
  impl: (spec: SandboxRunSpec) => Promise<Pick<SandboxRunResult, 'stdout' | 'stderr' | 'exitCode' | 'runtimeMs'>>,
): SandboxBackend {
  return {
    run: async (spec) => {
      const r = await impl(spec)
      return {
        stdout: r.stdout,
        stderr: r.stderr,
        exitCode: r.exitCode,
        runtimeMs: r.runtimeMs,
        outputFiles: [],
        killedByTimeout: false,
      }
    },
  }
}

describe('runPythonSandbox', () => {
  it('returns call_cap_exceeded without invoking backend', async () => {
    let ran = false
    const result = await runPythonSandbox({
      code: 'print(1)',
      callCapExceeded: true,
      backend: {
        run: async () => {
          ran = true
          throw new Error('should not run')
        },
      },
      resolveDataRef: async () => null,
      image: 'python:3.12-slim',
    })
    expect(ran).toBe(false)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('call_cap_exceeded')
  })

  it('returns ref_expired when data ref cannot be resolved', async () => {
    const result = await runPythonSandbox({
      code: 'print(1)',
      dataRefs: [{ kind: 'kb_search_result', id: 'missing' }],
      backend: mockBackend(async () => ({ stdout: '', stderr: '', exitCode: 0, runtimeMs: 12 })),
      resolveDataRef: async () => null,
      image: 'python:3.12-slim',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('ref_expired')
      expect(result.id).toBe('missing')
    }
  })

  it('harvests small PNG inline and uploads large PNG when putArtifact is set', async () => {
    const tinyPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )
    const backend = mockBackend(async (spec) => {
      await writeFile(path.join(spec.outputsDir, 'small.png'), tinyPng)
      const bigBody = Buffer.alloc(SANDBOX_INLINE_IMAGE_MAX_BYTES + 1024, 9)
      await writeFile(path.join(spec.outputsDir, 'big.png'), bigBody)
      return { stdout: 'ok', stderr: '', exitCode: 0, runtimeMs: 12 }
    })

    const puts: string[] = []
    const result = await runPythonSandbox({
      code: 'print("hi")',
      backend,
      resolveDataRef: async () => null,
      image: 'python:3.12-slim',
      putArtifact: async ({ filename }) => {
        puts.push(filename)
        return {
          id: `art_${filename}`,
          signed_url: `https://example.test/${filename}`,
          kind: 'png',
          size_bytes: SANDBOX_INLINE_IMAGE_MAX_BYTES + 1024,
        }
      },
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.inline_figures.some((f) => f.filename === 'small.png')).toBe(true)
      expect(result.artifacts.some((a) => a.filename === 'big.png')).toBe(true)
      expect(puts).toContain('big.png')
    }
  })

  it('returns nonzero_exit with harvested outputs', async () => {
    const tinyPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )
    const backend = mockBackend(async (spec) => {
      await writeFile(path.join(spec.outputsDir, 'out.png'), tinyPng)
      return { stdout: '', stderr: 'boom', exitCode: 2, runtimeMs: 12 }
    })

    const result = await runPythonSandbox({
      code: 'import sys; sys.exit(2)',
      backend,
      resolveDataRef: async () => null,
      image: 'python:3.12-slim',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('nonzero_exit')
      expect(result.exit_code).toBe(2)
      expect(result.inline_figures?.some((f) => f.filename === 'out.png')).toBe(true)
    }
  })

  it('maps backend timeout to structured timeout result', async () => {
    const result = await runPythonSandbox({
      code: 'print(1)',
      backend: {
        run: async () => ({
          stdout: '',
          stderr: '',
          exitCode: null,
          runtimeMs: 30_000,
          outputFiles: [],
          killedByTimeout: true,
        }),
      },
      resolveDataRef: async () => null,
      image: 'python:3.12-slim',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('timeout')
  })
})
})

describe.skipIf(process.env.OZ_RUN_SANDBOX_INTEGRATION !== '1')(
  'pythonSandbox tier (b) integration (local Docker)',
  () => {
    it('is opt-in only (set OZ_RUN_SANDBOX_INTEGRATION=1 to run real container tests here)', () => {
      expect(process.env.OZ_RUN_SANDBOX_INTEGRATION).toBe('1')
    })
  },
)
