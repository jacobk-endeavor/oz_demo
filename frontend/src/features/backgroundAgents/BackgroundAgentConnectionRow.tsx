import { useState } from 'react'
import { connectionLogoSrc } from './backgroundAgentConnections'
import { joinClasses } from '../../shared/ui/visualSystem'

export type ConnectionRowPhase = 'static' | 'connecting' | 'done' | 'pending'

export function BackgroundAgentConnectionRow({
  name,
  domain,
  phase = 'static',
}: {
  name: string
  domain: string
  phase?: ConnectionRowPhase
}) {
  const [failed, setFailed] = useState(false)
  const { src, local } = connectionLogoSrc(domain)
  return (
    <div
      className={joinClasses(
        'flex min-w-0 items-center gap-2.5',
        phase === 'pending' && 'opacity-45',
        phase === 'connecting' && 'rounded-lg bg-violet-100/50 py-0.5 pr-1',
      )}
      title={`${name} (${domain})`}
    >
      <div
        className={joinClasses(
          'flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg',
          'border border-zinc-200/90 bg-white shadow-sm',
          phase === 'connecting' && 'border-violet-300/90 ring-1 ring-violet-200/50',
        )}
      >
        {failed ? (
          <span className="text-[10px] font-bold text-zinc-500" aria-hidden>
            {name.slice(0, 2).toUpperCase()}
          </span>
        ) : (
          <img
            src={src}
            alt=""
            className={local ? 'h-7 w-7 object-contain' : 'h-6 w-6 object-contain'}
            loading="lazy"
            onError={() => setFailed(true)}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-sm font-medium text-zinc-800">{name}</p>
        {phase === 'connecting' ? (
          <p className="m-0 text-[11px] font-medium text-violet-600">Connecting…</p>
        ) : null}
        {phase === 'done' ? (
          <p className="m-0 text-[11px] font-medium text-emerald-700/90">Connected</p>
        ) : null}
        {phase === 'pending' ? (
          <p className="m-0 text-[11px] text-zinc-500">Pending</p>
        ) : null}
      </div>
    </div>
  )
}
