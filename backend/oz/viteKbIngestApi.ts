/**
 * Dev/preview middleware: upload a file from the Knowledge Base UI, run Track A ingest (pgvector),
 * then the wiki ingest scaffold (markdown under wiki/).
 *
 * Large uploads are streamed to `incoming/kb-ui-raw/` (not held fully in memory) and the file is kept
 * as the canonical raw artifact for reprocessing or audit; ingest reads from that path.
 */
import { execFile, execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')
/** Persistent raw uploads from the KB UI (gitignored); streamed here before ingest. */
const KB_RAW_INCOMING_ROOT = path.join(REPO_ROOT, 'incoming', 'kb-ui-raw')
const KB_INGEST_SCRIPT = path.join(REPO_ROOT, 'calls/kb/scripts/ingest_kb.py')

function maxUploadBytes(): number {
  const raw = String(process.env.OZ_KB_UPLOAD_MAX_BYTES ?? '').trim()
  const n = raw ? Number.parseInt(raw, 10) : NaN
  if (Number.isFinite(n) && n > 0) return n
  return 500 * 1024 * 1024
}

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

/** When true, first ingest pass uses --reembed so kb_extracts + wiki scaffold run even for duplicate SHA. */
function readWikiFullPathHeader(req: IncomingMessage): boolean {
  const raw = req.headers['x-oz-kb-wiki-full']
  if (typeof raw !== 'string') return false
  const t = raw.trim().toLowerCase()
  return t === '1' || t === 'true' || t === 'yes'
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

function dayStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Stream the request body to disk while hashing — avoids buffering multi‑hundred‑MB files in RAM.
 * Uses pause/resume for backpressure with the file sink.
 */
function streamUploadToFile(
  req: IncomingMessage,
  destPath: string,
  maxBytes: number,
): Promise<{ sha256Hex: string; bytesWritten: number }> {
  mkdirSync(path.dirname(destPath), { recursive: true })
  const hash = createHash('sha256')
  let total = 0
  const ws = createWriteStream(destPath, { flags: 'wx' })

  return new Promise((resolve, reject) => {
    const fail = (err: Error) => {
      req.destroy()
      ws.destroy()
      try {
        unlinkSync(destPath)
      } catch {
        /* ignore */
      }
      reject(err)
    }

    const onData = (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      total += buf.length
      if (total > maxBytes) {
        fail(
          new Error(
            `Upload exceeds configured maximum of ${maxBytes} bytes (set OZ_KB_UPLOAD_MAX_BYTES to raise).`,
          ),
        )
        return
      }
      hash.update(buf)
      if (!ws.write(buf)) {
        req.pause()
        ws.once('drain', () => {
          req.resume()
        })
      }
    }

    const onEnd = () => {
      ws.end()
    }

    ws.on('finish', () => {
      req.removeListener('data', onData)
      req.removeListener('end', onEnd)
      resolve({ sha256Hex: hash.digest('hex'), bytesWritten: total })
    })
    ws.on('error', (e) => fail(e instanceof Error ? e : new Error(String(e))))
    req.on('data', onData)
    req.on('end', onEnd)
    req.on('error', (e) => fail(e instanceof Error ? e : new Error(String(e))))
  })
}

/** Turns opaque Python stderr into an actionable next step for developers. */
function hintForIngestFailure(detail: string): string | undefined {
  const d = detail.toLowerCase()
  if (
    d.includes('modulenotfounderror') ||
    d.includes('no module named') ||
    d.includes('missing dependency')
  ) {
    return 'Create the KB ingest venv and install deps: cd calls/kb/scripts && python3 -m venv .venv && .venv/bin/pip install -r requirements-kb-ingest.txt — then restart `npm run dev`.'
  }
  if (d.includes('openai_api_key') || (d.includes('openai') && d.includes('required'))) {
    return 'Set OPENAI_API_KEY in the repo root `.env` (used for text embeddings).'
  }
  if (
    d.includes('missing db config') ||
    d.includes('database_url') ||
    (d.includes('pghost') && d.includes('pguser'))
  ) {
    return 'Set DATABASE_URL (or PGHOST, PGUSER, PGPASSWORD, PGDATABASE) in `.env` for pgvector ingest.'
  }
  return undefined
}

type KbIngestStdoutParse = {
  source_id?: string
  /** Present when ingest_kb skipped work because sha already ingested (no kb_extracts refresh). */
  ingest_state?: 'ingested' | 'unchanged'
}

function parseKbIngestStdout(stdout: string): KbIngestStdoutParse {
  let last: KbIngestStdoutParse = {}
  for (const line of stdout.split('\n')) {
    const t = line.trim()
    if (!t.startsWith('{')) continue
    try {
      const o = JSON.parse(t) as { event?: string; source_id?: string }
      if (typeof o.source_id !== 'string') continue
      if (o.event === 'kb.ingested') {
        return { source_id: o.source_id, ingest_state: 'ingested' }
      }
      if (o.event === 'kb.unchanged') {
        last = { source_id: o.source_id, ingest_state: 'unchanged' }
      }
    } catch {
      /* ignore */
    }
  }
  return last
}

/** Local kb_extracts + wiki; no Postgres or OpenAI (see ingest_kb.py --extract-bundle-only). */
function execKbExtractBundleOnly(params: {
  py: string
  env: NodeJS.ProcessEnv
  rawPath: string
  password?: string
}): Promise<string> {
  const args = [
    KB_INGEST_SCRIPT,
    params.rawPath,
    '--scope',
    'global',
    '--extract-bundle-only',
    '--on-success',
    'emit-event',
    ...(params.password ? ['--password', params.password] : []),
  ]
  return new Promise((resolve, reject) => {
    execFile(
      params.py,
      args,
      {
        cwd: REPO_ROOT,
        env: params.env,
        maxBuffer: 24 * 1024 * 1024,
        timeout: 600_000,
      },
      (err, out, stderr) => {
        if (err) {
          reject(new Error(String(stderr || '') || String(out || '') || (err as Error).message))
          return
        }
        resolve(String(out || ''))
      },
    )
  })
}

function execKbIngest(params: {
  py: string
  env: NodeJS.ProcessEnv
  rawPath: string
  password?: string
  reembed: boolean
}): Promise<string> {
  const args = [
    KB_INGEST_SCRIPT,
    params.rawPath,
    '--scope',
    'global',
    '--on-success',
    'emit-event',
    ...(params.password ? ['--password', params.password] : []),
    ...(params.reembed ? ['--reembed'] : []),
  ]
  return new Promise((resolve, reject) => {
    execFile(
      params.py,
      args,
      {
        cwd: REPO_ROOT,
        env: params.env,
        maxBuffer: 24 * 1024 * 1024,
        timeout: 600_000,
      },
      (err, out, stderr) => {
        if (err) {
          reject(new Error(String(stderr || '') || String(out || '') || (err as Error).message))
          return
        }
        resolve(String(out || ''))
      },
    )
  })
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

    const rawName = req.headers['x-file-name']
    const decoded =
      typeof rawName === 'string' ? decodeURIComponent(rawName.replace(/\+/g, ' ')) : 'upload'
    const safeName = sanitizeBasename(decoded)
    const passwordHeader = req.headers['x-kb-password']
    const password = typeof passwordHeader === 'string' ? passwordHeader : undefined
    const wikiFullPath = readWikiFullPathHeader(req)

    const uploadId = randomUUID()
    const rawPath = path.join(KB_RAW_INCOMING_ROOT, dayStamp(), `${uploadId}_${safeName}`)
    const rawRelative = path.relative(REPO_ROOT, rawPath)

    let sha256Hex: string
    let bytesWritten = 0
    try {
      const streamed = await streamUploadToFile(req, rawPath, maxUploadBytes())
      sha256Hex = streamed.sha256Hex
      bytesWritten = streamed.bytesWritten
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const tooBig = msg.includes('exceeds') || msg.includes('maximum')
      res.statusCode = tooBig ? 413 : 400
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ ok: false, error: msg }))
      return
    }

    const py = resolvePython()
    const env = mergeEnv()

    /** 1) Local kb_extracts + wiki — independent of cloud pgvector / embeddings. */
    let extractStdout = ''
    try {
      extractStdout = await execKbExtractBundleOnly({ py, env, rawPath, password })
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      const hint = hintForIngestFailure(detail)
      res.statusCode = 502
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({
          ok: false,
          error: 'Local kb_extracts failed (--extract-bundle-only)',
          detail,
          ...(hint ? { hint } : {}),
        }),
      )
      return
    }

    const shaFallback12 = sha256Hex.slice(0, 12).toLowerCase()
    let parsedLocal = parseKbIngestStdout(extractStdout)
    let sourceId = (parsedLocal.source_id ?? shaFallback12).toLowerCase()
    let manifestPath = path.join(REPO_ROOT, 'kb_extracts', sourceId, 'manifest.json')

    let wiki: { ok: boolean; detail?: string; skipped?: boolean }
    let wikiCompletedOk = false
    if (existsSync(manifestPath)) {
      wiki = runWikiIngest(REPO_ROOT, sourceId)
      if (wiki.ok) {
        wiki = { ...wiki, skipped: false }
        wikiCompletedOk = true
      }
    } else {
      wiki = {
        ok: true,
        skipped: true,
        detail:
          'Local kb_extracts bundle missing after --extract-bundle-only (wiki scaffold skipped). Check PDF encryption/OCR needs or file type.',
      }
    }

    /** 2) Cloud / remote pgvector ingest (OpenAI + Postgres) — optional failure for wiki. */
    let pgvector: { ok: true } | { ok: false; detail: string } = { ok: true }
    let vectorStdout = ''
    try {
      vectorStdout = await execKbIngest({ py, env, rawPath, password, reembed: wikiFullPath })
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      pgvector = { ok: false, detail }
    }

    if (!wikiFullPath && pgvector.ok && !existsSync(manifestPath)) {
      try {
        vectorStdout = await execKbIngest({ py, env, rawPath, password, reembed: true })
        pgvector = { ok: true }
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e)
        pgvector = { ok: false, detail }
      }
    }

    if (pgvector.ok) {
      const pv = parseKbIngestStdout(vectorStdout)
      if (pv.source_id) sourceId = pv.source_id.toLowerCase()
      manifestPath = path.join(REPO_ROOT, 'kb_extracts', sourceId, 'manifest.json')
      if (existsSync(manifestPath) && !wikiCompletedOk) {
        wiki = runWikiIngest(REPO_ROOT, sourceId)
        if (wiki.ok) wiki = { ...wiki, skipped: false }
      }
    }

    const kbExtractsLocal = existsSync(path.join(REPO_ROOT, 'kb_extracts', sourceId, 'manifest.json'))

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(
      JSON.stringify({
        ok: true,
        source_id: sourceId,
        sha256_12: sourceId,
        sha256: sha256Hex,
        bytes_written: bytesWritten,
        raw_path: rawRelative.replace(/\\/g, '/'),
        wiki,
        pgvector,
        kb_extracts_local: kbExtractsLocal,
        ...(wikiFullPath ? { wiki_full_path: true } : {}),
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
