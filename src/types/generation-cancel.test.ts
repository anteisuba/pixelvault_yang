import { describe, it, expect } from 'vitest'

import {
  cancelGenerationsRequestSchema,
  cancelGenerationsResponseSchema,
  workerCancelRequestSchema,
} from '@/types'
import { GENERATION_CANCEL_MAX_BATCH } from '@/constants/generation-cancel'

describe('cancelGenerationsRequestSchema', () => {
  it('accepts a single jobId', () => {
    const result = cancelGenerationsRequestSchema.safeParse({
      jobIds: ['job-1'],
    })
    expect(result.success).toBe(true)
  })

  it('accepts a full batch at the max size', () => {
    const jobIds = Array.from(
      { length: GENERATION_CANCEL_MAX_BATCH },
      (_, i) => `job-${i}`,
    )
    const result = cancelGenerationsRequestSchema.safeParse({ jobIds })
    expect(result.success).toBe(true)
  })

  it('rejects an empty jobIds array', () => {
    const result = cancelGenerationsRequestSchema.safeParse({ jobIds: [] })
    expect(result.success).toBe(false)
  })

  it('rejects a batch over the max size', () => {
    const jobIds = Array.from(
      { length: GENERATION_CANCEL_MAX_BATCH + 1 },
      (_, i) => `job-${i}`,
    )
    const result = cancelGenerationsRequestSchema.safeParse({ jobIds })
    expect(result.success).toBe(false)
  })

  it('rejects a blank jobId', () => {
    const result = cancelGenerationsRequestSchema.safeParse({ jobIds: [''] })
    expect(result.success).toBe(false)
  })

  it('rejects a missing jobIds field', () => {
    const result = cancelGenerationsRequestSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('cancelGenerationsResponseSchema', () => {
  it('accepts a fully partitioned response', () => {
    const result = cancelGenerationsResponseSchema.safeParse({
      cancelled: ['job-1'],
      alreadyFinished: ['job-2'],
      notFound: ['job-3'],
    })
    expect(result.success).toBe(true)
  })

  it('accepts empty arrays for every bucket', () => {
    const result = cancelGenerationsResponseSchema.safeParse({
      cancelled: [],
      alreadyFinished: [],
      notFound: [],
    })
    expect(result.success).toBe(true)
  })

  it('rejects a missing bucket', () => {
    const result = cancelGenerationsResponseSchema.safeParse({
      cancelled: [],
      alreadyFinished: [],
    })
    expect(result.success).toBe(false)
  })
})

describe('workerCancelRequestSchema', () => {
  it('accepts jobId alone', () => {
    const result = workerCancelRequestSchema.safeParse({ jobId: 'job-1' })
    expect(result.success).toBe(true)
  })

  it('accepts every optional identifier populated', () => {
    const result = workerCancelRequestSchema.safeParse({
      jobId: 'job-1',
      workflowInstanceId: 'wf-1',
      provider: 'fal',
      providerJobId: 'req-1',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a missing jobId', () => {
    const result = workerCancelRequestSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})
