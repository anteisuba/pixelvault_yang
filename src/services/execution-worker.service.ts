import 'server-only'

import { createHmac } from 'node:crypto'

import { EXECUTION_INTERNAL, EXECUTION_WORKER } from '@/constants/execution'
import type {
  LongVideoPipelineWorkerRunContext,
  WorkerDispatchResult,
  WorkerRunContext,
} from '@/types'
import { WorkerDispatchResultSchema } from '@/types'
import { GenerateImageServiceError } from '@/services/generate-image.service'

function getInternalCallbackSecret(): string {
  const secret = process.env.INTERNAL_CALLBACK_SECRET

  if (!secret) {
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      'Internal callback secret is not configured',
      500,
    )
  }

  return secret
}

function getAppBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
}

export function isExecutionWorkerDispatchConfigured(): boolean {
  return Boolean(
    process.env.EXECUTION_WORKER_BASE_URL &&
    process.env.INTERNAL_CALLBACK_SECRET,
  )
}

function getWorkerBaseUrl(): string {
  const workerBaseUrl = process.env.EXECUTION_WORKER_BASE_URL

  if (!workerBaseUrl) {
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      'Execution worker URL is not configured',
      500,
    )
  }

  return workerBaseUrl.replace(/\/$/, '')
}

function signBody(body: string): string {
  return createHmac(
    EXECUTION_INTERNAL.SIGNATURE_ALGORITHM,
    getInternalCallbackSecret(),
  )
    .update(body, 'utf8')
    .digest('hex')
}

export function buildInternalUrl(path: string): string {
  return new URL(path, getAppBaseUrl()).toString()
}

export async function dispatchWorkerRun(
  runContext: WorkerRunContext,
): Promise<WorkerDispatchResult> {
  return dispatchSignedWorkerRun(runContext, EXECUTION_WORKER.FAL_QUEUE_PATH)
}

export async function dispatchLongVideoPipelineWorkerRun(
  runContext: LongVideoPipelineWorkerRunContext,
): Promise<WorkerDispatchResult> {
  return dispatchSignedWorkerRun(
    runContext,
    EXECUTION_WORKER.LONG_VIDEO_PIPELINE_PATH,
  )
}

async function dispatchSignedWorkerRun(
  runContext: WorkerRunContext | LongVideoPipelineWorkerRunContext,
  path: string,
): Promise<WorkerDispatchResult> {
  const body = JSON.stringify(runContext)
  const response = await fetch(`${getWorkerBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [EXECUTION_INTERNAL.SIGNATURE_HEADER]: signBody(body),
    },
    body,
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      `Execution worker dispatch failed (${response.status}): ${errorBody.slice(0, 200)}`,
      502,
    )
  }

  const payload: unknown = await response.json()
  return WorkerDispatchResultSchema.parse(payload)
}
