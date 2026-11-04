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

import { checkCharacterLook } from './assistant-character-look.service'

const CHARACTER = {
  name: 'Denia',
  work: '鸣潮',
  look: '短发少女',
  identity: '',
  backstory: '',
  tags: ['short_hair'],
}

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

describe('checkCharacterLook（S14 对一下设定和外观）', () => {
  it('卡上的图连同设定交给看图模型；越界的图号去掉', async () => {
    modelReplies({
      conflicts: [
        { field: 'look', claim: '短发', seen: '长发', images: [1, 2, 9] },
      ],
    })
    const result = await checkCharacterLook({
      userId,
      character: CHARACTER,
      imageUrls: ['https://cdn.test/1.png', 'https://cdn.test/2.png'],
    })
    expect(mockLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        // 「全跟助手」：看图用 `resolveVisionRoute` 给的那个型号。
        adapterType: AI_ADAPTER_TYPES.GEMINI,
        apiKey: plainKeyOf(AI_ADAPTER_TYPES.GEMINI),
        modelId: LLM_TEXT_MODEL_IDS.GEMINI_3_8_FLASH,
        imageData: ['https://cdn.test/1.png', 'https://cdn.test/2.png'],
        userPrompt: expect.stringContaining('look: 短发少女'),
      }),
    )
    // ⛔ 衣服不算矛盾 —— 写在给看图模型的规矩里。
    expect(mockLlm.mock.calls[0]?.[0].systemPrompt).toContain(
      'Different outfits',
    )
    expect(result).toEqual({
      viewed: 2,
      conflicts: [
        { field: 'look', claim: '短发', seen: '长发', images: [1, 2] },
      ],
    })
  })

  it('卡上没图就不看；看不成返回 null，不抛', async () => {
    await expect(
      checkCharacterLook({ userId, character: CHARACTER, imageUrls: [] }),
    ).resolves.toEqual({ viewed: 0, conflicts: [] })
    expect(mockLlm).not.toHaveBeenCalled()

    mockLlm.mockRejectedValue(new Error('upstream 500'))
    await expect(
      checkCharacterLook({
        userId,
        character: CHARACTER,
        imageUrls: ['https://cdn.test/1.png'],
      }),
    ).resolves.toBeNull()
  })
})
