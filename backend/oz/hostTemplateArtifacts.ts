/**
 * Host-mode rendering for typed artifacts (sandboxTemplates/*.py) + Spaces + oz_artifacts.
 * Phase 2 entry before sandbox-routed make_* (Oz-Demo-1xm).
 */
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { rm, readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { getOzArtifactsDb, insertOzArtifactRow } from './artifactRegistry'
import {
  formatArtifactObjectKey,
  resolveSignedUrlTtlSeconds,
  tryCreateSpacesArtifactClientFromEnv,
} from './artifactStorage'

const execFileAsync = promisify(execFile)

export type ArtifactPipelineDeps = {
  repoRoot: string
  tenant: string
  readEnv: () => Record<string, string>
}

export type TypedArtifactOk = {
  ok: true
  id: string
  kind: 'xlsx' | 'docx' | 'pdf'
  title: string
  size_bytes: number
  signed_url?: string
}

export type TypedArtifactErr = {
  ok: false
  error: string
  stderr?: string
}

export type TypedArtifactResult = TypedArtifactOk | TypedArtifactErr

function resolvePythonBinary(): string {
  const fromEnv = String(process.env.OZ_PYTHON ?? '').trim()
  if (fromEnv) return fromEnv
  return process.platform === 'win32' ? 'python' : 'python3'
}

function pythonModuleEnv(repoRoot: string): NodeJS.ProcessEnv {
  const ozPyRoot = path.join(repoRoot, 'backend', 'oz')
  const prev = process.env.PYTHONPATH
  const merged = prev && prev.length ? `${ozPyRoot}${path.delimiter}${prev}` : ozPyRoot
  return { ...process.env, PYTHONPATH: merged }
}

type TemplateModule = 'sandboxTemplates.spreadsheet' | 'sandboxTemplates.report_docx' | 'sandboxTemplates.report_pdf'

async function runTemplateCli(
  repoRoot: string,
  moduleName: TemplateModule,
  payload: unknown,
  outputExt: 'xlsx' | 'docx' | 'pdf',
): Promise<{ ok: true; bytes: Buffer } | { ok: false; stderr: string }> {
  const tmp = await mkdtemp(path.join(tmpdir(), 'oz-make-'))
  const inputPath = path.join(tmp, 'payload.json')
  const outputPath = path.join(tmp, `out.${outputExt}`)
  try {
    await writeFile(inputPath, JSON.stringify(payload), 'utf8')
    const py = resolvePythonBinary()
    try {
      await execFileAsync(
        py,
        ['-m', moduleName, '-i', inputPath, '-o', outputPath],
        {
          env: pythonModuleEnv(repoRoot),
          maxBuffer: 32 * 1024 * 1024,
        },
      )
    } catch (err: unknown) {
      const e = err as { stderr?: Buffer | string; message?: string }
      const stderr =
        typeof e.stderr === 'string'
          ? e.stderr
          : Buffer.isBuffer(e.stderr)
            ? e.stderr.toString('utf8')
            : ''
      return { ok: false, stderr: stderr || e.message || String(err) }
    }
    const bytes = await readFile(outputPath)
    return { ok: true, bytes }
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
}

async function registerArtifactBytes(
  deps: ArtifactPipelineDeps,
  params: {
    bytes: Buffer
    kind: 'xlsx' | 'docx' | 'pdf'
    title: string
    ext: string
    contentType: string
  },
): Promise<TypedArtifactOk | TypedArtifactErr> {
  const db = getOzArtifactsDb(deps.readEnv)
  const ttl = await resolveSignedUrlTtlSeconds(deps.repoRoot)
  const spaces = tryCreateSpacesArtifactClientFromEnv({ signedUrlTtlSeconds: ttl })
  if (!db || !spaces) {
    return { ok: false, error: 'artifact_storage_unconfigured' }
  }
  const id = randomUUID()
  const sha256 = createHash('sha256').update(params.bytes).digest('hex')
  const key = formatArtifactObjectKey({ tenant: deps.tenant, artId: id, ext: params.ext })
  await spaces.putObject({
    key,
    body: params.bytes,
    contentType: params.contentType,
  })
  await insertOzArtifactRow(db, {
    id,
    tenant: deps.tenant,
    kind: params.kind,
    title: params.title,
    key,
    sha256,
    bytes: params.bytes.length,
    ttlAt: null,
  })
  let signed_url: string | undefined
  try {
    signed_url = await spaces.presignGetObject(key)
  } catch {
    /* presign optional */
  }
  return {
    ok: true,
    id,
    kind: params.kind,
    title: params.title,
    size_bytes: params.bytes.length,
    ...(signed_url ? { signed_url } : {}),
  }
}

function trimTitle(raw: string, fallback: string): string {
  const t = String(raw ?? '').trim()
  const base = t.length ? t.slice(0, 200) : fallback
  return base.length ? base : fallback
}

export function validateSpreadsheetPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return 'payload must be an object'
  const p = payload as Record<string, unknown>
  const sheets = p.sheets
  const title = typeof p.title === 'string' ? p.title.trim() : ''
  const notes = typeof p.notes === 'string' ? p.notes.trim() : ''
  if (!Array.isArray(sheets)) return 'sheets must be an array'
  if (sheets.length === 0 && !title && !notes) {
    return 'provide at least one sheet and/or title or notes (cover-only workbook)'
  }
  for (const sh of sheets) {
    if (!sh || typeof sh !== 'object') return 'each sheet must be an object'
    const row = sh as Record<string, unknown>
    if (!Array.isArray(row.columns)) return 'each sheet needs columns[]'
    if (!Array.isArray(row.rows)) return 'each sheet needs rows[]'
  }
  return null
}

export function validateSectionsPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return 'payload must be an object'
  const p = payload as Record<string, unknown>
  if (!('sections' in p)) return 'payload must include sections'
  if (!Array.isArray(p.sections)) return 'sections must be an array'
  return null
}

export async function makeSpreadsheetArtifact(
  deps: ArtifactPipelineDeps,
  payload: unknown,
): Promise<TypedArtifactResult> {
  const verr = validateSpreadsheetPayload(payload)
  if (verr) return { ok: false, error: verr }
  const title = trimTitle(
    typeof (payload as Record<string, unknown>).title === 'string'
      ? ((payload as Record<string, unknown>).title as string)
      : '',
    'Spreadsheet',
  )
  const rendered = await runTemplateCli(deps.repoRoot, 'sandboxTemplates.spreadsheet', payload, 'xlsx')
  if (!rendered.ok) return { ok: false, error: 'render_failed', stderr: rendered.stderr }
  return registerArtifactBytes(deps, {
    bytes: rendered.bytes,
    kind: 'xlsx',
    title,
    ext: 'xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export async function makeDocxArtifact(deps: ArtifactPipelineDeps, payload: unknown): Promise<TypedArtifactResult> {
  const verr = validateSectionsPayload(payload)
  if (verr) return { ok: false, error: verr }
  const title = trimTitle(
    typeof (payload as Record<string, unknown>).title === 'string'
      ? ((payload as Record<string, unknown>).title as string)
      : '',
    'Document',
  )
  const rendered = await runTemplateCli(deps.repoRoot, 'sandboxTemplates.report_docx', payload, 'docx')
  if (!rendered.ok) return { ok: false, error: 'render_failed', stderr: rendered.stderr }
  return registerArtifactBytes(deps, {
    bytes: rendered.bytes,
    kind: 'docx',
    title,
    ext: 'docx',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}

export async function makePdfArtifact(deps: ArtifactPipelineDeps, payload: unknown): Promise<TypedArtifactResult> {
  const verr = validateSectionsPayload(payload)
  if (verr) return { ok: false, error: verr }
  const title = trimTitle(
    typeof (payload as Record<string, unknown>).title === 'string'
      ? ((payload as Record<string, unknown>).title as string)
      : '',
    'Report',
  )
  const rendered = await runTemplateCli(deps.repoRoot, 'sandboxTemplates.report_pdf', payload, 'pdf')
  if (!rendered.ok) return { ok: false, error: 'render_failed', stderr: rendered.stderr }
  return registerArtifactBytes(deps, {
    bytes: rendered.bytes,
    kind: 'pdf',
    title,
    ext: 'pdf',
    contentType: 'application/pdf',
  })
}
