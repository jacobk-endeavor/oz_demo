#!/usr/bin/env node

import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const repoRoot = process.cwd()
const frontendSrcDir = path.join(repoRoot, 'frontend', 'src')
const ozFeatureDir = path.join(frontendSrcDir, 'features', 'oz')

const codeExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const directModelAllowlist = new Set([normalizePath('frontend/src/services/ozOpenAi.ts')])

const violations = []

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/')
}

async function walkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) return walkFiles(fullPath)
      if (!entry.isFile()) return []
      return [fullPath]
    }),
  )
  return nested.flat()
}

function isCodeFile(filePath) {
  return codeExtensions.has(path.extname(filePath))
}

function isTestFile(relativePath) {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(relativePath)
}

function pushViolation(kind, relativePath, detail) {
  violations.push({ kind, file: relativePath, detail })
}

function checkForbiddenDirectModelCalls(relativePath, content) {
  if (directModelAllowlist.has(relativePath)) return

  const forbiddenPatterns = [
    { pattern: /https:\/\/api\.(openai|anthropic)\.com/i, reason: 'direct provider HTTPS endpoint' },
    { pattern: /\/v1\/chat\/completions/i, reason: 'direct model completions endpoint literal' },
    { pattern: /\bnew\s+OpenAI\s*\(/, reason: 'direct OpenAI SDK client construction' },
    { pattern: /from\s+['"]openai['"]/, reason: 'direct OpenAI SDK import' },
    { pattern: /from\s+['"]@anthropic-ai\/sdk['"]/, reason: 'direct Anthropic SDK import' },
    {
      pattern: /Authorization\s*:\s*`Bearer\s*\$\{[^}]*?(OPENAI|ANTHROPIC|API_KEY)/i,
      reason: 'manual provider auth header in frontend',
    },
  ]

  for (const rule of forbiddenPatterns) {
    if (rule.pattern.test(content)) {
      pushViolation(
        'forbidden-frontend-model-call',
        relativePath,
        `Matched ${rule.reason}. Route through backend/runtime transport instead.`,
      )
    }
  }
}

function checkOzFrontendBoundary(relativePath, content) {
  if (!relativePath.startsWith('frontend/src/features/oz/')) return
  if (isTestFile(relativePath)) return

  if (/(from\s+['"](?:\.\.\/)+backend\/|import\(\s*['"](?:\.\.\/)+backend\/)/.test(content)) {
    pushViolation(
      'frontend-backend-boundary',
      relativePath,
      'Frontend Oz production code must not import backend runtime modules directly.',
    )
  }

  const legacyEndpoints = ['/api/oz/openai', '/api/oz/rag-calls']
  for (const endpoint of legacyEndpoints) {
    if (content.includes(endpoint)) {
      pushViolation(
        'legacy-transport-in-oz-feature',
        relativePath,
        `Found ${endpoint}. Non-hardcoded Oz chat must flow through /api/oz/chat.`,
      )
    }
  }
}

async function checkUnifiedPathContract() {
  const frontendClientPath = path.join(ozFeatureDir, 'ozChatClient.ts')
  const backendApiPath = path.join(repoRoot, 'backend', 'oz', 'viteOzChatApi.ts')

  const [frontendClient, backendApi] = await Promise.all([
    fs.readFile(frontendClientPath, 'utf8'),
    fs.readFile(backendApiPath, 'utf8'),
  ])

  if (!frontendClient.includes("const OZ_CHAT_PATH = '/api/oz/chat'")) {
    pushViolation(
      'canonical-path-regression',
      normalizePath(path.relative(repoRoot, frontendClientPath)),
      'Expected OZ_CHAT_PATH to remain /api/oz/chat in the canonical frontend chat client.',
    )
  }

  if (frontendClient.includes("'/api/chat'") || frontendClient.includes('"/api/chat"')) {
    pushViolation(
      'cross-app-transport-regression',
      normalizePath(path.relative(repoRoot, frontendClientPath)),
      'Frontend Oz chat client must not call Sauron /api/chat transport.',
    )
  }

  if (!backendApi.includes("const OZ_CHAT_PATH = '/api/oz/chat'")) {
    pushViolation(
      'canonical-path-regression',
      normalizePath(path.relative(repoRoot, backendApiPath)),
      'Expected backend Oz chat API plugin to expose /api/oz/chat.',
    )
  }
}

async function run() {
  const allFiles = (await walkFiles(frontendSrcDir)).filter(isCodeFile)

  for (const fullPath of allFiles) {
    const relativePath = normalizePath(path.relative(repoRoot, fullPath))
    const content = await fs.readFile(fullPath, 'utf8')
    checkForbiddenDirectModelCalls(relativePath, content)
    checkOzFrontendBoundary(relativePath, content)
  }

  await checkUnifiedPathContract()

  if (violations.length === 0) {
    console.log('Architecture guardrails passed.')
    process.exit(0)
  }

  console.error('Architecture guardrails failed:\n')
  for (const violation of violations) {
    console.error(`- [${violation.kind}] ${violation.file}`)
    console.error(`  ${violation.detail}`)
  }
  console.error('\nSee docs/oz-demo/ci-guardrails.md for remediation guidance.')
  process.exit(1)
}

run().catch((error) => {
  console.error('Architecture guardrail runner crashed.')
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
