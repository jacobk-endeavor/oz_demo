import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path, { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  loadSchemaRegistry,
  lookupStructuredSchema,
  resolveAndValidateStructuredSchema,
  validateStructuredData,
} from './schemaRegistry'

const cleanupDirs: string[] = []
const THIS_DIR = dirname(fileURLToPath(import.meta.url))

afterEach(async () => {
  for (const dir of cleanupDirs.splice(0, cleanupDirs.length)) {
    await rm(dir, { recursive: true, force: true })
  }
})

describe('schemaRegistry', () => {
  it('loads kb_schemas artifacts from repo root and finds known stems', async () => {
    const repoRoot = path.resolve(THIS_DIR, '../../../..')
    const loaded = await loadSchemaRegistry(repoRoot)
    const names = loaded.map((entry) => entry.schemaName).sort()
    expect(names).toContain('product_catalog.schema.json')
    expect(names).toContain('recommendations.schema.json')
  })

  it('prefers highest version whose applies_when matches payload', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'schema-registry-'))
    cleanupDirs.push(repoRoot)
    const schemaDir = path.join(repoRoot, 'kb_schemas')
    await mkdir(schemaDir, { recursive: true })

    await writeFile(
      path.join(schemaDir, 'product_catalog.schema.json'),
      JSON.stringify({
        type: 'object',
        required: ['schema_version', 'items'],
        properties: {
          schema_version: { const: 1 },
          items: { type: 'array' },
        },
        'x-kb-schema': {
          stem: 'product_catalog',
          version: 1,
        },
      }),
      'utf8',
    )

    await writeFile(
      path.join(schemaDir, 'product_catalog.v2.schema.json'),
      JSON.stringify({
        type: 'object',
        required: ['schema_version', 'items'],
        properties: {
          schema_version: { const: 2 },
          items: { type: 'array' },
        },
        'x-kb-schema': {
          stem: 'product_catalog',
          version: 2,
          applies_when: { equals: { schema_version: 2 } },
        },
      }),
      'utf8',
    )

    const loaded = await loadSchemaRegistry(repoRoot)
    const v2Match = lookupStructuredSchema(loaded, 'product_catalog.json', {
      schema_version: 2,
      items: [],
    })
    expect(v2Match.type).toBe('matched')
    if (v2Match.type !== 'matched') throw new Error('expected match')
    expect(v2Match.entry.version).toBe(2)

    const v1Match = lookupStructuredSchema(loaded, 'product_catalog.json', {
      schema_version: 1,
      items: [],
    })
    expect(v1Match.type).toBe('matched')
    if (v1Match.type !== 'matched') throw new Error('expected match')
    expect(v1Match.entry.version).toBe(1)
  })

  it('returns no_schema when filename stem is unknown', async () => {
    const repoRoot = path.resolve(THIS_DIR, '../../../..')
    const loaded = await loadSchemaRegistry(repoRoot)
    const result = lookupStructuredSchema(loaded, 'missing_source.json', { foo: 'bar' })
    expect(result).toEqual({ type: 'no_schema', reason: 'no_schema' })
  })

  it('validates data and returns friendly validation errors', async () => {
    const repoRoot = path.resolve(THIS_DIR, '../../../..')
    const loaded = await loadSchemaRegistry(repoRoot)
    const match = lookupStructuredSchema(loaded, 'product_catalog.json', {
      schema_version: 1,
      items: [],
    })
    if (match.type !== 'matched') throw new Error('expected product_catalog schema')

    const valid = validateStructuredData(match.entry, {
      schema_version: 1,
      items: [
        {
          sku: 'PGFGD',
          description: 'PALIGHT FLEX GARAGE DOOR TRIM/ WEATHERSTOP',
          product_line_code: 'AT',
          product_line: 'AT',
          sub_category: 'AT-AT-PMoulding',
        },
      ],
    })
    expect(valid).toEqual({ valid: true })

    const invalid = validateStructuredData(match.entry, {
      schema_version: 1,
      items: [{ sku: 'MISSING_REQUIRED_FIELDS' }],
    })
    expect(invalid.valid).toBe(false)
    if (invalid.valid) throw new Error('expected invalid payload')
    expect(invalid.reason).toBe('schema_validation_failed')
    expect(invalid.errors.length).toBeGreaterThan(0)
  })

  it('returns extractor-friendly resolution result', async () => {
    const repoRoot = path.resolve(THIS_DIR, '../../../..')
    const loaded = await loadSchemaRegistry(repoRoot)
    const resolved = resolveAndValidateStructuredSchema(loaded, 'product_catalog.json', {
      schema_version: 1,
      items: [],
    })
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) throw new Error('expected ok result')
    expect(resolved.schema.stem).toBe('product_catalog')

    const missing = resolveAndValidateStructuredSchema(loaded, 'unknown.json', {})
    expect(missing).toEqual({ ok: false, reason: 'no_schema' })
  })
})
