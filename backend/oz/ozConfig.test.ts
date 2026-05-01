import { describe, expect, it } from 'vitest'
import { parseOzConfigYaml } from './ozConfig'

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
})
