import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockResolveVisionRoute = vi.fn()
vi.mock('@/services/vision/vision-route.service', () => ({
  resolveVisionRoute: (...args: unknown[]) => mockResolveVisionRoute(...args),
}))

const mockCompleteVisionStructured = vi.fn()
vi.mock('@/services/vision/vision-structured-output', () => ({
  completeVisionStructured: (...args: unknown[]) =>
    mockCompleteVisionStructured(...args),
  VISION_JSON_CONTRACT: 'json',
  VISION_SAFETY_PREAMBLE: 'data',
}))

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }))

import { checkCharacterLook } from './assistant-character-look.service'

const CHARACTER = {
  name: 'Denia',
  work: '鸣潮',
  look: '短发少女',
  identity: '',
  backstory: '',
  tags: ['short_hair'],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockResolveVisionRoute.mockResolvedValue({
    route: { adapterType: 'gemini' },
    borrowed: false,
  })
})

describe('checkCharacterLook（S14 对一下设定和外观）', () => {
  it('卡上的图连同设定交给看图模型；越界的图号去掉', async () => {
    mockCompleteVisionStructured.mockResolvedValue({
      conflicts: [
        { field: 'look', claim: '短发', seen: '长发', images: [1, 2, 9] },
      ],
    })
    const result = await checkCharacterLook({
      userId: 'user-1',
      character: CHARACTER,
      imageUrls: ['https://cdn.test/1.png', 'https://cdn.test/2.png'],
    })
    expect(mockCompleteVisionStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        imageData: ['https://cdn.test/1.png', 'https://cdn.test/2.png'],
        userPrompt: expect.stringContaining('look: 短发少女'),
      }),
    )
    // ⛔ 衣服不算矛盾 —— 写在给看图模型的规矩里。
    expect(
      mockCompleteVisionStructured.mock.calls[0]?.[0].systemPrompt,
    ).toContain('Different outfits')
    expect(result).toEqual({
      viewed: 2,
      conflicts: [
        { field: 'look', claim: '短发', seen: '长发', images: [1, 2] },
      ],
    })
  })

  it('卡上没图就不看；看不成返回 null，不抛', async () => {
    await expect(
      checkCharacterLook({ userId: 'u', character: CHARACTER, imageUrls: [] }),
    ).resolves.toEqual({ viewed: 0, conflicts: [] })
    expect(mockCompleteVisionStructured).not.toHaveBeenCalled()

    mockCompleteVisionStructured.mockRejectedValue(new Error('timeout'))
    await expect(
      checkCharacterLook({
        userId: 'u',
        character: CHARACTER,
        imageUrls: ['https://cdn.test/1.png'],
      }),
    ).resolves.toBeNull()
  })
})
