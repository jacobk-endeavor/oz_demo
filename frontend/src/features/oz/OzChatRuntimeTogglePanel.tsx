import { useEffect, useState } from 'react'
import { fetchOzChatConfig, type OzChatAgenticProvider, type OzChatRuntimeKind } from './ozChatClient'
import {
  readOzChatRuntimeOverride,
  writeOzChatRuntimeOverride,
  type OzChatRuntimeOverride,
} from './ozChatRuntimeToggle'

type ServerSnapshot = {
  configured: OzChatRuntimeKind
  agentic_available: boolean
  agentic_provider: OzChatAgenticProvider
  providers_available: { openai: boolean; anthropic: boolean }
} | null

const BUTTON_BASE: React.CSSProperties = {
  padding: '4px 10px',
  border: '1px solid #d4d4d8',
  background: '#fff',
  cursor: 'pointer',
  fontSize: 12,
  fontFamily: 'inherit',
  color: '#3f3f46',
  borderRadius: 0,
}

function buttonStyle(active: boolean, disabled: boolean): React.CSSProperties {
  return {
    ...BUTTON_BASE,
    background: active ? '#18181b' : '#fff',
    color: active ? '#fafafa' : disabled ? '#a1a1aa' : '#3f3f46',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  }
}

export function OzChatRuntimeTogglePanel({ style }: { style?: React.CSSProperties }) {
  const [override, setOverride] = useState<OzChatRuntimeOverride>(() => readOzChatRuntimeOverride())
  const [server, setServer] = useState<ServerSnapshot>(null)

  useEffect(() => {
    let cancelled = false
    fetchOzChatConfig().then((cfg) => {
      if (cancelled || !cfg) return
      setServer({
        configured: cfg.chat.runtime,
        agentic_available: cfg.agentic_available,
        agentic_provider: cfg.agentic_provider,
        providers_available: cfg.providers_available,
      })
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function onChange(e: Event) {
      const detail = (e as CustomEvent).detail as OzChatRuntimeOverride
      setOverride(detail ?? null)
    }
    window.addEventListener('oz:chat-runtime-changed', onChange as EventListener)
    return () => window.removeEventListener('oz:chat-runtime-changed', onChange as EventListener)
  }, [])

  function setMode(next: OzChatRuntimeOverride) {
    writeOzChatRuntimeOverride(next)
    setOverride(next)
  }

  const effective: OzChatRuntimeKind = override ?? server?.configured ?? 'scaffold'
  const agenticDisabled = server != null && !server.agentic_available
  const providerLabel = server?.agentic_provider ? ` via ${server.agentic_provider}` : ''
  const tooltip = `Effective: ${effective}${providerLabel}${
    override ? ' (per-tab override)' : server ? ' (config/oz.yaml default)' : ' (loading…)'
  }${
    agenticDisabled
      ? ' — no agentic provider key set; agentic falls back to scaffold'
      : ''
  }`

  return (
    <div
      title={tooltip}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        border: '1px solid #e4e4e7',
        background: '#fafafa',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontSize: 11,
        color: '#52525b',
        ...(style ?? {}),
      }}
    >
      <span style={{ fontWeight: 600, letterSpacing: '0.04em' }}>RUNTIME</span>
      <div style={{ display: 'inline-flex' }}>
        <button
          type="button"
          onClick={() => setMode(null)}
          style={{ ...buttonStyle(override === null, false), borderRight: 'none' }}
        >
          default
        </button>
        <button
          type="button"
          onClick={() => setMode('scaffold')}
          style={{ ...buttonStyle(override === 'scaffold', false), borderRight: 'none' }}
        >
          scaffold
        </button>
        <button
          type="button"
          onClick={() => (agenticDisabled ? null : setMode('agentic'))}
          disabled={agenticDisabled}
          style={buttonStyle(override === 'agentic', agenticDisabled)}
        >
          agentic
        </button>
      </div>
      <span style={{ color: '#71717a' }}>
        →&nbsp;<strong style={{ color: '#18181b' }}>{effective}</strong>
        {effective === 'agentic' && server?.agentic_provider ? (
          <span style={{ color: '#52525b' }}>&nbsp;via {server.agentic_provider}</span>
        ) : null}
        {server ? ` (yaml: ${server.configured})` : ''}
      </span>
    </div>
  )
}
