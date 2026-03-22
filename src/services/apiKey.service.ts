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
import { ProviderConfigSchema } from '@/types'
import type { UserApiKeyRecord } from '@/types'

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
