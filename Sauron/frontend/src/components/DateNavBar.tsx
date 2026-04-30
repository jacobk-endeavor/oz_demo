import { type ReactNode } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

export default function DateNavBar({
  label,
  onPrev,
  onNext,
  resetLabel,
  onReset,
  children,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  resetLabel: string;
  onReset: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
        <button
          type="button"
          onClick={onPrev}
          className="p-2 text-zinc-500 transition hover:bg-white hover:text-zinc-700"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <div className="h-5 w-px bg-zinc-200" />
        <button
          type="button"
          onClick={onNext}
          className="p-2 text-zinc-500 transition hover:bg-white hover:text-zinc-700"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>
      <span className="text-sm font-medium text-zinc-700">{label}</span>
      <button
        type="button"
        onClick={onReset}
        className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50"
      >
        {resetLabel}
      </button>
      {children}
    </div>
  );
}
