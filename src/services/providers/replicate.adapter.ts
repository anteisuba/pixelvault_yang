import 'server-only'

import { z } from 'zod'

import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

import {
  ProviderError,
  type HealthCheckInput,
  type ProviderAdapter,
} from '@/services/providers/types'

import { logger } from '@/lib/logger'

// ─── Adapter ────────────────────────────────────────────────────

export const replicateAdapter: ProviderAdapter = {
  adapterType: AI_ADAPTER_TYPES.REPLICATE,

  async healthCheck({ modelId, apiKey, baseUrl, timeoutMs }: HealthCheckInput) {
    const start = Date.now()
    try {
      const [owner, name] = modelId.split('/')
      if (!owner || !name) {
        return {
          status: 'unavailable' as const,
          latencyMs: Date.now() - start,
          error: 'Invalid Replicate model ID format',
        }
      }
      const endpoint = `${baseUrl}/models/${owner}/${name}`
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(timeoutMs),
      })
      const latencyMs = Date.now() - start
      if (response.ok) {
        return { status: 'available' as const, latencyMs }
      }
      return {
        status: 'unavailable' as const,
        latencyMs,
        error: `HTTP ${response.status}`,
      }
    } catch (err) {
      return {
        status: 'unavailable' as const,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  },
}

// ─── LoRA Training (standalone functions, not part of ProviderAdapter) ──

const REPLICATE_TRAINING_SCHEMA = z.object({
  id: z.string(),
  status: z.enum(['starting', 'processing', 'succeeded', 'failed', 'canceled']),
  output: z.unknown().optional(),
  error: z.string().nullable().optional(),
  logs: z.string().optional(),
  metrics: z.record(z.string(), z.unknown()).optional(),
})

export type ReplicateTrainingStatus = z.infer<
  typeof REPLICATE_TRAINING_SCHEMA
>['status']

/**
 * Submit a LoRA training job to Replicate's fast-flux-trainer.
 * Returns the training ID for status polling.
 */
export async function submitReplicateLoraTraining(input: {
  apiKey: string
  inputImagesUrl: string
  triggerWord: string
  loraType: 'subject' | 'style'
  destinationOwner?: string
}): Promise<{ trainingId: string }> {
  const baseUrl = AI_PROVIDER_ENDPOINTS.REPLICATE

  // Step 0: Get the Replicate account username for destination
  let owner = input.destinationOwner
  if (!owner) {
    const accountRes = await fetch(`${baseUrl}/account`, {
      headers: { Authorization: `Bearer ${input.apiKey}` },
    })
    if (accountRes.ok) {
      const accountData = (await accountRes.json()) as { username?: string }
      owner = accountData.username
    }
    if (!owner) {
      // Fallback: use trigger word slug as owner won't work, but we need something
      throw new ProviderError(
        'Replicate',
        400,
        'Could not determine Replicate username. Check your API key.',
      )
    }
  }

  // Step 1: Get latest version of fast-flux-trainer
  const modelRes = await fetch(
    `${baseUrl}/models/replicate/fast-flux-trainer`,
    { headers: { Authorization: `Bearer ${input.apiKey}` } },
  )
  if (!modelRes.ok) {
    const err = await modelRes.text().catch(() => 'Unknown error')
    throw new ProviderError(
      'Replicate',
      modelRes.status,
      `Failed to fetch trainer model: ${err}`,
    )
  }
  const modelData = (await modelRes.json()) as {
    latest_version?: { id?: string }
  }
  const versionId = modelData.latest_version?.id
  if (!versionId) {
    throw new ProviderError(
      'Replicate',
      500,
      'Could not determine trainer version',
    )
  }

  // Step 2: Create destination model (ignore 409 = already exists)
  const destName = `lora-${input.triggerWord.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`
  const destination = `${owner}/${destName}`

  const createModelRes = await fetch(`${baseUrl}/models`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      owner,
      name: destName,
      visibility: 'private',
      hardware: 'cpu',
      description: `LoRA trained via PixelVault (trigger: ${input.triggerWord})`,
    }),
  })
  // 409 = model already exists, that's fine
  if (!createModelRes.ok && createModelRes.status !== 409) {
    const err = await createModelRes.text().catch(() => 'Unknown error')
    logger.warn('Failed to create destination model (non-fatal)', {
      status: createModelRes.status,
      err: err.slice(0, 200),
    })
  }

  // Step 3: Submit training with version ID
  const url = `${baseUrl}/models/replicate/fast-flux-trainer/versions/${versionId}/trainings`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      destination,
      input: {
        input_images: input.inputImagesUrl,
        trigger_word: input.triggerWord,
        lora_type: input.loraType,
      },
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    logger.error('Replicate submitLoraTraining failed', {
      status: response.status,
      errorBody: errorBody.slice(0, 500),
    })
    throw new ProviderError('Replicate', response.status, errorBody)
  }

  const data = REPLICATE_TRAINING_SCHEMA.parse(await response.json())
  return { trainingId: data.id }
}

/**
 * Check status of a Replicate LoRA training job.
 */
export async function checkReplicateLoraTrainingStatus(input: {
  apiKey: string
  trainingId: string
}): Promise<{
  status: ReplicateTrainingStatus
  loraUrl: string | null
  error: string | null
  logs: string | null
}> {
  const baseUrl = AI_PROVIDER_ENDPOINTS.REPLICATE

  const url = `${baseUrl}/trainings/${input.trainingId}`

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${input.apiKey}` },
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new ProviderError('Replicate', response.status, errorBody)
  }

  const data = REPLICATE_TRAINING_SCHEMA.parse(await response.json())

  // Extract LoRA weights URL from output
  let loraUrl: string | null = null
  if (data.status === 'succeeded' && data.output) {
    const output = data.output as Record<string, unknown>
    loraUrl = (output.weights as string) ?? (output.version as string) ?? null
  }

  return {
    status: data.status,
    loraUrl,
    error: data.error ?? null,
    logs: data.logs ?? null,
  }
}
