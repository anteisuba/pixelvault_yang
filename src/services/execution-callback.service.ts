import 'server-only'

import type { ExecutionCallbackPayload } from '@/types'
import { db } from '@/lib/db'
import { ApiRequestError } from '@/lib/errors'
import { logger } from '@/lib/logger'

const GENERATION_JOB_STATUSES = [
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
] as const

const TERMINAL_GENERATION_JOB_STATUSES = ['COMPLETED', 'FAILED'] as const

export type ExecutionCallbackJobStatus =
  (typeof GENERATION_JOB_STATUSES)[number]

export type ExecutionCallbackAction =
  | 'logged'
  | 'ignored-terminal'
  | 'not-found'

export interface CallbackResult {
  runId: string
  jobStatus: ExecutionCallbackJobStatus
  action: ExecutionCallbackAction
}

function isTerminalGenerationJobStatus(
  status: ExecutionCallbackJobStatus,
): boolean {
  return TERMINAL_GENERATION_JOB_STATUSES.some(
    (terminalStatus) => terminalStatus === status,
  )
}

function toExecutionCallbackJobStatus(
  status: string,
): ExecutionCallbackJobStatus {
  const parsedStatus = GENERATION_JOB_STATUSES.find((item) => item === status)

  if (!parsedStatus) {
    throw new ApiRequestError(
      'EXECUTION_RUN_STATUS_INVALID',
      500,
      'errors.common.unexpected',
      'Execution run has an invalid job status.',
    )
  }

  return parsedStatus
}

export async function handleExecutionCallback(
  payload: ExecutionCallbackPayload,
): Promise<CallbackResult> {
  const job = await db.generationJob.findUnique({
    where: { id: payload.runId },
    select: { id: true, status: true },
  })

  if (!job) {
    logger.warn('Execution callback run not found', {
      runId: payload.runId,
      kind: payload.kind,
    })

    throw new ApiRequestError(
      'EXECUTION_RUN_NOT_FOUND',
      404,
      'errors.execution.runNotFound',
      'Execution run not found.',
    )
  }

  const jobStatus = toExecutionCallbackJobStatus(job.status)

  if (isTerminalGenerationJobStatus(jobStatus)) {
    logger.info('Execution callback ignored for terminal run', {
      runId: job.id,
      kind: payload.kind,
      jobStatus,
    })

    return {
      runId: job.id,
      jobStatus,
      action: 'ignored-terminal',
    }
  }

  switch (payload.kind) {
    case 'ping':
      logger.info('Execution callback ping logged', {
        runId: job.id,
        jobStatus,
        ts: payload.ts,
      })
      break
    case 'status':
      logger.info('Execution callback status logged', {
        runId: job.id,
        jobStatus,
        ts: payload.ts,
      })
      break
    case 'result':
      // TODO(Phase 3 sub-step 2 part 3): connect this branch to video artifact
      // persistence and generationJob finalization after video submit migrates.
      logger.info('Execution callback result logged without finalization', {
        runId: job.id,
        jobStatus,
        ts: payload.ts,
      })
      break
  }

  return {
    runId: job.id,
    jobStatus,
    action: 'logged',
  }
}
