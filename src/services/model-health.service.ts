import 'server-only'

import { HEALTH_CHECK } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getProviderAdapter } from '@/services/providers/registry'
import { updateModelHealthStatus } from '@/services/model-config.service'

import type { ModelHealthRecord, ModelHealthStatus } from '@/types'

// ─── System API keys (server env) ────────────────────────────────

function getSystemApiKey(adapterType: string): string | null {
  switch (adapterType) {
    case AI_ADAPTER_TYPES.HUGGINGFACE:
      return process.env.HF_API_TOKEN ?? null
    case AI_ADAPTER_TYPES.GEMINI:
      return process.env.GEMINI_API_KEY ?? null
    case AI_ADAPTER_TYPES.OPENAI:
      return process.env.OPENAI_API_KEY ?? null
    case AI_ADAPTER_TYPES.FAL:
      return process.env.FAL_API_KEY ?? null
    case AI_ADAPTER_TYPES.REPLICATE:
      return process.env.REPLICATE_API_TOKEN ?? null
    default:
      return null
  }
}

// ─── In-memory cache ──────────────────────────────────────────────

interface CacheEntry {
  records: ModelHealthRecord[]
  timestamp: number
}

let healthCache: CacheEntry | null = null

export function getHealthCache(): ModelHealthRecord[] | null {
  if (!healthCache) return null
  if (Date.now() - healthCache.timestamp > HEALTH_CHECK.CACHE_TTL_MS) {
    healthCache = null
    return null
  }
  return healthCache.records
}

// ─── Health check logic ───────────────────────────────────────────

interface ModelTarget {
  modelId: string
  externalModelId: string
  adapterType: string
  baseUrl: string
}

export async function checkSingleModelHealth(
  target: ModelTarget,
): Promise<ModelHealthRecord> {
  const adapter = getProviderAdapter(target.adapterType as AI_ADAPTER_TYPES)

  if (!adapter?.healthCheck) {
    return {
      modelId: target.modelId,
      status: 'degraded',
      lastChecked: new Date(),
      error: 'No health check implemented for this adapter',
    }
  }

  const apiKey = getSystemApiKey(target.adapterType)
  if (!apiKey) {
    return {
      modelId: target.modelId,
      status: 'degraded',
      lastChecked: new Date(),
      error: `No system API key for ${target.adapterType}`,
    }
  }

  const result = await adapter.healthCheck({
    modelId: target.externalModelId,
    apiKey,
    baseUrl: target.baseUrl,
    timeoutMs: HEALTH_CHECK.TIMEOUT_MS,
  })

  return {
    modelId: target.modelId,
    status: result.status,
    lastChecked: new Date(),
    latencyMs: result.latencyMs,
    error: result.error,
  }
}

export async function checkAllModelsHealth(
  targets: ModelTarget[],
): Promise<ModelHealthRecord[]> {
  const results = await Promise.allSettled(
    targets.map((t) => checkSingleModelHealth(t)),
  )

  const records: ModelHealthRecord[] = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value
    return {
      modelId: targets[i].modelId,
      status: 'unavailable' as ModelHealthStatus,
      lastChecked: new Date(),
      error: r.reason instanceof Error ? r.reason.message : 'Unknown error',
    }
  })

  // Update DB health status
  await Promise.allSettled(
    records.map((r) => updateModelHealthStatus(r.modelId, r.status)),
  )

  // Update cache
  healthCache = { records, timestamp: Date.now() }

  return records
}
