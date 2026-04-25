import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const defaults = {
  xmlns: 'http://www.w3.org/2000/svg',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2 as number,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
  width: 20,
  height: 20,
}

export function ChatIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <path d="M17 10c0 3.866-3.134 7-7 7a6.96 6.96 0 0 1-3.5-.937L3 17l.937-3.5A6.96 6.96 0 0 1 3 10c0-3.866 3.134-7 7-7s7 3.134 7 7Z" />
    </svg>
  )
}

export function GraphIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <circle cx="5" cy="10" r="2" />
      <circle cx="15" cy="5" r="2" />
      <circle cx="15" cy="15" r="2" />
      <line x1="7" y1="9" x2="13" y2="6" />
      <line x1="7" y1="11" x2="13" y2="14" />
    </svg>
  )
}

export function UploadIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <path d="M17 13v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2" />
      <polyline points="14 7 10 3 6 7" />
      <line x1="10" y1="3" x2="10" y2="13" />
    </svg>
  )
}

export function SearchIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <circle cx="9" cy="9" r="5" />
      <line x1="14" y1="14" x2="18" y2="18" />
    </svg>
  )
}

export function PanelRightIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <rect width="16" height="16" x="2" y="2" rx="2" />
      <line x1="13" y1="2" x2="13" y2="18" />
    </svg>
  )
}
