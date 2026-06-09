import 'server-only'

import {
  MODEL_KEYWORD_LORA_FETCH_TIMEOUT_MS,
  MODEL_KEYWORD_LORA_KEYWORD_RAW_URL,
  MODEL_KEYWORD_LORA_RESULT_LIMIT,
} from '@/constants/lora'
import { cleanTriggerToken } from '@/lib/lora-trigger-clean'
import { normalizePromptTagSearchText } from '@/lib/prompt-tag-search'
import { withRetry } from '@/lib/with-retry'
import type { PromptTagDefinition } from '@/types/prompt-tags'

const MODEL_KEYWORD_CACHE_TTL_MS = 24 * 60 * 60 * 1000

interface ModelKeywordEntry {
  hash: string
  keywords: string[]
  polarity: 'positive' | 'negative'
  filename?: string
}

interface ModelKeywordCache {
  fetchedAt: number
  entries: ModelKeywordEntry[]
}

let cache: ModelKeywordCache | null = null
let inflight: Promise<ModelKeywordEntry[]> | null = null

class ModelKeywordFetchError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ModelKeywordFetchError'
    this.status = status
  }
}

function splitModelKeywordLine(line: string): ModelKeywordEntry | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null

  const firstComma = trimmed.indexOf(',')
  if (firstComma <= 0) return null

  const hash = trimmed.slice(0, firstComma).trim().toLowerCase()
  if (!/^[0-9a-f]{6,16}$/.test(hash)) return null

  const rest = trimmed.slice(firstComma + 1).trim()
  if (!rest) return null

  const parts = rest.split(',')
  const rawKeywords = parts[0]?.trim() ?? ''
  const polarity = /^negative\s*:/i.test(rawKeywords) ? 'negative' : 'positive'
  const filename = parts.slice(1).join(',').trim()

  const seen = new Set<string>()
  const keywords: string[] = []
  for (const rawKeyword of rawKeywords.split('|')) {
    const keyword = cleanTriggerToken(rawKeyword.replace(/^negative\s*:/i, ''))
    if (!keyword) continue
    const key = keyword.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    keywords.push(keyword)
  }

  if (keywords.length === 0) return null

  return {
    hash,
    keywords,
    polarity,
    ...(filename ? { filename } : {}),
  }
}

function parseModelKeywordFile(raw: string): ModelKeywordEntry[] {
  return raw
    .split(/\r?\n/)
    .map(splitModelKeywordLine)
    .filter((entry): entry is ModelKeywordEntry => Boolean(entry))
}

async function fetchModelKeywordEntries(): Promise<ModelKeywordEntry[]> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, MODEL_KEYWORD_LORA_FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(MODEL_KEYWORD_LORA_KEYWORD_RAW_URL, {
      headers: { Accept: 'text/plain' },
      next: { revalidate: 86400 },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new ModelKeywordFetchError(
        `model-keyword request failed with status ${response.status}`,
        response.status,
      )
    }
    return parseModelKeywordFile(await response.text())
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ModelKeywordFetchError('model-keyword request timeout')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

async function getModelKeywordEntries(): Promise<ModelKeywordEntry[]> {
  const now = Date.now()
  if (cache && now - cache.fetchedAt < MODEL_KEYWORD_CACHE_TTL_MS) {
    return cache.entries
  }

  inflight ??= withRetry(fetchModelKeywordEntries, {
    maxAttempts: 3,
    baseDelayMs: 400,
    maxDelayMs: 2000,
    label: 'model-keyword.lora-keyword',
  }).finally(() => {
    inflight = null
  })

  const entries = await inflight
  cache = { fetchedAt: now, entries }
  return entries
}

function scoreModelKeywordEntry(
  entry: ModelKeywordEntry,
  normalizedQuery: string,
): number {
  let score = 0
  for (const keyword of entry.keywords) {
    const normalizedKeyword = normalizePromptTagSearchText(keyword)
    if (normalizedKeyword === normalizedQuery) score = Math.max(score, 150)
    else if (normalizedKeyword.startsWith(normalizedQuery)) {
      score = Math.max(score, 110)
    } else if (normalizedKeyword.includes(normalizedQuery)) {
      score = Math.max(score, 80)
    }
  }

  if (entry.filename) {
    const normalizedFilename = normalizePromptTagSearchText(entry.filename)
    if (normalizedFilename === normalizedQuery) score = Math.max(score, 95)
    else if (normalizedFilename.includes(normalizedQuery)) {
      score = Math.max(score, 60)
    }
  }

  if (entry.hash.startsWith(normalizedQuery)) score = Math.max(score, 70)

  return score
}

function modelKeywordEntryToTags(
  entry: ModelKeywordEntry,
  score: number,
): PromptTagDefinition[] {
  return entry.keywords.slice(0, 8).map((keyword, index) => ({
    id: `model-keyword:${entry.hash}:${index}:${keyword
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}`,
    type: 'lora_trigger',
    source: 'model_keyword',
    label: keyword,
    promptText: keyword,
    aliases: [entry.hash, entry.filename ?? ''].filter(
      (value): value is string => Boolean(value),
    ),
    category: 'lora',
    polarity: entry.polarity,
    modelFamilies: ['any'],
    orderGroup: 34,
    confidence: 'inferred',
    popularity: Math.max(0, score - index),
  }))
}

export interface SearchModelKeywordLoraTagsInput {
  query: string
  limit?: number
}

export async function searchModelKeywordLoraTags({
  query,
  limit = MODEL_KEYWORD_LORA_RESULT_LIMIT,
}: SearchModelKeywordLoraTagsInput): Promise<PromptTagDefinition[]> {
  const normalizedQuery = normalizePromptTagSearchText(query)
  if (!normalizedQuery) return []

  const entries = await getModelKeywordEntries()
  const scored = entries
    .map((entry) => ({
      entry,
      score: scoreModelKeywordEntry(entry, normalizedQuery),
    }))
    .filter((item) => item.score > 0)
    .sort(
      (a, b) => b.score - a.score || a.entry.hash.localeCompare(b.entry.hash),
    )

  const tags: PromptTagDefinition[] = []
  const seen = new Set<string>()
  for (const item of scored) {
    for (const tag of modelKeywordEntryToTags(item.entry, item.score)) {
      const key = `${tag.polarity}:${tag.promptText.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      tags.push(tag)
      if (tags.length >= limit) return tags
    }
  }

  return tags
}

export function __resetModelKeywordCacheForTests(): void {
  cache = null
  inflight = null
}
