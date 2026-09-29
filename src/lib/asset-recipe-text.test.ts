import { describe, expect, it } from 'vitest'

import {
  buildAssetRecipeText,
  formatGenerationSeed,
} from '@/lib/asset-recipe-text'

const base = {
  prompt: '1girl, white bridal lingerie',
  negativePrompt: 'lowres, bad hands',
  model: 'wai-illustrious-sdxl',
  width: 832,
  height: 1216,
  seed: '1234567890123' as string | number | bigint | null,
  snapshot: {
    compiledPrompt: 'x',
    advancedParams: {
      steps: 28,
      guidanceScale: 5,
      runnerSampler: 'euler_ancestral',
      runnerScheduler: 'normal',
    },
  } as unknown,
}

describe('buildAssetRecipeText', () => {
  it('writes prompt, negative and one params line like the LoRA viewer', () => {
    expect(buildAssetRecipeText(base)).toBe(
      [
        '1girl, white bridal lingerie',
        'Negative prompt: lowres, bad hands',
        'Steps: 28, Sampler: euler_ancestral, Scheduler: normal, CFG scale: 5, Seed: 1234567890123, Size: 832x1216, Model: wai-illustrious-sdxl',
      ].join('\n'),
    )
  })

  it('skips what the record does not have, and never names the upload sentinel as a model', () => {
    expect(
      buildAssetRecipeText({
        ...base,
        prompt: '  ',
        negativePrompt: null,
        model: 'user-upload',
        seed: null,
        snapshot: null,
      }),
    ).toBe('Size: 832x1216')
  })

  it('tolerates old snapshots whose shape does not match', () => {
    expect(
      buildAssetRecipeText({
        ...base,
        negativePrompt: null,
        seed: null,
        snapshot: { advancedParams: 'broken' },
      }),
    ).toBe(
      '1girl, white bridal lingerie\nSize: 832x1216, Model: wai-illustrious-sdxl',
    )
  })
})

describe('formatGenerationSeed', () => {
  it('reads bigint, number and string seeds alike', () => {
    expect(formatGenerationSeed(BigInt(42))).toBe('42')
    expect(formatGenerationSeed(7)).toBe('7')
    expect(formatGenerationSeed('9')).toBe('9')
    expect(formatGenerationSeed(null)).toBeNull()
  })
})
