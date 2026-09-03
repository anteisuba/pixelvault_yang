import 'server-only'

import { EXECUTION_WORKER, LOOPBACK_HOSTNAMES } from '@/constants/execution'
import { createInternalExecutionHeaders } from '@/lib/signature-verifiers/internal-execution'
import type {
  LongVideoPipelineWorkerRunContext,
  WorkerCancelRequest,
  WorkerDispatchResult,
  WorkerModel3DRunContext,
  WorkerRunContext,
} from '@/types'
import { WorkerDispatchResultSchema } from '@/types'
import { GenerateImageServiceError } from '@/services/image/generate-image.service'
import { withRetry } from '@/lib/with-retry'

export type ExecutionWorkerDispatchOutcome = 'rejected' | 'unknown'

/**
 * Distinguishes a definite worker rejection from an ambiguous dispatch. A
 * network error or malformed acknowledgement may happen after the worker has
 * accepted the durable workflow, so callers must not mark the business job as
 * failed solely from those outcomes.
 */
export class ExecutionWorkerDispatchError extends GenerateImageServiceError {
  readonly outcome: ExecutionWorkerDispatchOutcome
  readonly upstreamStatus?: number

  constructor(
    message: string,
    outcome: ExecutionWorkerDispatchOutcome,
    upstreamStatus?: number,
  ) {
    super('PROVIDER_ERROR', message, 502)
    this.name = 'ExecutionWorkerDispatchError'
    this.outcome = outcome
    this.upstreamStatus = upstreamStatus
  }
}

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

/**
 * The local worker is an optional development dependency. When it is not
 * running, synchronous providers (such as Fish Audio voice previews) can
 * still complete through the in-process provider adapter. Production always
 * keeps the worker as the durable execution boundary.
 */
export function shouldUseInlineExecutionFallback(): boolean {
  if (process.env.NODE_ENV !== 'development') return false

  const configuredBaseUrl = process.env.EXECUTION_WORKER_BASE_URL
  if (!configuredBaseUrl) return false

  try {
    return LOOPBACK_HOSTNAMES.includes(
      new URL(configuredBaseUrl).hostname.toLowerCase(),
    )
  } catch {
    return false
  }
}

/**
 * The worker calls these URLs back over its own network stack, so a URL it
 * cannot reach does not fail loudly: dispatch is accepted, the workflow dies
 * inside workerd, no callback ever arrives, and the job sits RUNNING until the
 * sweeper reaps it as `callback_timeout` many minutes later.
 *
 * `https://` + loopback is the one shape that can never work — `next dev`
 * serves plain HTTP, and even under `--experimental-https` workerd refuses the
 * self-signed certificate and reports the failure as an opaque
 * `internal error; reference = …` with no usable stack. Reject it at dispatch
 * instead of shipping that silent hang. Real hosts are untouched, so production
 * (`https://www.anteisuba.com`) is unaffected.
 */
function assertReachableInternalUrl(url: URL): void {
  if (
    url.protocol !== 'https:' ||
    !LOOPBACK_HOSTNAMES.includes(url.hostname.toLowerCase())
  ) {
    return
  }

  throw new GenerateImageServiceError(
    'PROVIDER_ERROR',
    `NEXT_PUBLIC_APP_URL is "${getAppBaseUrl()}", but the execution worker cannot reach a local server over https. Use "http://${url.host}" instead.`,
    500,
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

export function buildInternalUrl(path: string): string {
  const url = new URL(path, getAppBaseUrl())
  assertReachableInternalUrl(url)
  return url.toString()
}

export async function dispatchWorkerRun(
  runContext: WorkerRunContext,
): Promise<WorkerDispatchResult> {
  return dispatchSignedWorkerRun(runContext, EXECUTION_WORKER.FAL_QUEUE_PATH)
}

export async function dispatchImageWorkerRun(
  runContext: WorkerRunContext,
): Promise<WorkerDispatchResult> {
  return dispatchSignedWorkerRun(runContext, EXECUTION_WORKER.IMAGE_QUEUE_PATH)
}

export async function dispatchLongVideoPipelineWorkerRun(
  runContext: LongVideoPipelineWorkerRunContext,
): Promise<WorkerDispatchResult> {
  return dispatchSignedWorkerRun(
    runContext,
    EXECUTION_WORKER.LONG_VIDEO_PIPELINE_PATH,
  )
}

export async function dispatchHyper3DRodinWorkerRun(
  runContext: WorkerModel3DRunContext,
): Promise<WorkerDispatchResult> {
  return dispatchSignedWorkerRun(
    runContext,
    EXECUTION_WORKER.HYPER3D_RODIN_PATH,
  )
}

export async function dispatchHunyuan3DWorkerRun(
  runContext: WorkerModel3DRunContext,
): Promise<WorkerDispatchResult> {
  return dispatchSignedWorkerRun(runContext, EXECUTION_WORKER.HUNYUAN3D_PATH)
}

async function dispatchSignedWorkerRun(
  runContext:
    | WorkerRunContext
    | LongVideoPipelineWorkerRunContext
    | WorkerModel3DRunContext,
  path: string,
): Promise<WorkerDispatchResult> {
  const body = JSON.stringify(runContext)
  const url = `${getWorkerBaseUrl()}${path}`

  return withRetry(() => dispatchSignedWorkerRunOnce(url, body), {
    maxAttempts: EXECUTION_WORKER.DISPATCH_MAX_ATTEMPTS,
    baseDelayMs: EXECUTION_WORKER.DISPATCH_RETRY_DELAY_MS,
    maxDelayMs: EXECUTION_WORKER.DISPATCH_RETRY_DELAY_MS,
    label: `execution-worker.dispatch:${runContext.runId}`,
    isRetryable: (error) =>
      error instanceof ExecutionWorkerDispatchError &&
      error.outcome === 'unknown',
  })
}

async function dispatchSignedWorkerRunOnce(
  url: string,
  body: string,
): Promise<WorkerDispatchResult> {
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...createInternalExecutionHeaders({
          body,
          method: 'POST',
          url,
          secret: getInternalCallbackSecret(),
        }),
      },
      body,
      signal: AbortSignal.timeout(EXECUTION_WORKER.DISPATCH_TIMEOUT_MS),
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown network error'
    throw new ExecutionWorkerDispatchError(
      `Execution worker dispatch failed: ${message}`,
      'unknown',
    )
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    const outcome =
      response.status === 429 || response.status >= 500 ? 'unknown' : 'rejected'
    throw new ExecutionWorkerDispatchError(
      `Execution worker dispatch failed (${response.status}): ${errorBody.slice(0, 200)}`,
      outcome,
      response.status,
    )
  }

  try {
    const payload: unknown = await response.json()
    return WorkerDispatchResultSchema.parse(payload)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Invalid worker response'
    throw new ExecutionWorkerDispatchError(
      `Execution worker returned an invalid acknowledgement: ${message}`,
      'unknown',
      response.status,
    )
  }
}

/**
 * Best-effort "stop what you're doing" notify to the execution worker for a
 * job the app has already CAS-transitioned to `CANCELLED` in the DB. Unlike
 * `dispatchSignedWorkerRun`, this is a single attempt with a short timeout —
 * the DB-side cancel is already the source of truth, so a slow/unreachable
 * worker must never block or fail the caller. Throws on failure; callers
 * (see `generation-cancel.service.ts`) are expected to catch and log rather
 * than propagate.
 */
export async function notifyWorkerCancel(
  request: WorkerCancelRequest,
): Promise<void> {
  const body = JSON.stringify(request)
  const url = `${getWorkerBaseUrl()}${EXECUTION_WORKER.CANCEL_PATH}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...createInternalExecutionHeaders({
        body,
        method: 'POST',
        url,
        secret: getInternalCallbackSecret(),
      }),
    },
    body,
    signal: AbortSignal.timeout(EXECUTION_WORKER.CANCEL_TIMEOUT_MS),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new Error(
      `Execution worker cancel notify failed (${response.status}): ${errorBody.slice(0, 200)}`,
    )
  }
}
