import { describe, expect, it } from 'vitest'

import {
  closestNovelAiAspectRatio,
  findNovelAiResolutionPreset,
  getNovelAiCharacterLayoutMode,
  getNovelAiImageDimensions,
  getNovelAiMaxCharacters,
  getNovelAiOpusCost,
  isValidNovelAiDimensions,
  novelAiGridCellCenter,
  novelAiInpaintFallsBack,
  pickNovelAiPresetForTier,
  resolveNovelAiDimensions,
  resolveNovelAiInpaintModelId,
  snapNovelAiDimension,
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

  // V5 Curated 没有自己的 inpaint 模型 —— 网页端借 V4.5 Curated 的，界面要说出来，
  // 所以这条回落必须是**可查询的**而不是藏在 worker 里。
  it('falls V5 Curated back to the V4.5 Curated inpainting model', () => {
    expect(resolveNovelAiInpaintModelId('nai-diffusion-5-curated')).toBe(
      'nai-diffusion-4-5-curated-inpainting',
    )
    expect(novelAiInpaintFallsBack('nai-diffusion-5-curated')).toBe(true)
  })

  it.each(['nai-diffusion-4-5-full', 'nai-diffusion-4-5-curated'])(
    'sends %s to its own inpainting model',
    (modelId) => {
      expect(resolveNovelAiInpaintModelId(modelId)).toBe(
        `${modelId}-inpainting`,
      )
      expect(novelAiInpaintFallsBack(modelId)).toBe(false)
    },
  )

  it.each([undefined, 'nai-diffusion-3', 'fal-ai/flux-2/flash'])(
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

  // 官方判据（subscription 页）：文生图 · 单张 · ≤1024² · ≤28 步；V5 计入用量条（FAQ）。
  it('文生图 · 单张 · ≤1024² · ≤28 步才免', () => {
    const base = {
      width: 1024,
      height: 1024,
      steps: 28,
      imageCount: 1,
      hasReferenceImage: false,
      modelIds: ['nai-diffusion-4-5-full'],
    }
    expect(getNovelAiOpusCost(base)).toBe('free')
    expect(getNovelAiOpusCost({ ...base, steps: 29 })).toBe('metered')
    expect(getNovelAiOpusCost({ ...base, imageCount: 2 })).toBe('metered')
    // 判据是**总像素**而不是两条边：官方的 Normal 档 1216×832 = 1,011,712 px
    // 仍在 1024² 以内，所以它是免费的；Large 档才越线。
    expect(getNovelAiOpusCost({ ...base, width: 1216, height: 832 })).toBe(
      'free',
    )
    expect(getNovelAiOpusCost({ ...base, width: 1728, height: 1024 })).toBe(
      'metered',
    )
  })

  it('带底图（图生图 / 重绘 / 精确参考）不免', () => {
    expect(
      getNovelAiOpusCost({
        width: 1024,
        height: 1024,
        steps: 28,
        imageCount: 1,
        hasReferenceImage: true,
        modelIds: ['nai-diffusion-4-5-full'],
      }),
    ).toBe('metered')
  })

  it('V5 在免费条件内也计入用量条；超规格照样按 Anlas', () => {
    const v5 = {
      width: 1024,
      height: 1024,
      steps: 28,
      imageCount: 1,
      hasReferenceImage: false,
      modelIds: ['nai-diffusion-5-curated'],
    }
    expect(getNovelAiOpusCost(v5)).toBe('usageLimited')
    expect(getNovelAiOpusCost({ ...v5, steps: 40 })).toBe('metered')
    expect(
      getNovelAiOpusCost({
        ...v5,
        modelIds: ['nai-diffusion-4-5-full', 'nai-diffusion-5-full'],
      }),
    ).toBe('usageLimited')
  })

  it('校验 64 倍数、单边上限与总像素上限，并提供吸附与解析', () => {
    expect(isValidNovelAiDimensions(832, 1216)).toBe(true)
    expect(isValidNovelAiDimensions(2048, 1536)).toBe(true)
    expect(isValidNovelAiDimensions(1920, 1088)).toBe(true)
    expect(isValidNovelAiDimensions(800, 1216)).toBe(false)
    expect(isValidNovelAiDimensions(2048, 2048)).toBe(false)
    expect(isValidNovelAiDimensions(0, 1024)).toBe(false)

    expect(snapNovelAiDimension(1000)).toBe(1024)
    expect(snapNovelAiDimension(10)).toBe(64)
    expect(snapNovelAiDimension(9999)).toBe(2048)

    expect(
      resolveNovelAiDimensions({
        aspectRatio: '1:1',
        novelAiWidth: 1024,
        novelAiHeight: 1536,
      }),
    ).toEqual({ width: 1024, height: 1536 })
    expect(
      resolveNovelAiDimensions({
        aspectRatio: '16:9',
        novelAiWidth: 2048,
        novelAiHeight: 2048,
      }),
    ).toEqual({ width: 1216, height: 832 })
  })

  it('切换预设档位自动保持方向，Wallpaper 无正方时落到竖版', () => {
    expect(findNovelAiResolutionPreset(832, 1216)).toMatchObject({
      tier: 'normal',
      orientation: 'portrait',
    })
    expect(findNovelAiResolutionPreset(1024, 768)).toBeUndefined()

    expect(pickNovelAiPresetForTier('large', 832, 1216)).toMatchObject({
      width: 1024,
      height: 1536,
    })
    expect(pickNovelAiPresetForTier('wallpaper', 1216, 832)).toMatchObject({
      width: 1920,
      height: 1088,
    })
    expect(pickNovelAiPresetForTier('wallpaper', 1024, 1024)).toMatchObject({
      orientation: 'portrait',
      width: 1088,
      height: 1920,
    })

    expect(closestNovelAiAspectRatio(1024, 1536)).toBe('9:16')
    expect(closestNovelAiAspectRatio(1920, 1088)).toBe('16:9')
    expect(closestNovelAiAspectRatio(1472, 1472)).toBe('1:1')
  })
})
