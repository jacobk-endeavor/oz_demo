import { joinClasses } from '../../shared/ui'

type MicStatus = 'idle' | 'connecting' | 'live' | 'denied' | 'unavailable'

/**
 * Picks a physical audio input in-page (radio list). Avoids `window.open` and `chrome://`
 * links so the browser does not send you to a separate settings or “options” tab.
 */
export function FieldMicrophoneControl({
  devices,
  selectedDeviceId,
  status,
  error,
  onAllow,
  onPickDevice,
  onDone,
  connectDisabled,
  compact,
  idPrefix,
  showFirstTimeExplainer = true,
}: {
  devices: readonly MediaDeviceInfo[]
  selectedDeviceId: string
  status: MicStatus
  error: string | null
  onAllow: () => void
  onPickDevice: (deviceId: string) => void
  /** Shown when reopening the full card after one-time setup (collapses the large panel). */
  onDone?: () => void
  connectDisabled?: boolean
  compact?: boolean
  idPrefix: string
  showFirstTimeExplainer?: boolean
}) {
  const name = `${idPrefix}-mic`
  return (
    <div
      className={joinClasses('w-full max-w-sm rounded-2xl border border-zinc-200/80 bg-white/80 px-3 py-2 shadow-sm', compact ? 'py-2' : 'py-3')}
      data-testid="field-mic-control"
    >
      {error ? (
        <p className="text-xs leading-snug text-rose-800" role="alert">
          {error}
        </p>
      ) : null}
      <fieldset className="mt-1 space-y-1.5 border-0 p-0">
        <legend className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Microphone</legend>
        {showFirstTimeExplainer ? (
          <p className="text-[11px] leading-snug text-zinc-500">
            Choose an input and allow access here. Permission stays in this tab; we are not opening your browser&rsquo;s
            settings in a new tab.
          </p>
        ) : (
          <p className="text-[11px] leading-snug text-zinc-500">Pick a different input if needed, then allow.</p>
        )}
        {devices.length === 0 && status === 'idle' ? (
          <p className="text-xs text-zinc-500">No inputs listed yet. Tap allow—labels appear after the browser prompt.</p>
        ) : null}
        <div className="max-h-40 space-y-1 overflow-y-auto pr-0.5">
          {devices.map((d) => {
            const label = d.label?.trim() || 'Microphone (unnamed — allow access to see device names)'
            return (
              <label
                key={d.deviceId}
                className="flex cursor-pointer items-start gap-2 rounded-lg px-1 py-1 text-left text-sm text-zinc-800 hover:bg-sky-50/60"
              >
                <input
                  type="radio"
                  className="mt-1 border-zinc-400 text-sky-600"
                  name={name}
                  checked={selectedDeviceId === d.deviceId}
                  onChange={() => onPickDevice(d.deviceId)}
                />
                <span className="min-w-0 flex-1 break-words leading-snug">{label}</span>
              </label>
            )
          })}
        </div>
      </fieldset>
      {status === 'unavailable' ? (
        <p className="mt-2 text-xs text-amber-900/90">MediaDevices API is not available (use a secure page or a modern browser).</p>
      ) : status === 'live' ? null : (
        <button
          type="button"
          onClick={onAllow}
          disabled={connectDisabled || status === 'connecting'}
          className="mt-2 w-full rounded-xl bg-sky-600/90 py-2 text-sm font-medium text-white transition enabled:hover:bg-sky-600 enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="field-mic-allow"
        >
          {status === 'connecting' ? 'Connecting…' : 'Allow microphone'}
        </button>
      )}
      {status === 'live' ? (
        <p className="mt-1.5 text-center text-[11px] text-emerald-800/90">This input is live for Field App. Dictation may still follow the OS default in some browsers — the level meter reflects the input above.</p>
      ) : null}
      {onDone ? (
        <button
          type="button"
          onClick={onDone}
          className="mt-2 w-full rounded-lg border border-zinc-200/90 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          data-testid="field-mic-done"
        >
          Done
        </button>
      ) : null}
    </div>
  )
}
