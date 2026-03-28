import 'server-only'

import { db } from '@/lib/db'
import type { Prisma } from '@/lib/generated/prisma/client'
import { encryptApiKey, decryptApiKey } from '@/lib/crypto'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
  isAiAdapterType,
  type ProviderConfig,
} from '@/constants/providers'
import { HEALTH_CHECK } from '@/constants/config'
import { ProviderConfigSchema } from '@/types'
import type { UserApiKeyRecord, ApiKeyVerifyResult } from '@/types'

// ─── Masking Helper ───────────────────────────────────────────────

function maskKey(plaintext: string): string {
  if (plaintext.length <= 8) return '****'
  const prefix = plaintext.slice(0, 4)
  const suffix = plaintext.slice(-4)
  return `${prefix}****...****${suffix}`
}

export interface ResolvedApiKeyValue {
  id: string
  modelId: string
  adapterType: AI_ADAPTER_TYPES
  providerConfig: ProviderConfig
  label: string
  keyValue: string
}

function normalizeAdapterType(value: string): AI_ADAPTER_TYPES {
  return isAiAdapterType(value) ? value : AI_ADAPTER_TYPES.HUGGINGFACE
}

function normalizeProviderConfig(
  adapterType: AI_ADAPTER_TYPES,
  value: unknown,
): ProviderConfig {
  const parseResult = ProviderConfigSchema.safeParse(value)
  if (parseResult.success) {
    return parseResult.data
  }

  return getDefaultProviderConfig(adapterType)
}

function toProviderConfigJson(
  providerConfig: ProviderConfig,
): Prisma.InputJsonValue {
  return {
    label: providerConfig.label,
    baseUrl: providerConfig.baseUrl,
  }
}

// ─── Service Functions ────────────────────────────────────────────

export async function listUserApiKeys(
  userId: string,
): Promise<UserApiKeyRecord[]> {
  const records = await db.userApiKey.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })

  return records.map((r) => {
    let maskedKey = '****'
    try {
      const plain = decryptApiKey(r.encryptedKey)
      maskedKey = maskKey(plain)
    } catch {
      maskedKey = '****'
    }
    const adapterType = normalizeAdapterType(r.adapterType)

    return {
      id: r.id,
      modelId: r.modelId,
      adapterType,
      providerConfig: normalizeProviderConfig(adapterType, r.providerConfig),
      label: r.label,
      maskedKey,
      isActive: r.isActive,
      createdAt: r.createdAt,
    }
  })
}

export async function getApiKeyValueById(
  id: string,
  userId: string,
): Promise<ResolvedApiKeyValue | null> {
  const record = await db.userApiKey.findUnique({ where: { id } })
  if (!record || record.userId !== userId || !record.isActive) return null
  try {
    const adapterType = normalizeAdapterType(record.adapterType)

    return {
      id: record.id,
      modelId: record.modelId,
      adapterType,
      providerConfig: normalizeProviderConfig(
        adapterType,
        record.providerConfig,
      ),
      label: record.label,
      keyValue: decryptApiKey(record.encryptedKey),
    }
  } catch {
    return null
  }
}

export async function findActiveKeyForAdapter(
  userId: string,
  adapterType: AI_ADAPTER_TYPES,
): Promise<ResolvedApiKeyValue | null> {
  const record = await db.userApiKey.findFirst({
    where: { userId, adapterType, isActive: true },
    orderBy: { createdAt: 'desc' },
  })
  if (!record) return null
  try {
    const normalizedAdapter = normalizeAdapterType(record.adapterType)
    return {
      id: record.id,
      modelId: record.modelId,
      adapterType: normalizedAdapter,
      providerConfig: normalizeProviderConfig(
        normalizedAdapter,
        record.providerConfig,
      ),
      label: record.label,
      keyValue: decryptApiKey(record.encryptedKey),
    }
  } catch {
    return null
  }
}

export async function createApiKey(
  userId: string,
  modelId: string,
  adapterType: AI_ADAPTER_TYPES,
  providerConfig: ProviderConfig,
  label: string,
  keyValue: string,
): Promise<UserApiKeyRecord> {
  const encryptedKey = encryptApiKey(keyValue)

  const record = await db.userApiKey.create({
    data: {
      userId,
      modelId,
      adapterType,
      providerConfig: toProviderConfigJson(providerConfig),
      label,
      encryptedKey,
      isActive: true,
    },
  })

  const normalizedAdapterType = normalizeAdapterType(record.adapterType)

  return {
    id: record.id,
    modelId: record.modelId,
    adapterType: normalizedAdapterType,
    providerConfig: normalizeProviderConfig(
      normalizedAdapterType,
      record.providerConfig,
    ),
    label: record.label,
    maskedKey: maskKey(keyValue),
    isActive: record.isActive,
    createdAt: record.createdAt,
  }
}

export async function updateApiKey(
  id: string,
  userId: string,
  data: { label?: string; isActive?: boolean },
): Promise<UserApiKeyRecord> {
  const existing = await db.userApiKey.findUnique({ where: { id } })
  if (!existing || existing.userId !== userId) {
    throw new Error('API key not found or access denied')
  }

  const updated = await db.userApiKey.update({
    where: { id },
    data: {
      ...(data.label !== undefined && { label: data.label }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  })

  let maskedKey = '****'
  try {
    const plain = decryptApiKey(updated.encryptedKey)
    maskedKey = maskKey(plain)
  } catch {
    maskedKey = '****'
  }

  const normalizedAdapterType = normalizeAdapterType(updated.adapterType)

  return {
    id: updated.id,
    modelId: updated.modelId,
    adapterType: normalizedAdapterType,
    providerConfig: normalizeProviderConfig(
      normalizedAdapterType,
      updated.providerConfig,
    ),
    label: updated.label,
    maskedKey,
    isActive: updated.isActive,
    createdAt: updated.createdAt,
  }
}

export async function deleteApiKey(id: string, userId: string): Promise<void> {
  const existing = await db.userApiKey.findUnique({ where: { id } })
  if (!existing || existing.userId !== userId) {
    throw new Error('API key not found or access denied')
  }
  await db.userApiKey.delete({ where: { id } })
}

// ─── Lightweight auth verification per adapter ───────────────────

async function verifyAdapterKey(
  adapterType: AI_ADAPTER_TYPES,
  apiKey: string,
  baseUrl: string,
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const timeoutMs = HEALTH_CHECK.TIMEOUT_MS
  const start = Date.now()

  try {
    let response: Response

    switch (adapterType) {
      case AI_ADAPTER_TYPES.OPENAI: {
        // GET /models — lightweight auth check
        const url = baseUrl.replace(/\/images\/?$/, '/models')
        response = await fetch(url, {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(timeoutMs),
        })
        break
      }
      case AI_ADAPTER_TYPES.GEMINI: {
        // GET /models — list models to verify key
        const url = `${baseUrl.replace(/\/$/, '')}`
        response = await fetch(url, {
          method: 'GET',
          headers: { 'x-goog-api-key': apiKey },
          signal: AbortSignal.timeout(timeoutMs),
        })
        break
      }
      case AI_ADAPTER_TYPES.FAL: {
        // GET queue endpoint — just auth check
        response = await fetch('https://queue.fal.run', {
          method: 'GET',
          headers: { Authorization: `Key ${apiKey}` },
          signal: AbortSignal.timeout(timeoutMs),
        })
        // fal returns 404 for root but still validates auth (401/403 = bad key)
        const latencyMs = Date.now() - start
        if (response.status === 401 || response.status === 403) {
          return { ok: false, latencyMs, error: `HTTP ${response.status}` }
        }
        return { ok: true, latencyMs }
      }
      case AI_ADAPTER_TYPES.HUGGINGFACE: {
        // GET /api/whoami-v2 — verifies token
        response = await fetch('https://huggingface.co/api/whoami-v2', {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(timeoutMs),
        })
        break
      }
      case AI_ADAPTER_TYPES.REPLICATE: {
        // GET /v1/account — verifies token
        response = await fetch('https://api.replicate.com/v1/account', {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(timeoutMs),
        })
        break
      }
      case AI_ADAPTER_TYPES.NOVELAI: {
        // User API is on api.novelai.net (image.novelai.net is generation only)
        response = await fetch('https://api.novelai.net/user/subscription', {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(timeoutMs),
        })
        break
      }
      case AI_ADAPTER_TYPES.VOLCENGINE: {
        // GET /models — lightweight auth check (same as OpenAI pattern)
        const url = `${baseUrl.replace(/\/$/, '')}/models`
        response = await fetch(url, {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(timeoutMs),
        })
        break
      }
      default: {
        return { ok: false, latencyMs: 0, error: 'Unknown adapter' }
      }
    }

    const latencyMs = Date.now() - start
    if (response.ok) {
      return { ok: true, latencyMs }
    }
    return { ok: false, latencyMs, error: `HTTP ${response.status}` }
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

export async function verifyApiKey(
  id: string,
  userId: string,
): Promise<ApiKeyVerifyResult> {
  const record = await db.userApiKey.findUnique({ where: { id } })
  if (!record || record.userId !== userId) {
    throw new Error('API key not found or access denied')
  }

  const adapterType = normalizeAdapterType(record.adapterType)
  const providerConfig = normalizeProviderConfig(
    adapterType,
    record.providerConfig,
  )

  let plainKey: string
  try {
    plainKey = decryptApiKey(record.encryptedKey)
  } catch {
    return { id, status: 'failed', error: 'Cannot decrypt API key' }
  }

  if (!plainKey.trim()) {
    return { id, status: 'no_key' }
  }

  const result = await verifyAdapterKey(
    adapterType,
    plainKey,
    providerConfig.baseUrl,
  )

  return {
    id,
    status: result.ok ? 'available' : 'failed',
    latencyMs: result.latencyMs,
    error: result.error,
  }
}
