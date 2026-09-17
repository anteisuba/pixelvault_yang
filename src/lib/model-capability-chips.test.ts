import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  getModelCapabilityChips,
  isCapabilityChipSet,
  pruneIncompatibleCapabilityValues,
} from '@/lib/model-capability-chips'

const capabilitiesOf = (
  adapterType: AI_ADAPTER_TYPES,
  modelId?: string,
): string[] =>
  getModelCapabilityChips(adapterType, modelId).map((chip) => chip.capability)

describe('getModelCapabilityChips', () => {
  it('derives GPT Image chips from the capability table alone', () => {
    expect(
      capabilitiesOf(AI_ADAPTER_TYPES.OPENAI, AI_MODELS.OPENAI_GPT_IMAGE_2),
    ).toEqual(['quality', 'preview', 'background', 'style'])
  })

  // 2.5 的 override 是**整体替换**（不是合并），style 因此在这一档消失。
  it('follows a per-model override instead of the adapter default', () => {
    expect(
      capabilitiesOf(
        AI_ADAPTER_TYPES.OPENAI,
        AI_MODELS.OPENAI_GPT_IMAGE_25_FLARE,
      ),
    ).toEqual(['quality', 'preview', 'background'])
  })

  // 没有专属能力 = 宿主整段（虚线 + 小标 + chip 行）不渲染。
  it('returns nothing for models whose only capabilities are generic', () => {
    expect(
      capabilitiesOf(AI_ADAPTER_TYPES.GEMINI, AI_MODELS.GEMINI_PRO_IMAGE),
    ).toEqual([])
    expect(
      capabilitiesOf(AI_ADAPTER_TYPES.FAL, AI_MODELS.SEEDREAM_50_PRO),
    ).toEqual([])
  })

  // seed / 负面提示词 / LoRA 不是这条 chip 行的事（seed 进第 12 项的规格
  // 「更多」，UC 拆去 D2b，LoRA 只在 LoRA 工作台）。
  it('never derives seed, negative prompt or LoRA chips', () => {
    const caps = capabilitiesOf(AI_ADAPTER_TYPES.FAL, AI_MODELS.FLUX_LORA)
    expect(caps).not.toContain('seed')
    expect(caps).not.toContain('negativePrompt')
    expect(caps).not.toContain('lora')
    expect(caps).toEqual(['guidanceScale', 'steps', 'referenceStrength'])
  })

  it('marks referenceStrength as needing a reference image', () => {
    const chip = getModelCapabilityChips(
      AI_ADAPTER_TYPES.FAL,
      AI_MODELS.FLUX_LORA,
    ).find((entry) => entry.capability === 'referenceStrength')
    expect(chip?.requiresReferenceImage).toBe(true)
    expect(chip?.kind).toBe('slider')
  })

  it('ignores adapters that are not in the capability table', () => {
    expect(
      getModelCapabilityChips('not-an-adapter' as AI_ADAPTER_TYPES),
    ).toEqual([])
    expect(getModelCapabilityChips(undefined)).toEqual([])
  })
})

describe('isCapabilityChipSet', () => {
  it('treats the capability default as the idle state', () => {
    const [quality] = getModelCapabilityChips(
      AI_ADAPTER_TYPES.OPENAI,
      AI_MODELS.OPENAI_GPT_IMAGE_2,
    )
    expect(isCapabilityChipSet(quality, {})).toBe(false)
    expect(isCapabilityChipSet(quality, { quality: 'auto' })).toBe(false)
    expect(isCapabilityChipSet(quality, { quality: 'high' })).toBe(true)
  })
})

describe('pruneIncompatibleCapabilityValues', () => {
  // 通用值（提示词 · 参考轨 · 规格 · 张数）原样保留，专属值静默回默认。
  it('drops model-specific values the new model cannot take, keeping generic ones', () => {
    const next = pruneIncompatibleCapabilityValues(
      {
        prompt: undefined,
        quality: 'max',
        background: 'transparent',
        resolution: '2K',
        seed: 42,
        negativePrompt: 'blurry',
      } as never,
      AI_ADAPTER_TYPES.FAL,
      AI_MODELS.SEEDREAM_50_PRO,
    )
    expect(next).toEqual({
      prompt: undefined,
      resolution: '2K',
      seed: 42,
      negativePrompt: 'blurry',
    })
  })

  it('drops a quality tier the target model does not declare', () => {
    expect(
      pruneIncompatibleCapabilityValues(
        { quality: 'max' },
        AI_ADAPTER_TYPES.OPENAI,
        AI_MODELS.OPENAI_GPT_IMAGE_2,
      ),
    ).toEqual({})
  })

  it('keeps a value the target model still supports', () => {
    expect(
      pruneIncompatibleCapabilityValues(
        { quality: 'high', background: 'transparent' },
        AI_ADAPTER_TYPES.OPENAI,
        AI_MODELS.OPENAI_GPT_IMAGE_2,
      ),
    ).toBeNull()
  })

  // ⚠ 没有变化必须返回 null —— 宿主的 effect 依赖里就有 advancedParams，
  // 每次都还一个新对象会把它打成死循环。
  it('returns null when nothing changes', () => {
    expect(
      pruneIncompatibleCapabilityValues(
        { resolution: '2K' },
        AI_ADAPTER_TYPES.GEMINI,
        AI_MODELS.GEMINI_PRO_IMAGE,
      ),
    ).toBeNull()
  })

  it('drops a slider value outside the new model range', () => {
    expect(
      pruneIncompatibleCapabilityValues(
        { guidanceScale: 18 },
        AI_ADAPTER_TYPES.FAL,
        AI_MODELS.FLUX_2_FLASH,
      ),
    ).toBeNull()
    expect(
      pruneIncompatibleCapabilityValues(
        { guidanceScale: 18 },
        AI_ADAPTER_TYPES.VOLCENGINE,
      ),
    ).toEqual({})
  })
})
