import { describe, expect, it } from 'vitest'

import {
  ASSISTANT_MEDIA_CAPABILITIES,
  ASSISTANT_MEDIA_UNSUPPORTED_ERRORS,
  ASSISTANT_VIDEO_TIERS,
  assistantAdapterAcceptsReferenceKind,
  assistantAdapterSatisfiesVideoTier,
  assistantAdapterSupportsImage,
  assistantAdapterVideoTier,
  getAssistantMediaCapabilityLabel,
} from '@/constants/assistant'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { VISION_CAPABLE_ADAPTERS } from '@/constants/vision'

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

  it('纯文本模型 = false', () => {
    for (const adapterType of [
      AI_ADAPTER_TYPES.DEEPSEEK,
      AI_ADAPTER_TYPES.ANTHROPIC,
      AI_ADAPTER_TYPES.DASHSCOPE,
      AI_ADAPTER_TYPES.VOLCENGINE,
    ]) {
      expect(assistantAdapterVideoTier(adapterType)).toBe(false)
    }
  })

  it('⚠ 不变式：能吃视频的前提是能吃图（frames 档就是把视频降级成图）', () => {
    for (const [adapterType, capability] of Object.entries(
      ASSISTANT_MEDIA_CAPABILITIES,
    )) {
      if (capability.video !== false) {
        expect(capability.image, `${adapterType} 有视频档却不能吃图`).toBe(true)
      }
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
        assistantAdapterSatisfiesVideoTier(AI_ADAPTER_TYPES.DEEPSEEK, tier),
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
      ),
    ).toBe(false)
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

describe('getAssistantMediaCapabilityLabel', () => {
  it('frames 档标 imageOnly —— 标签说的是「能挂什么附件」，挂视频仍只有 native 行', () => {
    expect(getAssistantMediaCapabilityLabel(AI_ADAPTER_TYPES.OPENAI)).toBe(
      'imageOnly',
    )
    expect(getAssistantMediaCapabilityLabel(AI_ADAPTER_TYPES.GEMINI)).toBe(
      'imageVideo',
    )
    expect(getAssistantMediaCapabilityLabel(AI_ADAPTER_TYPES.DEEPSEEK)).toBe(
      'textOnly',
    )
  })
})

describe('消费者：constants/vision 的 VISION_CAPABLE_ADAPTERS 从矩阵推导', () => {
  it('成员 = 矩阵里 image 为 true 的那些，Gemini 排第一', () => {
    expect([...VISION_CAPABLE_ADAPTERS]).toEqual(
      expect.arrayContaining([
        AI_ADAPTER_TYPES.GEMINI,
        AI_ADAPTER_TYPES.OPENAI,
      ]),
    )
    expect(VISION_CAPABLE_ADAPTERS[0]).toBe(AI_ADAPTER_TYPES.GEMINI)
    for (const adapterType of VISION_CAPABLE_ADAPTERS) {
      expect(assistantAdapterSupportsImage(adapterType)).toBe(true)
    }
    expect(VISION_CAPABLE_ADAPTERS).not.toContain(AI_ADAPTER_TYPES.DEEPSEEK)
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
