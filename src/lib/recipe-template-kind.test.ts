import { describe, expect, it } from 'vitest'

import {
  getRecipeTemplateKind,
  getTagTemplateSource,
} from './recipe-template-kind'

const base = { outputType: 'IMAGE' as const, modelId: 'flux-2-pro' }

describe('标签模板的三个来处（pages/prompts.md）', () => {
  it('标签台存的 · 提示词页新建的 · LoRA 台存的都是「标签」，来处分得开', () => {
    expect(
      getTagTemplateSource({ ...base, params: { promptDialect: 'tags' } }),
    ).toBe('tags')
    expect(
      getTagTemplateSource({
        ...base,
        params: { promptDialect: 'tags', origin: 'prompts' },
      }),
    ).toBe('prompts')
    const lora = {
      ...base,
      params: {
        advancedParams: {
          loras: [
            { url: 'https://civitai.com/api/download/models/111', scale: 0.8 },
          ],
        },
      },
    }
    expect(getTagTemplateSource(lora)).toBe('lora')
    expect(getRecipeTemplateKind(lora)).toBe('TAGS')
  })

  it('自然语言图片模板与视频模板不是标签模板', () => {
    expect(getTagTemplateSource({ ...base, params: {} })).toBeNull()
    expect(getRecipeTemplateKind({ ...base, params: {} })).toBe('IMAGE')
    // 视频配方也可能带 LoRA：先看出图类型。
    const video = {
      outputType: 'VIDEO' as const,
      modelId: 'wan-video',
      params: {
        advancedParams: {
          loras: [{ url: 'https://example.com/a.safetensors', scale: 1 }],
        },
      },
    }
    expect(getTagTemplateSource(video)).toBeNull()
    expect(getRecipeTemplateKind(video)).toBe('VIDEO')
  })
})
