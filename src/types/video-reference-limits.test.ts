import { describe, expect, it } from 'vitest'

import { EXECUTION_WORKFLOW_IDS } from '@/constants/execution'
import { VIDEO_REFERENCE_LIMITS } from '@/constants/video-reference-limits'

import { GenerateVideoRequestSchema, WorkerRunContextSchema } from '@/types'

const buildVideoRequest = () => ({
  prompt: 'A conversation in a quiet room',
  modelId: 'seedance-2.5',
})

describe('video reference request limits', () => {
  it('keeps the image schema ceiling aligned with the shared constant', () => {
    const atLimit = GenerateVideoRequestSchema.safeParse({
      ...buildVideoRequest(),
      referenceImages: Array.from(
        { length: VIDEO_REFERENCE_LIMITS.IMAGES },
        (_, index) => `https://cdn.example.com/reference-${index}.png`,
      ),
    })
    const overLimit = GenerateVideoRequestSchema.safeParse({
      ...buildVideoRequest(),
      referenceImages: Array.from(
        { length: VIDEO_REFERENCE_LIMITS.IMAGES + 1 },
        (_, index) => `https://cdn.example.com/reference-${index}.png`,
      ),
    })

    expect(atLimit.success).toBe(true)
    expect(overLimit.success).toBe(false)
  })

  it('keeps audio URLs and bindings aligned with the shared constant', () => {
    const audioUrls = Array.from(
      { length: VIDEO_REFERENCE_LIMITS.AUDIO },
      (_, index) => `https://cdn.example.com/audio-${index}.mp3`,
    )
    const audioBindings = audioUrls.map((url, index) => ({
      url,
      characterName: `Character ${index}`,
    }))

    expect(
      GenerateVideoRequestSchema.safeParse({
        ...buildVideoRequest(),
        audioUrls,
        audioBindings,
      }).success,
    ).toBe(true)
    expect(
      GenerateVideoRequestSchema.safeParse({
        ...buildVideoRequest(),
        audioUrls: [...audioUrls, 'https://cdn.example.com/audio-extra.mp3'],
      }).success,
    ).toBe(false)
    expect(
      GenerateVideoRequestSchema.safeParse({
        ...buildVideoRequest(),
        audioBindings: [
          ...audioBindings,
          {
            url: 'https://cdn.example.com/audio-extra.mp3',
            characterName: 'Extra character',
          },
        ],
      }).success,
    ).toBe(false)
  })

  it('keeps the worker video payload aligned with the same constants', () => {
    const referenceImages = Array.from(
      { length: VIDEO_REFERENCE_LIMITS.IMAGES },
      (_, index) => `https://cdn.example.com/reference-${index}.png`,
    )
    const audioUrls = Array.from(
      { length: VIDEO_REFERENCE_LIMITS.AUDIO },
      (_, index) => `https://cdn.example.com/audio-${index}.mp3`,
    )
    const context = {
      runId: 'run-1',
      workflowId: EXECUTION_WORKFLOW_IDS.FAL_QUEUE,
      providerId: 'provider-1',
      useSystemKey: true,
      callbackUrl: 'https://app.example.com/callback',
      resolveKeyUrl: 'https://app.example.com/resolve-key',
      timeoutMs: 60_000,
      maxAttempts: 2,
      pollIntervalMs: 1_000,
      outputType: 'VIDEO',
      providerInput: {
        prompt: 'A conversation in a quiet room',
        modelId: 'seedance-2.5',
        externalModelId: 'seedance-2.5',
        aspectRatio: '16:9',
        referenceImages,
        audioUrls,
        audioBindings: audioUrls.map((url) => ({ url })),
        width: 1280,
        height: 720,
      },
    }

    expect(WorkerRunContextSchema.safeParse(context).success).toBe(true)
    expect(
      WorkerRunContextSchema.safeParse({
        ...context,
        providerInput: {
          ...context.providerInput,
          referenceImages: [
            ...referenceImages,
            'https://cdn.example.com/reference-extra.png',
          ],
        },
      }).success,
    ).toBe(false)
    expect(
      WorkerRunContextSchema.safeParse({
        ...context,
        providerInput: {
          ...context.providerInput,
          audioUrls: [...audioUrls, 'https://cdn.example.com/audio-extra.mp3'],
        },
      }).success,
    ).toBe(false)
  })
})
