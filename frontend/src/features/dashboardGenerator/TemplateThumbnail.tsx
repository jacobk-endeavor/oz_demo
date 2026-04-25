import type { ReactElement } from 'react'
import type { GeneratedWebAppTemplateId } from './types'

interface TemplateThumbnailProps {
  templateId: GeneratedWebAppTemplateId
  className?: string
}

/**
 * Tiny inline-SVG preview for each dashboard template, drawn at the actual
 * card aspect ratio so the user can see the layout shape (chart grid vs
 * terminal vs filter table) without rendering the heavy real preview.
 */
export function TemplateThumbnail({ templateId, className }: TemplateThumbnailProps) {
  return (
    <svg
      viewBox="0 0 160 90"
      className={className}
      role="img"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      {renderers[templateId]?.()}
    </svg>
  )
}

const renderers: Record<GeneratedWebAppTemplateId, () => ReactElement> = {
  sales_demand_command_center: () => (
    <g>
      <rect width="160" height="90" rx="6" fill="#f4f6fb" />
      <rect x="6" y="6" width="50" height="14" rx="2" fill="#dbeafe" />
      <rect x="60" y="6" width="34" height="14" rx="2" fill="#fee2e2" />
      <rect x="98" y="6" width="56" height="14" rx="2" fill="#dcfce7" />
      {/* bar group */}
      <rect x="6" y="30" width="72" height="54" rx="3" fill="#ffffff" stroke="#e4e4e7" />
      <rect x="14" y="68" width="10" height="10" fill="#3b82f6" />
      <rect x="28" y="60" width="10" height="18" fill="#3b82f6" />
      <rect x="42" y="50" width="10" height="28" fill="#3b82f6" />
      <rect x="56" y="42" width="10" height="36" fill="#3b82f6" />
      {/* line + ranked list */}
      <rect x="82" y="30" width="72" height="26" rx="3" fill="#ffffff" stroke="#e4e4e7" />
      <polyline points="86,50 96,46 106,48 116,40 126,44 136,38 148,34" fill="none" stroke="#0ea5e9" strokeWidth="1.5" />
      <rect x="82" y="60" width="72" height="24" rx="3" fill="#ffffff" stroke="#e4e4e7" />
      <rect x="86" y="64" width="40" height="3" fill="#cbd5e1" />
      <rect x="86" y="70" width="56" height="3" fill="#cbd5e1" />
      <rect x="86" y="76" width="32" height="3" fill="#cbd5e1" />
    </g>
  ),
  quote_pipeline_studio: () => (
    <g>
      <rect width="160" height="90" rx="6" fill="#fff7ed" />
      <rect x="6" y="6" width="148" height="16" rx="3" fill="#ffedd5" />
      <rect x="10" y="11" width="60" height="6" fill="#fb923c" />
      {/* table */}
      <rect x="6" y="28" width="148" height="56" rx="3" fill="#ffffff" stroke="#fed7aa" />
      {[34, 44, 54, 64, 74].map((y) => (
        <g key={y}>
          <rect x="10" y={y} width="42" height="4" fill="#fdba74" />
          <rect x="58" y={y} width="60" height="4" fill="#fed7aa" />
          <rect x="124" y={y} width="24" height="4" fill="#ea580c" />
        </g>
      ))}
    </g>
  ),
  lead_route_planner: () => (
    <g>
      <rect width="160" height="90" rx="6" fill="#f0f9ff" />
      <rect x="6" y="6" width="92" height="78" rx="3" fill="#ffffff" stroke="#bae6fd" />
      {/* table rows */}
      {[14, 24, 34, 44, 54, 64, 74].map((y) => (
        <rect key={y} x="10" y={y} width="84" height="4" fill="#bae6fd" />
      ))}
      {/* mini map */}
      <rect x="102" y="6" width="52" height="78" rx="3" fill="#ffffff" stroke="#bae6fd" />
      <circle cx="118" cy="22" r="3" fill="#0284c7" />
      <circle cx="138" cy="38" r="3" fill="#0284c7" />
      <circle cx="120" cy="58" r="3" fill="#0284c7" />
      <circle cx="142" cy="72" r="3" fill="#0284c7" />
      <polyline
        points="118,22 138,38 120,58 142,72"
        fill="none"
        stroke="#0ea5e9"
        strokeDasharray="2 2"
      />
    </g>
  ),
  weekly_revenue_brief: () => (
    <g>
      <rect width="160" height="90" rx="6" fill="#eef2ff" />
      <rect x="6" y="6" width="148" height="14" rx="3" fill="#e0e7ff" />
      <rect x="6" y="24" width="70" height="60" rx="3" fill="#ffffff" stroke="#c7d2fe" />
      {[30, 40, 50, 60, 70].map((y) => (
        <rect key={y} x="10" y={y} width="62" height="3" fill="#c7d2fe" />
      ))}
      <rect x="82" y="24" width="72" height="60" rx="3" fill="#ffffff" stroke="#c7d2fe" />
      {/* mini bar chart */}
      <rect x="88" y="68" width="8" height="12" fill="#6366f1" />
      <rect x="100" y="60" width="8" height="20" fill="#6366f1" />
      <rect x="112" y="50" width="8" height="30" fill="#6366f1" />
      <rect x="124" y="42" width="8" height="38" fill="#6366f1" />
      <rect x="136" y="36" width="8" height="44" fill="#6366f1" />
    </g>
  ),
  investor_command: () => (
    <g>
      <rect width="160" height="90" rx="6" fill="#020714" />
      {/* ticker */}
      <rect x="0" y="6" width="160" height="6" fill="#04132a" />
      <rect x="6" y="7.5" width="20" height="3" fill="#34d399" />
      <rect x="30" y="7.5" width="42" height="3" fill="#0f766e" />
      <rect x="76" y="7.5" width="34" height="3" fill="#0f766e" />
      <rect x="114" y="7.5" width="40" height="3" fill="#0f766e" />
      {/* status sections row */}
      <rect x="6" y="16" width="46" height="8" rx="1.5" fill="#04132a" stroke="#065f46" />
      <rect x="56" y="16" width="46" height="8" rx="1.5" fill="#04132a" stroke="#065f46" />
      <rect x="106" y="16" width="48" height="8" rx="1.5" fill="#04132a" stroke="#065f46" />
      {/* line chart area */}
      <rect x="6" y="28" width="148" height="54" rx="3" fill="#04132a" stroke="#065f46" />
      <polyline
        points="10,72 22,68 36,70 50,60 64,64 78,52 92,56 106,48 120,52 134,42 150,38"
        fill="none"
        stroke="#34d399"
        strokeWidth="1.4"
      />
      <line x1="10" y1="78" x2="150" y2="78" stroke="#065f46" strokeDasharray="2 2" />
    </g>
  ),
  company_finder: () => (
    <g>
      <rect width="160" height="90" rx="6" fill="#f8fafc" />
      {/* filter panel */}
      <rect x="0" y="0" width="36" height="90" fill="#ffffff" stroke="#e2e8f0" />
      {[10, 20, 30, 42, 52, 62, 74].map((y) => (
        <rect key={y} x="4" y={y} width="28" height="4" fill="#dbeafe" />
      ))}
      {/* table */}
      <rect x="36" y="0" width="92" height="90" fill="#ffffff" stroke="#e2e8f0" />
      <rect x="36" y="0" width="92" height="10" fill="#f1f5f9" />
      {[14, 22, 30, 38, 46, 54, 62, 70, 78].map((y) => (
        <g key={y}>
          <rect x="40" y={y} width="14" height="3" fill="#cbd5e1" />
          <rect x="58" y={y} width="36" height="3" fill="#e2e8f0" />
          <rect x="98" y={y} width="26" height="3" fill="#cbd5e1" />
        </g>
      ))}
      {/* assistant rail */}
      <rect x="128" y="0" width="32" height="90" fill="#ffffff" stroke="#e2e8f0" />
      <rect x="132" y="14" width="24" height="8" rx="2" fill="#dbeafe" />
      <rect x="132" y="26" width="24" height="14" rx="2" fill="#f1f5f9" />
      <rect x="132" y="44" width="24" height="14" rx="2" fill="#f1f5f9" />
      <rect x="132" y="78" width="24" height="6" rx="2" fill="#3b82f6" />
    </g>
  ),
}
