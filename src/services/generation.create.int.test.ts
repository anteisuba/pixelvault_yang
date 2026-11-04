/**
 * L2a 真库：作品落库（createGeneration）—— 默认值、落夹、角色卡关联、取号与名字、快照净化。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { db } from '@/lib/db'
import { buildGenerationDisplayName } from '@/lib/generation-name'
import { createGeneration } from '@/services/generation.service'
import { createTestCard } from '@/test/int/cards'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { createTestFolder } from '@/test/int/generations'

let me: Awaited<ReturnType<typeof createTestUser>>

const input = (
  overrides: Partial<Parameters<typeof createGeneration>[0]> = {},
) => ({
  url: 'https://cdn.example.com/gen.png',
  storageKey: 'generations/gen.png',
  mimeType: 'image/png',
  width: 1024,
  height: 1024,
  prompt: 'Visible prompt',
  model: 'sdxl',
  provider: 'huggingface',
  requestCount: 1,
  userId: me.id,
  ...overrides,
})
const displayName = (snapshot: unknown) =>
  (snapshot as { displayName?: string }).displayName

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
})

describe('createGeneration', () => {
  it('落一张出好的私密图：默认值齐全，不挂角色卡', async () => {
    const created = await createGeneration(input())

    expect(
      await db.generation.findUniqueOrThrow({ where: { id: created.id } }),
    ).toMatchObject({
      userId: me.id,
      outputType: 'IMAGE',
      isFreeGeneration: false,
      isPublic: false,
      isPromptPublic: false,
      runGroupType: 'single',
      runGroupIndex: 0,
      projectId: null,
    })
    expect(await db.generationCharacterCard.count()).toBe(0)
  })

  it('落进为它建的夹（成员表），⛔ 再写旧的单值归属', async () => {
    const folder = await createTestFolder(me.id, '海报')

    const created = await createGeneration(input({ projectId: folder.id }))

    expect(await db.projectItem.findMany()).toEqual([
      expect.objectContaining({
        projectId: folder.id,
        generationId: created.id,
      }),
    ])
    expect(
      (await db.generation.findUniqueOrThrow({ where: { id: created.id } }))
        .projectId,
    ).toBeNull()
  })

  it('夹是别人的或已删：静默不放，作品照样落库', async () => {
    const other = await createTestUser()
    const theirs = await createTestFolder(other.id, '别人的')
    const deleted = await createTestFolder(me.id, '删了的')
    await db.project.update({
      where: { id: deleted.id },
      data: { isDeleted: true },
    })

    await createGeneration(input({ projectId: theirs.id }))
    await createGeneration(input({ projectId: deleted.id }))

    expect(await db.generation.count()).toBe(2)
    expect(await db.projectItem.count()).toBe(0)
  })

  it('挂上角色卡，连同用的哪套造型；没给造型的留空', async () => {
    const first = await createTestCard(me.id, { name: '甲' })
    const second = await createTestCard(me.id, { name: '乙' })
    const look = await db.characterLook.create({
      data: { characterCardId: second.id, label: 'Q 版' },
    })

    const created = await createGeneration(
      input({
        characterCardIds: [first.id, second.id],
        characterLookIds: { [second.id]: look.id },
      }),
    )

    const links = await db.generationCharacterCard.findMany({
      where: { generationId: created.id },
    })
    expect(links).toHaveLength(2)
    expect(links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ characterCardId: first.id, lookId: null }),
        expect.objectContaining({
          characterCardId: second.id,
          lookId: look.id,
        }),
      ]),
    )
  })

  it('缩略图 / 预览图地址一起存', async () => {
    const created = await createGeneration(
      input({
        thumbnailUrl: 'https://cdn.example.com/gen.thumbnail.webp',
        thumbnailStorageKey: 'generations/gen.thumbnail.webp',
        previewUrl: 'https://cdn.example.com/gen.preview.webp',
        previewStorageKey: 'generations/gen.preview.webp',
      }),
    )

    expect(
      await db.generation.findUniqueOrThrow({ where: { id: created.id } }),
    ).toMatchObject({
      thumbnailUrl: 'https://cdn.example.com/gen.thumbnail.webp',
      thumbnailStorageKey: 'generations/gen.thumbnail.webp',
      previewUrl: 'https://cdn.example.com/gen.preview.webp',
      previewStorageKey: 'generations/gen.preview.webp',
    })
  })
})

describe('createGeneration · 取号与名字（snapshot.displayName）', () => {
  it('同一用户依次拿到 1、2、3 号，名字与纯函数按同一个号现算的一致', async () => {
    const made = []
    for (const prompt of ['银发少女立绘，雪原', '第二张', '第三张']) {
      made.push(await createGeneration(input({ prompt })))
    }

    expect(made.map((g) => g.seq)).toEqual([1, 2, 3])
    // ⭐ 读取侧（列表口不带 snapshot）按同一条规则现算，名字必须对得上。
    expect(displayName(made[0]!.snapshot)).toBe(
      buildGenerationDisplayName({
        seq: 1,
        outputType: 'IMAGE',
        prompt: '银发少女立绘，雪原',
      }),
    )
    expect(displayName(made[0]!.snapshot)).toBe('图_001·银发少女立绘，雪')
  })

  it('号按人各算各的', async () => {
    const other = await createTestUser()
    await createGeneration(input())
    await createGeneration(input())

    const theirs = await createGeneration(input({ userId: other.id }))

    expect(theirs.seq).toBe(1)
  })

  // ⭐ 取号锁住 User 那一行再读 max(seq)+1：同一用户同时落两张也拿到两个号。
  it('同一用户同时落几张：号各不相同', async () => {
    const made = await Promise.all(
      Array.from({ length: 4 }, () => createGeneration(input())),
    )

    expect(made.map((g) => g.seq).sort()).toEqual([1, 2, 3, 4])
  })

  it('displayLabel 盖过提示词摘要，调用方自己的 snapshot 字段保留', async () => {
    const created = await createGeneration(
      input({
        prompt: '银发少女立绘',
        displayLabel: '主视觉',
        snapshot: { imageUrl: 'https://example.com/a.png' },
      }),
    )

    expect(created.snapshot).toMatchObject({
      displayName: '图_001·主视觉',
      imageUrl: 'https://example.com/a.png',
    })
  })

  it('视频产物用视频前缀', async () => {
    const created = await createGeneration(
      input({ prompt: '海边日落', mimeType: 'video/mp4', outputType: 'VIDEO' }),
    )

    expect(displayName(created.snapshot)).toBe('视频_001·海边日落')
  })

  it('匿名行不取号：seq 留空，名字只有摘要', async () => {
    const created = await createGeneration(
      input({ userId: undefined, prompt: '银发少女立绘' }),
    )

    expect(created.seq).toBeNull()
    expect(displayName(created.snapshot)).toBe('银发少女立绘')
  })

  it('快照里的 data: 原文 ⛔ 落库，链接原样保留', async () => {
    const created = await createGeneration(
      input({
        snapshot: {
          referenceImages: [
            'data:image/png;base64,iVBORw0KGgo=',
            'https://cdn.example.com/ref.png',
          ],
          multiViewImages: { backImageUrl: 'data:image/jpeg;base64,/9j/' },
        },
      }),
    )

    const stored = await db.generation.findUniqueOrThrow({
      where: { id: created.id },
    })
    expect(stored.snapshot).toMatchObject({
      referenceImages: [
        '[inline data omitted]',
        'https://cdn.example.com/ref.png',
      ],
      multiViewImages: { backImageUrl: '[inline data omitted]' },
    })
  })
})
