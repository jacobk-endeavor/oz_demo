import { describe, expect, it } from 'vitest'
import { createOzToolSurface } from '../../../../backend/oz/chatRuntime'
import { validateSectionsPayload, validateSpreadsheetPayload } from '../../../../backend/oz/hostTemplateArtifacts'

describe('hostTemplateArtifacts validation', () => {
  it('validates spreadsheet payloads', () => {
    expect(validateSpreadsheetPayload(null)).toBeTruthy()
    expect(validateSpreadsheetPayload({ sheets: [] })).toBeTruthy()
    expect(validateSpreadsheetPayload({ sheets: [], title: 'T' })).toBeNull()
    expect(
      validateSpreadsheetPayload({
        sheets: [{ name: 'S', columns: ['a'], rows: [[1]] }],
      }),
    ).toBeNull()
  })

  it('validates doc/pdf section payloads', () => {
    expect(validateSectionsPayload({})).toBeTruthy()
    expect(validateSectionsPayload({ sections: [] })).toBeNull()
  })
})

describe('make_* tools without artifact deps', () => {
  it('returns artifact_pipeline_unconfigured', async () => {
    const surface = createOzToolSurface({ message: 'export table' })
    const r = await surface.make_spreadsheet({
      sheets: [{ name: 'S', columns: ['SKU'], rows: [['A1']] }],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('artifact_pipeline_unconfigured')
  })
})
