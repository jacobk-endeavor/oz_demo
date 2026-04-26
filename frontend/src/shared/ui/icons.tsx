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

export function HomeIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <path d="M3.5 9.2 10 3l6.5 6.2V16a1.2 1.2 0 0 1-1.2 1.2h-3.2v-4.2a.8.8 0 0 0-.8-.8H8.7a.8.8 0 0 0-.8.8v4.2H4.7A1.2 1.2 0 0 1 3.5 16V9.2Z" />
    </svg>
  )
}

export function SearchIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <circle cx="8.2" cy="8.2" r="4.2" />
      <line x1="11.2" y1="11.2" x2="16.2" y2="16.2" />
    </svg>
  )
}

export function TableIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <rect x="3" y="3" width="14" height="14" rx="1.2" />
      <line x1="3" y1="8.2" x2="17" y2="8.2" />
      <line x1="3" y1="12.2" x2="17" y2="12.2" />
      <line x1="8.2" y1="8.2" x2="8.2" y2="17" />
      <line x1="12.2" y1="8.2" x2="12.2" y2="17" />
    </svg>
  )
}

export function FileStackIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <path d="M6 3.5h6l2.5 2.5V16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M4.2 4.2h-1.2a1.2 1.2 0 0 0-1.2 1.2v8.1a1.2 1.2 0 0 0 1.1 1.2" />
    </svg>
  )
}

/** Handheld / on-site (Field App) — stroke rounded rect + home indicator. */
export function FieldAppIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <rect x="4.2" y="2.2" width="11.5" height="15.5" rx="1.6" />
      <line x1="7.2" y1="15" x2="12.5" y2="15" />
    </svg>
  )
}

export function LogLinesIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <line x1="3.5" y1="4.2" x2="16" y2="4.2" />
      <line x1="3.5" y1="8" x2="16" y2="8" />
      <line x1="3.5" y1="12" x2="12" y2="12" />
      <line x1="3.5" y1="16" x2="14" y2="16" />
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

/** Stacked / open book — Knowledge Base in the app shell. */
export function KnowledgeBaseIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10v12H5.5A1.5 1.5 0 0 1 4 14.5v-9Z" />
      <path d="M10 4h4.5A1.5 1.5 0 0 1 16 5.5v9A1.5 1.5 0 0 1 14.5 16H10V4Z" />
      <line x1="10" y1="3.5" x2="10" y2="16.5" />
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

export function ShareIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <circle cx="6" cy="10" r="2" />
      <circle cx="15" cy="5" r="2" />
      <circle cx="15" cy="15" r="2" />
      <line x1="7.7" y1="9" x2="13.3" y2="6" />
      <line x1="7.7" y1="11" x2="13.3" y2="14" />
    </svg>
  )
}

export function TrashIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <path d="M6.5 6.5V15a1.5 1.5 0 0 0 1.5 1.5h4a1.5 1.5 0 0 0 1.5-1.5V6.5" />
      <path d="M4 6.5h12" />
      <path d="M8 6.5V5a1.5 1.5 0 0 1 1.5-1.5h1A1.5 1.5 0 0 1 12 5v1.5" />
      <line x1="8.2" y1="9.5" x2="8.2" y2="13" />
      <line x1="11.8" y1="9.5" x2="11.8" y2="13" />
    </svg>
  )
}

export function CopyIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <rect x="6" y="6" width="11" height="11" rx="2" />
      <path d="M3 13V5a2 2 0 0 1 2-2h8" />
    </svg>
  )
}

export function SpinnerIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <path d="M10 3a7 7 0 1 0 7 7" />
    </svg>
  )
}

export function ArrowUpIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <line x1="10" y1="16" x2="10" y2="4" />
      <polyline points="5 9 10 4 15 9" />
    </svg>
  )
}

export function AtSignIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <circle cx="10" cy="10" r="3.2" />
      <path d="M13.2 10v1.6a2 2 0 0 0 4 0V10a7.2 7.2 0 1 0-3 5.8" />
    </svg>
  )
}

export function PlusIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <line x1="10" y1="4" x2="10" y2="16" />
      <line x1="4" y1="10" x2="16" y2="10" />
    </svg>
  )
}

export function MoreHorizontalIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <circle cx="5" cy="10" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="10" cy="10" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function ChevronDownIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <polyline points="5 8 10 13 15 8" />
    </svg>
  )
}

export function ClockIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <circle cx="10" cy="10" r="7" />
      <polyline points="10 6 10 10.5 13 12" />
    </svg>
  )
}

export function InfinityIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <path d="M5.6 13.6a3.6 3.6 0 1 1 0-7.2c1 0 1.95.4 2.65 1.05L14 13.6a3.6 3.6 0 0 0 5.6-3.6 3.6 3.6 0 0 0-5.6-3.6L8.25 12.55A3.6 3.6 0 0 1 5.6 13.6Z" />
    </svg>
  )
}

export function PencilIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <path d="M3 17l1-4 9.5-9.5a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2L7 16l-4 1Z" />
      <line x1="11" y1="6" x2="14" y2="9" />
    </svg>
  )
}

export function ChatBubbleIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <path d="M17 10c0 3.3-3.1 6-7 6a8 8 0 0 1-2.3-.3L4 17l1-3.2A5.8 5.8 0 0 1 3 10c0-3.3 3.1-6 7-6s7 2.7 7 6Z" />
    </svg>
  )
}

export function PlayIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <path d="M6.5 4.2 16 10 6.5 15.8V4.2Z" />
    </svg>
  )
}

export function PauseIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <rect x="5.2" y="4.2" width="3.1" height="11.5" rx="0.4" />
      <rect x="11.5" y="4.2" width="3.1" height="11.5" rx="0.4" />
    </svg>
  )
}

export function CloseIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <line x1="5" y1="5" x2="15" y2="15" />
      <line x1="15" y1="5" x2="5" y2="15" />
    </svg>
  )
}

/** “Open in new window / tab” (small page + north-east jump). */
export function OpenInNewTabIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <path d="M3.2 7.2v8.1a.9.9 0 0 0 .9.9H14a.9.9 0 0 0 .9-.9V12" />
      <path d="M10.2 2.2H16a.9.9 0 0 1 .9.9V8" />
      <line x1="5.2" y1="13.2" x2="16.2" y2="2.2" />
    </svg>
  )
}

export function ArrowPathIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <path d="M3.5 10.5A6.2 6.2 0 0 1 9.2 4.1l.1-.1" />
      <path d="M3.2 3.2v3.2h3.2" />
      <path d="M16.5 9.5A6.2 6.2 0 0 1 10.7 16l-.1.1" />
      <path d="M16.8 16.8v-3.2h-3.2" />
    </svg>
  )
}

export function PaperclipIcon({ className, ...props }: IconProps) {
  return (
    <svg {...defaults} viewBox="0 0 20 20" className={className} {...props}>
      <path d="M14.5 8.5 8.7 14.3a2.5 2.5 0 1 1-3.5-3.5l6.6-6.6a4 4 0 0 1 5.7 5.7l-7.7 7.7a5.5 5.5 0 0 1-7.8-7.8l6.4-6.4" />
    </svg>
  )
}
