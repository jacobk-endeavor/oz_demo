/** Fallback when a workflow sub-route has no dedicated page yet. */
export function PlaceholderSubtabPage({ name, pageId }: { name: string; pageId: string }) {
  return (
    <div
      className="flex h-full min-h-0 flex-col items-center justify-center gap-2 px-6 text-center"
      data-testid="workflow-placeholder"
      data-page={pageId}
    >
      <p className="text-sm font-medium text-zinc-800">{name}</p>
      <p className="max-w-md text-xs text-zinc-500">
        Placeholder for <code className="rounded bg-zinc-200/60 px-1 text-zinc-800">{pageId}</code>.
      </p>
    </div>
  )
}
