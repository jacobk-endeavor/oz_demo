import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020'
import { type ErrorObject, type ValidateFunction } from 'ajv'

type JsonObject = Record<string, unknown>

export type AppliesWhen = {
  equals?: Record<string, unknown>
}

export type SchemaRegistryMetadata = {
  stem?: string
  version?: number
  applies_when?: AppliesWhen
}

export type LoadedSchema = {
  schemaName: string
  stem: string
  version: number
  schemaPath: string
  renderPath: string
  schema: JsonObject
  appliesWhen: AppliesWhen
  validate: ValidateFunction
}

export type SchemaLookupResult =
  | { type: 'matched'; entry: LoadedSchema }
  | { type: 'no_schema'; reason: 'no_schema' }

export type SchemaValidationResult =
  | { valid: true }
  | { valid: false; reason: 'schema_validation_failed'; errors: string[] }

export type StructuredSchemaResolution =
  | { ok: true; schema: LoadedSchema }
  | { ok: false; reason: 'no_schema' | 'schema_validation_failed'; errors?: string[] }

const SCHEMA_FILENAME = /^(?<stem>[a-z0-9_]+?)(?:\.v(?<version>\d+))?\.schema\.json$/i
const ajv = new Ajv2020({ allErrors: true, strict: false })

function filenameStem(fileName: string): string {
  const base = path.basename(fileName).trim().toLowerCase()
  return base.replace(/\.[^.]+$/, '')
}

function splitPath(pathExpression: string): string[] {
  return pathExpression.split('.').filter((part) => part.trim().length > 0)
}

function deepReadValue(root: unknown, pathExpression: string): unknown {
  const parts = splitPath(pathExpression)
  let cursor: unknown = root
  for (const part of parts) {
    if (cursor == null || typeof cursor !== 'object' || Array.isArray(cursor)) return undefined
    cursor = (cursor as Record<string, unknown>)[part]
  }
  return cursor
}

function appliesWhenMatches(input: unknown, appliesWhen: AppliesWhen): boolean {
  const equalsChecks = appliesWhen.equals ?? {}
  for (const [pathExpression, expected] of Object.entries(equalsChecks)) {
    const actual = deepReadValue(input, pathExpression)
    if (actual !== expected) return false
  }
  return true
}

function parseSchemaMetadata(schema: JsonObject): SchemaRegistryMetadata {
  const raw = schema['x-kb-schema']
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const object = raw as Record<string, unknown>
  const equalsRaw = object.applies_when
  let applies_when: AppliesWhen | undefined
  if (equalsRaw != null && typeof equalsRaw === 'object' && !Array.isArray(equalsRaw)) {
    const maybeEquals = (equalsRaw as Record<string, unknown>).equals
    if (maybeEquals != null && typeof maybeEquals === 'object' && !Array.isArray(maybeEquals)) {
      applies_when = { equals: maybeEquals as Record<string, unknown> }
    }
  }
  return {
    stem: typeof object.stem === 'string' ? object.stem : undefined,
    version: typeof object.version === 'number' ? object.version : undefined,
    applies_when,
  }
}

function normalizeAjvErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (errors == null) return []
  return errors.map((error) => {
    const location = error.instancePath.length > 0 ? error.instancePath : '/'
    return `${location}: ${error.message ?? 'invalid'}`
  })
}

export async function loadSchemaRegistry(repoRoot: string): Promise<LoadedSchema[]> {
  const schemaDir = path.join(repoRoot, 'kb_schemas')
  const files = await readdir(schemaDir)
  const schemaFiles = files.filter((file) => SCHEMA_FILENAME.test(file))
  const loaded: LoadedSchema[] = []

  for (const file of schemaFiles) {
    const fullPath = path.join(schemaDir, file)
    const text = await readFile(fullPath, 'utf8')
    const schema = JSON.parse(text) as JsonObject
    const parsedName = SCHEMA_FILENAME.exec(file)
    if (parsedName?.groups == null) continue

    const parsedStem = parsedName.groups.stem.toLowerCase()
    const parsedVersion = parsedName.groups.version == null ? 1 : Number.parseInt(parsedName.groups.version, 10)
    const metadata = parseSchemaMetadata(schema)
    const stem = (metadata.stem ?? parsedStem).toLowerCase()
    const version = metadata.version ?? parsedVersion
    const renderName = version > 1 ? `${stem}.v${version}.render.py` : `${stem}.render.py`
    const validate = ajv.compile(schema)

    loaded.push({
      schemaName: file,
      stem,
      version,
      schemaPath: fullPath,
      renderPath: path.join(schemaDir, renderName),
      schema,
      appliesWhen: metadata.applies_when ?? {},
      validate,
    })
  }

  return loaded.sort((left, right) => {
    if (left.stem !== right.stem) return left.stem.localeCompare(right.stem)
    return right.version - left.version
  })
}

export function lookupStructuredSchema(
  schemas: LoadedSchema[],
  fileName: string,
  parsedPayload: unknown,
): SchemaLookupResult {
  const stem = filenameStem(fileName)
  const candidates = schemas.filter((entry) => entry.stem === stem)
  for (const candidate of candidates) {
    if (appliesWhenMatches(parsedPayload, candidate.appliesWhen)) {
      return { type: 'matched', entry: candidate }
    }
  }
  return { type: 'no_schema', reason: 'no_schema' }
}

export function validateStructuredData(schema: LoadedSchema, parsedPayload: unknown): SchemaValidationResult {
  const valid = schema.validate(parsedPayload)
  if (valid) return { valid: true }
  return {
    valid: false,
    reason: 'schema_validation_failed',
    errors: normalizeAjvErrors(schema.validate.errors),
  }
}

export function resolveAndValidateStructuredSchema(
  schemas: LoadedSchema[],
  fileName: string,
  parsedPayload: unknown,
): StructuredSchemaResolution {
  const lookup = lookupStructuredSchema(schemas, fileName, parsedPayload)
  if (lookup.type === 'no_schema') {
    return { ok: false, reason: 'no_schema' }
  }
  const validation = validateStructuredData(lookup.entry, parsedPayload)
  if (!validation.valid) {
    return {
      ok: false,
      reason: 'schema_validation_failed',
      errors: validation.errors,
    }
  }
  return { ok: true, schema: lookup.entry }
}
