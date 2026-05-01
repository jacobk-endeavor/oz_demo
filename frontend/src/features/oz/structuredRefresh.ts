import type { ExtractManifest, ExtractManifestUnit } from './extractArtifact'
import { buildKbRefreshedEvent, type KbRefreshedEvent } from './kbEvents'

export type StructuredUnitDiff = {
  added: ExtractManifestUnit[]
  modified: Array<{ before: ExtractManifestUnit; after: ExtractManifestUnit }>
  removed: ExtractManifestUnit[]
}

function unitKey(unit: ExtractManifestUnit): string {
  return unit.locator
}

function asMap(units: ExtractManifestUnit[]): Map<string, ExtractManifestUnit> {
  const map = new Map<string, ExtractManifestUnit>()
  for (const unit of units) {
    map.set(unitKey(unit), unit)
  }
  return map
}

export function diffStructuredManifestUnits(previous: ExtractManifest, next: ExtractManifest): StructuredUnitDiff {
  const previousByKey = asMap(previous.units)
  const nextByKey = asMap(next.units)
  const added: ExtractManifestUnit[] = []
  const modified: Array<{ before: ExtractManifestUnit; after: ExtractManifestUnit }> = []
  const removed: ExtractManifestUnit[] = []

  for (const [key, oldUnit] of previousByKey) {
    const newUnit = nextByKey.get(key)
    if (newUnit == null) {
      removed.push(oldUnit)
      continue
    }
    if (oldUnit.content_hash !== newUnit.content_hash) {
      modified.push({ before: oldUnit, after: newUnit })
    }
  }
  for (const [key, newUnit] of nextByKey) {
    if (!previousByKey.has(key)) added.push(newUnit)
  }

  return { added, modified, removed }
}

export function buildStructuredRefreshEvent(input: {
  previous: ExtractManifest
  next: ExtractManifest
  replay?: boolean
}): { diff: StructuredUnitDiff; event: KbRefreshedEvent } {
  const diff = diffStructuredManifestUnits(input.previous, input.next)
  const event = buildKbRefreshedEvent({
    source_id: input.next.source_id,
    replay: input.replay,
    summary: {
      added: diff.added.length,
      modified: diff.modified.length,
      removed: diff.removed.length,
    },
  })
  return { diff, event }
}
