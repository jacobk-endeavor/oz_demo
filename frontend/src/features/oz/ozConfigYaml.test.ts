import { describe, expect, it } from 'vitest'
import { parseOzConfigYaml } from '../../../../backend/oz/ozConfig'

describe('parseOzConfigYaml', () => {
  it('returns scaffold default when input is empty', () => {
    const cfg = parseOzConfigYaml('')
    expect(cfg.chat.runtime).toBe('scaffold')
  })

  it('parses chat.runtime: agentic and agentic.model', () => {
    const cfg = parseOzConfigYaml(
      [
        '# top comment',
        'chat:',
        '  runtime: agentic',
        '  agentic:',
        '    model: claude-opus-4-7',
        '',
      ].join('\n'),
    )
    expect(cfg.chat.runtime).toBe('agentic')
    expect(cfg.chat.agentic?.model).toBe('claude-opus-4-7')
    expect(cfg.chat.agentic?.provider).toBe('auto')
  })

  it('parses chat.agentic.provider', () => {
    const cfg = parseOzConfigYaml('chat:\n  runtime: agentic\n  agentic:\n    provider: openai\n')
    expect(cfg.chat.agentic?.provider).toBe('openai')
  })

  it('falls back to auto for unknown provider values', () => {
    const cfg = parseOzConfigYaml('chat:\n  agentic:\n    provider: groq\n')
    expect(cfg.chat.agentic?.provider).toBe('auto')
  })

  it('falls back to scaffold for unknown runtime values', () => {
    const cfg = parseOzConfigYaml('chat:\n  runtime: bogus\n')
    expect(cfg.chat.runtime).toBe('scaffold')
  })

  it('strips inline comments and quotes', () => {
    const cfg = parseOzConfigYaml('chat:\n  runtime: agentic   # trailing\n  agentic:\n    model: "claude-sonnet-4-6"\n')
    expect(cfg.chat.runtime).toBe('agentic')
    expect(cfg.chat.agentic?.model).toBe('claude-sonnet-4-6')
  })

  it('parses sandbox.imageDigest', () => {
    const cfg = parseOzConfigYaml(
      ['sandbox:', '  imageDigest: "sha256:abcd"', 'chat:', '  runtime: scaffold', ''].join('\n'),
    )
    expect(cfg.sandbox?.imageDigest).toBe('sha256:abcd')
  })

  it('omits sandbox when imageDigest empty', () => {
    const cfg = parseOzConfigYaml('sandbox:\n  imageDigest: ""\n')
    expect(cfg.sandbox).toBeUndefined()
  })

  it('parses artifacts.signedUrlTtlSeconds', () => {
    const cfg = parseOzConfigYaml('artifacts:\n  signedUrlTtlSeconds: 1800\n')
    expect(cfg.artifacts?.signedUrlTtlSeconds).toBe(1800)
  })

  it('omits artifacts when TTL invalid or missing', () => {
    expect(parseOzConfigYaml('artifacts:\n  signedUrlTtlSeconds: 0\n').artifacts).toBeUndefined()
    expect(parseOzConfigYaml('artifacts:\n  signedUrlTtlSeconds: -1\n').artifacts).toBeUndefined()
  })
})
