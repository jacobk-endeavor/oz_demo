import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronRightIcon } from '@heroicons/react/20/solid';
import ToolCallIndicator from './ToolCallIndicator';
import type { ToolCallInfo } from './ToolCallIndicator';

function pluralCalls(n: number): string {
  return `Made ${n} tool call${n !== 1 ? 's' : ''}`;
}

interface ToolCallGroupProps {
  toolCalls: ToolCallInfo[];
  hasTextAfter: boolean;
}

export default function ToolCallGroup({ toolCalls, hasTextAfter }: ToolCallGroupProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [height, setHeight] = useState<number | 'auto'>('auto');
  const userToggled = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const allDone = toolCalls.every((tc) => tc.status === 'done');

  const measureAndAnimate = useCallback((opening: boolean) => {
    const el = contentRef.current;
    if (!el) return;

    if (opening) {
      setCollapsed(false);
      requestAnimationFrame(() => {
        const fullH = el.scrollHeight;
        setHeight(0);
        requestAnimationFrame(() => {
          setHeight(fullH);
          const onEnd = () => {
            setHeight('auto');
            el.removeEventListener('transitionend', onEnd);
          };
          el.addEventListener('transitionend', onEnd, { once: true });
        });
      });
    } else {
      const currentH = el.scrollHeight;
      setHeight(currentH);
      requestAnimationFrame(() => {
        setHeight(0);
        const onEnd = () => {
          setCollapsed(true);
          setHeight('auto');
          el.removeEventListener('transitionend', onEnd);
        };
        el.addEventListener('transitionend', onEnd, { once: true });
      });
    }
  }, []);

  useEffect(() => {
    if (!allDone || !hasTextAfter || userToggled.current) return;
    const timer = setTimeout(() => measureAndAnimate(false), 3000);
    return () => clearTimeout(timer);
  }, [allDone, hasTextAfter, measureAndAnimate]);

  const toggle = () => {
    userToggled.current = true;
    measureAndAnimate(collapsed);
  };

  const label = pluralCalls(toolCalls.length);

  return (
    <div className="my-2">
      {(allDone || collapsed) && (
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 transition-colors mb-1"
        >
          <ChevronRightIcon
            className={[
              'h-3.5 w-3.5 transition-transform duration-200',
              collapsed ? '' : 'rotate-90',
            ].join(' ')}
          />
          <span>{label}</span>
        </button>
      )}
      <div
        ref={contentRef}
        className="overflow-hidden transition-[height] duration-300 ease-in-out"
        style={{ height: collapsed ? 0 : height }}
      >
        {toolCalls.map((tc, i) => (
          <ToolCallIndicator key={i} toolCall={tc} />
        ))}
      </div>
    </div>
  );
}
