import { useEffect, useMemo, useState } from 'react'
import { type FieldNotesVisitLogRow, readFieldNotesVisitLog } from '../fieldApp/fieldNotesVisitLog'

/**
 * Tabular rows appended from Field App → Prospect Q&A when the rep taps “Log visit to Field notes”.
 */
export function FieldNotesVisitLogTable() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const on = () => setTick((n) => n + 1)
    window.addEventListener('field-notes-visit-log-changed', on)
    return () => window.removeEventListener('field-notes-visit-log-changed', on)
  }, [])

  const rows = useMemo(() => readFieldNotesVisitLog(), [tick])

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/80 p-4 text-sm text-zinc-600">
        <p className="font-medium text-zinc-800">Visit log (from Field)</p>
        <p className="mt-1">
          No rows yet. On <strong>Field</strong> → <strong>Prospect Q&A + notes</strong>, capture a visit and tap{' '}
          <strong>Log visit to Field notes</strong>. Rows land here for the team.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <p className="border-b border-zinc-200 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        Visit log (Field App — prospect background)
      </p>
      <table className="w-full min-w-[56rem] border-collapse text-left text-sm" role="table">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50/90 text-[11px] font-medium uppercase tracking-wide text-zinc-600">
            <th className="whitespace-nowrap px-3 py-2">When</th>
            <th className="px-3 py-2">Rep</th>
            <th className="px-3 py-2">Customer</th>
            <th className="px-3 py-2">Order / line items</th>
            <th className="px-3 py-2">Ship to</th>
            <th className="px-3 py-2">Competition</th>
            <th className="px-3 py-2">Insights</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-zinc-100 last:border-0 odd:bg-white even:bg-zinc-50/50">
              <td className="whitespace-nowrap px-3 py-2 tabular-nums text-zinc-600">
                {new Date(r.at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
              </td>
              <td className="px-3 py-2 text-zinc-800">{r.userLabel}</td>
              <td className="max-w-[10rem] px-3 py-2 text-zinc-800">{r.customer}</td>
              <td className="max-w-xs px-3 py-2 text-zinc-700">{r.lineItems}</td>
              <td className="max-w-xs px-3 py-2 text-zinc-700">{r.shipTo}</td>
              <td className="max-w-xs px-3 py-2 text-zinc-600">{r.competitors}</td>
              <td className="max-w-xs px-3 py-2 text-zinc-600">{r.insights}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
