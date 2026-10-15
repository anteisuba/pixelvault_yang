import { describe, expect, it } from 'vitest'

import {
  ASSISTANT_MEDIA_CAPABILITIES,
  ASSISTANT_MEDIA_UNSUPPORTED_ERRORS,
  ASSISTANT_VIDEO_TIERS,
  assistantAdapterAcceptsReferenceKind,
  assistantAdapterSatisfiesVideoTier,
  assistantAdapterSupportsImage,
  assistantAdapterVideoTier,
} from '@/constants/assistant'
import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

/**
 * 能力矩阵三值化（AI 导演内核 · 切片 2 · §4.3）。
 *
 * 这套断言守的是**语义**而不是当前的值：`video` 从布尔变成
 * `'native' | 'frames' | false` 之后，「支持视频」这句话必须由调用方说清是哪一档。
 */
describe('ASSISTANT_MEDIA_CAPABILITIES 三值化', () => {
  it('Gemini = native（实测可用的那一条）', () => {
    expect(assistantAdapterVideoTier(AI_ADAPTER_TYPES.GEMINI)).toBe(
      ASSISTANT_VIDEO_TIERS.native,
    )
  })

  it('OpenAI = frames（能吃图但吃不了视频文件）', () => {
    expect(assistantAdapterVideoTier(AI_ADAPTER_TYPES.OPENAI)).toBe(
      ASSISTANT_VIDEO_TIERS.frames,
    )
  })

  it('看不了图的路由 = false', () => {
    for (const adapterType of [
      AI_ADAPTER_TYPES.VOLCENGINE,
      AI_ADAPTER_TYPES.BYTEPLUS,
    ]) {
      expect(assistantAdapterVideoTier(adapterType)).toBe(false)
    }
  })

  it('Claude 与 Grok 能看图 → 至少 frames（从前写着 false，与不变式自相矛盾）', () => {
    for (const adapterType of [
      AI_ADAPTER_TYPES.ANTHROPIC,
      AI_ADAPTER_TYPES.XAI,
    ]) {
      expect(assistantAdapterVideoTier(adapterType)).toBe(
        ASSISTANT_VIDEO_TIERS.frames,
      )
      expect(
        assistantAdapterSatisfiesVideoTier(
          adapterType,
          ASSISTANT_VIDEO_TIERS.native,
        ),
      ).toBe(false)
    }
  })

  it.each([undefined, LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH])(
    'DeepSeek 默认与 Flash 档能吃图但不冒充原生视频模型（%s）',
    (modelId) => {
      expect(
        assistantAdapterSupportsImage(AI_ADAPTER_TYPES.DEEPSEEK, modelId),
      ).toBe(true)
      expect(
        assistantAdapterVideoTier(AI_ADAPTER_TYPES.DEEPSEEK, modelId),
      ).toBe(ASSISTANT_VIDEO_TIERS.frames)
      expect(
        assistantAdapterSatisfiesVideoTier(
          AI_ADAPTER_TYPES.DEEPSEEK,
          ASSISTANT_VIDEO_TIERS.native,
          modelId,
        ),
      ).toBe(false)
    },
  )

  it('显式 DeepSeek V4 Pro 仍是纯文字档', () => {
    expect(
      assistantAdapterSupportsImage(
        AI_ADAPTER_TYPES.DEEPSEEK,
        LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
      ),
    ).toBe(false)
    expect(
      assistantAdapterVideoTier(
        AI_ADAPTER_TYPES.DEEPSEEK,
        LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
      ),
    ).toBe(false)
  })

  it('⚠ 不变式：能吃图 ⇔ 至少 frames（frames 档就是把视频降级成图）', () => {
    for (const [adapterType, capability] of Object.entries(
      ASSISTANT_MEDIA_CAPABILITIES,
    )) {
      expect(
        capability.video !== false,
        `${adapterType}：image=${String(capability.image)} 与 video=${String(capability.video)} 对不上`,
      ).toBe(capability.image)
    }
  })
})

describe('assistantAdapterSatisfiesVideoTier —— 调用方必须说出要哪一档', () => {
  it('要 native 时只有 native 满足，frames 档不算数', () => {
    expect(
      assistantAdapterSatisfiesVideoTier(
        AI_ADAPTER_TYPES.GEMINI,
        ASSISTANT_VIDEO_TIERS.native,
      ),
    ).toBe(true)
    expect(
      assistantAdapterSatisfiesVideoTier(
        AI_ADAPTER_TYPES.OPENAI,
        ASSISTANT_VIDEO_TIERS.native,
      ),
    ).toBe(false)
  })

  it('要 frames 时两档都满足（native 看的东西严格更多）', () => {
    expect(
      assistantAdapterSatisfiesVideoTier(
        AI_ADAPTER_TYPES.OPENAI,
        ASSISTANT_VIDEO_TIERS.frames,
      ),
    ).toBe(true)
    expect(
      assistantAdapterSatisfiesVideoTier(
        AI_ADAPTER_TYPES.GEMINI,
        ASSISTANT_VIDEO_TIERS.frames,
      ),
    ).toBe(true)
  })

  it('一档都没有的路两种要求都不满足', () => {
    for (const tier of [
      ASSISTANT_VIDEO_TIERS.native,
      ASSISTANT_VIDEO_TIERS.frames,
    ]) {
      expect(
        assistantAdapterSatisfiesVideoTier(
          AI_ADAPTER_TYPES.DEEPSEEK,
          tier,
          LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
        ),
      ).toBe(false)
    }
  })
})

describe('assistantAdapterAcceptsReferenceKind —— 附件闸', () => {
  it('图片只看图片能力，与要求的视频档无关', () => {
    expect(
      assistantAdapterAcceptsReferenceKind(
        AI_ADAPTER_TYPES.OPENAI,
        'image',
        ASSISTANT_VIDEO_TIERS.native,
      ),
    ).toBe(true)
    expect(
      assistantAdapterAcceptsReferenceKind(
        AI_ADAPTER_TYPES.DEEPSEEK,
        'image',
        ASSISTANT_VIDEO_TIERS.frames,
        LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
      ),
    ).toBe(false)
    expect(
      assistantAdapterAcceptsReferenceKind(
        AI_ADAPTER_TYPES.DEEPSEEK,
        'image',
        ASSISTANT_VIDEO_TIERS.native,
        LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH,
      ),
    ).toBe(true)
  })

  it('聊天轮（要 native）不接受 frames 档路由上的视频附件', () => {
    expect(
      assistantAdapterAcceptsReferenceKind(
        AI_ADAPTER_TYPES.OPENAI,
        'video',
        ASSISTANT_VIDEO_TIERS.native,
      ),
    ).toBe(false)
  })
})

describe('ASSISTANT_MEDIA_UNSUPPORTED_ERRORS', () => {
  it('errorCode 与 i18nKey 一字未改（三语文案已在位，前端据此路由 QuickSetupDialog）', () => {
    expect(ASSISTANT_MEDIA_UNSUPPORTED_ERRORS.video).toMatchObject({
      code: 'ASSISTANT_VIDEO_UNSUPPORTED',
      httpStatus: 400,
      i18nKey: 'errors.assistant.videoUnsupported',
    })
    expect(ASSISTANT_MEDIA_UNSUPPORTED_ERRORS.image).toMatchObject({
      code: 'ASSISTANT_IMAGE_UNSUPPORTED',
      httpStatus: 400,
      i18nKey: 'errors.assistant.imageUnsupported',
    })
  })
})
