import { describe, expect, it } from 'vitest'

import { RUNNER_NATIVE_DIMENSIONS } from '../../../../../src/constants/runner-dimensions'
import type { WorkerImageRunContext } from '../../index'
import {
  getRunnerCheckpointSpec,
  getRunnerDimensions,
  readRunnerClipSkip,
} from './image'

describe('getRunnerDimensions (default per aspect ratio)', () => {
  it('gives SDXL the ~1MP training bucket, not 1792×1024', () => {
    expect(getRunnerDimensions({}, '16:9', 'sdxl')).toEqual({
      width: 1344,
      height: 768,
    })
    expect(getRunnerDimensions({}, '9:16', 'sdxl')).toEqual({
      width: 768,
      height: 1344,
    })
  })

  it('reads the same table the LoRA workbench preview reads, for every architecture', () => {
    for (const architecture of ['sdxl', 'anima', 'zimage', 'krea2'] as const) {
      for (const [ratio, size] of Object.entries(RUNNER_NATIVE_DIMENSIONS)) {
        expect(getRunnerDimensions({}, ratio, architecture)).toEqual(size)
      }
    }
  })

  it('still honours exact dimensions', () => {
    expect(
      getRunnerDimensions(
        { runnerWidth: 832, runnerHeight: 1216 },
        '16:9',
        'sdxl',
      ),
    ).toEqual({ width: 832, height: 1216 })
  })
})

describe('readRunnerClipSkip', () => {
  it('returns the recipe clip skip when present', () => {
    expect(readRunnerClipSkip({ runnerClipSkip: 2 })).toBe(2)
    expect(readRunnerClipSkip({ runnerClipSkip: 1 })).toBe(1)
  })

  it('leaves it to the checkpoint when absent', () => {
    expect(readRunnerClipSkip({})).toBeUndefined()
  })

  it('rejects a clip skip ComfyUI cannot apply', () => {
    for (const value of [0, -2, 1.5, 13, 'two']) {
      expect(() => readRunnerClipSkip({ runnerClipSkip: value })).toThrow(
        /clip skip/i,
      )
    }
  })
})

describe('getRunnerCheckpointSpec', () => {
  function contextWith(runnerCheckpoint: Record<string, unknown>) {
    return {
      providerInput: { advancedParams: { runnerCheckpoint } },
    } as unknown as WorkerImageRunContext
  }
  const base = {
    filename: 'civitai-ckpt-2753273.safetensors',
    downloadUrl: 'https://civitai.com/api/download/models/2753273',
  }

  it('passes a known prediction type through', () => {
    expect(
      getRunnerCheckpointSpec(contextWith({ ...base, predictionType: 'flow' })),
    ).toMatchObject({ predictionType: 'flow' })
    expect(
      getRunnerCheckpointSpec(
        contextWith({ ...base, predictionType: 'v_prediction' }),
      ),
    ).toMatchObject({ predictionType: 'v_prediction' })
  })

  it('drops an unknown one rather than inventing a sampling node', () => {
    expect(
      getRunnerCheckpointSpec(contextWith({ ...base, predictionType: 'edm' })),
    ).not.toHaveProperty('predictionType')
  })
})
