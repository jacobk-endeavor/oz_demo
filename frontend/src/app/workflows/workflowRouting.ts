import { useEffect, useState } from 'react'
import {
  fieldMobileNavItems,
  fieldWorkflowIdForPage,
  isFieldMobileNavId,
} from '../../features/fieldApp/fieldAppSidebarNav'
import { getFieldMobileWorkflow } from '../../features/fieldApp/fieldMobileWorkflows'
import { WORKFLOW_PAGE_META, type WorkflowPageMeta, type OzWorkflowNavId } from '../../shared/ui'

export type Page = OzWorkflowNavId

const allPages = new Set<Page>([
  'oz',
  'search',
  'field-app',
  ...fieldMobileNavItems.map((e) => e.id),
  'tables',
  'knowledge-base',
  'nebula',
  'field-notes',
  'quotes-ready',
  'dashboards',
  'quote-automation',
  'lead-generation',
  'background-agents',
  'help',
])

function isPage(value: string): value is Page {
  return allPages.has(value as Page)
}

export function getPageMeta(p: Page): WorkflowPageMeta {
  if (isFieldMobileNavId(p)) {
    const w = getFieldMobileWorkflow(fieldWorkflowIdForPage(p))!
    return {
      eyebrow: 'Field (mobile workflow)',
      title: w.shortTitle,
      subtitle: w.summary,
    }
  }
  return WORKFLOW_PAGE_META[p as keyof typeof WORKFLOW_PAGE_META]
}

export function isFieldAppCommandCenter(p: Page): boolean {
  return p === 'field-app' || isFieldMobileNavId(p)
}

export function getHashPage(): Page {
  const hashPath = window.location.hash.replace(/^#\/?/, '').split('?')[0]
  if (hashPath === '') return 'oz'
  if (hashPath === 'settings') return 'oz'
  return isPage(hashPath) ? hashPath : 'oz'
}

export function useHashRoute(): [Page, (p: Page) => void] {
  const [page, setPage] = useState<Page>(getHashPage)

  useEffect(() => {
    function onHashChange() {
      setPage(getHashPage())
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  function navigate(p: Page) {
    setPage(p)
    window.location.hash = `#/${p}`
  }

  return [page, navigate]
}

export function isCommandCenterFirstPage(p: Page): boolean {
  return p === 'oz' || isFieldAppCommandCenter(p)
}

export function isLeadTableChatPage(p: Page): boolean {
  return p === 'oz' || p === 'tables' || p === 'lead-generation'
}
