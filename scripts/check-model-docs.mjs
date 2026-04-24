#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import typescript from 'typescript'

const ts = typescript

const MODELS_FILE = path.join(process.cwd(), 'src/constants/models.ts')
const DEFAULT_TIMEOUT_MS = 20_000
const USER_AGENT = 'pixelvault-model-doc-monitor/1.0'
const DEPRECATION_KEYWORDS = [
  'deprecated',
  'deprecation',
  'deprecations',
  'shut down',
  'sunset',
  'retired',
]

const EXTRA_WATCH_PAGES = [
  {
    id: 'provider:openai:image-guide',
    kind: 'providerDoc',
    label: 'OpenAI image generation guide',
    url: 'https://developers.openai.com/api/docs/guides/image-generation',
  },
  {
    id: 'provider:openai:models',
    kind: 'providerDoc',
    label: 'OpenAI models overview',
    url: 'https://developers.openai.com/api/docs/models',
  },
  {
    id: 'provider:gemini:image-guide',
    kind: 'providerDoc',
    label: 'Gemini image generation guide',
    url: 'https://ai.google.dev/gemini-api/docs/image-generation',
  },
  {
    id: 'provider:gemini:changelog',
    kind: 'providerDoc',
    label: 'Gemini changelog',
    url: 'https://ai.google.dev/gemini-api/docs/changelog',
  },
  {
    id: 'provider:gemini:deprecations',
    kind: 'providerDoc',
    label: 'Gemini deprecations',
    url: 'https://ai.google.dev/gemini-api/docs/deprecations',
  },
  {
    id: 'provider:fal:models',
    kind: 'providerDoc',
    label: 'fal model index',
    url: 'https://fal.ai/models',
  },
  {
    id: 'provider:novelai:image-models',
    kind: 'providerDoc',
    label: 'NovelAI image models',
    url: 'https://docs.novelai.net/en/image/models/',
  },
  {
    id: 'provider:volc:image-api',
    kind: 'providerDoc',
    label: 'VolcEngine image generation API',
    url: 'https://www.volcengine.com/docs/82379/1541523',
  },
  {
    id: 'provider:volc:video-api',
    kind: 'providerDoc',
    label: 'VolcEngine video generation API',
    url: 'https://www.volcengine.com/docs/82379/1520757',
  },
]

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const models = await loadModels(MODELS_FILE)
  const report = await buildReport(models, args)

  if (args.reportJson) {
    await writeJson(args.reportJson, report)
  }

  const markdown = renderMarkdownReport(report)
  if (args.reportMd) {
    await writeText(args.reportMd, markdown)
  }

  const snapshot = buildSnapshot(report)
  if (args.writeCurrentSnapshot) {
    await writeJson(args.writeCurrentSnapshot, snapshot)
  }

  if (args.writeSnapshot) {
    await writeJson(args.writeSnapshot, snapshot)
  }

  if (args.stdoutReport) {
    process.stdout.write(`${markdown}\n`)
  }

  if (
    args.failOnChanges &&
    (report.summary.changeCount > 0 || report.summary.errorCount > 0)
  ) {
    process.exitCode = 1
  }
}

function parseArgs(argv) {
  const args = {
    compareSnapshot: null,
    writeSnapshot: null,
    writeCurrentSnapshot: null,
    reportJson: null,
    reportMd: null,
    failOnChanges: false,
    stdoutReport: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    const next = argv[index + 1]

    if (argument === '--compare-snapshot' && next) {
      args.compareSnapshot = next
      index += 1
      continue
    }

    if (argument === '--write-snapshot' && next) {
      args.writeSnapshot = next
      index += 1
      continue
    }

    if (argument === '--write-current-snapshot' && next) {
      args.writeCurrentSnapshot = next
      index += 1
      continue
    }

    if (argument === '--report-json' && next) {
      args.reportJson = next
      index += 1
      continue
    }

    if (argument === '--report-md' && next) {
      args.reportMd = next
      index += 1
      continue
    }

    if (argument === '--fail-on-changes') {
      args.failOnChanges = true
      continue
    }

    if (argument === '--stdout-report') {
      args.stdoutReport = true
      continue
    }

    throw new Error(`Unknown argument: ${argument}`)
  }

  return args
}

async function buildReport(models, args) {
  const missingOfficialUrl = models.filter((model) => !model.officialUrl)
  const baselineSnapshot = args.compareSnapshot
    ? await readJson(args.compareSnapshot)
    : null
  const watchTargets = buildWatchTargets(models)
  const pageResults = []

  for (const target of watchTargets) {
    pageResults.push(await fetchWatchTarget(target))
  }

  const apiResults = await runOptionalApiChecks()
  const inventorySummary = summarizeInventory(models)
  const inventoryDiff = diffInventory(baselineSnapshot?.models ?? [], models)
  const pageDiff = diffSnapshotItems(
    baselineSnapshot?.pages ?? [],
    pageResults.map((result) => result.snapshotItem),
  )
  const apiDiff = diffSnapshotItems(
    baselineSnapshot?.apis ?? [],
    apiResults
      .filter((result) => result.snapshotItem !== null)
      .map((result) => result.snapshotItem),
  )
  const findings = []

  for (const model of missingOfficialUrl) {
    findings.push({
      severity: 'error',
      scope: 'inventory',
      title: `Model ${model.id} is missing officialUrl`,
      detail:
        'Weekly doc monitoring relies on officialUrl for official source comparison.',
      relatedModels: [model.id],
    })
  }

  for (const result of pageResults) {
    if (!result.ok) {
      findings.push({
        severity: 'error',
        scope: 'docs',
        title: `Failed to fetch ${result.label}`,
        detail: `${result.url} returned HTTP ${result.status}.`,
        relatedModels: result.models,
      })
    }
  }

  for (const result of apiResults) {
    if (result.status === 'error') {
      findings.push({
        severity: 'warn',
        scope: 'api',
        title: `Optional API check failed for ${result.label}`,
        detail: result.detail,
        relatedModels: [],
      })
    }
  }

  for (const change of inventoryDiff.changed) {
    findings.push({
      severity: 'warn',
      scope: 'inventory',
      title: `Snapshot inventory drift for ${change.id}`,
      detail: change.detail,
      relatedModels: [change.id],
    })
  }

  for (const model of models) {
    if (model.externalModelId.includes('preview')) {
      findings.push({
        severity: 'info',
        scope: 'policy',
        title: `Preview model still in catalog: ${model.externalModelId}`,
        detail:
          'Preview model slugs usually have shorter lifecycle and should not be treated as a stable default.',
        relatedModels: [model.id],
      })
    }
  }

  findings.push(
    ...buildDocDrivenGovernanceFindings({
      models,
      pageResults,
      apiResults,
    }),
  )

  const summary = summarizeFindings({
    models,
    inventorySummary,
    findings,
    pageDiff,
    apiDiff,
  })

  return {
    generatedAt: new Date().toISOString(),
    sourceFile: path.relative(process.cwd(), MODELS_FILE).replaceAll('\\', '/'),
    inventory: {
      summary: inventorySummary,
      models,
      missingOfficialUrl: missingOfficialUrl.map((model) => model.id),
      diff: inventoryDiff,
    },
    docs: {
      watchTargets,
      pages: pageResults,
      diff: pageDiff,
    },
    apis: {
      checks: apiResults,
      diff: apiDiff,
    },
    findings,
    summary,
  }
}

function summarizeFindings({ models, inventorySummary, findings, pageDiff, apiDiff }) {
  const severityCounts = countBy(findings, 'severity')

  return {
    totalModels: models.length,
    outputTypeCounts: inventorySummary.byOutputType,
    providerCounts: inventorySummary.byProvider,
    errorCount: severityCounts.error ?? 0,
    warnCount: severityCounts.warn ?? 0,
    infoCount: severityCounts.info ?? 0,
    pageChangeCount:
      pageDiff.added.length + pageDiff.removed.length + pageDiff.changed.length,
    apiChangeCount:
      apiDiff.added.length + apiDiff.removed.length + apiDiff.changed.length,
    changeCount:
      pageDiff.added.length +
      pageDiff.removed.length +
      pageDiff.changed.length +
      apiDiff.added.length +
      apiDiff.removed.length +
      apiDiff.changed.length,
  }
}

function buildSnapshot(report) {
  return {
    generatedAt: report.generatedAt,
    sourceFile: report.sourceFile,
    models: report.inventory.models.map((model) => ({
      id: model.id,
      outputType: model.outputType,
      adapterType: model.adapterType,
      externalModelId: model.externalModelId,
      officialUrl: model.officialUrl ?? null,
    })),
    pages: report.docs.pages.map((result) => result.snapshotItem),
    apis: report.apis.checks
      .filter((result) => result.snapshotItem !== null)
      .map((result) => result.snapshotItem),
  }
}

function buildWatchTargets(models) {
  const byUrl = new Map()

  for (const model of models) {
    if (!model.officialUrl) {
      continue
    }

    const existing = byUrl.get(model.officialUrl)
    if (existing) {
      existing.models.push(model.id)
      continue
    }

    byUrl.set(model.officialUrl, {
      id: `model:${hashText(model.officialUrl).slice(0, 12)}`,
      kind: 'modelDoc',
      label: model.officialUrl,
      url: model.officialUrl,
      models: [model.id],
    })
  }

  return [...byUrl.values(), ...EXTRA_WATCH_PAGES.map((page) => ({ ...page, models: [] }))]
}

async function fetchWatchTarget(target) {
  let response
  let body = ''
  const fetchUrl = getFetchUrl(target.url)

  try {
    response = await fetch(fetchUrl, {
      headers: {
        'user-agent': USER_AGENT,
        'accept-language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    })
    body = await response.text()
  } catch (error) {
    return {
      ...target,
      ok: false,
      status: 0,
      finalUrl: target.url,
      title: null,
      hash: null,
      excerpt: null,
      text: '',
      error: getErrorMessage(error),
      snapshotItem: {
        id: target.id,
        kind: target.kind,
        label: target.label,
        url: target.url,
        models: target.models,
        status: 0,
        finalUrl: target.url,
        title: null,
        hash: null,
      },
    }
  }

  const title = extractTitle(body)
  const normalizedText = normalizeFetchedText(body)

  return {
    ...target,
    ok: response.ok,
    status: response.status,
    finalUrl: response.url,
    title,
    hash: normalizedText ? hashText(normalizedText) : null,
    excerpt: normalizedText.slice(0, 280),
    text: normalizedText,
    error: null,
    snapshotItem: {
      id: target.id,
      kind: target.kind,
      label: target.label,
      url: target.url,
      models: target.models,
      status: response.status,
      finalUrl: response.url,
      title,
      hash: normalizedText ? hashText(normalizedText) : null,
    },
  }
}

async function runOptionalApiChecks() {
  const results = []

  if (process.env.OPENAI_API_KEY) {
    results.push(
      await fetchJsonApiCheck({
        id: 'api:openai:v1-models',
        label: 'OpenAI /v1/models',
        url: 'https://api.openai.com/v1/models',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        selector: (payload) =>
          Array.isArray(payload?.data)
            ? payload.data
                .map((item) => item?.id)
                .filter((value) => typeof value === 'string' && value.startsWith('gpt-image'))
                .sort()
            : [],
      }),
    )
  } else {
    results.push({
      id: 'api:openai:v1-models',
      label: 'OpenAI /v1/models',
      status: 'skipped',
      detail: 'OPENAI_API_KEY is not set.',
      items: [],
      snapshotItem: null,
    })
  }

  if (process.env.GEMINI_API_KEY) {
    results.push(
      await fetchJsonApiCheck({
        id: 'api:gemini:v1beta-models',
        label: 'Gemini v1beta/models',
        url: `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`,
        selector: (payload) =>
          Array.isArray(payload?.models)
            ? payload.models
                .map((item) => item?.name)
                .filter((value) => typeof value === 'string' && value.includes('gemini'))
                .sort()
            : [],
      }),
    )
  } else {
    results.push({
      id: 'api:gemini:v1beta-models',
      label: 'Gemini v1beta/models',
      status: 'skipped',
      detail: 'GEMINI_API_KEY is not set.',
      items: [],
      snapshotItem: null,
    })
  }

  return results
}

async function fetchJsonApiCheck({ id, label, url, headers, selector }) {
  try {
    const response = await fetch(url, {
      headers: {
        ...headers,
        'user-agent': USER_AGENT,
      },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    })
    const payload = await response.json()
    const items = selector(payload)

    return {
      id,
      label,
      status: response.ok ? 'ok' : 'error',
      detail: response.ok
        ? `Fetched ${items.length} relevant model ids.`
        : `HTTP ${response.status}`,
      items,
      snapshotItem: {
        id,
        label,
        url,
        status: response.status,
        hash: hashText(JSON.stringify(items)),
        items,
      },
    }
  } catch (error) {
    return {
      id,
      label,
      status: 'error',
      detail: getErrorMessage(error),
      items: [],
      snapshotItem: null,
    }
  }
}

function buildDocDrivenGovernanceFindings({ models, pageResults, apiResults }) {
  const findings = []
  const byId = new Map(pageResults.map((result) => [result.id, result]))
  const openaiGuide = byId.get('provider:openai:image-guide')
  const geminiGuide = byId.get('provider:gemini:image-guide')
  const geminiChangelog = byId.get('provider:gemini:changelog')
  const geminiDeprecations = byId.get('provider:gemini:deprecations')
  const openaiModelsApi = apiResults.find(
    (result) => result.id === 'api:openai:v1-models' && result.status === 'ok',
  )

  if (
    openaiGuide?.text.includes('gpt-image-2') &&
    !models.some((model) => model.externalModelId === 'gpt-image-2')
  ) {
    findings.push({
      severity: 'warn',
      scope: 'docs',
      title: 'OpenAI image guide now documents gpt-image-2',
      detail:
        'The official image generation guide mentions gpt-image-2, but the current repo catalog does not expose that model.',
      relatedModels: ['gpt-image-1.5'],
    })
  }

  if (
    geminiGuide?.text.includes('gemini-2.5-flash-image') &&
    models.some(
      (model) =>
        model.id === 'gemini-2.5-flash-image' &&
        model.externalModelId !== 'gemini-2.5-flash-image',
    )
  ) {
    findings.push({
      severity: 'error',
      scope: 'docs',
      title: 'Gemini 2.5 image slug is not aligned with the official stable slug',
      detail:
        'Gemini image docs currently expose gemini-2.5-flash-image as the stable model slug.',
      relatedModels: ['gemini-2.5-flash-image'],
    })
  }

  for (const source of [geminiChangelog, geminiDeprecations]) {
    if (!source?.text) {
      continue
    }

    for (const model of models.filter(
      (item) => item.adapterType === 'GEMINI' && item.externalModelId.includes('preview'),
    )) {
      const context = findKeywordContext(
        source.text,
        model.externalModelId,
        DEPRECATION_KEYWORDS,
      )

      if (!context) {
        continue
      }

      findings.push({
        severity: 'warn',
        scope: 'docs',
        title: `Gemini docs mention lifecycle risk for ${model.externalModelId}`,
        detail: `${source.label} contains ${model.externalModelId} near deprecation-related language.`,
        relatedModels: [model.id],
      })
    }
  }

  if (
    openaiModelsApi?.items.length &&
    !openaiModelsApi.items.includes('gpt-image-1.5') &&
    models.some((model) => model.externalModelId === 'gpt-image-1.5')
  ) {
    findings.push({
      severity: 'warn',
      scope: 'api',
      title: 'OpenAI model list no longer returns gpt-image-1.5',
      detail:
        'The authenticated OpenAI models API did not list gpt-image-1.5 in the current response.',
      relatedModels: ['gpt-image-1.5'],
    })
  }

  return findings
}

function diffInventory(previousModels, currentModels) {
  const previousById = new Map(previousModels.map((model) => [model.id, model]))
  const changed = []

  for (const model of currentModels) {
    const previous = previousById.get(model.id)
    if (!previous) {
      continue
    }

    const relevantCurrent = {
      externalModelId: model.externalModelId,
      officialUrl: model.officialUrl ?? null,
      outputType: model.outputType,
      adapterType: model.adapterType,
    }
    const relevantPrevious = {
      externalModelId: previous.externalModelId,
      officialUrl: previous.officialUrl ?? null,
      outputType: previous.outputType,
      adapterType: previous.adapterType,
    }

    if (JSON.stringify(relevantCurrent) !== JSON.stringify(relevantPrevious)) {
      changed.push({
        id: model.id,
        detail: `Snapshot has ${JSON.stringify(relevantPrevious)}, current catalog has ${JSON.stringify(relevantCurrent)}.`,
      })
    }
  }

  return { changed }
}

function diffSnapshotItems(previousItems, currentItems) {
  const previousById = new Map(previousItems.map((item) => [item.id, item]))
  const currentById = new Map(currentItems.map((item) => [item.id, item]))
  const added = []
  const removed = []
  const changed = []

  for (const [id, item] of currentById) {
    if (!previousById.has(id)) {
      added.push(item)
      continue
    }

    if (JSON.stringify(item) !== JSON.stringify(previousById.get(id))) {
      changed.push({
        id,
        previous: previousById.get(id),
        current: item,
      })
    }
  }

  for (const [id, item] of previousById) {
    if (!currentById.has(id)) {
      removed.push(item)
    }
  }

  return { added, removed, changed }
}

async function loadModels(filePath) {
  const source = await fs.readFile(filePath, 'utf8')
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const enumValues = new Map()

  for (const statement of sourceFile.statements) {
    if (!ts.isEnumDeclaration(statement) || statement.name.text !== 'AI_MODELS') {
      continue
    }

    for (const member of statement.members) {
      if (!ts.isIdentifier(member.name) || !member.initializer) {
        continue
      }

      const value = resolveExpression(member.initializer, enumValues)
      if (typeof value === 'string') {
        enumValues.set(member.name.text, value)
      }
    }
  }

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue
    }

    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        declaration.name.text !== 'MODEL_OPTIONS' ||
        !declaration.initializer ||
        !ts.isArrayLiteralExpression(declaration.initializer)
      ) {
        continue
      }

      const models = []

      for (const element of declaration.initializer.elements) {
        if (!ts.isObjectLiteralExpression(element)) {
          continue
        }

        const model = extractModelOption(element, enumValues)
        if (model && model.available) {
          models.push(model)
        }
      }

      return models
    }
  }

  throw new Error('Unable to locate MODEL_OPTIONS in src/constants/models.ts')
}

function extractModelOption(node, enumValues) {
  const properties = new Map()

  for (const property of node.properties) {
    if (
      !ts.isPropertyAssignment(property) ||
      !ts.isIdentifier(property.name)
    ) {
      continue
    }

    properties.set(property.name.text, property.initializer)
  }

  const idExpression = properties.get('id')
  const externalExpression = properties.get('externalModelId')
  const outputTypeExpression = properties.get('outputType')
  const availableExpression = properties.get('available')
  const officialUrlExpression = properties.get('officialUrl')
  const adapterExpression = properties.get('adapterType')

  const id = resolveExpression(idExpression, enumValues)
  const externalModelId = resolveExpression(externalExpression, enumValues)
  const outputType = resolveExpression(outputTypeExpression, enumValues)
  const available = resolveExpression(availableExpression, enumValues)
  const officialUrl = resolveExpression(officialUrlExpression, enumValues)
  const adapterType = resolveExpression(adapterExpression, enumValues)

  if (
    typeof id !== 'string' ||
    typeof externalModelId !== 'string' ||
    typeof outputType !== 'string' ||
    typeof available !== 'boolean' ||
    typeof adapterType !== 'string'
  ) {
    return null
  }

  return {
    id,
    externalModelId,
    outputType,
    available,
    officialUrl: typeof officialUrl === 'string' ? officialUrl : null,
    adapterType,
  }
}

function resolveExpression(expression, enumValues) {
  if (!expression) {
    return null
  }

  if (ts.isStringLiteralLike(expression)) {
    return expression.text
  }

  if (ts.isNumericLiteral(expression)) {
    return Number(expression.text)
  }

  if (expression.kind === ts.SyntaxKind.TrueKeyword) {
    return true
  }

  if (expression.kind === ts.SyntaxKind.FalseKeyword) {
    return false
  }

  if (ts.isPropertyAccessExpression(expression)) {
    if (
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === 'AI_MODELS'
    ) {
      return enumValues.get(expression.name.text) ?? null
    }

    if (
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === 'AI_ADAPTER_TYPES'
    ) {
      return expression.name.text
    }
  }

  return null
}

function summarizeInventory(models) {
  const byOutputType = countBy(models, 'outputType')
  const byProvider = countBy(models, 'adapterType')

  return {
    byOutputType,
    byProvider,
  }
}

function countBy(items, key) {
  const counts = {}

  for (const item of items) {
    const value = item[key]
    counts[value] = (counts[value] ?? 0) + 1
  }

  return counts
}

function extractTitle(html) {
  const match = html.match(/<title>([^<]+)<\/title>/i)
  return match ? decodeHtmlEntities(match[1].trim()) : null
}

function normalizeFetchedText(input) {
  if (!input) {
    return ''
  }

  const withoutScripts = input
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, ' ')
  const decoded = decodeHtmlEntities(withoutTags)

  return decoded.replace(/\s+/g, ' ').trim().toLowerCase()
}

function getFetchUrl(rawUrl) {
  const url = new URL(rawUrl)

  if (url.hostname === 'ai.google.dev') {
    url.searchParams.set('hl', 'en')
  }

  if (url.hostname === 'www.volcengine.com') {
    url.searchParams.set('lang', 'zh')
  }

  return url.toString()
}

function decodeHtmlEntities(text) {
  return text
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
}

function findKeywordContext(text, needle, keywords) {
  const lowerNeedle = needle.toLowerCase()
  let cursor = 0

  while (cursor >= 0) {
    const index = text.indexOf(lowerNeedle, cursor)
    if (index === -1) {
      return null
    }

    const windowStart = Math.max(0, index - 240)
    const windowEnd = Math.min(text.length, index + lowerNeedle.length + 240)
    const windowText = text.slice(windowStart, windowEnd)

    if (keywords.some((keyword) => windowText.includes(keyword))) {
      return windowText
    }

    cursor = index + lowerNeedle.length
  }

  return null
}

function hashText(text) {
  return crypto.createHash('sha256').update(text).digest('hex')
}

async function readJson(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    return JSON.parse(content)
  } catch (error) {
    if (isMissingFileError(error)) {
      return null
    }

    throw error
  }
}

async function writeJson(filePath, value) {
  await ensureParentDirectory(filePath)
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function writeText(filePath, value) {
  await ensureParentDirectory(filePath)
  await fs.writeFile(filePath, value, 'utf8')
}

async function ensureParentDirectory(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

function renderMarkdownReport(report) {
  const lines = []
  const { summary } = report

  lines.push('# Model Doc Monitor Report')
  lines.push('')
  lines.push(`Generated: ${report.generatedAt}`)
  lines.push(`Source file: \`${report.sourceFile}\``)
  lines.push('')
  lines.push('## Inventory')
  lines.push('')
  lines.push(
    `- Total models: ${summary.totalModels} (${renderCounts(summary.outputTypeCounts)})`,
  )
  lines.push(`- Providers: ${renderCounts(summary.providerCounts)}`)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push(`- Errors: ${summary.errorCount}`)
  lines.push(`- Warnings: ${summary.warnCount}`)
  lines.push(`- Info: ${summary.infoCount}`)
  lines.push(`- Doc snapshot changes: ${summary.pageChangeCount}`)
  lines.push(`- API snapshot changes: ${summary.apiChangeCount}`)
  lines.push('')
  lines.push('## Findings')
  lines.push('')

  if (report.findings.length === 0) {
    lines.push('- No findings.')
  } else {
    for (const finding of report.findings) {
      lines.push(
        `- [${finding.severity}] ${finding.title} — ${finding.detail}${
          finding.relatedModels.length
            ? ` (models: ${finding.relatedModels.join(', ')})`
            : ''
        }`,
      )
    }
  }

  lines.push('')
  lines.push('## Snapshot Diffs')
  lines.push('')
  appendDiffSection(lines, 'Doc pages', report.docs.diff)
  appendDiffSection(lines, 'API checks', report.apis.diff)

  lines.push('')
  lines.push('## Optional API Checks')
  lines.push('')

  for (const check of report.apis.checks) {
    lines.push(`- ${check.label}: ${check.status} — ${check.detail}`)
  }

  return `${lines.join('\n')}\n`
}

function appendDiffSection(lines, label, diff) {
  lines.push(`### ${label}`)
  lines.push('')

  if (
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.changed.length === 0
  ) {
    lines.push('- No snapshot changes.')
    lines.push('')
    return
  }

  for (const item of diff.added) {
    lines.push(`- Added: ${item.label} (${item.url ?? item.id})`)
  }

  for (const item of diff.removed) {
    lines.push(`- Removed: ${item.label} (${item.url ?? item.id})`)
  }

  for (const item of diff.changed) {
    lines.push(`- Changed: ${item.current.label} (${item.current.url ?? item.id})`)
  }

  lines.push('')
}

function renderCounts(counts) {
  return Object.entries(counts)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ')
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function isMissingFileError(error) {
  return (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'ENOENT'
  )
}

main().catch((error) => {
  console.error(getErrorMessage(error))
  process.exit(1)
})
