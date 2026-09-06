import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import {
  ADAPTER_PROMPT_HINTS,
  MODEL_STRENGTHS,
  NEGATIVE_PROMPT_SUPPORTS,
  TAG_BASED_PROMPT_MODEL_IDS,
  getModelEnhanceHint,
  getModelNegativePromptSupport,
  isTagBasedPromptModel,
} from '@/constants/model-strengths'
import { IMAGE_MODEL_OPTIONS } from '@/constants/models/image'
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

// ── 逐图片模型的官方提示词规则 ─────────────────────────────────────
// 名册以 `IMAGE_MODEL_OPTIONS` 为准：新增模型忘了写方言条目，这一组会红。

/** hint 会整段拼进系统提示词，长了就挤掉真正的任务指令。 */
const MAX_HINT_LENGTH = 900

const IMAGE_MODEL_IDS = IMAGE_MODEL_OPTIONS.map((model) => model.id)

/** 编辑方言与生成方言不是一回事的那几条。 */
const EDIT_MODEL_IDS = [
  AI_MODELS.FLUX_2_PRO_EDIT,
  AI_MODELS.FLUX_KONTEXT_MAX,
] as const

/** 请求体里**根本没有** negative 字段的模型（官方文档明写）。 */
const NO_NEGATIVE_MODEL_IDS = [
  AI_MODELS.OPENAI_GPT_IMAGE_2,
  AI_MODELS.GEMINI_PRO_IMAGE,
  AI_MODELS.GEMINI_FLASH_IMAGE,
  AI_MODELS.GEMINI_FLASH_LITE_IMAGE,
  AI_MODELS.FLUX_2_PRO,
  AI_MODELS.FLUX_2_FLASH,
  AI_MODELS.FLUX_2_PRO_EDIT,
  AI_MODELS.FLUX_KONTEXT_MAX,
  AI_MODELS.FLUX_LORA,
  AI_MODELS.IDEOGRAM_3,
  AI_MODELS.RECRAFT_V4_PRO,
] as const

const GEMINI_MODEL_IDS = [
  AI_MODELS.GEMINI_PRO_IMAGE,
  AI_MODELS.GEMINI_FLASH_IMAGE,
  AI_MODELS.GEMINI_FLASH_LITE_IMAGE,
] as const

/** FLUX.2 才有官方 JSON 结构化 prompt；Kontext / flux-lora 是 FLUX.1，没有。 */
const FLUX_2_MODEL_IDS = [
  AI_MODELS.FLUX_2_PRO,
  AI_MODELS.FLUX_2_FLASH,
  AI_MODELS.FLUX_2_PRO_EDIT,
] as const

const SEEDREAM_MODEL_IDS = [
  AI_MODELS.SEEDREAM_50_PRO,
  AI_MODELS.SEEDREAM_50_LITE,
  AI_MODELS.SEEDREAM_50_VOLCENGINE,
  AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE,
  AI_MODELS.SEEDREAM_50_LITE_VOLCENGINE,
  AI_MODELS.SEEDREAM_50_PRO_BYTEPLUS,
  AI_MODELS.SEEDREAM_50_LITE_BYTEPLUS,
  AI_MODELS.SEEDREAM_45,
  AI_MODELS.SEEDREAM_45_VOLCENGINE,
] as const

describe('图片模型的逐 model 方言条目', () => {
  /**
   * 数字写死是**故意**的：加模型时这一条先红，提醒去补方言，而不是让新模型
   * 悄悄落到 adapter 兜底 hint 上。
   */
  it('图片名册就是 31 条，一条不漏地有 strength 条目', () => {
    expect(IMAGE_MODEL_IDS.length).toBe(31)
    for (const modelId of IMAGE_MODEL_IDS) {
      expect(MODEL_STRENGTHS[modelId], `${modelId} 缺方言条目`).toBeTruthy()
    }
  })

  it.each(IMAGE_MODEL_IDS)('%s 的 hint 非空且不超长', (modelId) => {
    const hint = MODEL_STRENGTHS[modelId]?.enhanceHint ?? ''
    expect(hint.trim().length).toBeGreaterThan(0)
    expect(hint.length).toBeLessThanOrEqual(MAX_HINT_LENGTH)
  })

  it.each(IMAGE_MODEL_IDS)('%s 标了合法的负向提示档位', (modelId) => {
    const support = MODEL_STRENGTHS[modelId]?.negativePrompt
    expect(NEGATIVE_PROMPT_SUPPORTS).toContain(support)
    expect(getModelNegativePromptSupport(modelId)).toBe(support)
  })

  /** ⚠ 未知模型必须是 null（「不知道」），不能编一个默认档位出来。 */
  it('未知模型的负向档位是 null，不是猜一个', () => {
    expect(
      getModelNegativePromptSupport('totally-unknown-model-xyz'),
    ).toBeNull()
  })
})

describe('负向提示的能力档位', () => {
  it.each(NO_NEGATIVE_MODEL_IDS)('%s 根本没有 negative 字段', (modelId) => {
    expect(MODEL_STRENGTHS[modelId]?.negativePrompt).toBe('unsupported')
  })

  it.each(NOVELAI_MODEL_IDS)('%s 走 NovelAI 的 UC 字段', (modelId) => {
    expect(MODEL_STRENGTHS[modelId]?.negativePrompt).toBe('undesired-content')
  })

  it.each(SEEDREAM_MODEL_IDS)('%s 有常规 negative 字段', (modelId) => {
    expect(MODEL_STRENGTHS[modelId]?.negativePrompt).toBe('supported')
  })

  it.each([
    AI_MODELS.ILLUSTRIOUS_XL,
    AI_MODELS.ANIMA_PENCIL_XL,
    AI_MODELS.ILLUSTRIOUS_RECIPE_CLONE,
    AI_MODELS.ANIMA_PENCIL_XL_RUNNER,
    AI_MODELS.PONY_DIFFUSION_V6,
    AI_MODELS.SDXL_10_RUNNER,
    AI_MODELS.ANIMA_DIT_RUNNER,
  ] as const)('%s 的负向是 tag 串', (modelId) => {
    expect(MODEL_STRENGTHS[modelId]?.negativePrompt).toBe('supported')
  })
})

describe('编辑方言', () => {
  it.each(EDIT_MODEL_IDS)('%s 带编辑方言，且是祈使的改写句', (modelId) => {
    const editHint = MODEL_STRENGTHS[modelId]?.editHint ?? ''
    expect(editHint.trim().length).toBeGreaterThan(0)
    expect(editHint).toMatch(/Change|Replace/)
  })

  it('凡是写了 editHint 的模型，写法都是「改什么 + 保什么」', () => {
    for (const [modelId, strength] of Object.entries(MODEL_STRENGTHS)) {
      if (!strength?.editHint) continue
      expect(strength.editHint, `${modelId} 的 editHint`).toMatch(
        /Change|Replace/,
      )
      expect(strength.editHint.length).toBeLessThanOrEqual(MAX_HINT_LENGTH)
    }
  })
})

describe('各家官方语法的关键事实写进了 hint', () => {
  it.each(FLUX_2_MODEL_IDS)('%s 写了官方支持 JSON 结构化 prompt', (modelId) => {
    expect(MODEL_STRENGTHS[modelId]?.enhanceHint).toContain('JSON')
  })

  /** Kontext / flux-lora 是 FLUX.1 线，别把 FLUX.2 的 JSON 输入抹到它们头上。 */
  it.each([AI_MODELS.FLUX_KONTEXT_MAX, AI_MODELS.FLUX_LORA] as const)(
    '%s 不谎称有 JSON prompt',
    (modelId) => {
      expect(MODEL_STRENGTHS[modelId]?.enhanceHint).not.toContain('JSON')
    },
  )

  it('gpt-image 用 Image 1 / Image 2 点名多张参考图', () => {
    const hint =
      MODEL_STRENGTHS[AI_MODELS.OPENAI_GPT_IMAGE_2]?.enhanceHint ?? ''
    expect(hint).toContain('Image 1')
    expect(hint).toContain('Image 2')
    // mask 是 prompt 引导，不是像素级抠图。
    expect(hint).toContain('Do not change anything else')
  })

  /**
   * Gemini 官方明写：**不要用否定句**（写 empty street，不写 no cars）。
   * 所以这份方言说明本身也不能示范 "no xxx" —— 助手会照抄示例。
   */
  it.each(GEMINI_MODEL_IDS)('%s 只教正向说法，不示范否定句', (modelId) => {
    const hint = MODEL_STRENGTHS[modelId]?.enhanceHint ?? ''
    expect(hint).toContain('Do not change any other elements')
    expect(hint).not.toContain('no ')
  })

  it('Recraft 的风格走 style_id 参数，不写形容词', () => {
    expect(MODEL_STRENGTHS[AI_MODELS.RECRAFT_V4_PRO]?.enhanceHint).toContain(
      'style_id',
    )
  })

  it('Ideogram 写了 150 词上限与引号包住待渲染文字', () => {
    const hint = MODEL_STRENGTHS[AI_MODELS.IDEOGRAM_3]?.enhanceHint ?? ''
    expect(hint).toContain('150')
    expect(hint).toContain('double quotes')
  })

  it.each(SEEDREAM_MODEL_IDS)('%s 写了主体+行为+环境的结构', (modelId) => {
    const hint = MODEL_STRENGTHS[modelId]?.enhanceHint ?? ''
    expect(hint).toContain('subject + action + environment')
    expect(hint).toContain('double quotes')
  })

  /**
   * 多角色：`|` 只排序，不定位 —— worker 目前把 characterPrompts / use_coords
   * 写死为空，助手不能许诺网格定位。
   */
  it.each(NOVELAI_MODEL_IDS)('%s 如实写出多角色的能力边界', (modelId) => {
    const hint = MODEL_STRENGTHS[modelId]?.enhanceHint ?? ''
    expect(hint).toContain('never placement')
    expect(hint).toContain('Undesired Content')
  })
})
