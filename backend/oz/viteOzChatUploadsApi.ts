/**
 * Dev/preview middleware: multipart uploads for Oz chat attachments → DigitalOcean Spaces.
 * POST /api/oz/chat/uploads — pattern `s3://oz-uploads-<env>/<tenant>/<conv_id>/<upload_id>.<ext>`
 */
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import busboy from 'busboy'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Readable } from 'node:stream'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import {
  bufferReadableWithCaps,
  normalizeMultipartMime,
  newUploadId,
  OZ_CHAT_UPLOAD_ALLOWED_MIMES,
  OZ_CHAT_UPLOAD_MAX_AGGREGATE_BYTES,
  OZ_CHAT_UPLOAD_MAX_FILE_BYTES,
  resolveOzUploadsBucket,
  resolveUploadKindAndExt,
  sanitizeConversationIdSegment,
  sha256Hex,
} from './ozChatUploads'
import { resolveOzTenant } from './threadDirectionNormalize'

const OZ_CHAT_UPLOADS_PATH = '/api/oz/chat/uploads'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')

function readEnv(): Record<string, string> {
  return loadEnv(process.env.NODE_ENV || 'development', REPO_ROOT, '')
}

function normalizedUrlPath(url: string | undefined): string {
  const pathOnly = url?.split('?')[0] ?? ''
  const trimmed = pathOnly.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

function isUploadsPost(req: IncomingMessage): boolean {
  if (req.method !== 'POST') return false
  const url = req.url ?? ''
  return normalizedUrlPath(url) === OZ_CHAT_UPLOADS_PATH || url.includes(OZ_CHAT_UPLOADS_PATH)
}

function parseConversationIdQuery(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    const q = url.includes('?') ? url.split('?')[1] : ''
    const params = new URLSearchParams(q)
    const v = params.get('conversation_id')
    return v ?? undefined
  } catch {
    return undefined
  }
}

function sanitizeDownloadFilename(name: string): string {
  const base = path.basename(name || 'upload').replace(/[^\w.\-()+ ]+/g, '_')
  return base.length > 0 ? base.slice(0, 180) : 'upload.bin'
}

function spacesClient(): S3Client | null {
  const key = (process.env.DO_SPACES_KEY || process.env.AWS_ACCESS_KEY_ID || '').trim()
  const secret = (process.env.DO_SPACES_SECRET || process.env.AWS_SECRET_ACCESS_KEY || '').trim()
  const endpoint = (process.env.DO_SPACES_ENDPOINT || '').trim()
  const region = (process.env.DO_SPACES_REGION || '').trim() || 'us-east-1'
  if (!key || !secret || !endpoint) return null
  return new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId: key, secretAccessKey: secret },
    forcePathStyle: false,
  })
}

export type OzChatUploadItem = {
  upload_id: string
  filename: string
  kind: string
  size_bytes: number
  sha256: string
}

type FailSignal = Error & { statusCode?: number }

export function ozChatUploadsApiPlugin() {
  async function handler(req: IncomingMessage, res: ServerResponse, next: () => void) {
    if (!isUploadsPost(req)) {
      next()
      return
    }

    const ct = String(req.headers['content-type'] ?? '')
    if (!ct.toLowerCase().includes('multipart/form-data')) {
      res.statusCode = 415
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: 'Expected multipart/form-data' }))
      return
    }

    const conversationFromQuery = parseConversationIdQuery(req.url)
    Object.assign(process.env, readEnv())

    const jsonErr = (status: number, msg: string) => {
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify({ error: msg }))
    }

    let conversationId = conversationFromQuery
    const uploads: OzChatUploadItem[] = []
    let aggregateBytes = 0

    const client = spacesClient()
    const bucket = resolveOzUploadsBucket(process.env)
    if (!client || !bucket) {
      jsonErr(
        503,
        'Upload storage is not configured. Set DO_SPACES_KEY, DO_SPACES_SECRET, DO_SPACES_ENDPOINT, and OZ_UPLOADS_BUCKET (or OZ_UPLOAD_ENV for oz-uploads-<env>).',
      )
      return
    }

    const tenant = resolveOzTenant(readEnv)

    try {
      await new Promise<void>((resolve, reject) => {
        const bb = busboy({
          headers: req.headers,
          limits: {
            files: 64,
            fieldSize: 4096,
            parts: 128,
          },
        })

        /** Serialize file handling so aggregate byte caps are deterministic. */
        let chain: Promise<void> = Promise.resolve()
        let priorFailure: unknown | null = null

        bb.on('field', (name: string, val: string) => {
          if (name === 'conversation_id' && val) {
            const t = String(val).trim()
            if (t) conversationId = t
          }
        })

        bb.on('file', (fieldname: string, fileStream: Readable, info: { filename: string; mimeType: string }) => {
          if (fieldname !== 'file') {
            fileStream.resume()
            return
          }

          // Keep the chain fulfilled so every part stream is drained even after an error.
          chain = chain.then(async () => {
            if (priorFailure) {
              fileStream.resume()
              return
            }
            try {
              const mimeNorm = normalizeMultipartMime(info.mimeType)
              if (!mimeNorm || !OZ_CHAT_UPLOAD_ALLOWED_MIMES.has(mimeNorm)) {
                fileStream.resume()
                const err: FailSignal = Object.assign(
                  new Error(`MIME type not allowed: ${mimeNorm || '(missing)'}`),
                  { statusCode: 415 },
                )
                priorFailure = err
                return
              }
              const mapped = resolveUploadKindAndExt(mimeNorm)
              if (!mapped) {
                fileStream.resume()
                priorFailure = new Error('internal MIME map mismatch')
                return
              }

              const conv = sanitizeConversationIdSegment(conversationId ?? '')
              if (!conv) {
                fileStream.resume()
                const err: FailSignal = Object.assign(
                  new Error(
                    'conversation_id is required (query ?conversation_id= or form field before files) and must match /^[a-zA-Z0-9._-]{1,200}$/',
                  ),
                  { statusCode: 400 },
                )
                priorFailure = err
                return
              }

              const safeName = sanitizeDownloadFilename(info.filename)
              const buf = await bufferReadableWithCaps(fileStream, {
                maxFileBytes: OZ_CHAT_UPLOAD_MAX_FILE_BYTES,
                aggregateSoFar: aggregateBytes,
                maxAggregateBytes: OZ_CHAT_UPLOAD_MAX_AGGREGATE_BYTES,
              })
              aggregateBytes += buf.length

              const upload_id = newUploadId()
              const objectKey = `${tenant}/${conv}/${upload_id}.${mapped.ext}`

              await client.send(
                new PutObjectCommand({
                  Bucket: bucket,
                  Key: objectKey,
                  Body: buf,
                  ContentType: mimeNorm,
                }),
              )

              uploads.push({
                upload_id,
                filename: safeName,
                kind: mapped.kind,
                size_bytes: buf.length,
                sha256: sha256Hex(buf),
              })
            } catch (err) {
              priorFailure = priorFailure ?? err
              try {
                fileStream.resume()
              } catch {
                /* ignore */
              }
            }
          })
        })

        bb.on('finish', () => {
          chain
            .then(() => {
              if (priorFailure) reject(priorFailure as Error)
              else resolve()
            })
            .catch(reject)
        })

        bb.on('error', reject)
        req.on('error', reject)
        req.pipe(bb)
      })
    } catch (e) {
      const fail = e as FailSignal
      const status =
        typeof fail.statusCode === 'number'
          ? fail.statusCode
          : e instanceof RangeError
            ? 413
            : 500
      const msg = e instanceof Error ? e.message : String(e)
      jsonErr(status, msg)
      return
    }

    const conv = sanitizeConversationIdSegment(conversationId ?? '')
    if (!conv) {
      jsonErr(
        400,
        'conversation_id is required (query ?conversation_id= or form field) and must match /^[a-zA-Z0-9._-]{1,200}$/',
      )
      return
    }

    if (uploads.length === 0) {
      jsonErr(400, 'No file parts named "file" were uploaded')
      return
    }

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify({ uploads }))
  }

  return {
    name: 'oz-chat-uploads-api',
    enforce: 'pre' as const,
    configureServer(server: { middlewares: { use: (fn: typeof handler) => void } }) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server: { middlewares: { use: (fn: typeof handler) => void } }) {
      server.middlewares.use(handler)
    },
  }
}
