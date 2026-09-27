import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockLoad = vi.hoisted(() => vi.fn())
vi.mock('@/services/cards/card-bus.service', () => ({
  loadCardBusCharacters: mockLoad,
}))
const mockContract = vi.hoisted(() => ({ images: 4 as number | null }))
vi.mock('@/constants/video-model-send-plan', () => ({
  getVideoModelSendContract: () => ({ slots: { images: mockContract.images } }),
}))
vi.mock('@/constants/models', () => ({
  getModelById: () => ({ adapterType: 'fal' }),
}))

import type { GenerateVideoRequest } from '@/types'

import { withCharacterVideoReferences } from './card-bus-video.service'

const request = (extra: Partial<GenerateVideoRequest> = {}) =>
  ({
    modelId: 'seedance',
    prompt: 'Denia 回头',
    aspectRatio: '16:9',
    duration: 5,
    ...extra,
  }) as GenerateVideoRequest

const character = (cardId: string, urls: string[]) => ({
  cardId,
  slots: urls.map((url, index) => ({ id: `${cardId}-${index}`, url })),
})

beforeEach(() => {
  mockLoad.mockReset()
  mockContract.images = 4
})

describe('卡片总线的视频出口（镜头里 @她）', () => {
  it('没有角色：原样返回，不查库', async () => {
    const input = request()
    await expect(withCharacterVideoReferences('u', input)).resolves.toBe(input)
    expect(mockLoad).not.toHaveBeenCalled()
  })

  it('勾了的全带、按勾的顺序追加在自带参考图后面；没勾的只带主图', async () => {
    mockLoad.mockResolvedValue([
      character('denia', ['d/1', 'd/2']),
      character('rixi', ['r/main', 'r/2']),
    ])
    const out = await withCharacterVideoReferences(
      'u',
      request({
        referenceImages: ['own/1'],
        characterCardIds: ['denia', 'rixi'],
        characterImagePicks: {
          denia: [{ slotId: 'a' }, { generationId: 'g' }],
        },
      }),
    )
    expect(mockLoad).toHaveBeenCalledWith('u', ['denia', 'rixi'], {
      denia: [{ slotId: 'a' }, { generationId: 'g' }],
    })
    expect(out.referenceImages).toEqual(['own/1', 'd/1', 'd/2', 'r/main'])
  })

  it('按端点封顶、已有的同一张不重复', async () => {
    mockContract.images = 2
    mockLoad.mockResolvedValue([character('denia', ['own/1', 'd/2', 'd/3'])])
    const out = await withCharacterVideoReferences(
      'u',
      request({
        referenceImages: ['own/1'],
        characterCardIds: ['denia'],
        characterImagePicks: { denia: [{ slotId: 'a' }] },
      }),
    )
    expect(out.referenceImages).toEqual(['own/1', 'd/2'])
  })
})
