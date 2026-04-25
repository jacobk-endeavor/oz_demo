import { useMemo, useState } from 'react'
import { joinClasses } from '../../../shared/ui'

const tickerHeadlines = [
  { source: 'POLYMARKET', text: 'Will the Fed increase interest rates by 25+ bps after the April 2026 meeting?', value: '0%' },
  { source: 'POLYMARKET', text: 'Will the Fed decrease interest rates by 25 bps after the April 2026 meeting?', value: '0%' },
  { source: 'KALSHI', text: 'Will Elon Musk tweet 50+ times today?', value: '63%' },
  { source: 'GOOGLE NEWS', text: 'Brent oil rises above $100 after Iran seizes container ships, U.S. maintains naval blockade — CNBC' },
  { source: 'GOOGLE NEWS', text: 'WTI Stock Just Got A Fresh Outperform Call — Yahoo Finance' },
]

const resolutions = ['1M', '5M', '15M', '1H', '1D'] as const
type Resolution = (typeof resolutions)[number]

const equitySeries: Record<Resolution, Array<{ time: string; value: number }>> = {
  '1M': [
    { time: '9:00', value: 100000 },
    { time: '9:30', value: 100020 },
    { time: '10:00', value: 100050 },
    { time: '10:30', value: 100040 },
    { time: '11:00', value: 100070 },
    { time: '11:30', value: 100075 },
    { time: '12:00', value: 100100 },
    { time: '12:30', value: 100090 },
    { time: '1:00', value: 100110 },
    { time: '1:30', value: 100130 },
    { time: '2:00', value: 100120 },
    { time: '2:30', value: 100140 },
    { time: '3:00', value: 100170 },
    { time: '3:30', value: 100200 },
    { time: '4:00', value: 100150 },
  ],
  '5M': [
    { time: '9:00', value: 99800 },
    { time: '10:00', value: 100050 },
    { time: '11:00', value: 100075 },
    { time: '12:00', value: 100110 },
    { time: '1:00', value: 100130 },
    { time: '2:00', value: 100100 },
    { time: '3:00', value: 100200 },
    { time: '4:00', value: 100150 },
  ],
  '15M': [
    { time: '9:00', value: 99700 },
    { time: '11:00', value: 100100 },
    { time: '1:00', value: 100150 },
    { time: '3:00', value: 100210 },
  ],
  '1H': [
    { time: 'Mon', value: 99500 },
    { time: 'Tue', value: 99750 },
    { time: 'Wed', value: 100000 },
    { time: 'Thu', value: 100120 },
    { time: 'Fri', value: 100200 },
  ],
  '1D': [
    { time: 'Mar 1', value: 95000 },
    { time: 'Mar 15', value: 96500 },
    { time: 'Apr 1', value: 98200 },
    { time: 'Apr 15', value: 99800 },
    { time: 'Apr 24', value: 100200 },
  ],
}

function formatCurrency(value: number) {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`
  return `$${value.toFixed(0)}`
}

function buildLinePath(
  data: Array<{ time: string; value: number }>,
  width: number,
  height: number,
  padding: { top: number; right: number; bottom: number; left: number },
) {
  const innerWidth = width - padding.left - padding.right
  const innerHeight = height - padding.top - padding.bottom
  const min = Math.min(...data.map((point) => point.value))
  const max = Math.max(...data.map((point) => point.value))
  const range = Math.max(max - min, 1)

  const points = data.map((point, index) => {
    const x = padding.left + (innerWidth * index) / Math.max(data.length - 1, 1)
    const y = padding.top + innerHeight - ((point.value - min) / range) * innerHeight
    return { x, y }
  })

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(' ')

  const fillPath = `${linePath} L${(points.at(-1)?.x ?? padding.left).toFixed(1)},${(padding.top + innerHeight).toFixed(1)} L${padding.left},${(padding.top + innerHeight).toFixed(1)} Z`

  return { points, linePath, fillPath, min, max }
}

const chartLayout = {
  width: 760,
  height: 280,
  padding: { top: 16, right: 16, bottom: 28, left: 56 },
} as const

export function InvestorCommandPreview() {
  const [resolution, setResolution] = useState<Resolution>('15M')
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const data = equitySeries[resolution]
  const { width, height, padding } = chartLayout

  const { points, linePath, fillPath, min, max } = useMemo(
    () => buildLinePath(data, chartLayout.width, chartLayout.height, chartLayout.padding),
    [data],
  )

  const yAxisLabels = useMemo(() => {
    const steps = 4
    return Array.from({ length: steps + 1 }, (_, index) => {
      const value = min + ((max - min) * index) / steps
      return { value, label: formatCurrency(value) }
    })
  }, [min, max])

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-[#020714] font-mono text-emerald-200 shadow-sm">
      {/* News ticker */}
      <div className="flex gap-6 overflow-x-auto border-b border-emerald-500/20 bg-[#040b1c] px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-emerald-300/85">
        {tickerHeadlines.map((headline) => (
          <div key={headline.text} className="flex shrink-0 items-center gap-2">
            <span className="rounded-sm bg-emerald-500/10 px-1.5 py-0.5 font-semibold text-emerald-200">
              {headline.source}
            </span>
            <span className="whitespace-nowrap text-emerald-100/85 normal-case tracking-normal">
              {headline.text}
            </span>
            {headline.value && (
              <span className="font-semibold text-emerald-100">{headline.value}</span>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-b border-emerald-500/15 px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-emerald-200/80">
        <span>institute // ops</span>
        <span className="rounded-sm border border-emerald-500/40 px-2 py-0.5 text-emerald-200">
          sign out
        </span>
      </div>

      <div className="px-4 pt-3 pb-2 text-[11px] uppercase tracking-[0.18em] text-emerald-200">
        <span className="text-emerald-300/80">// investor command</span>
      </div>

      <div className="grid gap-3 px-4 pb-3 text-[11px] tracking-wide text-emerald-200 md:grid-cols-3">
        <Section title="net return vs baseline">
          <div className="text-2xl text-emerald-300">+0.00%</div>
          <p className="mt-1 text-emerald-200/70">
            Window Apr 24, 2026 · 9:00 AM Eastern → now (ET).
          </p>
          <p className="mt-1 text-emerald-200/55">
            ALPACA_PAPER selects paper or live.
          </p>
        </Section>
        <Section title="data link">
          <ul className="space-y-1 text-emerald-100/85">
            <li>• Execution &amp; marks via Alpaca.</li>
            <li>• API credentials never leave the server.</li>
          </ul>
        </Section>
        <Section title="book status">
          <ol className="space-y-1 text-emerald-100/85">
            <li>01 Chart engine — Alpaca portfolio history</li>
            <li>02 Ticker strip — macro Polymarket / Kalshi (sports filtered)</li>
            <li>03 News scan — Google RSS + WSJ + Reddit</li>
          </ol>
        </Section>
      </div>

      <div className="border-t border-emerald-500/15 px-4 py-3">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-emerald-200/80">
          <span>equity · time series</span>
          <span className="text-emerald-200/55">
            usd cash · from Apr 24, 2026 · 9:00 AM Eastern
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-200/75">
          <span className="text-emerald-200/55">resolution</span>
          {resolutions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setResolution(option)
                setHoverIndex(null)
              }}
              className={joinClasses(
                'rounded-sm px-2 py-1 transition-colors',
                option === resolution
                  ? 'bg-emerald-400/20 text-emerald-100'
                  : 'text-emerald-200/55 hover:bg-emerald-400/10 hover:text-emerald-100',
              )}
              aria-pressed={option === resolution}
            >
              {option}
            </button>
          ))}
        </div>

        <div className="relative mt-3 overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-72 w-full"
            role="img"
            aria-label="Equity time series chart"
            onMouseLeave={() => setHoverIndex(null)}
          >
            {/* Grid lines */}
            {yAxisLabels.map((label, index) => {
              const y =
                padding.top +
                ((height - padding.top - padding.bottom) * (yAxisLabels.length - 1 - index)) /
                  (yAxisLabels.length - 1)
              return (
                <g key={`grid-${index}`}>
                  <line
                    x1={padding.left}
                    x2={width - padding.right}
                    y1={y}
                    y2={y}
                    stroke="rgba(16, 185, 129, 0.14)"
                    strokeDasharray="2 4"
                  />
                  <text
                    x={padding.left - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-emerald-200/70 text-[10px]"
                  >
                    {label.label}
                  </text>
                </g>
              )
            })}

            {/* Filled area + line */}
            <path d={fillPath} fill="rgba(16, 185, 129, 0.16)" />
            <path
              d={linePath}
              fill="none"
              stroke="#34d399"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Hover hit area */}
            {points.map((point, index) => (
              <rect
                key={`hover-${index}`}
                x={point.x - 14}
                y={padding.top}
                width={28}
                height={height - padding.top - padding.bottom}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(index)}
              />
            ))}

            {hoverIndex !== null && points[hoverIndex] && (
              <g>
                <line
                  x1={points[hoverIndex].x}
                  x2={points[hoverIndex].x}
                  y1={padding.top}
                  y2={height - padding.bottom}
                  stroke="rgba(52, 211, 153, 0.6)"
                  strokeWidth={1}
                />
                <circle
                  cx={points[hoverIndex].x}
                  cy={points[hoverIndex].y}
                  r={4}
                  fill="#34d399"
                  stroke="#022c22"
                  strokeWidth={1.5}
                />
              </g>
            )}

            {/* X axis labels */}
            {data.map((point, index) => {
              const x =
                padding.left +
                ((width - padding.left - padding.right) * index) / Math.max(data.length - 1, 1)
              return (
                <text
                  key={`x-${index}`}
                  x={x}
                  y={height - 8}
                  textAnchor="middle"
                  className="fill-emerald-200/60 text-[9px]"
                >
                  {point.time}
                </text>
              )
            })}
          </svg>

          {hoverIndex !== null && data[hoverIndex] && (
            <div className="pointer-events-none absolute right-6 top-6 rounded border border-emerald-400/40 bg-[#02160c]/95 px-3 py-2 text-[11px] text-emerald-100">
              <p className="text-emerald-300/80">{data[hoverIndex].time}</p>
              <p className="mt-1 font-semibold">
                Account value · {formatCurrency(data[hoverIndex].value)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-emerald-500/20 bg-[#04132a] p-3">
      <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-300/85">{title}</p>
      <div className="mt-1 normal-case tracking-normal text-emerald-100/90">{children}</div>
    </div>
  )
}
