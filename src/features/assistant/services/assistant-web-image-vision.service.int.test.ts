import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

/**
 * 看图那一跳只在模型边界上假（`llmTextCompletion`）：路由（真库里的 key + 人设）、
 * 结构化输出的解析与校验都是真代码。
 */
const mockLlm = vi.fn()
vi.mock('@/services/llm-text.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/llm-text.service')>()),
  llmTextCompletion: (...args: unknown[]) => mockLlm(...args),
}))
/** 看图模型这一次回的 JSON。 */
function modelReplies(value: unknown) {
  mockLlm.mockResolvedValue(JSON.stringify(value))
}

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }))

import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { plainKeyOf, seedAssistantKeys } from '@/test/int/assistant-keys'
import { createTestUser, resetDatabase } from '@/test/int/db'

import { inspectWebImageCandidates } from './assistant-web-image-vision.service'

let userId = ''

beforeEach(async () => {
  vi.clearAllMocks()
  await resetDatabase()
  // 助手选的是 Gemini 3.8 Flash（看得了图），key 是真加密进库的那一把。
  userId = (await createTestUser()).id
  await seedAssistantKeys(userId, {
    keys: [{ adapterType: AI_ADAPTER_TYPES.GEMINI, id: 'key-1' }],
    routeModel: LLM_TEXT_MODEL_IDS.GEMINI_3_8_FLASH,
  })
})

describe('inspectWebImageCandidates（搜完先看一眼）', () => {
  it('主图排在第一张当参照，候选跟在后面；判断按候选序号排好', async () => {
    modelReplies({
      items: [
        {
          imageIndex: 1,
          isCharacter: 'no',
          view: 'bust',
          cluttered: false,
          observation: '另一个角色',
        },
        {
          imageIndex: 0,
          isCharacter: 'yes',
          view: 'full',
          cluttered: false,
          observation: '全身立绘',
        },
      ],
    })
    const result = await inspectWebImageCandidates({
      userId,
      apiKeyId: 'key-1',
      modelId: LLM_TEXT_MODEL_IDS.GEMINI_3_8_FLASH,
      character: {
        name: 'Denia',
        work: '鸣潮',
        referenceUrl: 'https://cdn.test/main.png',
      },
      thumbnails: ['https://t.test/a.jpg', 'https://t.test/b.jpg'],
    })
    // 「全跟助手」：看图用这一轮助手那把 key、那个型号，⛔ 不借别家。
    expect(mockLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterType: AI_ADAPTER_TYPES.GEMINI,
        apiKey: plainKeyOf(AI_ADAPTER_TYPES.GEMINI),
        modelId: LLM_TEXT_MODEL_IDS.GEMINI_3_8_FLASH,
        imageData: [
          'https://cdn.test/main.png',
          'https://t.test/a.jpg',
          'https://t.test/b.jpg',
        ],
      }),
    )
    expect(result?.map((item) => item.imageIndex)).toEqual([0, 1])
  })

  it('看不成（没有能看图的路 / 输出不对）返回 null，不抛', async () => {
    mockLlm.mockRejectedValue(new Error('upstream 500'))
    await expect(
      inspectWebImageCandidates({
        userId,
        character: { name: 'Denia', work: null },
        thumbnails: ['https://t.test/a.jpg'],
      }),
    ).resolves.toBeNull()
  })

  it('没有候选就不看', async () => {
    await expect(
      inspectWebImageCandidates({
        userId,
        character: { name: 'Denia', work: null },
        thumbnails: [],
      }),
    ).resolves.toEqual([])
    expect(mockLlm).not.toHaveBeenCalled()
  })
})
