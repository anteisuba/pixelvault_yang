import 'server-only'

import type { Prisma } from '@/lib/generated/prisma/client'

import { db } from '@/lib/db'
import { MODEL_OPTIONS, type ModelOption } from '@/constants/models'
import type {
  ModelConfigInput,
  ModelConfigRecord,
  UpdateModelConfigInput,
} from '@/types'

// ─── Helpers ────────────────────────────────────────────────────

function toRecord(row: {
  id: string
  modelId: string
  externalModelId: string
  adapterType: string
  outputType: string
  cost: number
  available: boolean
  officialUrl: string | null
  timeoutMs: number | null
  qualityTier: string | null
  i2vModelId: string | null
  videoDefaults: unknown
  providerConfig: unknown
  sortOrder: number
  healthStatus: string | null
  lastHealthCheck: Date | null
  createdAt: Date
  updatedAt: Date
}): ModelConfigRecord {
  return {
    ...row,
    outputType: row.outputType as ModelConfigRecord['outputType'],
    videoDefaults: (row.videoDefaults as Record<string, unknown>) ?? null,
    providerConfig: row.providerConfig as { label: string; baseUrl: string },
  }
}

// ─── CRUD ───────────────────────────────────────────────────────

export async function getAllModelConfigs(): Promise<ModelConfigRecord[]> {
  const rows = await db.modelConfig.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
  return rows.map(toRecord)
}

export async function getModelConfigById(
  modelId: string,
): Promise<ModelConfigRecord | null> {
  const row = await db.modelConfig.findUnique({ where: { modelId } })
  return row ? toRecord(row) : null
}

export async function createModelConfig(
  input: ModelConfigInput,
): Promise<ModelConfigRecord> {
  const row = await db.modelConfig.create({
    data: {
      modelId: input.modelId,
      externalModelId: input.externalModelId,
      adapterType: input.adapterType,
      outputType: input.outputType,
      cost: input.cost,
      available: input.available,
      officialUrl: input.officialUrl ?? null,
      timeoutMs: input.timeoutMs ?? null,
      qualityTier: input.qualityTier ?? null,
      i2vModelId: input.i2vModelId ?? null,
      videoDefaults:
        (input.videoDefaults as Prisma.InputJsonValue) ?? undefined,
      providerConfig: input.providerConfig as Prisma.InputJsonValue,
      sortOrder: input.sortOrder,
    },
  })
  return toRecord(row)
}

export async function updateModelConfig(
  modelId: string,
  input: UpdateModelConfigInput,
): Promise<ModelConfigRecord> {
  const data: Record<string, unknown> = {}
  if (input.externalModelId !== undefined)
    data.externalModelId = input.externalModelId
  if (input.adapterType !== undefined) data.adapterType = input.adapterType
  if (input.outputType !== undefined) data.outputType = input.outputType
  if (input.cost !== undefined) data.cost = input.cost
  if (input.available !== undefined) data.available = input.available
  if (input.officialUrl !== undefined) data.officialUrl = input.officialUrl
  if (input.timeoutMs !== undefined) data.timeoutMs = input.timeoutMs
  if (input.qualityTier !== undefined) data.qualityTier = input.qualityTier
  if (input.i2vModelId !== undefined) data.i2vModelId = input.i2vModelId
  if (input.videoDefaults !== undefined)
    data.videoDefaults = input.videoDefaults ?? undefined
  if (input.providerConfig !== undefined)
    data.providerConfig = input.providerConfig
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder

  const row = await db.modelConfig.update({
    where: { modelId },
    data,
  })
  return toRecord(row)
}

export async function deleteModelConfig(modelId: string): Promise<void> {
  await db.modelConfig.delete({ where: { modelId } })
}

// ─── Resolved Model Options ─────────────────────────────────────

/**
 * Merge DB model configs with hardcoded MODEL_OPTIONS.
 * DB entries take precedence over hardcoded defaults.
 */
export async function getResolvedModelOptions(): Promise<ModelOption[]> {
  const dbConfigs = await getAllModelConfigs()
  const dbMap = new Map(dbConfigs.map((c) => [c.modelId, c]))

  const merged: ModelOption[] = []
  const seen = new Set<string>()

  // DB configs first (in sort order)
  for (const config of dbConfigs) {
    seen.add(config.modelId)
    merged.push({
      id: config.modelId as ModelOption['id'],
      cost: config.cost,
      adapterType: config.adapterType as ModelOption['adapterType'],
      providerConfig: config.providerConfig,
      externalModelId: config.externalModelId,
      outputType: config.outputType,
      available: config.available,
      officialUrl: config.officialUrl ?? undefined,
      timeoutMs: config.timeoutMs ?? undefined,
      qualityTier: config.qualityTier as ModelOption['qualityTier'],
      i2vModelId: config.i2vModelId ?? undefined,
      videoDefaults: config.videoDefaults as ModelOption['videoDefaults'],
    })
  }

  // Hardcoded fallbacks for models not in DB
  for (const model of MODEL_OPTIONS) {
    if (!seen.has(model.id)) {
      merged.push(model)
    }
  }

  return merged
}

// ─── Update Health Status ───────────────────────────────────────

export async function updateModelHealthStatus(
  modelId: string,
  healthStatus: string,
): Promise<void> {
  await db.modelConfig.updateMany({
    where: { modelId },
    data: { healthStatus, lastHealthCheck: new Date() },
  })
}
