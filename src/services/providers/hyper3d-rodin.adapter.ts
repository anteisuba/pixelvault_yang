import 'server-only'

import { z } from 'zod'

import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { logger } from '@/lib/logger'

import {
  ProviderError,
  type ProviderAdapter,
  type ProviderGenerationInput,
  type ProviderGenerationResult,
  type ProviderModel3DInput,
  type ProviderModel3DQueueStatusResult,
  type ProviderQueueStatusInput,
  type ProviderQueueSubmitResult,
} from '@/services/providers/types'

const BASE_URL = AI_PROVIDER_ENDPOINTS.HYPER3D

// ─── Response schemas ────────────────────────────────────────────────────────

const RodinSubmitResponseSchema = z.object({
  uuid: z.string().min(1),
})

const RodinStatusJobSchema = z.object({
  status: z.string(),
  message: z.string().optional(),
})

const RodinStatusResponseSchema = z.object({
  jobs: z.array(RodinStatusJobSchema).optional(),
  status_messages: z.array(RodinStatusJobSchema).optional(),
})

// ─── Status mapping ──────────────────────────────────────────────────────────

function mapRodinStatus(
  raw: string,
): 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' {
  const s = raw.toLowerCase()
  if (s === 'succeeded' || s === 'done' || s === 'completed') return 'COMPLETED'
  if (s === 'failed' || s === 'error') return 'FAILED'
  if (s === 'running' || s === 'processing') return 'IN_PROGRESS'
  return 'IN_QUEUE'
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export const hyper3dRodinAdapter: ProviderAdapter = {
  adapterType: AI_ADAPTER_TYPES.HYPER3D_RODIN,

  generateImage(
    _input: ProviderGenerationInput,
  ): Promise<ProviderGenerationResult> {
    throw new ProviderError(
      'Hyper3D Rodin',
      400,
      'Rodin does not support image generation.',
    )
  },

  async submitModel3DToQueue({
    imageUrl,
    apiKey,
    seed,
    rodinTier,
    rodinMeshMode,
    rodinTextureMode,
    rodinMaterial,
    rodinHighPack,
    rodinTAPose,
    rodinHdTexture,
    rodinTextureDelight,
    rodinQualityOverride,
    rodinAdditionalImageUrls,
    rodinBboxCondition,
  }: ProviderModel3DInput): Promise<ProviderQueueSubmitResult> {
    const form = new FormData()

    form.append('image_urls[]', imageUrl)
    if (rodinAdditionalImageUrls?.length) {
      for (const url of rodinAdditionalImageUrls) {
        form.append('image_urls[]', url)
      }
    }

    if (rodinTier) form.append('tier', rodinTier)
    if (rodinMeshMode) form.append('mesh', rodinMeshMode)
    if (rodinTextureMode) form.append('texture', rodinTextureMode)
    if (rodinMaterial) form.append('material', rodinMaterial)
    if (rodinHighPack != null) form.append('high_pack', String(rodinHighPack))
    if (rodinTAPose != null) form.append('t_a_pose', String(rodinTAPose))
    if (rodinHdTexture != null)
      form.append('hd_texture', String(rodinHdTexture))
    if (rodinTextureDelight != null)
      form.append('texture_delight', String(rodinTextureDelight))
    if (rodinQualityOverride != null)
      form.append('quality_override', String(rodinQualityOverride))
    if (seed != null && seed >= 0) form.append('seed', String(seed))
    if (rodinBboxCondition) {
      form.append('condition_mode', 'gt')
      form.append('bbox_condition', JSON.stringify(rodinBboxCondition))
    }

    const response = await fetch(`${BASE_URL}/api/v2/rodin`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(120_000),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      logger.error('Hyper3D Rodin submitModel3DToQueue failed', {
        status: response.status,
        errorBody: errorBody.slice(0, 500),
      })
      throw new ProviderError('Hyper3D Rodin', response.status, errorBody)
    }

    const raw: unknown = await response.json()
    const parsed = RodinSubmitResponseSchema.safeParse(raw)
    if (!parsed.success) {
      throw new ProviderError(
        'Hyper3D Rodin',
        502,
        `Unexpected submit response: ${JSON.stringify(raw).slice(0, 200)}`,
      )
    }

    const jobUuid = parsed.data.uuid
    return {
      requestId: jobUuid,
      statusUrl: `${BASE_URL}/api/v2/status?job_uuid=${jobUuid}`,
      responseUrl: `${BASE_URL}/api/v2/download?job_uuid=${jobUuid}&format=glb`,
    }
  },

  async checkModel3DQueueStatus({
    statusUrl,
    apiKey,
  }: ProviderQueueStatusInput): Promise<ProviderModel3DQueueStatusResult> {
    let res: Response
    try {
      res = await fetch(statusUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(30_000),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.warn('Hyper3D Rodin status fetch failed', { statusUrl, msg })
      return { status: 'IN_QUEUE' }
    }

    if (!res.ok) {
      logger.warn('Hyper3D Rodin status non-2xx', {
        status: res.status,
        statusUrl,
      })
      return { status: 'IN_QUEUE' }
    }

    const raw: unknown = await res.json()
    const parsed = RodinStatusResponseSchema.safeParse(raw)
    if (!parsed.success) return { status: 'IN_PROGRESS' }

    const messages = parsed.data.jobs ?? parsed.data.status_messages ?? []
    if (messages.length === 0) return { status: 'IN_PROGRESS' }

    const statuses = messages.map((m) => mapRodinStatus(m.status))
    if (statuses.some((s) => s === 'FAILED')) return { status: 'FAILED' }
    if (statuses.every((s) => s === 'COMPLETED')) return { status: 'COMPLETED' }
    if (statuses.some((s) => s === 'IN_PROGRESS'))
      return { status: 'IN_PROGRESS' }
    return { status: 'IN_QUEUE' }
  },
}
