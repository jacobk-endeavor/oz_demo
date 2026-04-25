import { useRef, useCallback, useState, type KeyboardEvent, type FormEvent } from 'react'

interface ComposerProps {
  onSend: (text: string) => void
  disabled: boolean
  /** Previously-sent user questions in the active session, oldest → newest.
      The composer lets the user step through them with the prev/next
      buttons or ArrowUp / ArrowDown on an empty textarea (shell-style). */
  history: string[]
}

export function Composer({ onSend, disabled, history }: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // null = at the "live" tail (nothing pre-filled); number = index into history.
  const [cursor, setCursor] = useState<number | null>(null)

  const resetHeight = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    const maxHeight = 6 * 24 // ~6 lines
    ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`
  }, [])

  const setValue = useCallback(
    (v: string) => {
      const ta = textareaRef.current
      if (!ta) return
      ta.value = v
      resetHeight()
    },
    [resetHeight],
  )

  const handleSubmit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault()
      const ta = textareaRef.current
      if (!ta) return
      const text = ta.value.trim()
      if (!text || disabled) return
      onSend(text)
      ta.value = ''
      ta.style.height = 'auto'
      setCursor(null)
    },
    [onSend, disabled],
  )

  /** Step backwards through prior questions (older). */
  const prev = useCallback(() => {
    if (history.length === 0) return
    const next =
      cursor === null ? history.length - 1 : Math.max(0, cursor - 1)
    setCursor(next)
    setValue(history[next] ?? '')
  }, [cursor, history, setValue])

  /** Step forward (newer) or clear back to live. */
  const next = useCallback(() => {
    if (history.length === 0 || cursor === null) return
    const idx = cursor + 1
    if (idx >= history.length) {
      setCursor(null)
      setValue('')
    } else {
      setCursor(idx)
      setValue(history[idx] ?? '')
    }
  }, [cursor, history, setValue])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      const ta = textareaRef.current
      const empty = !ta || ta.value.trim() === ''
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
        return
      }
      // Shell-style: up/down cycles through prior questions ONLY when
      // textarea is empty (or already in cycle mode), so typing a new
      // message isn't disrupted.
      if (e.key === 'ArrowUp' && (empty || cursor !== null)) {
        e.preventDefault()
        prev()
        return
      }
      if (e.key === 'ArrowDown' && cursor !== null) {
        e.preventDefault()
        next()
      }
    },
    [handleSubmit, prev, next, cursor],
  )

  const canPrev = history.length > 0 && (cursor === null || cursor > 0)
  const canNext = cursor !== null

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 border-t border-zinc-200 px-4 py-3"
    >
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={prev}
          disabled={!canPrev || disabled}
          title="Previous question (↑)"
          aria-label="Previous question"
          className="flex h-5 w-8 items-center justify-center rounded border border-zinc-200 bg-white text-xs text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-30"
        >
          ▲
        </button>
        <button
          type="button"
          onClick={next}
          disabled={!canNext || disabled}
          title="Next question (↓)"
          aria-label="Next question"
          className="flex h-5 w-8 items-center justify-center rounded border border-zinc-200 bg-white text-xs text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-30"
        >
          ▼
        </button>
      </div>
      <textarea
        ref={textareaRef}
        placeholder="Ask about your knowledge base…"
        disabled={disabled}
        rows={1}
        onInput={() => {
          resetHeight()
          // Typing resets the cycle cursor to "live".
          if (cursor !== null) setCursor(null)
        }}
        onKeyDown={handleKeyDown}
        className={[
          'flex-1 resize-none rounded-xl border border-zinc-300 px-4 py-2.5',
          'text-[15px] text-zinc-900 placeholder:text-zinc-400',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        ].join(' ')}
        data-testid="composer-input"
      />
      <button
        type="submit"
        disabled={disabled}
        className={[
          'rounded-xl bg-blue-500 text-white px-4 py-2.5 text-sm font-medium',
          'hover:bg-blue-600 transition-colors',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'flex items-center gap-2',
        ].join(' ')}
        data-testid="send-button"
      >
        {disabled && (
          <svg
            className="h-4 w-4 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        Send
      </button>
    </form>
  )
}
