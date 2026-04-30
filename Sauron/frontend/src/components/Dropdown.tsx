import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

export default function Dropdown({
  trigger,
  children,
  align = 'left',
  className = 'w-44',
  openOnHover = false,
}: {
  trigger: (props: { toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  className?: string;
  openOnHover?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | null>(null);

  const clearHoverTimer = useCallback(() => {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  useEffect(() => () => clearHoverTimer(), [clearHoverTimer]);

  const hoverProps = openOnHover
    ? {
        onMouseEnter: () => { clearHoverTimer(); setOpen(true); },
        onMouseLeave: () => { hoverTimer.current = window.setTimeout(() => setOpen(false), 200); },
      }
    : {};

  return (
    <div className="relative" ref={ref} {...hoverProps}>
      {trigger({ toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} z-20 mt-1 ${className} rounded-lg border border-zinc-200 bg-white py-1 shadow-lg`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
