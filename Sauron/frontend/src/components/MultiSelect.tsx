import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid';

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  label?: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  searchable?: boolean;
  loading?: boolean;
  loadingText?: string;
  className?: string;
  buttonClassName?: string;
  dropdownClassName?: string;
  selectedDisplay?: 'count' | 'labels';
  maxSelectedLabels?: number;
}

export default function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = 'All',
  searchable = false,
  loading = false,
  loadingText = 'Loading...',
  className,
  buttonClassName,
  dropdownClassName,
  selectedDisplay = 'count',
  maxSelectedLabels = 2,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && searchable) {
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open, searchable]);

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;
  const selectedOptions = selected
    .map((value) => options.find((option) => option.value === value))
    .filter((option): option is MultiSelectOption => option != null);
  const selectedSummary = selectedDisplay === 'labels'
    ? (() => {
        if (selectedOptions.length <= maxSelectedLabels) {
          return selectedOptions.map((option) => option.label).join(', ');
        }
        const visible = selectedOptions.slice(0, maxSelectedLabels).map((option) => option.label).join(', ');
        return `${visible} +${selectedOptions.length - maxSelectedLabels}`;
      })()
    : selected.length === 1
      ? (selectedOptions[0]?.label ?? selected[0])
      : `${selected.length} selected`;

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  function clear() {
    onChange([]);
    setOpen(false);
    setQuery('');
  }

  return (
    <div
      ref={containerRef}
      className={['relative w-full min-w-0', className ?? ''].join(' ').trim()}
    >
      {label && <label className="mb-1 block text-xs font-medium text-zinc-500">{label}</label>}

      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={[
          'flex w-full min-w-0 items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm shadow-sm transition-colors hover:border-zinc-300 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400',
          buttonClassName ?? '',
        ].join(' ').trim()}
      >
        {selected.length === 0 ? (
          <span className="text-zinc-400">{placeholder}</span>
        ) : (
          <span className="truncate text-zinc-900" title={selectedSummary}>
            {selectedSummary}
          </span>
        )}
        <ChevronDownIcon
          className={`ml-2 h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className={`absolute z-30 mt-1 rounded-lg border border-zinc-200 bg-white shadow-lg ${dropdownClassName ?? 'w-full'}`}>
          {searchable && (
            <div className="relative border-b border-zinc-100 p-2">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="w-full rounded-md border border-zinc-200 bg-zinc-50 py-1.5 pl-8 pr-3 text-xs text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
            </div>
          )}

          {loading && (
            <p className="px-3 py-2 text-xs text-zinc-500">{loadingText}</p>
          )}

          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-zinc-400">No options found</p>
            ) : (
              filtered.map((option) => {
                const isSelected = selected.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggle(option.value)}
                    className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors hover:bg-zinc-50 ${
                      isSelected ? 'text-zinc-900' : 'text-zinc-600'
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        isSelected
                          ? 'border-zinc-900 bg-zinc-900 text-white'
                          : 'border-zinc-300 bg-white'
                      }`}
                    >
                      {isSelected && (
                        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                          <path
                            d="M2.5 6L5 8.5L9.5 3.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span className="truncate">{option.label}</span>
                  </button>
                );
              })
            )}
          </div>

          {selected.length > 0 && (
            <div className="border-t border-zinc-100 px-3 py-2">
              <button
                type="button"
                onClick={clear}
                className="text-xs text-zinc-500 hover:text-zinc-700"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
