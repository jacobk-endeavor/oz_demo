/**
 * Loader for config/oz.yaml. Tiny hand-rolled parser — no `yaml` / `js-yaml`
 * dependency since the config schema is small and stable. Defaults preserve
 * pre-config behavior (chat.runtime = 'scaffold').
 */
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

export type OzChatRuntimeKind = 'scaffold' | 'agentic'
export type OzChatAgenticProvider = 'auto' | 'openai' | 'anthropic'

export type OzConfig = {
  chat: {
    runtime: OzChatRuntimeKind
    agentic?: {
      provider?: OzChatAgenticProvider
      /** Provider-specific model override; ignored when not applicable to the chosen provider. */
      model?: string
    }
  }
}

const DEFAULT_CONFIG: OzConfig = {
  chat: {
    runtime: 'scaffold',
    agentic: { provider: 'auto' },
  },
}

const CONFIG_REL_PATH = path.join('config', 'oz.yaml')

/** Strip the inline `# comment` tail from a YAML line, respecting nothing fancier than that. */
function stripInlineComment(line: string): string {
  const idx = line.indexOf('#')
  return idx === -1 ? line : line.slice(0, idx)
}

function leadingIndent(line: string): number {
  let i = 0
  while (i < line.length && line[i] === ' ') i += 1
  return i
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

type ParsedNode = { value?: string; children: Map<string, ParsedNode> }

function parseSimpleYaml(text: string): ParsedNode {
  const root: ParsedNode = { children: new Map() }
  const stack: Array<{ indent: number; node: ParsedNode }> = [{ indent: -1, node: root }]
  for (const raw of text.split('\n')) {
    const stripped = stripInlineComment(raw)
    if (!stripped.trim()) continue
    const indent = leadingIndent(stripped)
    const trimmed = stripped.trim()
    const colonIdx = trimmed.indexOf(':')
    if (colonIdx === -1) continue
    const key = trimmed.slice(0, colonIdx).trim()
    const valuePart = trimmed.slice(colonIdx + 1)
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop()
    const parent = stack[stack.length - 1].node
    const child: ParsedNode = { children: new Map() }
    const v = valuePart.trim()
    if (v.length > 0) child.value = unquote(v)
    parent.children.set(key, child)
    stack.push({ indent, node: child })
  }
  return root
}

function getValue(root: ParsedNode, dottedPath: string): string | undefined {
  const segments = dottedPath.split('.')
  let node: ParsedNode | undefined = root
  for (const seg of segments) {
    if (!node) return undefined
    node = node.children.get(seg)
  }
  return node?.value
}

export function parseOzConfigYaml(text: string): OzConfig {
  const root = parseSimpleYaml(text)
  const runtimeRaw = (getValue(root, 'chat.runtime') ?? '').toLowerCase()
  const runtime: OzChatRuntimeKind = runtimeRaw === 'agentic' ? 'agentic' : 'scaffold'
  const providerRaw = (getValue(root, 'chat.agentic.provider') ?? '').toLowerCase()
  const provider: OzChatAgenticProvider =
    providerRaw === 'openai' || providerRaw === 'anthropic' || providerRaw === 'auto' ? providerRaw : 'auto'
  const model = getValue(root, 'chat.agentic.model')
  const agentic: NonNullable<OzConfig['chat']['agentic']> = { provider }
  if (model) agentic.model = model
  return { chat: { runtime, agentic } }
}

let cached: { mtimeMs: number; config: OzConfig } | null = null

/**
 * Load config/oz.yaml. Caches by mtime so unchanged files don't re-parse, but
 * an edit (without restart) is picked up on the next call. Falls back to the
 * default config on any read/parse error so the chat path never breaks because
 * of a malformed config.
 */
export async function loadOzConfig(repoRoot: string): Promise<OzConfig> {
  const configPath = path.join(repoRoot, CONFIG_REL_PATH)
  try {
    const info = await stat(configPath)
    if (cached && cached.mtimeMs === info.mtimeMs) return cached.config
    const text = await readFile(configPath, 'utf8')
    const config = parseOzConfigYaml(text)
    cached = { mtimeMs: info.mtimeMs, config }
    return config
  } catch {
    return DEFAULT_CONFIG
  }
}

export const OZ_CONFIG_DEFAULTS = DEFAULT_CONFIG
