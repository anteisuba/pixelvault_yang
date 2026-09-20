import { describe, expect, it } from 'vitest'

import {
  getNovelAiCharacterLayoutMode,
  getNovelAiImageDimensions,
  getNovelAiMaxCharacters,
  isWithinNovelAiOpusFreeTier,
  novelAiGridCellCenter,
  novelAiInpaintFallsBack,
  resolveNovelAiInpaintModelId,
  snapToNovelAiGrid,
  supportsNovelAiCharacters,
} from '@/constants/novelai'

describe('NovelAI inpainting model map', () => {
  it('sends V5 Full to its own inpainting model', () => {
    expect(resolveNovelAiInpaintModelId('nai-diffusion-5-full')).toBe(
      'nai-diffusion-5-full-inpainting',
    )
    expect(novelAiInpaintFallsBack('nai-diffusion-5-full')).toBe(false)
  })

  // V5 Curated 没有自己的 inpaint 模型（官方 models 页）—— 它借 V4.5 Full 的，
  // 界面要说出来，所以这条回落必须是**可查询的**而不是藏在 worker 里。
  it('falls V5 Curated back to the V4.5 Full inpainting model', () => {
    expect(resolveNovelAiInpaintModelId('nai-diffusion-5-curated')).toBe(
      'nai-diffusion-4-5-full-inpainting',
    )
    expect(novelAiInpaintFallsBack('nai-diffusion-5-curated')).toBe(true)
  })

  it.each([undefined, 'nai-diffusion-4-5-full', 'fal-ai/flux-2/flash'])(
    'has no inpainting counterpart for %s',
    (modelId) => {
      expect(resolveNovelAiInpaintModelId(modelId)).toBeUndefined()
      expect(novelAiInpaintFallsBack(modelId)).toBe(false)
    },
  )
})

describe('NovelAI 角色构图两形态', () => {
  // 按模型能力切，⛔ 不给用户选（D10 ④）。
  it.each([
    ['nai-diffusion-5-full', 'free', 22],
    ['nai-diffusion-5-curated', 'free', 22],
    ['nai-diffusion-4-5-full', 'grid', 6],
    ['nai-diffusion-4-5-curated', 'grid', 6],
  ])('%s 是 %s 档，最多 %i 人', (modelId, mode, max) => {
    expect(getNovelAiCharacterLayoutMode(modelId)).toBe(mode)
    expect(getNovelAiMaxCharacters(modelId)).toBe(max)
    expect(supportsNovelAiCharacters(modelId)).toBe(true)
  })

  it.each([undefined, 'fal-ai/flux-2/flash', 'pixai-tsubaki-2'])(
    '%s 没有角色构图',
    (modelId) => {
      expect(getNovelAiCharacterLayoutMode(modelId)).toBeUndefined()
      expect(getNovelAiMaxCharacters(modelId)).toBe(0)
      expect(supportsNovelAiCharacters(modelId)).toBe(false)
    },
  )

  // 5 格的格心：0.1 / 0.3 / 0.5 / 0.7 / 0.9。
  it('网格档把坐标吸到格心', () => {
    expect(novelAiGridCellCenter(0)).toBeCloseTo(0.1)
    expect(novelAiGridCellCenter(4)).toBeCloseTo(0.9)
    expect(snapToNovelAiGrid(0)).toBeCloseTo(0.1)
    expect(snapToNovelAiGrid(0.44)).toBeCloseTo(0.5)
    expect(snapToNovelAiGrid(1)).toBeCloseTo(0.9)
  })
})

describe('NovelAI 出图尺寸与 Opus 免费窗口', () => {
  it('按比例查到官方档位', () => {
    expect(getNovelAiImageDimensions('16:9')).toEqual({
      width: 1216,
      height: 832,
    })
    expect(getNovelAiImageDimensions('nonsense')).toEqual({
      width: 1024,
      height: 1024,
    })
  })

  // 官方判据：单张 · ≤1024² · ≤28 步。
  it('三条都满足才在免费窗口里', () => {
    const base = { width: 1024, height: 1024, steps: 28, imageCount: 1 }
    expect(isWithinNovelAiOpusFreeTier(base)).toBe(true)
    expect(isWithinNovelAiOpusFreeTier({ ...base, steps: 29 })).toBe(false)
    expect(isWithinNovelAiOpusFreeTier({ ...base, imageCount: 2 })).toBe(false)
    // 判据是**总像素**而不是两条边：官方的 Normal 档 1216×832 = 1,011,712 px
    // 仍在 1024² 以内，所以它是免费的；Large 档才越线。
    expect(
      isWithinNovelAiOpusFreeTier({ ...base, width: 1216, height: 832 }),
    ).toBe(true)
    expect(
      isWithinNovelAiOpusFreeTier({ ...base, width: 1728, height: 1024 }),
    ).toBe(false)
  })
})
