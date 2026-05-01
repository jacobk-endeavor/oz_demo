/**
 * Persists Knowledge Base library entries across SPA navigations (same browser origin).
 * Raw bytes live in IndexedDB; metadata index in localStorage for quick listing.
 */

import type { KnowledgeAssetKind } from './knowledgeBaseIngest'

const LS_KEY = 'oz-kb-library-index-v1'
const IDB_NAME = 'oz-kb-library'
const IDB_VERSION = 1
const BLOB_STORE = 'files'

export type PersistedFolderEntry = {
  kind: 'folder'
  id: string
  displayName: string
  ingest: 'ingested'
}

export type PersistedFileEntry = {
  kind: 'file'
  id: string
  displayName: string
  sizeLabel: string
  assetKind: KnowledgeAssetKind
  mimeType: string
  lastModified: number
  byteLength: number
  sourceId?: string
  wikiWarning?: string
  wikiNote?: string
  pgvectorNote?: string
}

export type PersistedIndexEntry = PersistedFolderEntry | PersistedFileEntry

type PersistedIndex = { v: 1; entries: PersistedIndexEntry[] }

function readIndex(): PersistedIndex {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw == null) return { v: 1, entries: [] }
    const p = JSON.parse(raw) as PersistedIndex
    if (p?.v !== 1 || !Array.isArray(p.entries)) return { v: 1, entries: [] }
    return p
  } catch {
    return { v: 1, entries: [] }
  }
}

function writeIndex(entries: PersistedIndexEntry[]) {
  const idx: PersistedIndex = { v: 1, entries }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(idx))
  } catch {
    /* quota or private mode */
  }
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE)
      }
    }
  })
}

function idbPut(id: string, body: ArrayBuffer): Promise<void> {
  return openIdb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(BLOB_STORE, 'readwrite')
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => {
          db.close()
          reject(tx.error ?? new Error('IndexedDB write failed'))
        }
        tx.objectStore(BLOB_STORE).put(body, id)
      }),
  )
}

function idbGet(id: string): Promise<ArrayBuffer | undefined> {
  return openIdb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(BLOB_STORE, 'readonly')
        const r = tx.objectStore(BLOB_STORE).get(id)
        r.onsuccess = () => {
          const v = r.result
          db.close()
          resolve(v instanceof ArrayBuffer ? v : undefined)
        }
        r.onerror = () => {
          db.close()
          reject(r.error ?? new Error('IndexedDB read failed'))
        }
      }),
  )
}

function idbDelete(id: string): Promise<void> {
  return openIdb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(BLOB_STORE, 'readwrite')
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => {
          db.close()
          reject(tx.error ?? new Error('IndexedDB delete failed'))
        }
        tx.objectStore(BLOB_STORE).delete(id)
      }),
  )
}

export async function persistIngestedFolder(meta: Omit<PersistedFolderEntry, 'kind' | 'ingest'>): Promise<void> {
  const idx = readIndex()
  const next = idx.entries.filter((e) => e.id !== meta.id)
  next.push({ kind: 'folder', ...meta, ingest: 'ingested' })
  writeIndex(next)
}

export async function persistIngestedFile(
  meta: Omit<PersistedFileEntry, 'kind'>,
  body: ArrayBuffer,
): Promise<void> {
  await idbPut(meta.id, body)
  const idx = readIndex()
  const next = idx.entries.filter((e) => e.id !== meta.id)
  next.push({ kind: 'file', ...meta })
  writeIndex(next)
}

export async function removePersistedEntry(id: string): Promise<void> {
  const idx = readIndex()
  const ent = idx.entries.find((e) => e.id === id)
  writeIndex(idx.entries.filter((e) => e.id !== id))
  if (ent?.kind === 'file') {
    await idbDelete(id)
  }
}

export function fileFromPersisted(meta: PersistedFileEntry, buf: ArrayBuffer): File {
  const mime =
    meta.mimeType && meta.mimeType.length > 0 ? meta.mimeType : 'application/octet-stream'
  return new File([buf], meta.displayName, { type: mime, lastModified: meta.lastModified })
}

export async function loadPersistedIndex(): Promise<PersistedIndexEntry[]> {
  return readIndex().entries
}

export async function loadPersistedFileBlob(id: string): Promise<ArrayBuffer | undefined> {
  return idbGet(id)
}
