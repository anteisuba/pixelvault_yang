import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
  },
}))

import {
  GENERATION_STAGE,
  GenerationStageTimer,
  withGenerationObservability,
} from '@/lib/generation-observability'
import { logger } from '@/lib/logger'

describe('generation-observability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('records additive stage durations and appends a JSON-safe snapshot', async () => {
    let now = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    const timer = new GenerationStageTimer({
      outputType: 'IMAGE',
      modelId: 'gpt-image-2',
    })

    now += 30
    await timer.measure(GENERATION_STAGE.PROVIDER_SUBMIT, async () => {
      now += 70
    })

    await timer.measure(GENERATION_STAGE.PROVIDER_SUBMIT, async () => {
      now += 20
    })

    timer.addNote('streamed')

    const snapshot = withGenerationObservability(
      { compiledPrompt: 'prompt' },
      timer,
    )

    expect(snapshot).toMatchObject({
      compiledPrompt: 'prompt',
      observability: {
        version: 1,
        totalMs: 120,
        stageDurationsMs: {
          provider_submit: 90,
        },
        notes: ['streamed'],
      },
    })
  })

  it('logs normalized timing context', () => {
    const timer = new GenerationStageTimer({
      outputType: 'VIDEO',
      jobId: 'job-1',
      modelId: 'kling-v3-pro',
    })

    timer.setDuration(GENERATION_STAGE.PROVIDER_WAIT_POLL, 123.4)
    timer.setContext({ generationId: 'gen-1', provider: 'FAL' })
    timer.log({ requestId: 'req-1' })

    expect(logger.info).toHaveBeenCalledWith(
      'Generation stage timings',
      expect.objectContaining({
        event: 'generation_stage_timings',
        outputType: 'VIDEO',
        jobId: 'job-1',
        generationId: 'gen-1',
        modelId: 'kling-v3-pro',
        provider: 'FAL',
        requestId: 'req-1',
        stageDurationsMs: {
          provider_wait_poll: 123,
        },
      }),
    )
  })
})
