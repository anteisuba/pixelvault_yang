/**
 * L2a 真库：创作偏好学习（user-preference.service）。不假任何自有模块：
 * 历史从库里真的读（只认点过「满意」的图、没删的配方），核写进 UserCreativePreference 的那一行。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { db } from '@/lib/db'
import {
  getUserPreference,
  updatePreferenceOnDeleted,
  updatePreferenceOnRecipeSaved,
  updatePreferenceOnSatisfied,
} from '@/services/user-preference.service'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { seedGeneration } from '@/test/int/seed-generation'
import type { GenerationRecord } from '@/types'

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
})

const snapshot = (style: string) => ({
  intent: { subject: 'portrait of a character', style },
  aspectRatio: '1:1',
})

function seedStyled(
  userId: string,
  style: string,
  model: string,
  extra: { satisfied?: boolean; createdAt?: Date } = {},
) {
  return seedGeneration(userId, {
    model,
    prompt: `${style} portrait`,
    snapshot: snapshot(style),
    ...(extra.satisfied ? { evaluation: { userSatisfied: true } } : {}),
    ...(extra.createdAt ? { createdAt: extra.createdAt } : {}),
  })
}

/** 库里那一行原样交给服务（服务只读 id / createdAt / prompt / model / snapshot 这几格）。 */
async function record(id: string): Promise<GenerationRecord> {
  const row = await db.generation.findUniqueOrThrow({ where: { id } })
  return row as unknown as GenerationRecord
}

const pref = async () =>
  db.userCreativePreference.findUniqueOrThrow({ where: { userId: me.id } })

describe('user-preference.service（真库）', () => {
  it('读：有就回那一行，没有回 null', async () => {
    expect(await getUserPreference(me.id)).toBeNull()
    await db.userCreativePreference.create({
      data: { userId: me.id, favoriteStyles: ['watercolor'] },
    })
    expect(await getUserPreference(me.id)).toMatchObject({
      userId: me.id,
      favoriteStyles: ['watercolor'],
    })
  })

  it('满意：同一风格点满意够次数才算喜欢；只数满意过的、我自己的', async () => {
    await seedStyled(me.id, 'anime illustration', 'model-a', {
      satisfied: true,
      createdAt: new Date('2026-05-04T09:00:00Z'),
    })
    // 没点满意 / 别人的：都不算
    await seedStyled(me.id, 'anime illustration', 'model-b')
    await seedStyled(other.id, 'anime illustration', 'model-b', {
      satisfied: true,
    })
    const current = await seedStyled(me.id, 'anime illustration', 'model-a', {
      createdAt: new Date('2026-05-04T10:00:00Z'),
    })

    // 满意过的只有 2 张（门槛 3）：没满意的、别人的若被算进来就会过线
    await updatePreferenceOnSatisfied(me.id, await record(current.id))
    expect((await pref()).favoriteStyles).toEqual([])

    await seedStyled(me.id, 'anime illustration', 'model-a', {
      satisfied: true,
      createdAt: new Date('2026-05-04T08:00:00Z'),
    })
    await updatePreferenceOnSatisfied(me.id, await record(current.id))
    expect(await pref()).toMatchObject({
      favoriteStyles: ['anime illustration'],
      preferredAspectRatios: ['1:1'],
      preferredModelsByTask: expect.objectContaining({
        anime: expect.arrayContaining(['model-a']),
      }),
    })
  })

  it('同一张图重复点满意不重复计数；已有的不喜欢风格保住', async () => {
    await db.userCreativePreference.create({
      data: { userId: me.id, rejectedStyles: ['low-poly'] },
    })
    const current = await seedStyled(me.id, 'anime illustration', 'model-a', {
      satisfied: true,
    })
    await updatePreferenceOnSatisfied(me.id, await record(current.id))
    expect(await pref()).toMatchObject({
      favoriteStyles: [],
      rejectedStyles: ['low-poly'],
    })
  })

  it('删图：风格进不喜欢，排最前', async () => {
    await db.userCreativePreference.create({
      data: { userId: me.id, rejectedStyles: ['low-poly'] },
    })
    const gen = await seedStyled(me.id, 'photorealistic', 'model-a')
    await updatePreferenceOnDeleted(me.id, await record(gen.id))
    expect((await pref()).rejectedStyles).toEqual([
      'photorealistic',
      'low-poly',
    ])
  })

  it('存配方：最近几份配方里反复出现的负面词记下；删掉的配方、别人的不算', async () => {
    const recipe = (
      userId: string,
      negativePrompt: string,
      isDeleted = false,
    ) =>
      db.recipe.create({
        data: {
          userId,
          compiledPrompt: 'anime portrait',
          modelId: 'model-b',
          provider: 'fal',
          negativePrompt,
          isDeleted,
          userIntent: {
            subject: 'portrait of a character',
            style: 'anime illustration',
          },
        },
      })
    await recipe(me.id, 'blur, low quality')
    await recipe(me.id, 'bad hands')
    await recipe(me.id, 'low quality', true)
    await recipe(other.id, 'low quality')

    await updatePreferenceOnRecipeSaved(me.id, {
      id: 'recipe-new',
      userIntent: null,
      compiledPrompt: 'anime portrait',
      negativePrompt: 'blur, bad hands',
      modelId: 'model-a',
    })
    expect(await pref()).toMatchObject({
      commonNegativeTags: ['bad hands', 'blur'],
      preferredModelsByTask: expect.objectContaining({
        portrait: ['model-a'],
      }),
    })
  })
})
