import type { ReactNode } from 'react'

interface PanelProps {
  header?: ReactNode
  children: ReactNode
  className?: string
}

export function Panel({ header, children, className = '' }: PanelProps) {
  return (
    <div className={['rounded-xl bg-white shadow-xl shadow-black/5', className].join(' ')}>
      {header !== undefined && (
        <div className="border-b border-zinc-100 px-6 py-4">{header}</div>
      )}
      <div className="p-6">{children}</div>
    </div>
  )
}
