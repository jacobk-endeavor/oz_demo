import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  BG_AGENT_STORAGE_KEY,
  backgroundAgentDisplayName,
  deleteBackgroundAgent,
  matchBackgroundAgentIntent,
  parseBackgroundAgentRequest,
  saveBackgroundAgents,
  tryCompleteBackgroundRequest,
  type BackgroundAgentRecord,
} from './backgroundAgentModel'

describe('matchBackgroundAgentIntent', () => {
  it('matches common phrases', () => {
    expect(matchBackgroundAgentIntent('create a background agent for weekly email')).toBe(true)
    expect(matchBackgroundAgentIntent('BACKGROUND AGENT to track calls')).toBe(true)
  })

  it('rejects unrelated lines', () => {
    expect(matchBackgroundAgentIntent('show me the lead table')).toBe(false)
  })
})

describe('parseBackgroundAgentRequest', () => {
  it('pulls what and when from a full user sentence (demo headline)', () => {
    const line =
      'create a weekly sales report delivered to me on monday at 9am about which of my salesmen are placing the most calls'
    const { what, when } = parseBackgroundAgentRequest(line)
    expect(when).toMatch(/weekly/i)
    expect(when).toMatch(/9/i)
    expect(what).toMatch(/salesm[ae]n|calls/i)
  })
})

describe('tryCompleteBackgroundRequest', () => {
  it('asks for missing when', () => {
    const r = tryCompleteBackgroundRequest(null, 'create a background agent that emails me a competitor summary')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.needWhen).toBe(true)
  })

  it('completes in two turns', () => {
    const a = tryCompleteBackgroundRequest(
      null,
      'I want a background agent for a call-volume leaderboard',
    )
    expect(a.ok).toBe(false)
    if (a.ok) return
    const b = tryCompleteBackgroundRequest(a.partial, 'every tuesday at 8am')
    expect(b.ok).toBe(true)
    if (!b.ok) return
    expect(b.when).toMatch(/8|tuesday/i)
  })
})

describe('deleteBackgroundAgent', () => {
  let store: Record<string, string>
  let realLs: Storage

  beforeEach(() => {
    store = {}
    realLs = window.localStorage
    const ls = {
      getItem: (k: string) => (Object.hasOwn(store, k) ? store[k]! : null),
      setItem: (k: string, v: string) => {
        store[k] = v
      },
      removeItem: (k: string) => {
        delete store[k]
      },
      clear: () => {
        store = {}
      },
      key: () => null,
      get length() {
        return Object.keys(store).length
      },
    } as Storage
    Object.defineProperty(window, 'localStorage', { value: ls, configurable: true, writable: true })
  })

  afterEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: realLs,
      configurable: true,
      writable: true,
    })
  })

  it('removes the matching id from storage and returns remaining agents', () => {
    const a: BackgroundAgentRecord = {
      id: 'a',
      createdAt: '2026-01-01',
      assignment: 'x',
      schedule: 's',
    }
    const b: BackgroundAgentRecord = {
      id: 'b',
      createdAt: '2026-01-02',
      assignment: 'y',
      schedule: 't',
    }
    saveBackgroundAgents([a, b])
    expect(JSON.parse(store[BG_AGENT_STORAGE_KEY]!).map((e: { id: string }) => e.id)).toEqual(['a', 'b'])
    const next = deleteBackgroundAgent('a')
    expect(next.map((e) => e.id)).toEqual(['b'])
    expect(JSON.parse(store[BG_AGENT_STORAGE_KEY]!).map((e: { id: string }) => e.id)).toEqual(['b'])
  })
})

describe('backgroundAgentDisplayName', () => {
  it('prefers task title when present', () => {
    expect(
      backgroundAgentDisplayName({
        taskTitle: 'Weekly Top Rep by Revenue',
        assignment: 'Longer text',
      }),
    ).toBe('Weekly Top Rep by Revenue')
  })

  it('falls back to the first segment of the assignment', () => {
    expect(
      backgroundAgentDisplayName({
        assignment: 'Email a summary of pipeline health. Use CRM data.',
      }),
    ).toBe('Email a summary of pipeline health')
  })
})
