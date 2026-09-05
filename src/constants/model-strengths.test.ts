import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import {
  ADAPTER_PROMPT_HINTS,
  MODEL_STRENGTHS,
  TAG_BASED_PROMPT_MODEL_IDS,
  getModelEnhanceHint,
  isTagBasedPromptModel,
} from '@/constants/model-strengths'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

/**
 * A1111 的权重形态：一对圆括号里带冒号加数字。NovelAI **不解析**它 —— 那串字符
 * 会被当成普通 token 喂进去。这条正则就是用来在 NovelAI 的方言说明里抓它的。
 */
const A1111_WEIGHT_SHAPE = /\([^)]*:\s*-?\d/

const NOVELAI_MODEL_IDS = [
  AI_MODELS.NOVELAI_V45_FULL,
  AI_MODELS.NOVELAI_V45_CURATED,
  AI_MODELS.NOVELAI_V5_FULL,
  AI_MODELS.NOVELAI_V5_CURATED,
] as const

describe('NovelAI 的权重语法', () => {
  it.each(NOVELAI_MODEL_IDS)(
    '%s 的方言说明不写 A1111 那套括号权重，写 NovelAI 的 :: 数值强调',
    (modelId) => {
      const hint = MODEL_STRENGTHS[modelId]?.enhanceHint
      expect(hint).toBeTruthy()
      expect(hint).not.toMatch(A1111_WEIGHT_SHAPE)
      expect(hint).toContain('::')
      // 括号那一层的官方写法：{} ×1.05、[] ÷1.05。
      expect(hint).toContain('{tag}')
      expect(hint).toContain('[tag]')
      expect(hint).toContain('1.05')
      // 多角色分段与文字渲染，两条都在同一份说明里。
      expect(hint).toContain('|')
      expect(hint).toContain('Text:')
    },
  )

  it('V4.5 Full 带官方 quality 串，且明说它接在末尾', () => {
    const hint = MODEL_STRENGTHS[AI_MODELS.NOVELAI_V45_FULL]?.enhanceHint ?? ''
    expect(hint).toContain('location, very aesthetic, masterpiece, no text')
    expect(hint).toContain('END')
  })

  it('V4.5+ 的负强调写成 -1::tag ::，不是负权重括号', () => {
    for (const modelId of NOVELAI_MODEL_IDS) {
      expect(MODEL_STRENGTHS[modelId]?.enhanceHint).toContain('-1::tag ::')
    }
  })

  /**
   * ⚠ Illustrious 家族**确实**吃 A1111 那套括号（它走的是 Comfy/A1111 解析器）——
   * 这一条锁住「别把 NovelAI 的修法顺手抹到隔壁」。
   */
  it('Illustrious 家族保留括号权重（它不是 NovelAI）', () => {
    expect(MODEL_STRENGTHS[AI_MODELS.ILLUSTRIOUS_XL]?.enhanceHint).toMatch(
      A1111_WEIGHT_SHAPE,
    )
  })
})

describe('tag 方言名册', () => {
  const TAG_BASED = [
    AI_MODELS.NOVELAI_V45_FULL,
    AI_MODELS.NOVELAI_V45_CURATED,
    AI_MODELS.NOVELAI_V5_FULL,
    AI_MODELS.NOVELAI_V5_CURATED,
    AI_MODELS.ILLUSTRIOUS_XL,
    AI_MODELS.ANIMA_PENCIL_XL,
    AI_MODELS.ILLUSTRIOUS_RECIPE_CLONE,
    AI_MODELS.ANIMA_PENCIL_XL_RUNNER,
    AI_MODELS.PONY_DIFFUSION_V6,
    AI_MODELS.SDXL_10_RUNNER,
    AI_MODELS.ANIMA_DIT_RUNNER,
  ] as const

  it.each(TAG_BASED)('%s 判定为 tag 方言', (modelId) => {
    expect(isTagBasedPromptModel(modelId)).toBe(true)
  })

  it.each([
    AI_MODELS.FLUX_2_PRO,
    AI_MODELS.OPENAI_GPT_IMAGE_2,
    AI_MODELS.GEMINI_FLASH_IMAGE,
    AI_MODELS.SEEDREAM_50_PRO,
  ] as const)('%s 不是 tag 方言', (modelId) => {
    expect(isTagBasedPromptModel(modelId)).toBe(false)
  })

  /**
   * 名册与 `promptStyle` 必须互相盖住。⛔ 别把判定改回「读 promptStyle」——
   * 那条会漏掉每一个还没写 strength 条目的模型（这次修的就是那个漏）。
   */
  it('名册与 MODEL_STRENGTHS 的 promptStyle 双向一致', () => {
    for (const [modelId, strength] of Object.entries(MODEL_STRENGTHS)) {
      if (strength?.promptStyle === 'tag-based') {
        expect(TAG_BASED_PROMPT_MODEL_IDS.has(modelId)).toBe(true)
      }
    }
    for (const modelId of TAG_BASED_PROMPT_MODEL_IDS) {
      expect(MODEL_STRENGTHS[modelId as AI_MODELS]?.promptStyle).toBe(
        'tag-based',
      )
    }
  })

  it('每个 tag 方言模型都带自己的必带前缀说明', () => {
    expect(MODEL_STRENGTHS[AI_MODELS.PONY_DIFFUSION_V6]?.enhanceHint).toContain(
      'score_9, score_8_up, score_7_up',
    )
    expect(MODEL_STRENGTHS[AI_MODELS.PONY_DIFFUSION_V6]?.enhanceHint).toContain(
      'source_anime',
    )
    for (const modelId of [
      AI_MODELS.ILLUSTRIOUS_XL,
      AI_MODELS.ILLUSTRIOUS_RECIPE_CLONE,
      AI_MODELS.ANIMA_PENCIL_XL,
      AI_MODELS.ANIMA_PENCIL_XL_RUNNER,
    ] as const) {
      expect(MODEL_STRENGTHS[modelId]?.enhanceHint).toContain(
        'masterpiece, best quality',
      )
    }
  })
})

/**
 * ⚠ 这是一份**读源码**的测试：`registry.ts` 是 `server-only`，直接 import 会把
 * 服务端模块拖进 constants 层的用例。同类先例见 `assistant-operator.money-gate.test.ts`。
 * 名册以 `PROVIDER_ADAPTERS` 为准（CLAUDE.md 明文），所以这里也从它取。
 */
const REGISTRY_SOURCE = readFileSync(
  join(process.cwd(), 'src/services/providers/registry.ts'),
  'utf8',
)

function registryAdapterTypes(): AI_ADAPTER_TYPES[] {
  const body = REGISTRY_SOURCE.slice(
    REGISTRY_SOURCE.indexOf('const PROVIDER_ADAPTERS'),
  )
  const names = [...body.matchAll(/\[AI_ADAPTER_TYPES\.([A-Z0-9_]+)\]:/g)].map(
    (match) => match[1],
  )
  return names.map((name) => {
    const value = (AI_ADAPTER_TYPES as Record<string, AI_ADAPTER_TYPES>)[name]
    expect(value, `AI_ADAPTER_TYPES.${name} 不存在`).toBeTruthy()
    return value
  })
}

describe('adapter 兜底方言（以 PROVIDER_ADAPTERS 为准）', () => {
  it('registry 里确实有一串媒体 adapter（正则没抓空）', () => {
    expect(registryAdapterTypes().length).toBeGreaterThanOrEqual(13)
  })

  it.each(registryAdapterTypes())(
    '%s 有兜底 hint，未知模型也拿得到方言',
    (adapterType) => {
      expect(ADAPTER_PROMPT_HINTS[adapterType]).toBeTruthy()
      expect(
        getModelEnhanceHint('some-unlisted-model-id', adapterType),
      ).toBeTruthy()
    },
  )

  it('语音 adapter 的说明说的是「怎么念」，不是「画什么」', () => {
    expect(ADAPTER_PROMPT_HINTS[AI_ADAPTER_TYPES.FISH_AUDIO]).toContain(
      '[whispering]',
    )
    expect(ADAPTER_PROMPT_HINTS[AI_ADAPTER_TYPES.ELEVENLABS]).toContain(
      '[whispers]',
    )
    // v3 不吃 SSML —— 写出来才挡得住模型自己发明一段标签。
    expect(ADAPTER_PROMPT_HINTS[AI_ADAPTER_TYPES.ELEVENLABS]).toContain('SSML')
  })

  /**
   * ⛔ 纯文本 LLM 线路有意没有条目 —— 见 `ADAPTER_PROMPT_HINTS` 尾部注释。
   * 这一条不是「暂时没写」，是结论；哪天有人补了，先读那段注释。
   */
  it('纯文本 LLM 线路（anthropic / xai）有意不列', () => {
    expect(ADAPTER_PROMPT_HINTS[AI_ADAPTER_TYPES.ANTHROPIC]).toBeUndefined()
    expect(ADAPTER_PROMPT_HINTS[AI_ADAPTER_TYPES.XAI]).toBeUndefined()
  })
})
