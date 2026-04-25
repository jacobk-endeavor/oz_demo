import { useEffect, useMemo, useState } from 'react'
import { Button, Modal, Tag, joinClasses } from '../../shared/ui'
import { CheckIcon, CopyIcon, SpinnerIcon } from '../../shared/ui/icons'

export type PublishVisibility = 'private_link' | 'workspace' | 'public'

export interface PublishedDashboardSnapshot {
  title: string
  visibility: PublishVisibility
  recipients: string[]
  message: string
  shareUrl: string
  publishedAt: string
}

interface PublishDashboardModalProps {
  open: boolean
  onClose: () => void
  defaultTitle: string
  /** Existing publication (if any) so the modal can show the manage view. */
  published: PublishedDashboardSnapshot | null
  onPublish: (snapshot: PublishedDashboardSnapshot) => void
  onUnpublish: () => void
}

type ModalStage = 'configure' | 'publishing' | 'published'

const visibilityCopy: Record<
  PublishVisibility,
  { label: string; description: string; tone: 'blue' | 'amber' | 'emerald' }
> = {
  private_link: {
    label: 'Anyone with the link',
    description: 'Mock share link with no real authentication. Best for the demo.',
    tone: 'blue',
  },
  workspace: {
    label: 'Workspace only',
    description: 'Restricted to teammates in the Oz workspace.',
    tone: 'emerald',
  },
  public: {
    label: 'Public',
    description: 'Discoverable on the public Oz dashboard index.',
    tone: 'amber',
  },
}

const publishSteps = [
  { id: 'snapshot', label: 'Snapshotting dashboard data' },
  { id: 'render', label: 'Rendering shareable preview' },
  { id: 'link', label: 'Generating share link' },
  { id: 'invite', label: 'Sending invitations' },
] as const

type StepId = (typeof publishSteps)[number]['id']

function makeShareUrl(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  const id = Math.random().toString(36).slice(2, 8)
  return `https://oz.demo/d/${slug || 'dashboard'}-${id}`
}

function parseRecipients(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function PublishDashboardModal({
  open,
  onClose,
  defaultTitle,
  published,
  onPublish,
  onUnpublish,
}: PublishDashboardModalProps) {
  const initialStage: ModalStage = published ? 'published' : 'configure'
  const [stage, setStage] = useState<ModalStage>(initialStage)
  const [title, setTitle] = useState(published?.title ?? defaultTitle)
  const [visibility, setVisibility] = useState<PublishVisibility>(
    published?.visibility ?? 'private_link',
  )
  const [recipientsInput, setRecipientsInput] = useState(
    (published?.recipients ?? ['sami@example.com', 'sales@example.com']).join(', '),
  )
  const [message, setMessage] = useState(
    published?.message ?? 'Latest sales dashboard with the call mining insights from this week.',
  )
  const [activeStepIndex, setActiveStepIndex] = useState<number>(publishSteps.length)
  const [snapshot, setSnapshot] = useState<PublishedDashboardSnapshot | null>(published)
  const [copied, setCopied] = useState(false)

  // Reset state when modal opens.
  useEffect(() => {
    if (!open) return
    setStage(published ? 'published' : 'configure')
    setTitle(published?.title ?? defaultTitle)
    setVisibility(published?.visibility ?? 'private_link')
    setRecipientsInput(
      (published?.recipients ?? ['sami@example.com', 'sales@example.com']).join(', '),
    )
    setMessage(
      published?.message ??
        'Latest sales dashboard with the call mining insights from this week.',
    )
    setSnapshot(published)
    setCopied(false)
    setActiveStepIndex(published ? publishSteps.length : 0)
  }, [open, published, defaultTitle])

  // Drive the publishing animation. Each step takes ~350ms.
  useEffect(() => {
    if (stage !== 'publishing') return
    if (activeStepIndex >= publishSteps.length) {
      const finalSnapshot: PublishedDashboardSnapshot = {
        title: title.trim() || defaultTitle,
        visibility,
        recipients: parseRecipients(recipientsInput),
        message: message.trim(),
        shareUrl: snapshot?.shareUrl ?? makeShareUrl(title.trim() || defaultTitle),
        publishedAt: new Date().toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }),
      }
      setSnapshot(finalSnapshot)
      onPublish(finalSnapshot)
      setStage('published')
      return
    }
    const timer = window.setTimeout(() => {
      setActiveStepIndex((current) => current + 1)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [
    stage,
    activeStepIndex,
    defaultTitle,
    message,
    onPublish,
    recipientsInput,
    snapshot?.shareUrl,
    title,
    visibility,
  ])

  const recipients = useMemo(() => parseRecipients(recipientsInput), [recipientsInput])

  const stepStatus = (stepId: StepId): 'queued' | 'running' | 'complete' => {
    const index = publishSteps.findIndex((step) => step.id === stepId)
    if (activeStepIndex >= publishSteps.length) return 'complete'
    if (index < activeStepIndex) return 'complete'
    if (index === activeStepIndex) return 'running'
    return 'queued'
  }

  function startPublishing() {
    setActiveStepIndex(0)
    setStage('publishing')
  }

  function handleCopy() {
    if (!snapshot) return
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(snapshot.shareUrl).catch(() => {
        /* clipboard may be unavailable; the visible link still does the job */
      })
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  function handleUnpublish() {
    onUnpublish()
    setStage('configure')
    setSnapshot(null)
    setActiveStepIndex(0)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        stage === 'published'
          ? 'Dashboard is published'
          : stage === 'publishing'
            ? 'Publishing dashboard'
            : 'Publish dashboard'
      }
      description={
        stage === 'published'
          ? 'This is a mock publish: nothing leaves the demo. Share the link or update sharing settings.'
          : stage === 'publishing'
            ? 'Oz is preparing a snapshot, building the shareable preview, and sending invitations.'
            : 'Mock publishing flow inspired by Opal: configure who can see this dashboard, then click publish to generate a fake share link.'
      }
      footer={
        stage === 'configure' ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={startPublishing}>Publish dashboard</Button>
          </>
        ) : stage === 'publishing' ? (
          <>
            <Button variant="ghost" disabled>
              Cancel
            </Button>
            <Button disabled loading>
              Publishing
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={handleUnpublish}>
              Unpublish
            </Button>
            <Button variant="secondary" onClick={() => setStage('configure')}>
              Edit sharing
            </Button>
            <Button onClick={onClose}>Done</Button>
          </>
        )
      }
    >
      {stage === 'configure' && (
        <ConfigureForm
          title={title}
          setTitle={setTitle}
          visibility={visibility}
          setVisibility={setVisibility}
          recipientsInput={recipientsInput}
          setRecipientsInput={setRecipientsInput}
          message={message}
          setMessage={setMessage}
          recipients={recipients}
        />
      )}

      {stage === 'publishing' && (
        <ol className="space-y-2" aria-label="Publishing steps">
          {publishSteps.map((step) => {
            const status = stepStatus(step.id)
            return (
              <li
                key={step.id}
                className={joinClasses(
                  'flex items-center gap-3 rounded-xl border p-3',
                  status === 'complete'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : status === 'running'
                      ? 'border-blue-300 bg-blue-50 text-blue-800'
                      : 'border-zinc-200 bg-white text-zinc-600',
                )}
              >
                <span
                  className={joinClasses(
                    'flex h-6 w-6 items-center justify-center rounded-full border',
                    status === 'complete'
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : status === 'running'
                        ? 'border-blue-500 bg-blue-500 text-white'
                        : 'border-zinc-300 bg-white text-zinc-400',
                  )}
                  aria-hidden="true"
                >
                  {status === 'complete' ? (
                    <CheckIcon className="h-3.5 w-3.5" />
                  ) : status === 'running' ? (
                    <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  )}
                </span>
                <span className="text-sm font-medium">{step.label}</span>
              </li>
            )
          })}
        </ol>
      )}

      {stage === 'published' && snapshot !== null && (
        <PublishedSummary snapshot={snapshot} copied={copied} onCopy={handleCopy} />
      )}
    </Modal>
  )
}

function ConfigureForm({
  title,
  setTitle,
  visibility,
  setVisibility,
  recipientsInput,
  setRecipientsInput,
  message,
  setMessage,
  recipients,
}: {
  title: string
  setTitle: (value: string) => void
  visibility: PublishVisibility
  setVisibility: (value: PublishVisibility) => void
  recipientsInput: string
  setRecipientsInput: (value: string) => void
  message: string
  setMessage: (value: string) => void
  recipients: string[]
}) {
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Dashboard title
        </span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
      </label>

      <fieldset>
        <legend className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Who can access
        </legend>
        <div className="mt-2 grid gap-2">
          {(Object.keys(visibilityCopy) as PublishVisibility[]).map((id) => {
            const copy = visibilityCopy[id]
            const active = visibility === id
            return (
              <label
                key={id}
                className={joinClasses(
                  'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
                  active
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-zinc-200 bg-white hover:border-blue-200 hover:bg-blue-50/40',
                )}
              >
                <input
                  type="radio"
                  name="dashboard-visibility"
                  value={id}
                  checked={active}
                  onChange={() => setVisibility(id)}
                  className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-900">{copy.label}</span>
                    {active && <Tag tone={copy.tone}>Selected</Tag>}
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-600">{copy.description}</p>
                </div>
              </label>
            )
          })}
        </div>
      </fieldset>

      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Invite recipients
        </span>
        <textarea
          rows={2}
          value={recipientsInput}
          onChange={(event) => setRecipientsInput(event.target.value)}
          placeholder="email@example.com, another@example.com"
          className="mt-1 w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
        {recipients.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {recipients.map((recipient) => (
              <Tag key={recipient} tone="zinc">
                {recipient}
              </Tag>
            ))}
          </div>
        )}
      </label>

      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Message
        </span>
        <textarea
          rows={3}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className="mt-1 w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
      </label>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        Demo only: clicking publish does not send real emails or expose this dashboard publicly.
      </div>
    </div>
  )
}

function PublishedSummary({
  snapshot,
  copied,
  onCopy,
}: {
  snapshot: PublishedDashboardSnapshot
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        Mock published. The link below is a placeholder URL for the demo.
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Share link
        </p>
        <div className="mt-1 flex items-stretch gap-2">
          <code
            className="flex-1 truncate rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-sm text-zinc-800"
            data-testid="published-share-url"
          >
            {snapshot.shareUrl}
          </code>
          <Button variant="secondary" onClick={onCopy} aria-label="Copy share link">
            <CopyIcon className="h-4 w-4" />
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Visibility
          </p>
          <p className="mt-0.5 text-sm font-medium text-zinc-900">
            {visibilityCopy[snapshot.visibility].label}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Published at
          </p>
          <p className="mt-0.5 text-sm font-medium text-zinc-900">{snapshot.publishedAt}</p>
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Invitations sent
        </p>
        {snapshot.recipients.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {snapshot.recipients.map((recipient) => (
              <li
                key={recipient}
                className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
              >
                <CheckIcon className="h-4 w-4 text-emerald-600" />
                <span className="truncate">{recipient}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-zinc-600">No recipients added.</p>
        )}
      </div>

      {snapshot.message && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Message
          </p>
          <p className="mt-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700">
            {snapshot.message}
          </p>
        </div>
      )}
    </div>
  )
}
