import { afterEach, describe, expect, it } from 'vitest'
import {
  clearOzPanelPayloadsForThread,
  getOzPanelPayload,
  ozPanelPayloadKey,
  useOzPanelPayloadStore,
} from './useOzChatStream'

afterEach(() => {
  useOzPanelPayloadStore.setState({ entries: {} })
})

describe('ozPanelPayloadKey', () => {
  it('keeps distinct threads isolated for the same message id', () => {
    const a = ozPanelPayloadKey('Jacob', 'msg-1')
    const b = ozPanelPayloadKey('Sami', 'msg-1')
    expect(a).not.toBe(b)
  })
})

describe('useOzPanelPayloadStore', () => {
  it('records display_table / display_panel tool_result shapes by thread and message', () => {
    useOzPanelPayloadStore.getState().recordPanelToolResult('Jacob', 'oz-1', {
      type: 'tool_result',
      name: 'display_table',
      tool_call_id: 'call-1',
      ok: true,
      summary: 'ok',
    })
    expect(getOzPanelPayload('Jacob', 'oz-1')?.tool).toBe('display_table')
    expect(getOzPanelPayload('Sami', 'oz-1')).toBeUndefined()
  })

  it('clears all payloads for a thread only', () => {
    useOzPanelPayloadStore.getState().recordPanelToolResult('Jacob', 'm1', {
      name: 'display_panel',
      ok: true,
    })
    useOzPanelPayloadStore.getState().recordPanelToolResult('Sami', 'm1', {
      name: 'display_panel',
      ok: true,
    })
    clearOzPanelPayloadsForThread('Jacob')
    expect(getOzPanelPayload('Jacob', 'm1')).toBeUndefined()
    expect(getOzPanelPayload('Sami', 'm1')?.tool).toBe('display_panel')
  })
})
