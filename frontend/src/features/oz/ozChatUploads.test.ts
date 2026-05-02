import { describe, expect, it } from 'vitest'
import {
  normalizeMultipartMime,
  resolveOzUploadsBucket,
  resolveUploadKindAndExt,
  sanitizeConversationIdSegment,
} from '../../../../backend/oz/ozChatUploads'

describe('ozChatUploads helpers', () => {
  it('normalizes mime type', () => {
    expect(normalizeMultipartMime('Image/JPEG; charset=binary')).toBe('image/jpeg')
    expect(normalizeMultipartMime('image/jpg')).toBe('image/jpeg')
  })

  it('maps allowed mime types', () => {
    expect(resolveUploadKindAndExt('application/pdf')).toEqual({ kind: 'pdf', ext: 'pdf' })
    expect(resolveUploadKindAndExt('text/csv')).toEqual({ kind: 'csv', ext: 'csv' })
    expect(resolveUploadKindAndExt('application/octet-stream')).toBeNull()
  })

  it('sanitizes conversation id segments', () => {
    expect(sanitizeConversationIdSegment('abc-123_THREAD')).toBe('abc-123_THREAD')
    expect(sanitizeConversationIdSegment('../evil')).toBeNull()
    expect(sanitizeConversationIdSegment('')).toBeNull()
  })

  it('resolves uploads bucket from env', () => {
    expect(resolveOzUploadsBucket({ OZ_UPLOADS_BUCKET: 'oz-uploads-dev' })).toBe('oz-uploads-dev')
    expect(resolveOzUploadsBucket({ OZ_UPLOAD_ENV: 'staging' })).toBe('oz-uploads-staging')
    expect(resolveOzUploadsBucket({})).toBeUndefined()
  })
})
