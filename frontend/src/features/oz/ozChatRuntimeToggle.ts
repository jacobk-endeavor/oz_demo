/**
 * localStorage-backed accessors for the chat-runtime override.
 *
 * The server reads config/oz.yaml's `chat.runtime` as the default; the UI
 * can override it per-turn by writing 'scaffold' or 'agentic' here. An empty
 * value means "follow the server default".
 */
export type OzChatRuntimeOverride = 'scaffold' | 'agentic' | null

const STORAGE_KEY = 'oz.chat.runtime.override'

export function readOzChatRuntimeOverride(): OzChatRuntimeOverride {
  if (typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (v === 'scaffold' || v === 'agentic') return v
    return null
  } catch {
    return null
  }
}

export function writeOzChatRuntimeOverride(next: OzChatRuntimeOverride): void {
  if (typeof window === 'undefined') return
  try {
    if (next === null) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, next)
    window.dispatchEvent(new CustomEvent('oz:chat-runtime-changed', { detail: next }))
  } catch {
    // ignore — toggle is a non-essential demo affordance
  }
}
