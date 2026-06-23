import { afterEach, describe, expect, it, vi } from 'vitest'

import { GENERATION_POLL } from '@/constants/config'
import {
  pollGenerationStatus,
  type GenerationStatusProbeResponse,
} from '@/lib/poll-generation-status'
import type { GenerationRecord } from '@/types'

const GENERATION: GenerationRecord = {
  id: 'generation-1',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  outputType: 'IMAGE',
  status: 'COMPLETED',
  url: 'https://cdn.test/result.png',
  storageKey: 'generations/result.png',
  mimeType: 'image/png',
  width: 1024,
  height: 1024,
  prompt: 'a prompt',
  model: 'gemini-3.1-flash-image-preview',
  provider: 'Gemini',
  requestCount: 1,
  isPublic: false,
  isPromptPublic: false,
}

const CONFIG = {
  maxAttempts: 5,
  intervalMs: 2000,
  fallbackError: 'fallback error',
}

function completed(): GenerationStatusProbeResponse {
  return {
    success: true,
    data: { status: 'COMPLETED', generation: GENERATION },
  }
}

function inProgress(): GenerationStatusProbeResponse {
  return { success: true, data: { status: 'IN_PROGRESS' } }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('pollGenerationStatus', () => {
  it('returns completed with the generation on COMPLETED', async () => {
    const probe = vi.fn().mockResolvedValue(completed())

    const outcome = await pollGenerationStatus('job-1', probe, CONFIG)

    expect(outcome).toEqual({ status: 'completed', generation: GENERATION })
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('surfaces FAILED error fields, falling back when the message is absent', async () => {
    const probe = vi.fn().mockResolvedValue({
      success: true,
      data: {
        status: 'FAILED',
        error: 'provider blocked the prompt',
        errorCode: 'content_filtered',
        i18nKey: 'errors.provider.contentFiltered',
      },
    } satisfies GenerationStatusProbeResponse)

    const outcome = await pollGenerationStatus('job-1', probe, CONFIG)

    expect(outcome).toEqual({
      status: 'failed',
      error: 'provider blocked the prompt',
      errorCode: 'content_filtered',
      i18nKey: 'errors.provider.contentFiltered',
    })
  })

  it('returns pending after the attempt budget is exhausted while still running', async () => {
    vi.useFakeTimers()
    const probe = vi.fn().mockResolvedValue(inProgress())

    const promise = pollGenerationStatus('job-1', probe, CONFIG)
    await vi.runAllTimersAsync()
    const outcome = await promise

    expect(outcome).toEqual({ status: 'pending' })
    expect(probe).toHaveBeenCalledTimes(CONFIG.maxAttempts)
  })

  it('retries transient failures and resolves once a later probe succeeds', async () => {
    vi.useFakeTimers()
    const probe = vi
      .fn()
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce({
        success: false,
      } as GenerationStatusProbeResponse)
      .mockResolvedValueOnce(completed())

    const promise = pollGenerationStatus('job-1', probe, CONFIG)
    await vi.runAllTimersAsync()
    const outcome = await promise

    expect(outcome).toEqual({ status: 'completed', generation: GENERATION })
    expect(probe).toHaveBeenCalledTimes(3)
  })

  it('gives up to pending after too many consecutive transient failures', async () => {
    vi.useFakeTimers()
    const probe = vi.fn().mockRejectedValue(new Error('status endpoint down'))

    const promise = pollGenerationStatus('job-1', probe, {
      ...CONFIG,
      // Budget well above the tolerance so the tolerance is what bails us out.
      maxAttempts: 100,
    })
    await vi.runAllTimersAsync()
    const outcome = await promise

    expect(outcome).toEqual({ status: 'pending' })
    expect(probe).toHaveBeenCalledTimes(GENERATION_POLL.TRANSIENT_TOLERANCE)
  })

  it('resets the transient counter after a successful read', async () => {
    vi.useFakeTimers()
    // transient, transient, IN_PROGRESS (resets), transient, transient, done —
    // never hits TRANSIENT_TOLERANCE consecutive, so it must NOT bail early.
    const probe = vi
      .fn()
      .mockRejectedValueOnce(new Error('blip'))
      .mockRejectedValueOnce(new Error('blip'))
      .mockResolvedValueOnce(inProgress())
      .mockRejectedValueOnce(new Error('blip'))
      .mockRejectedValueOnce(new Error('blip'))
      .mockResolvedValueOnce(completed())

    const promise = pollGenerationStatus('job-1', probe, {
      ...CONFIG,
      maxAttempts: 100,
    })
    await vi.runAllTimersAsync()
    const outcome = await promise

    expect(outcome).toEqual({ status: 'completed', generation: GENERATION })
    expect(probe).toHaveBeenCalledTimes(6)
  })
})
