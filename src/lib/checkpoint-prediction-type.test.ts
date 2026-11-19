import { describe, expect, it } from 'vitest'

import { inferCheckpointPredictionType } from './checkpoint-prediction-type'

// 名字全部取自 Civitai 上的真实底模（2026-11-19）。
describe('inferCheckpointPredictionType', () => {
  it.each([
    [
      'flow from the file name when the version name is bare',
      {
        modelName: 'ChenkinNoob-XL Rectified-Flow',
        versionName: 'v0.3',
        fileName: 'ChenkinNoob-XL-v0.3-Rectified-Flow.safetensors',
      },
      'flow',
    ],
    [
      'flow from a standalone RF token',
      {
        modelName: 'SilvermoonMix03-Chenkin-Rectified-Flow',
        versionName: 'v2.1 RF',
      },
      'flow',
    ],
    [
      'version name beats model name (vpred epoch of an RF model)',
      {
        modelName: 'AstolfoRF - SDXL Rectified Flow',
        versionName: '2.5EP (vpred)',
      },
      'v_prediction',
    ],
    [
      'RF epoch of the same model',
      {
        modelName: 'AstolfoRF - SDXL Rectified Flow',
        versionName: '3EP (RF)',
        fileName: 'x1a-AstolfoRF-3ep.safetensors',
      },
      'flow',
    ],
    [
      'v-pred from the model name',
      { modelName: 'Hikari Noob v-pred', versionName: '1.2.4' },
      'v_prediction',
    ],
    [
      'vPred spelled without separator',
      { modelName: 'Schnitza vPred', versionName: 'v2' },
      'v_prediction',
    ],
    [
      'Rectified Diffusion distill without "flow" stays eps',
      {
        modelName: 'NoobAIXL-Rectified-6 Steps',
        versionName: 'v1.0',
        fileName: 'noobaiXL_Rectified.safetensors',
      },
      'epsilon',
    ],
    [
      'an explicit epsilon version of a v-pred line',
      { modelName: 'Some Noob v-pred', versionName: 'v1.0 eps' },
      'epsilon',
    ],
    [
      'ordinary checkpoints',
      {
        modelName: 'WAI-illustrious-SDXL',
        versionName: 'v15.0',
        fileName: 'waiIllustriousSDXL_v150.safetensors',
      },
      'epsilon',
    ],
    [
      'RF inside a word is not a signal',
      {
        modelName: 'Surfmix XL',
        versionName: 'v1',
        fileName: 'surfRFmix.safetensors',
      },
      'epsilon',
    ],
  ])('%s', (_label, names, expected) => {
    expect(inferCheckpointPredictionType(names)).toBe(expected)
  })
})
