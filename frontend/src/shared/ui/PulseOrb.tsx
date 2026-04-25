import { joinClasses } from './visualSystem'

export type PulseOrbSize = 'sm' | 'md' | 'lg'

interface PulseOrbProps {
  size?: PulseOrbSize
  paused?: boolean
  label?: string
  className?: string
}

const sizeClasses: Record<PulseOrbSize, { wrap: string; core: string }> = {
  sm: { wrap: 'h-10 w-10', core: 'h-6 w-6' },
  md: { wrap: 'h-20 w-20', core: 'h-12 w-12' },
  lg: { wrap: 'h-32 w-32', core: 'h-20 w-20' },
}

export function PulseOrb({
  size = 'md',
  paused = false,
  label,
  className,
}: PulseOrbProps) {
  const dims = sizeClasses[size]
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      className={joinClasses(
        'pulse-orb',
        paused && 'pulse-orb--paused',
        dims.wrap,
        className,
      )}
      data-testid="pulse-orb"
    >
      <span className="pulse-orb__ring" aria-hidden="true" />
      <span
        className={joinClasses('pulse-orb__core rounded-full', dims.core)}
        aria-hidden="true"
      />
    </span>
  )
}
