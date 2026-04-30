import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type Updater,
} from '@tanstack/react-table';
import { ChevronUpIcon, ChevronDownIcon, ChevronUpDownIcon } from '@heroicons/react/20/solid';

interface Column<T> {
  key: keyof T;
  label: string;
  render?: (value: T[keyof T], row: T) => React.ReactNode;
  sortable?: boolean;
  sortDescFirst?: boolean;
  sortValue?: (row: T) => unknown;
}

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

interface Props<T> {
  columns: Column<T>[];
  data: T[];
  linkPrefix?: string;
  linkState?: Record<string, unknown>;
  onRowClick?: (row: T) => void;
  pagination?: PaginationProps;
  sorting?: SortingState;
  initialSorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
}

function renderValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-zinc-400">&mdash;</span>;
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  return String(value);
}

export default function DataTable<T extends { id: number }>({
  columns,
  data,
  linkPrefix,
  linkState,
  onRowClick,
  pagination,
  sorting: controlledSorting,
  initialSorting,
  onSortingChange,
}: Props<T>) {
  const navigate = useNavigate();
  const hasLinks = Boolean(linkPrefix) || Boolean(onRowClick);
  const [uncontrolledSorting, setUncontrolledSorting] = useState<SortingState>(initialSorting ?? []);
  const sorting = controlledSorting ?? uncontrolledSorting;

  function handleSortingChange(updater: Updater<SortingState>) {
    const nextSorting = typeof updater === 'function' ? updater(sorting) : updater;
    if (controlledSorting === undefined) {
      setUncontrolledSorting(nextSorting);
    }
    onSortingChange?.(nextSorting);
  }

  const tanstackColumns: ColumnDef<T, unknown>[] = columns.map((col) => ({
    id: String(col.key),
    accessorFn: (row: T) => col.sortValue?.(row) ?? row[col.key] ?? undefined,
    header: col.label,
    cell: (info) => {
      const rawValue = info.row.original[col.key];
      return (
      col.render
        ? col.render(rawValue, info.row.original)
        : renderValue(rawValue)
      );
    },
    enableSorting: col.sortable !== false,
    sortDescFirst: col.sortDescFirst,
    sortUndefined: 'last',
  }));

  const table = useReactTable({
    data,
    columns: tanstackColumns,
    state: { sorting },
    onSortingChange: handleSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const showFrom =
    pagination && pagination.total > 0
      ? (pagination.page - 1) * pagination.pageSize + 1
      : 0;
  const showTo = pagination
    ? Math.min(pagination.page * pagination.pageSize, pagination.total)
    : 0;

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full min-w-max border-separate border-spacing-0">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      className={[
                        'border-b border-zinc-200 bg-zinc-50/80 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500',
                        canSort ? 'group cursor-pointer select-none hover:bg-zinc-100/80' : '',
                      ].join(' ')}
                    >
                      <span className="inline-flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && (
                          <span className="text-zinc-400">
                            {sorted === 'asc' ? (
                              <ChevronUpIcon className="h-3.5 w-3.5" />
                            ) : sorted === 'desc' ? (
                              <ChevronDownIcon className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronUpDownIcon className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100" />
                            )}
                          </span>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-sm text-zinc-500"
                >
                  No data
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={
                    hasLinks
                      ? () => {
                          if (onRowClick) {
                            onRowClick(row.original);
                          } else {
                            navigate(`${linkPrefix}/${row.original.id}`, linkState ? { state: linkState } : undefined);
                          }
                        }
                      : undefined
                  }
                  className={[
                    'border-none',
                    hasLinks
                      ? 'cursor-pointer transition-colors hover:bg-zinc-50/80'
                      : '',
                  ].join(' ')}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="border-b border-zinc-100 px-4 py-4 text-sm text-zinc-700"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3">
          <span className="text-sm text-zinc-500">
            Showing {showFrom}&ndash;{showTo} of {pagination.total}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              className="rounded border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-zinc-500">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              className="rounded border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
