import 'server-only'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { ResolveKeyRequest, ResolveKeyResponse } from '@/types'
import { db } from '@/lib/db'
import { ApiRequestError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { getSystemApiKey, getSystemCivitaiToken } from '@/lib/platform-keys'
import { getApiKeyValueById } from '@/services/apiKey.service'

const TERMINAL_GENERATION_JOB_STATUSES = new Set([
  'COMPLETED',
  'FAILED',
  'CANCELLED',
])

function throwForbidden(): never {
  throw new ApiRequestError(
    'FORBIDDEN',
    403,
    'errors.auth.forbidden',
    'Forbidden.',
  )
}

export async function resolveExecutionApiKey(
  request: ResolveKeyRequest,
): Promise<ResolveKeyResponse> {
  const job = await db.generationJob.findUnique({
    where: { id: request.runId },
    select: { id: true, userId: true, status: true, adapterType: true },
  })

  if (!job || TERMINAL_GENERATION_JOB_STATUSES.has(job.status)) {
    logger.warn('Execution API key resolve denied for job', {
      runId: request.runId,
      reason: !job ? 'missing-job' : 'terminal-job',
    })
    throwForbidden()
  }

  if (request.keyKind === 'civitai') {
    if (
      job.adapterType !== AI_ADAPTER_TYPES.REPLICATE &&
      job.adapterType !== AI_ADAPTER_TYPES.FAL
    ) {
      logger.warn('Execution Civitai token resolve denied for adapter', {
        runId: request.runId,
        jobAdapterType: job.adapterType,
      })
      throwForbidden()
    }

    const civitaiToken = getSystemCivitaiToken()

    if (!civitaiToken) {
      logger.warn('Execution Civitai token resolve denied; token missing', {
        runId: request.runId,
        adapterType: job.adapterType,
      })
      throwForbidden()
    }

    logger.info('Execution Civitai token resolved for worker', {
      runId: request.runId,
      adapterType: job.adapterType,
      tokenSource: 'system',
    })

    return { apiKey: civitaiToken }
  }

  if (request.useSystemKey) {
    const adapterType = Object.values(AI_ADAPTER_TYPES).find(
      (candidate) => candidate === job.adapterType,
    )

    if (!adapterType || request.adapterType !== adapterType) {
      logger.warn('Execution system API key resolve denied for adapter', {
        runId: request.runId,
        requestedAdapterType: request.adapterType,
        jobAdapterType: job.adapterType,
      })
      throwForbidden()
    }

    const systemApiKey = getSystemApiKey(adapterType)
    if (!systemApiKey) {
      logger.warn('Execution system API key resolve denied; key missing', {
        runId: request.runId,
        adapterType,
      })
      throwForbidden()
    }

    logger.info('Execution system API key resolved for worker', {
      runId: request.runId,
      adapterType,
    })

    return { apiKey: systemApiKey }
  }

  if (!request.apiKeyId) {
    logger.warn('Execution API key resolve denied; key id missing', {
      runId: request.runId,
    })
    throwForbidden()
  }

  const apiKey = await getApiKeyValueById(request.apiKeyId, job.userId)

  if (!apiKey) {
    logger.warn('Execution API key resolve denied for key', {
      runId: request.runId,
      apiKeyId: request.apiKeyId,
    })
    throwForbidden()
  }

  logger.info('Execution API key resolved for worker', {
    runId: request.runId,
    apiKeyId: request.apiKeyId,
  })

  return { apiKey: apiKey.keyValue }
}
