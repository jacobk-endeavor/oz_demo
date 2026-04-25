import type { ReactNode } from 'react'
import { joinClasses, toneClasses, toneDot, type Tone } from './visualSystem'

interface TagProps {
  tone?: Tone
  dot?: boolean
  className?: string
  children: ReactNode
}

export function Tag({ tone = 'zinc', dot = false, className, children }: TagProps) {
  return (
    <span
      className={joinClasses(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        toneClasses[tone],
        className,
      )}
    >
      {dot && <span className={joinClasses('h-1.5 w-1.5 rounded-full', toneDot[tone])} aria-hidden="true" />}
      {children}
    </span>
  )
}
