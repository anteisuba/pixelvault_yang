import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EXECUTION_INTERNAL } from '@/constants/execution'
import type { WorkerRunContext } from '@/types'

import {
  buildInternalUrl,
  dispatchImageWorkerRun,
  ExecutionWorkerDispatchError,
} from './execution-worker.service'

const runContext: WorkerRunContext = {
  runId: 'job-1',
  workflowId: 'IMAGE_QUEUE',
  outputType: 'IMAGE',
  providerId: 'fal',
  apiKeyId: 'key-1',
  callbackUrl: 'https://app.example.com/api/internal/execution/callback',
  resolveKeyUrl: 'https://app.example.com/api/internal/execution/resolve-key',
  timeoutMs: 600_000,
  maxAttempts: 3,
  pollIntervalMs: 3_000,
  providerInput: {
    prompt: 'test image',
    modelId: 'flux-2-pro',
    externalModelId: 'fal-ai/flux-2-pro',
    aspectRatio: '1:1',
  },
}

describe('execution-worker.service', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    vi.stubEnv('EXECUTION_WORKER_BASE_URL', 'https://worker.example.com')
    vi.stubEnv('INTERNAL_CALLBACK_SECRET', 'test-secret')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('safely retries an ambiguous network failure with the same run id', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(
        Response.json({ workflowInstanceId: 'job-1' }, { status: 200 }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const pending = dispatchImageWorkerRun(runContext)
    await vi.runAllTimersAsync()

    await expect(pending).resolves.toEqual({ workflowInstanceId: 'job-1' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      fetchMock.mock.calls[1]?.[1]?.body,
    )
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
    const firstHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<
      string,
      string
    >
    const secondHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Record<
      string,
      string
    >
    expect(firstHeaders[EXECUTION_INTERNAL.VERSION_HEADER]).toBe('v1')
    expect(firstHeaders[EXECUTION_INTERNAL.TIMESTAMP_HEADER]).toMatch(
      /^\d{13}$/,
    )
    expect(firstHeaders[EXECUTION_INTERNAL.SIGNATURE_HEADER]).toMatch(
      /^[0-9a-f]{64}$/,
    )
    expect(firstHeaders[EXECUTION_INTERNAL.NONCE_HEADER]).not.toBe(
      secondHeaders[EXECUTION_INTERNAL.NONCE_HEADER],
    )
  })

  it('does not retry a definite worker validation rejection', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response('invalid workflow input', { status: 400 }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const error = await dispatchImageWorkerRun(runContext).catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(ExecutionWorkerDispatchError)
    expect(error).toMatchObject({ outcome: 'rejected', upstreamStatus: 400 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // An https loopback URL is accepted by `new URL()` but unreachable from the
  // worker: workerd reports the TLS failure as an opaque `internal error`, no
  // callback is ever delivered, and the job hangs until the sweeper reaps it.
  // Fail at build time so the misconfiguration names itself.
  it('rejects an https loopback app url instead of dispatching a run that can never call back', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://localhost:3000')

    expect(() => buildInternalUrl(EXECUTION_INTERNAL.CALLBACK_PATH)).toThrow(
      /cannot reach a local server over https/,
    )
  })

  it.each([
    ['http://localhost:3000', 'http://localhost:3000/'],
    ['https://www.anteisuba.com', 'https://www.anteisuba.com/'],
  ])('accepts a reachable app url (%s)', (appUrl, expectedOrigin) => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', appUrl)

    expect(buildInternalUrl(EXECUTION_INTERNAL.CALLBACK_PATH)).toBe(
      `${expectedOrigin.replace(/\/$/, '')}${EXECUTION_INTERNAL.CALLBACK_PATH}`,
    )
  })
})
