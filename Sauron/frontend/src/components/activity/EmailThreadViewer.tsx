import { useState, useCallback } from 'react';
import {
  EnvelopeIcon,
  ChevronDownIcon,
  ArrowUturnLeftIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  type LeadEmail,
  extractDisplayName,
  extractInitials,
  avatarColor,
  formatRelativeDate,
  formatFullDate,
} from './types';

export default function EmailThreadViewer({
  threadEmails,
  onReply,
  onClose,
}: {
  threadEmails: LeadEmail[];
  onReply?: (email: LeadEmail) => void;
  onClose: () => void;
}) {
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(() => {
    if (threadEmails.length <= 1) return new Set();
    return new Set(threadEmails.slice(0, -1).map((e) => e.id));
  });
  const [expandedHeaderIds, setExpandedHeaderIds] = useState<Set<number>>(new Set());

  const subject = threadEmails[0]?.subject || '(No subject)';
  const messageCount = threadEmails.length;

  const toggleCollapse = useCallback((id: number) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleHeader = useCallback((id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedHeaderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => setCollapsedIds(new Set()), []);
  const collapseAll = useCallback(() => {
    if (threadEmails.length <= 1) return;
    setCollapsedIds(new Set(threadEmails.slice(0, -1).map((e) => e.id)));
  }, [threadEmails]);

  return (
    <>
      {/* Header */}
      <div className="flex shrink-0 items-start justify-between border-b border-zinc-200 bg-white px-6 py-4">
        <div className="min-w-0 flex-1 pr-4">
          <h3 className="text-lg font-semibold text-zinc-900 leading-tight">
            {subject}
          </h3>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
              <EnvelopeIcon className="h-3 w-3" />
              {messageCount} {messageCount === 1 ? 'message' : 'messages'}
            </span>
            {messageCount > 1 && (
              <button
                type="button"
                onClick={collapsedIds.size > 0 ? expandAll : collapseAll}
                className="text-[11px] font-medium text-zinc-400 hover:text-zinc-600 transition"
              >
                {collapsedIds.size > 0 ? 'Expand all' : 'Collapse all'}
              </button>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600"
          aria-label="Close"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Thread */}
      <div className="flex-1 overflow-y-auto">
        <div className="divide-y divide-zinc-100">
          {threadEmails.map((email) => {
            const isCollapsed = collapsedIds.has(email.id);
            const isSent = email.direction === 'sent';
            const senderEmail = isSent ? email.from_email : email.from_email;
            const senderName = extractDisplayName(senderEmail);
            const initials = extractInitials(senderEmail);
            const color = avatarColor(senderEmail);
            const showHeaderDetails = expandedHeaderIds.has(email.id);

            if (isCollapsed) {
              return (
                <button
                  key={email.id}
                  type="button"
                  onClick={() => toggleCollapse(email.id)}
                  className="flex w-full items-center gap-3 px-6 py-3 text-left transition hover:bg-zinc-50/80"
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white text-xs font-semibold ${color}`}>
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-900 truncate">
                        {isSent ? 'me' : senderName}
                      </span>
                      {!email.is_read && !isSent && (
                        <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 truncate mt-0.5 leading-snug">
                      {email.body_plain?.substring(0, 120) || '(No content)'}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-zinc-400 ml-2">
                    {formatRelativeDate(email.occurred_at)}
                  </span>
                </button>
              );
            }

            return (
              <div key={email.id} className="bg-white">
                {/* Expanded message header */}
                <div
                  className="flex items-start gap-3 px-6 pt-4 pb-2 cursor-pointer"
                  onClick={() => messageCount > 1 ? toggleCollapse(email.id) : undefined}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white text-sm font-semibold mt-0.5 ${color}`}>
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-semibold text-zinc-900 truncate">
                          {isSent ? 'me' : senderName}
                        </span>
                        {isSent && (
                          <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                            Sent
                          </span>
                        )}
                        {!email.is_read && !isSent && (
                          <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                        )}
                      </div>
                      <span className="shrink-0 text-[11px] text-zinc-400" title={formatFullDate(email.occurred_at)}>
                        {formatRelativeDate(email.occurred_at)}
                      </span>
                    </div>

                    {/* To line / expandable details */}
                    <button
                      type="button"
                      onClick={(e) => toggleHeader(email.id, e)}
                      className="mt-0.5 flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 transition"
                    >
                      <span className="truncate">
                        to {isSent ? email.to_email : extractDisplayName(email.to_email)}
                      </span>
                      <ChevronDownIcon className={`h-3 w-3 shrink-0 transition ${showHeaderDetails ? 'rotate-180' : ''}`} />
                    </button>

                    {showHeaderDetails && (
                      <div className="mt-2 rounded-md border border-zinc-100 bg-zinc-50/80 px-3 py-2 text-xs text-zinc-500 space-y-1">
                        <div className="flex gap-2">
                          <span className="text-zinc-400 w-10 shrink-0">from:</span>
                          <span className="text-zinc-700 break-all">{email.from_email}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-zinc-400 w-10 shrink-0">to:</span>
                          <span className="text-zinc-700 break-all">{email.to_email}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-zinc-400 w-10 shrink-0">date:</span>
                          <span className="text-zinc-700">{formatFullDate(email.occurred_at)}</span>
                        </div>
                        {email.subject && (
                          <div className="flex gap-2">
                            <span className="text-zinc-400 w-10 shrink-0">subj:</span>
                            <span className="text-zinc-700">{email.subject}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Body */}
                <div className="px-6 pb-5 pl-[4.75rem]">
                  <div className="text-sm text-zinc-700 leading-relaxed whitespace-pre-line break-words">
                    {email.body_plain || <span className="italic text-zinc-400">No content</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      {onReply && (
        <div className="shrink-0 border-t border-zinc-200 bg-white px-6 py-3">
          <button
            type="button"
            onClick={() => onReply(threadEmails[threadEmails.length - 1])}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 hover:border-zinc-300"
          >
            <ArrowUturnLeftIcon className="h-4 w-4" />
            Reply
          </button>
        </div>
      )}
    </>
  );
}
