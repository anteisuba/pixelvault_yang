import { describe, expect, it } from 'vitest'

import {
  novelAiInpaintFallsBack,
  resolveNovelAiInpaintModelId,
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
