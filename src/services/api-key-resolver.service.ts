import 'server-only'

import type { ResolveKeyRequest, ResolveKeyResponse } from '@/types'
import { db } from '@/lib/db'
import { ApiRequestError } from '@/lib/errors'
import { logger } from '@/lib/logger'
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
    select: { id: true, userId: true, status: true },
  })

  if (!job || TERMINAL_GENERATION_JOB_STATUSES.has(job.status)) {
    logger.warn('Execution API key resolve denied for job', {
      runId: request.runId,
      reason: !job ? 'missing-job' : 'terminal-job',
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
