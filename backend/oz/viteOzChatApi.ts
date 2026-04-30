import type { IncomingMessage, ServerResponse } from 'node:http'
import { OZ_CHAT_CONTRACT_VERSION, runOzChatLoop, type OzChatRequest, type OzChatStreamEvent } from './chatRuntime'

const OZ_CHAT_PATH = '/api/oz/chat'

function normalizedUrlPath(url: string | undefined): string {
  const pathOnly = url?.split('?')[0] ?? ''
  const trimmed = pathOnly.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

function isOzChatPost(req: IncomingMessage): boolean {
  if (req.method !== 'POST') return false
  const path = normalizedUrlPath(req.url)
  return path === OZ_CHAT_PATH || path.endsWith(OZ_CHAT_PATH)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function writeSseFrame(res: ServerResponse, event: OzChatStreamEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

function writeSseDone(res: ServerResponse, message: string): void {
  const doneEvent: OzChatStreamEvent = {
    type: 'done',
    contract_version: OZ_CHAT_CONTRACT_VERSION,
    sequence: Number.MAX_SAFE_INTEGER,
    timestamp: new Date().toISOString(),
    message,
    finish_reason: 'error',
  }
  writeSseFrame(res, doneEvent)
}

export function ozChatApiPlugin() {
  async function handler(req: IncomingMessage, res: ServerResponse, next: () => void) {
    if (!isOzChatPost(req)) {
      next()
      return
    }

    let parsed: OzChatRequest
    try {
      parsed = JSON.parse(await readBody(req)) as OzChatRequest
    } catch {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Invalid JSON body' }))
      return
    }

    const message = String(parsed.message ?? '').trim()
    if (!message) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'message is required' }))
      return
    }

    const contractVersion = parsed.contract_version || OZ_CHAT_CONTRACT_VERSION
    const request: OzChatRequest = {
      ...parsed,
      message,
      contract_version: contractVersion,
    }

    res.statusCode = 200
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('x-oz-chat-contract-version', contractVersion)

    try {
      for await (const event of runOzChatLoop(request)) {
        writeSseFrame(res, event)
      }
    } catch (error) {
      writeSseDone(res, error instanceof Error ? error.message : String(error))
    }

    res.end()
  }

  return {
    name: 'oz-chat-api',
    enforce: 'pre' as const,
    configureServer(server: { middlewares: { use: (fn: typeof handler) => void } }) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server: { middlewares: { use: (fn: typeof handler) => void } }) {
      server.middlewares.use(handler)
    },
  }
}
