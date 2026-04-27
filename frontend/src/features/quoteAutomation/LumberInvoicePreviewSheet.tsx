import { joinClasses } from '../../shared/ui'

/** Read-only demo invoice aligned with Summit Ridge / Marshall Court lumber package (JCR sell ~$285k). */
export function LumberInvoicePreviewSheet({ className }: { className?: string }) {
  const rows = [
    {
      desc: 'SPF dimensional & stud packs — walls / plates',
      qty: '1 lot',
      unit: '—',
      amount: 95_000,
    },
    {
      desc: 'Engineered floor system (LVL / I-joist)',
      qty: '1 lot',
      unit: '—',
      amount: 98_000,
    },
    {
      desc: '7/16 OSB sheathing, anchors & hardware bundle',
      qty: '1 lot',
      unit: '—',
      amount: 72_000,
    },
    {
      desc: 'Flatbed delivery coordination (3 drops, Marshall Court)',
      qty: '3',
      unit: 'drops',
      amount: 20_000,
    },
  ] as const
  const total = rows.reduce((s, r) => s + r.amount, 0)

  return (
    <section
      className={joinClasses(
        'overflow-hidden rounded-2xl border border-zinc-300/90 bg-white shadow-sm',
        className,
      )}
      data-testid="lumber-invoice-preview"
    >
      <header className="border-b border-zinc-200 bg-gradient-to-r from-amber-50/90 to-white px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-900/90">Invoice preview (demo)</p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-900">INV-Q25-4420-LUM · Summit Ridge Framing</h3>
          <p className="text-xs text-zinc-600">Ref Q26-0601-LB · April 26, 2026</p>
        </div>
        <p className="mt-1 text-xs text-zinc-600">
          Bill-to: Summit Ridge Framing · Ship: Marshall Court jobsite (staged flatbed)
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50/90 text-[11px] uppercase tracking-[0.12em] text-zinc-500">
            <tr>
              <th className="px-4 py-2 font-semibold">Description</th>
              <th className="px-3 py-2 font-semibold">Qty</th>
              <th className="px-3 py-2 font-semibold">Unit</th>
              <th className="px-4 py-2 text-right font-semibold">Amount (USD)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((r) => (
              <tr key={r.desc}>
                <td className="px-4 py-2.5 text-zinc-800">{r.desc}</td>
                <td className="px-3 py-2.5 text-zinc-600">{r.qty}</td>
                <td className="px-3 py-2.5 text-zinc-600">{r.unit}</td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums text-zinc-900">
                  {r.amount.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-1 border-t border-zinc-200 bg-zinc-50/50 px-4 py-3 text-sm">
        <div className="flex justify-between text-base font-semibold text-zinc-900">
          <span>Total due (matches Job Cost Recap sell)</span>
          <span className="tabular-nums">
            {total.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
          </span>
        </div>
        <p className="text-[11px] text-zinc-500">
          Terms: 50% on lumber PO acceptance · balance Net-30 after final delivery. Not a legal invoice — demo only.
        </p>
      </div>
    </section>
  )
}
