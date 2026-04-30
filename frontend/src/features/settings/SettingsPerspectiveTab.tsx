import type { RagCallsScope } from '../ragCalls/ragCallsClient'
import { RagCallsScopeMenu } from '../ragCalls/RagCallsScopeMenu'
import { UserCircleIcon } from '../../shared/ui/icons'

function accountEmail(scope: RagCallsScope): string {
  const local = scope === 'admin' ? 'admin' : scope.toLowerCase()
  return `${local}@endeavorai.com`
}

/** Single-row settings: person icon + account email; scope picker opens the transcript menu. */
export function SettingsPerspectiveTab({
  ragCallsScope,
  ragCallsScopeBusy,
  onRagCallsScopeChange,
}: {
  ragCallsScope: RagCallsScope
  ragCallsScopeBusy: boolean
  onRagCallsScopeChange: (scope: RagCallsScope) => void
}) {
  return (
    <div className="group flex min-w-0 flex-nowrap items-center gap-2.5 whitespace-nowrap">
      <UserCircleIcon className="h-4 w-4 shrink-0 text-zinc-500 transition-colors group-hover:text-zinc-700" />
      <RagCallsScopeMenu
        rootClassName="inline-flex shrink-0"
        triggerLabel={accountEmail(ragCallsScope)}
        value={ragCallsScope}
        disabled={ragCallsScopeBusy}
        onPick={onRagCallsScopeChange}
      />
    </div>
  )
}
