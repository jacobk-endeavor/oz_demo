import { describe, expect, it } from 'vitest'
import { fileFromPersisted, type PersistedFileEntry } from './knowledgeBaseLibraryPersistence'

describe('knowledgeBaseLibraryPersistence', () => {
  it('fileFromPersisted builds a File with stored metadata', () => {
    const meta: PersistedFileEntry = {
      kind: 'file',
      id: 'kb-test',
      displayName: 'sample.pdf',
      sizeLabel: '12 B',
      assetKind: 'pdf',
      mimeType: 'application/pdf',
      lastModified: 1_700_000_000_000,
      byteLength: 3,
      sourceId: 'deadbeef',
    }
    const f = fileFromPersisted(meta, new Uint8Array([9, 8, 7]).buffer)
    expect(f.name).toBe('sample.pdf')
    expect(f.type).toBe('application/pdf')
    expect(f.lastModified).toBe(1_700_000_000_000)
    expect(f.size).toBe(3)
  })
})
