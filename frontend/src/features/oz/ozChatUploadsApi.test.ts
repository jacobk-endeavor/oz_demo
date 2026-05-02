import { describe, expect, it } from 'vitest'
import {
  isAllowedComposerUploadFile,
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

  it('enforces aggregate size', () => {
    const big = new File([new Uint8Array(26 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' })
    const v = validateComposerUploadFiles([big])
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.detail).toMatch(/25 MB/)
  })
})
