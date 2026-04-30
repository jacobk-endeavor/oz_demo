import { useState } from 'react';
import { PencilIcon, TrashIcon } from '@heroicons/react/20/solid';
import api from '../api';

interface CalendarRead {
  id: number;
  sales_rep_id: number;
  label: string;
  calendar_url: string;
  created_at: string;
  updated_at: string;
}

export default function CalendarsSection({
  salesRepId,
  calendars,
  onMutate,
}: {
  salesRepId: string;
  calendars: CalendarRead[];
  onMutate: () => void;
}) {
  const [newLabel, setNewLabel] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editUrl, setEditUrl] = useState('');

  const addCalendar = async () => {
    if (!newLabel.trim() || !newUrl.trim()) return;
    setAdding(true);
    await api.post(`/api/sales-reps/${salesRepId}/calendars`, {
      label: newLabel.trim(),
      calendar_url: newUrl.trim(),
    });
    setNewLabel('');
    setNewUrl('');
    setAdding(false);
    onMutate();
  };

  const deleteCalendar = async (calId: number) => {
    await api.delete(`/api/sales-reps/${salesRepId}/calendars/${calId}`);
    onMutate();
  };

  const startEdit = (cal: CalendarRead) => {
    setEditingId(cal.id);
    setEditLabel(cal.label);
    setEditUrl(cal.calendar_url);
  };

  const saveEdit = async (calId: number) => {
    const payload: Record<string, string> = {};
    if (editLabel.trim()) payload.label = editLabel.trim();
    if (editUrl.trim()) payload.calendar_url = editUrl.trim();
    await api.patch(`/api/sales-reps/${salesRepId}/calendars/${calId}`, payload);
    setEditingId(null);
    onMutate();
  };

  return (
    <>
      <h2 className="mb-2 mt-2 text-base font-semibold text-zinc-900">
        Calendars
        {calendars.length > 0 && (
          <span className="ml-2 text-sm font-normal text-zinc-400">({calendars.length})</span>
        )}
      </h2>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b border-zinc-200 bg-zinc-50/80 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Label
                </th>
                <th className="border-b border-zinc-200 bg-zinc-50/80 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Calendar URL
                </th>
                <th className="border-b border-zinc-200 bg-zinc-50/80 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {calendars.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-sm text-zinc-500">
                    No calendars configured
                  </td>
                </tr>
              ) : (
                calendars.map((cal) => (
                  <tr key={cal.id}>
                    <td className="border-b border-zinc-100 px-4 py-3 text-sm text-zinc-700">
                      {editingId === cal.id ? (
                        <input
                          type="text"
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          className="w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                        />
                      ) : (
                        cal.label
                      )}
                    </td>
                    <td className="border-b border-zinc-100 px-4 py-3 text-sm font-mono text-zinc-600 max-w-md truncate">
                      {editingId === cal.id ? (
                        <input
                          type="text"
                          value={editUrl}
                          onChange={(e) => setEditUrl(e.target.value)}
                          className="w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                        />
                      ) : (
                        cal.calendar_url
                      )}
                    </td>
                    <td className="border-b border-zinc-100 px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {editingId === cal.id ? (
                          <>
                            <button
                              onClick={() => saveEdit(cal.id)}
                              className="rounded px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="rounded px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-50"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(cal)}
                              className="rounded p-1 text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600"
                              title="Edit"
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => deleteCalendar(cal.id)}
                              className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500"
                              title="Delete"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-zinc-700">Add Calendar</h3>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-zinc-500">Label</label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Work Calendar"
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
          </div>
          <div className="flex-[2]">
            <label className="mb-1 block text-xs font-medium text-zinc-500">Calendar URL</label>
            <input
              type="text"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://calendar.google.com/..."
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
          </div>
          <button
            onClick={addCalendar}
            disabled={adding || !newLabel.trim() || !newUrl.trim()}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:opacity-50"
          >
            {adding ? 'Adding...' : 'Add'}
          </button>
        </div>
      </div>
    </>
  );
}
