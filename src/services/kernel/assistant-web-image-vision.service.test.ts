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

import { inspectWebImageCandidates } from './assistant-web-image-vision.service'

const ROUTE = { route: { adapterType: 'gemini' }, borrowed: false }

beforeEach(() => {
  vi.clearAllMocks()
  mockResolveVisionRoute.mockResolvedValue(ROUTE)
})

describe('inspectWebImageCandidates（搜完先看一眼）', () => {
  it('主图排在第一张当参照，候选跟在后面；判断按候选序号排好', async () => {
    mockCompleteVisionStructured.mockResolvedValue({
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
      userId: 'user-1',
      apiKeyId: 'key-1',
      character: {
        name: 'Denia',
        work: '鸣潮',
        referenceUrl: 'https://cdn.test/main.png',
      },
      thumbnails: ['https://t.test/a.jpg', 'https://t.test/b.jpg'],
    })
    expect(mockResolveVisionRoute).toHaveBeenCalledWith('user-1', 'key-1')
    expect(mockCompleteVisionStructured).toHaveBeenCalledWith(
      expect.objectContaining({
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
    mockCompleteVisionStructured.mockRejectedValue(new Error('timeout'))
    await expect(
      inspectWebImageCandidates({
        userId: 'user-1',
        character: { name: 'Denia', work: null },
        thumbnails: ['https://t.test/a.jpg'],
      }),
    ).resolves.toBeNull()
  })

  it('没有候选就不看', async () => {
    await expect(
      inspectWebImageCandidates({
        userId: 'user-1',
        character: { name: 'Denia', work: null },
        thumbnails: [],
      }),
    ).resolves.toEqual([])
    expect(mockCompleteVisionStructured).not.toHaveBeenCalled()
  })
})
