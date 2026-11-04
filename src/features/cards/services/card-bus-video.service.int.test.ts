/**
 * L2a 真库：卡片总线的视频出口（镜头里 @她）。真装载器读真卡，真端点契约封顶。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { MODEL_OPTIONS } from '@/constants/models'
import { getVideoModelSendContract } from '@/constants/video-model-send-plan'
import { db } from '@/lib/db'
import { createTestCard } from '@/test/int/cards'
import { createTestUser, resetDatabase } from '@/test/int/db'
import type { GenerateVideoRequest } from '@/types'

import { withCharacterVideoReferences } from './card-bus-video.service'

/** 一个一次至少收 4 张参考图的视频端点（从真模型目录里挑）。 */
const VIDEO = MODEL_OPTIONS.map((model) => ({
  model,
  cap:
    model.outputType === 'VIDEO'
      ? getVideoModelSendContract(model.id, model.adapterType).slots.images
      : null,
})).find((entry) => typeof entry.cap === 'number' && entry.cap >= 4)!

const request = (extra: Partial<GenerateVideoRequest> = {}) =>
  ({
    modelId: VIDEO.model.id,
    prompt: 'Denia 回头',
    aspectRatio: '16:9',
    duration: 5,
    ...extra,
  }) as GenerateVideoRequest

let me: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
})

async function cardWith(name: string, urls: string[]) {
  const card = await createTestCard(me.id, { name })
  await db.characterLook.create({
    data: {
      characterCardId: card.id,
      isDefault: true,
      referenceSlots: urls.map((url, index) => ({
        id: `slot-${index}`,
        role: 'identity',
        url,
        isPrimary: index === 0,
      })),
    },
  })
  return card.id
}

describe('卡片总线的视频出口（镜头里 @她）', () => {
  it('没有角色：原样返回', async () => {
    const input = request()
    await expect(withCharacterVideoReferences(me.id, input)).resolves.toBe(
      input,
    )
  })

  it('勾了的全带、按勾的顺序追加在自带参考图后面；没勾的只带主图', async () => {
    const denia = await cardWith('Denia', ['d/1', 'd/2'])
    const rixi = await cardWith('Rixi', ['r/main', 'r/2'])

    const out = await withCharacterVideoReferences(
      me.id,
      request({
        referenceImages: ['own/1'],
        characterCardIds: [denia, rixi],
        characterImagePicks: {
          [denia]: [{ slotId: 'slot-1' }, { slotId: 'slot-0' }],
        },
      }),
    )

    expect(out.referenceImages).toEqual(['own/1', 'd/2', 'd/1', 'r/main'])
  })

  it('按端点封顶、已有的同一张不重复', async () => {
    const denia = await cardWith('Denia', ['own/1', 'd/2', 'd/3'])
    const own = Array.from({ length: VIDEO.cap! - 1 }, (_, i) => `own/${i + 1}`)

    const out = await withCharacterVideoReferences(
      me.id,
      request({
        referenceImages: own,
        characterCardIds: [denia],
        characterImagePicks: {
          [denia]: [
            { slotId: 'slot-0' },
            { slotId: 'slot-1' },
            { slotId: 'slot-2' },
          ],
        },
      }),
    )

    expect(out.referenceImages).toEqual([...own, 'd/2'])
  })

  it('别人的卡不带', async () => {
    const other = await createTestUser()
    const theirs = await createTestCard(other.id)
    await db.characterLook.create({
      data: {
        characterCardId: theirs.id,
        isDefault: true,
        referenceSlots: [
          { id: 's', role: 'identity', url: 'x/1', isPrimary: true },
        ],
      },
    })
    const input = request({ characterCardIds: [theirs.id] })
    expect(
      (await withCharacterVideoReferences(me.id, input)).referenceImages,
    ).toBeUndefined()
  })
})
