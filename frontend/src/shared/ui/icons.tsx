import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const defaults = {
  xmlns: 'http://www.w3.org/2000/svg',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75 as number,
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

export function PanelLeftIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <rect width="16" height="16" x="2" y="2" rx="2" />
      <line x1="7" y1="2" x2="7" y2="18" />
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

export function ChevronLeftIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <polyline points="12 4 6 10 12 16" />
    </svg>
  )
}

export function ChevronRightIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <polyline points="8 4 14 10 8 16" />
    </svg>
  )
}

export function MicIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <rect x="8" y="3" width="4" height="9" rx="2" />
      <path d="M5 10a5 5 0 0 0 10 0" />
      <line x1="10" y1="15" x2="10" y2="18" />
    </svg>
  )
}

export function NebulaIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <circle cx="10" cy="10" r="6" />
      <path d="M4 10a6 6 0 0 1 6-6" />
      <path d="M16 10a6 6 0 0 1-6 6" />
    </svg>
  )
}

export function NotebookIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <rect x="4" y="3" width="13" height="14" rx="2" />
      <line x1="4" y1="7" x2="2" y2="7" />
      <line x1="4" y1="11" x2="2" y2="11" />
      <line x1="4" y1="15" x2="2" y2="15" />
    </svg>
  )
}

export function CallsIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <path d="M5 3h3l1.5 4-2 1a8 8 0 0 0 4.5 4.5l1-2 4 1.5v3a1 1 0 0 1-1 1A12 12 0 0 1 4 4a1 1 0 0 1 1-1Z" />
    </svg>
  )
}

export function DashboardIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <rect x="3" y="3" width="6" height="8" rx="1" />
      <rect x="11" y="3" width="6" height="4" rx="1" />
      <rect x="11" y="9" width="6" height="8" rx="1" />
      <rect x="3" y="13" width="6" height="4" rx="1" />
    </svg>
  )
}

export function QuoteIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <rect x="4" y="3" width="12" height="14" rx="2" />
      <line x1="7" y1="7" x2="13" y2="7" />
      <line x1="7" y1="10" x2="13" y2="10" />
      <line x1="7" y1="13" x2="11" y2="13" />
    </svg>
  )
}

export function LeadIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <circle cx="10" cy="7" r="3" />
      <path d="M3 17a7 7 0 0 1 14 0" />
    </svg>
  )
}

export function ReportIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <path d="M5 3h7l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <polyline points="12 3 12 7 16 7" />
    </svg>
  )
}

export function SparkleIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <path d="M10 3l1.4 3.6L15 8l-3.6 1.4L10 13l-1.4-3.6L5 8l3.6-1.4L10 3Z" />
      <path d="M16 13l.7 1.5L18 15l-1.3.5L16 17l-.7-1.5L14 15l1.3-.5L16 13Z" />
    </svg>
  )
}

export function CheckIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <polyline points="4 11 8 15 16 5" />
    </svg>
  )
}
