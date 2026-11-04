/**
 * L2a 真库：作品的写口 —— 公开 / 精选（含公开闸）、音频封面、删除、批量、挑胜者、审核态。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { db } from '@/lib/db'
import {
  batchDeleteGenerations,
  batchUpdateVisibility,
  deleteGeneration,
  readGenerationReviewStates,
  selectVariantWinner,
  setAudioCoverImage,
  setGenerationReviewState,
  setGenerationVisibility,
  toggleGenerationVisibility,
} from '@/services/generation.service'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { createTestGeneration } from '@/test/int/generations'

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

const BLOCKED_PROMPT = 'child, nude'
const reload = (id: string) =>
  db.generation.findUniqueOrThrow({ where: { id } })

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
})

describe('toggleGenerationVisibility', () => {
  it('别人的作品：null，⛔ 改', async () => {
    const theirs = await createTestGeneration(other.id)

    await expect(
      toggleGenerationVisibility(theirs.id, me.id, 'isPublic'),
    ).resolves.toBeNull()
    expect((await reload(theirs.id)).isPublic).toBe(false)
  })

  it('不给值就翻转，给了值就照给的写', async () => {
    const mine = await createTestGeneration(me.id)

    await expect(toggleGenerationVisibility(mine.id, me.id)).resolves.toEqual({
      id: mine.id,
      isPublic: true,
      isPromptPublic: false,
      isFeatured: false,
    })
    await expect(
      toggleGenerationVisibility(mine.id, me.id, 'isPublic', true),
    ).resolves.toMatchObject({ isPublic: true })
    await expect(
      toggleGenerationVisibility(mine.id, me.id, 'isPromptPublic'),
    ).resolves.toMatchObject({ isPublic: true, isPromptPublic: true })
    expect(await reload(mine.id)).toMatchObject({
      isPublic: true,
      isPromptPublic: true,
    })
  })

  it('精选满 9 张：再加报 MAX_FEATURED_EXCEEDED', async () => {
    for (let i = 0; i < 9; i += 1)
      await createTestGeneration(me.id, { isFeatured: true })
    const mine = await createTestGeneration(me.id)

    await expect(
      toggleGenerationVisibility(mine.id, me.id, 'isFeatured'),
    ).resolves.toEqual({ error: 'MAX_FEATURED_EXCEEDED' })
    expect((await reload(mine.id)).isFeatured).toBe(false)
  })

  it.each([
    [{ prompt: BLOCKED_PROMPT }, 'CONTENT_NOT_PUBLISHABLE'],
    [
      { prompt: 'Taipei 101 at night', searchGrounded: true },
      'SEARCH_GROUNDED_NOT_PUBLISHABLE',
    ],
  ])('过不了公开闸 %o：%s，⛔ 公开', async (data, error) => {
    const mine = await createTestGeneration(me.id, data)

    await expect(toggleGenerationVisibility(mine.id, me.id)).resolves.toEqual({
      error,
    })
    expect((await reload(mine.id)).isPublic).toBe(false)
  })

  it('过不了闸的已公开作品，本人照样能撤下', async () => {
    const mine = await createTestGeneration(me.id, {
      prompt: BLOCKED_PROMPT,
      isPublic: true,
    })

    await expect(
      toggleGenerationVisibility(mine.id, me.id),
    ).resolves.toMatchObject({ isPublic: false })
  })
})

describe('setGenerationVisibility', () => {
  it('别人的作品：null', async () => {
    const theirs = await createTestGeneration(other.id)

    await expect(
      setGenerationVisibility(theirs.id, me.id, { isPublic: true }),
    ).resolves.toBeNull()
  })

  it('一次改几个开关', async () => {
    const mine = await createTestGeneration(me.id, { isPromptPublic: true })

    await expect(
      setGenerationVisibility(mine.id, me.id, {
        isPublic: true,
        isPromptPublic: false,
      }),
    ).resolves.toEqual({
      id: mine.id,
      isPublic: true,
      isPromptPublic: false,
      isFeatured: false,
    })
  })

  it('打开精选时同样卡 9 张上限', async () => {
    for (let i = 0; i < 9; i += 1)
      await createTestGeneration(me.id, { isFeatured: true })
    const mine = await createTestGeneration(me.id)

    await expect(
      setGenerationVisibility(mine.id, me.id, { isFeatured: true }),
    ).resolves.toEqual({ error: 'MAX_FEATURED_EXCEEDED' })
  })

  it.each([
    [{ prompt: 'loli, nude' }, 'CONTENT_NOT_PUBLISHABLE'],
    [
      { prompt: 'Taipei 101', searchGrounded: true },
      'SEARCH_GROUNDED_NOT_PUBLISHABLE',
    ],
  ])('isPublic=true 过不了闸 %o：%s', async (data, error) => {
    const mine = await createTestGeneration(me.id, data)

    await expect(
      setGenerationVisibility(mine.id, me.id, {
        isPublic: true,
        isPromptPublic: true,
      }),
    ).resolves.toEqual({ error })
    expect(await reload(mine.id)).toMatchObject({
      isPublic: false,
      isPromptPublic: false,
    })
  })
})

describe('batchUpdateVisibility', () => {
  it('批量公开：过闸的发，过不了的（含先搜再画）留私密并交回 id；别人的不动', async () => {
    const ok = await createTestGeneration(me.id, {
      prompt: 'night city, red scarf',
    })
    const blocked = await createTestGeneration(me.id, {
      prompt: BLOCKED_PROMPT,
    })
    const grounded = await createTestGeneration(me.id, {
      prompt: 'Taipei 101',
      searchGrounded: true,
    })
    const theirs = await createTestGeneration(other.id)

    const result = await batchUpdateVisibility(
      [ok.id, blocked.id, grounded.id, theirs.id],
      me.id,
      'isPublic',
      true,
    )

    expect(result.updatedCount).toBe(1)
    expect([...result.blockedIds].sort()).toEqual(
      [blocked.id, grounded.id].sort(),
    )
    expect((await reload(ok.id)).isPublic).toBe(true)
    expect((await reload(blocked.id)).isPublic).toBe(false)
    expect((await reload(grounded.id)).isPublic).toBe(false)
    expect((await reload(theirs.id)).isPublic).toBe(false)
  })

  it('全被拦下：一行不改', async () => {
    const blocked = await createTestGeneration(me.id, {
      prompt: BLOCKED_PROMPT,
    })

    await expect(
      batchUpdateVisibility([blocked.id], me.id, 'isPublic', true),
    ).resolves.toEqual({ updatedCount: 0, blockedIds: [blocked.id] })
  })

  it('撤下公开 ⛔ 过闸', async () => {
    const blocked = await createTestGeneration(me.id, {
      prompt: BLOCKED_PROMPT,
      isPublic: true,
    })
    const plain = await createTestGeneration(me.id, { isPublic: true })

    await expect(
      batchUpdateVisibility([blocked.id, plain.id], me.id, 'isPublic', false),
    ).resolves.toEqual({ updatedCount: 2, blockedIds: [] })
  })
})

describe('setAudioCoverImage', () => {
  const COVER = 'https://cdn.example.com/c.png'

  it('本人的音频：封面存进 previewUrl，清掉配对的 key', async () => {
    const audio = await createTestGeneration(me.id, {
      outputType: 'AUDIO',
      previewStorageKey: 'old-preview.webp',
    })

    await expect(setAudioCoverImage(audio.id, me.id, COVER)).resolves.toEqual({
      id: audio.id,
      previewUrl: COVER,
    })
    expect(await reload(audio.id)).toMatchObject({
      previewUrl: COVER,
      previewStorageKey: null,
    })
  })

  it('别人的音频、或不是音频：null', async () => {
    const theirs = await createTestGeneration(other.id, {
      outputType: 'AUDIO',
    })
    const image = await createTestGeneration(me.id)

    await expect(
      setAudioCoverImage(theirs.id, me.id, COVER),
    ).resolves.toBeNull()
    await expect(setAudioCoverImage(image.id, me.id, COVER)).resolves.toBeNull()
    expect((await reload(image.id)).previewUrl).toBeNull()
  })
})

describe('删除', () => {
  it('别人的作品：null，⛔ 删', async () => {
    const theirs = await createTestGeneration(other.id)

    await expect(deleteGeneration(theirs.id, me.id)).resolves.toBeNull()
    expect(await db.generation.count()).toBe(1)
  })

  it('删本人的作品，交回存储 key；带风格的记进「不喜欢的风格」', async () => {
    const mine = await createTestGeneration(me.id, {
      storageKey: 'owned.png',
      snapshot: { style: 'Watercolor' },
    })

    await expect(deleteGeneration(mine.id, me.id)).resolves.toEqual({
      storageKeys: ['owned.png'],
    })
    expect(await db.generation.count()).toBe(0)
    // 偏好那一笔不挡删除（不等它），这里等它落地。
    await vi.waitFor(
      async () => {
        expect(
          await db.userCreativePreference.findUnique({
            where: { userId: me.id },
          }),
        ).toMatchObject({ rejectedStyles: ['watercolor'] })
      },
      { interval: 5 },
    )
  })

  it('批量删：只删本人的，交回原图 / 缩略 / 预览 / 模型的 key', async () => {
    const one = await createTestGeneration(me.id, {
      storageKey: 'one.png',
      thumbnailStorageKey: 'one-thumb.webp',
      previewStorageKey: 'one-preview.webp',
      createdAt: new Date('2026-01-01'),
    })
    const two = await createTestGeneration(me.id, {
      storageKey: 'two.png',
      modelStorageKey: 'two.glb',
      createdAt: new Date('2026-01-02'),
    })
    const theirs = await createTestGeneration(other.id)

    const result = await batchDeleteGenerations(
      [one.id, two.id, theirs.id],
      me.id,
    )

    expect(result.deletedCount).toBe(2)
    expect([...result.storageKeys].sort()).toEqual(
      [
        'one.png',
        'one-thumb.webp',
        'one-preview.webp',
        'two.png',
        'two.glb',
      ].sort(),
    )
    expect((await db.generation.findMany()).map((g) => g.id)).toEqual([
      theirs.id,
    ])
  })
})

describe('selectVariantWinner', () => {
  it('同一组里只留一个胜者', async () => {
    const [a, b] = await Promise.all(
      [0, 1].map((runGroupIndex) =>
        createTestGeneration(me.id, {
          runGroupId: 'run-1',
          runGroupType: 'variant',
          runGroupIndex,
          isWinner: runGroupIndex === 0,
        }),
      ),
    )

    await selectVariantWinner(me.id, 'run-1', b!.id)

    expect((await reload(a!.id)).isWinner).toBe(false)
    expect((await reload(b!.id)).isWinner).toBe(true)
  })

  it('选的不在这一组：抛错，原胜者不动', async () => {
    const winner = await createTestGeneration(me.id, {
      runGroupId: 'run-1',
      isWinner: true,
    })
    const stray = await createTestGeneration(me.id, { runGroupId: 'run-2' })

    await expect(selectVariantWinner(me.id, 'run-1', stray.id)).rejects.toThrow(
      'Generation not found or not part of this run group',
    )
    expect((await reload(winner.id)).isWinner).toBe(true)
  })
})

/**
 * 审核态（切片 X）—— owner 的「禁止用失败的旧图」在库这一层的落点：读只取
 * `snapshot->>'reviewState'`，写是库里的一次浅合并，整份 snapshot ⛔ 过 Node。
 */
describe('审核态', () => {
  it('读：只认词表里的值，按 userId 收敛', async () => {
    const blocked = await createTestGeneration(me.id, {
      snapshot: { reviewState: 'blocked' },
    })
    const unmarked = await createTestGeneration(me.id, { snapshot: {} })
    // 词表外的值（手改过库 / 老数据）一律当成没标过。
    const garbage = await createTestGeneration(me.id, {
      snapshot: { reviewState: 'garbage' },
    })
    const theirs = await createTestGeneration(other.id, {
      snapshot: { reviewState: 'approved' },
    })

    const states = await readGenerationReviewStates(me.id, [
      blocked.id,
      unmarked.id,
      garbage.id,
      theirs.id,
    ])

    expect([...states]).toEqual([[blocked.id, 'blocked']])
    await expect(readGenerationReviewStates(me.id, [])).resolves.toEqual(
      new Map(),
    )
  })

  it('写：浅合并进 snapshot（其它字段不丢），理由 trim 过再存，交回旧值', async () => {
    const mine = await createTestGeneration(me.id, {
      snapshot: { reviewState: 'approved', displayName: '图_001·猫' },
    })

    await expect(
      setGenerationReviewState(
        me.id,
        mine.id,
        'blocked',
        '  hands are mangled  ',
      ),
    ).resolves.toEqual({ id: mine.id, state: 'blocked', previous: 'approved' })
    expect((await reload(mine.id)).snapshot).toEqual({
      displayName: '图_001·猫',
      reviewState: 'blocked',
      reviewReason: 'hands are mangled',
    })
  })

  it('没标过的旧值是 pending；没给理由就清掉上一次的理由', async () => {
    const mine = await createTestGeneration(me.id, {
      snapshot: { reviewReason: 'old reason' },
    })

    await expect(
      setGenerationReviewState(me.id, mine.id, 'approved'),
    ).resolves.toMatchObject({ previous: 'pending' })
    expect((await reload(mine.id)).snapshot).toEqual({
      reviewState: 'approved',
      reviewReason: null,
    })
  })

  it('别人的作品改不动', async () => {
    const theirs = await createTestGeneration(other.id, { snapshot: {} })

    await expect(
      setGenerationReviewState(me.id, theirs.id, 'blocked'),
    ).resolves.toBeNull()
    expect((await reload(theirs.id)).snapshot).toEqual({})
  })

  it('snapshot 不是对象的历史行改不动，⛔ 悄悄重写成对象', async () => {
    const legacy = await createTestGeneration(me.id, {
      snapshot: ['legacy', 'array'],
    })

    await expect(
      setGenerationReviewState(me.id, legacy.id, 'blocked'),
    ).resolves.toBeNull()
    expect((await reload(legacy.id)).snapshot).toEqual(['legacy', 'array'])
  })
})
