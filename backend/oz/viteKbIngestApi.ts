/**
 * Dev/preview middleware: upload a file from the Knowledge Base UI, run Track A ingest (pgvector),
 * then the wiki ingest scaffold (markdown under wiki/).
 */
import { execFile, execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')
const UPLOAD_DIR = path.join(REPO_ROOT, '.kb-upload-tmp')
const KB_INGEST_SCRIPT = path.join(REPO_ROOT, 'calls/kb/scripts/ingest_kb.py')
const MAX_UPLOAD_BYTES = 45 * 1024 * 1024

const KB_INGEST_PATH = '/api/oz/knowledge-base/ingest'

function normalizedUrlPath(url: string | undefined): string {
  const pathOnly = url?.split('?')[0] ?? ''
  const trimmed = pathOnly.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

function isKbIngestPost(req: IncomingMessage): boolean {
  if (req.method !== 'POST') return false
  const url = req.url ?? ''
  return normalizedUrlPath(url) === KB_INGEST_PATH || url.includes(KB_INGEST_PATH)
}

function parseDotEnv(contents: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of contents.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const eq = line.indexOf('=')
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (key) out[key] = val
  }
  return out
}

/** Merge repo-root `.env` without overriding existing process.env (matches Track A ingest scripts). */
function mergeEnv(): NodeJS.ProcessEnv {
  let fileEnv: Record<string, string> = {}
  try {
    fileEnv = parseDotEnv(readFileSync(path.join(REPO_ROOT, '.env'), 'utf8'))
  } catch {
    /* missing or unreadable */
  }
  return { ...fileEnv, ...process.env }
}

function resolvePython(): string {
  const venvPy = path.join(REPO_ROOT, 'calls/kb/scripts/.venv/bin/python')
  if (existsSync(venvPy)) return venvPy
  const venvPyWin = path.join(REPO_ROOT, 'calls/kb/scripts/.venv/Scripts/python.exe')
  if (existsSync(venvPyWin)) return venvPyWin
  return process.platform === 'win32' ? 'python' : 'python3'
}

function sanitizeBasename(name: string): string {
  const base = path.basename(name || 'upload').replace(/[^\w.\-()+ ]+/g, '_')
  return base.length > 0 ? base.slice(0, 180) : 'upload.bin'
}

function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (c: Buffer) => {
      total += c.length
      if (total > maxBytes) {
        req.destroy()
        reject(new Error(`Body exceeds ${maxBytes} bytes`))
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function parseKbIngestStdout(stdout: string): { source_id?: string } {
  for (const line of stdout.split('\n')) {
    const t = line.trim()
    if (!t.startsWith('{')) continue
    try {
      const o = JSON.parse(t) as { event?: string; source_id?: string }
      if (o.event === 'kb.ingested' && typeof o.source_id === 'string') return { source_id: o.source_id }
    } catch {
      /* ignore */
    }
  }
  return {}
}

function runWikiIngest(repoRoot: string, sourceId: string): { ok: boolean; detail?: string } {
  const tsxCli = path.join(repoRoot, 'frontend/node_modules/tsx/dist/cli.mjs')
  const scriptPath = path.join(repoRoot, 'scripts/run-wiki-ingest.ts')
  if (!existsSync(tsxCli)) {
    return { ok: false, detail: 'Missing frontend/node_modules/tsx — run npm install in frontend.' }
  }
  if (!existsSync(scriptPath)) {
    return { ok: false, detail: 'Missing scripts/run-wiki-ingest.ts' }
  }
  try {
    execFileSync(process.execPath, [tsxCli, scriptPath, '--repoRoot', repoRoot, '--sourceId', sourceId], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: mergeEnv(),
      maxBuffer: 12 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { ok: true }
  } catch (e) {
    const err = e as { stderr?: Buffer; stdout?: Buffer; message?: string }
    const stderr = err.stderr?.toString?.() ?? ''
    const stdout = err.stdout?.toString?.() ?? ''
    return { ok: false, detail: stderr || stdout || err.message || String(e) }
  }
}

export function kbIngestApiPlugin() {
  async function handler(req: IncomingMessage, res: ServerResponse, next: () => void) {
    if (!isKbIngestPost(req)) {
      next()
      return
    }

    if (!existsSync(KB_INGEST_SCRIPT)) {
      res.statusCode = 501
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ ok: false, error: 'ingest_kb.py not found in repo' }))
      return
    }

    let body: Buffer
    try {
      body = await readBody(req, MAX_UPLOAD_BYTES)
    } catch (e) {
      res.statusCode = 413
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }))
      return
    }

    const rawName = req.headers['x-file-name']
    const decoded =
      typeof rawName === 'string' ? decodeURIComponent(rawName.replace(/\+/g, ' ')) : 'upload'
    const safeName = sanitizeBasename(decoded)
    const passwordHeader = req.headers['x-kb-password']
    const password = typeof passwordHeader === 'string' ? passwordHeader : undefined

    mkdirSync(UPLOAD_DIR, { recursive: true })
    const token = randomUUID()
    const tmpPath = path.join(UPLOAD_DIR, `${token}-${safeName}`)

    try {
      writeFileSync(tmpPath, body)
    } catch (e) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }))
      return
    }

    const py = resolvePython()
    const args = [
      KB_INGEST_SCRIPT,
      tmpPath,
      '--scope',
      'global',
      '--on-success',
      'emit-event',
      ...(password ? ['--password', password] : []),
    ]

    const env = mergeEnv()
    let stdout = ''
    try {
      await new Promise<void>((resolve, reject) => {
        execFile(
          py,
          args,
          {
            cwd: REPO_ROOT,
            env,
            maxBuffer: 24 * 1024 * 1024,
            timeout: 600_000,
          },
          (err, out, stderr) => {
            stdout = String(out || '')
            if (err) {
              reject(new Error(String(stderr || '') || stdout || (err as Error).message))
              return
            }
            resolve()
          },
        )
      })
    } catch (e) {
      try {
        unlinkSync(tmpPath)
      } catch {
        /* ignore */
      }
      res.statusCode = 502
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({
          ok: false,
          error: 'ingest_kb.py failed',
          detail: e instanceof Error ? e.message : String(e),
        }),
      )
      return
    }

    const shaFallback12 = createHash('sha256').update(body).digest('hex').slice(0, 12).toLowerCase()

    try {
      unlinkSync(tmpPath)
    } catch {
      /* ignore */
    }

    const parsed = parseKbIngestStdout(stdout)
    const sourceId = parsed.source_id ?? shaFallback12

    const wiki = runWikiIngest(REPO_ROOT, sourceId)

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(
      JSON.stringify({
        ok: true,
        source_id: sourceId,
        sha256_12: sourceId,
        wiki: wiki.ok ? { ok: true } : { ok: false, detail: wiki.detail },
      }),
    )
  }

  return {
    name: 'oz-kb-ingest-api',
    enforce: 'pre' as const,
    configureServer(server: { middlewares: { use: (fn: typeof handler) => void } }) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server: { middlewares: { use: (fn: typeof handler) => void } }) {
      server.middlewares.use(handler)
    },
  }
}
