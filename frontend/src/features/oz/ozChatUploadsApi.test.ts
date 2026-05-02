import { describe, expect, it } from 'vitest'
import {
  isAllowedComposerUploadFile,
  isKbPromotableFilename,
  uploadKindFromFilename,
  validateComposerUploadFiles,
} from './ozChatUploadsApi'

describe('ozChatUploadsApi', () => {
  it('allows pdf by mime or extension when type is empty', () => {
    expect(isAllowedComposerUploadFile(new File([], 'x.pdf', { type: 'application/pdf' }))).toBe(true)
    expect(isAllowedComposerUploadFile(new File([], 'x.pdf', { type: '' }))).toBe(true)
    expect(isAllowedComposerUploadFile(new File([], 'readme.txt', { type: '' }))).toBe(true)
  })

  it('rejects unknown extensions', () => {
    expect(isAllowedComposerUploadFile(new File([], 'x.exe', { type: '' }))).toBe(false)
  })

  it('maps promotable kinds from filenames for KB promotion', () => {
    expect(uploadKindFromFilename('data.csv')).toBe('csv')
    expect(uploadKindFromFilename('Sheet.xlsx')).toBe('xlsx')
    expect(uploadKindFromFilename('readme.md')).toBe('md')
    expect(isKbPromotableFilename('x.pdf')).toBe(true)
    expect(isKbPromotableFilename('snap.png')).toBe(false)
  })

  it('enforces aggregate size', () => {
    const big = new File([new Uint8Array(26 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' })
    const v = validateComposerUploadFiles([big])
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.detail).toMatch(/25 MB/)
  })
})
