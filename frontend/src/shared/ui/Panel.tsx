import type { ReactNode } from 'react'

interface PanelProps {
  header?: ReactNode
  children: ReactNode
  className?: string
}

export function Panel({ header, children, className = '' }: PanelProps) {
  return (
    <div
      className={[
        'rounded-3xl border border-white/14 bg-[#080A12]/86 text-[#F5F7FF] shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl',
        className,
      ].join(' ')}
    >
      {header !== undefined && (
        <div className="border-b border-white/10 px-6 py-4">{header}</div>
      )}
      <div className="p-6">{children}</div>
    </div>
  )
}
