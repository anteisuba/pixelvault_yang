/**
 * L2a 真库：素材文件夹归属原语（子孙展开、按夹计数、排最前、放进 / 拿出）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  addGenerationsToFolder,
  countFolderItems,
  folderScopeWhere,
  removeGenerationsFromFolder,
  topSortOrder,
} from '@/features/assets/services/asset-folder.service'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
})

function folder(
  userId: string,
  name: string,
  extra: { parentId?: string; isDeleted?: boolean; sortOrder?: number } = {},
) {
  return db.project.create({ data: { userId, name, ...extra } })
}

function image(userId: string, outputType: 'IMAGE' | 'VIDEO' = 'IMAGE') {
  return db.generation.create({
    data: {
      userId,
      outputType,
      url: 'https://cdn.test/x.png',
      storageKey: 'x.png',
      prompt: 'p',
      model: 'm',
      provider: 'p',
    },
  })
}

async function put(folderId: string, ...generationIds: string[]) {
  await db.projectItem.createMany({
    data: generationIds.map((generationId) => ({
      projectId: folderId,
      generationId,
    })),
  })
}

async function idsIn(where: Awaited<ReturnType<typeof folderScopeWhere>>) {
  const rows = await db.generation.findMany({
    where: { userId: me.id, ...where },
    select: { id: true },
  })
  return rows.map((row) => row.id).sort()
}

describe('folderScopeWhere', () => {
  it('未归档 = 一个活夹都不在（在已删夹里的也算未归档）', async () => {
    const live = await folder(me.id, 'live')
    const dead = await folder(me.id, 'dead', { isDeleted: true })
    const [a, b, c] = await Promise.all([
      image(me.id),
      image(me.id),
      image(me.id),
    ])
    await put(live.id, a.id)
    await put(dead.id, b.id)

    expect(await idsIn(await folderScopeWhere(me.id, null))).toEqual(
      [b.id, c.id].sort(),
    )
  })

  it('一个夹覆盖所有层的活子孙夹，不含已删的、也不含兄弟夹', async () => {
    const root = await folder(me.id, 'root')
    const kid = await folder(me.id, 'kid', { parentId: root.id })
    const grandkid = await folder(me.id, 'gk', { parentId: kid.id })
    const deadKid = await folder(me.id, 'dead', {
      parentId: root.id,
      isDeleted: true,
    })
    const sibling = await folder(me.id, 'sibling')
    const [a, b, c, d, e] = await Promise.all(
      Array.from({ length: 5 }, () => image(me.id)),
    )
    await put(root.id, a.id)
    await put(kid.id, b.id)
    await put(grandkid.id, c.id)
    await put(deadKid.id, d.id)
    await put(sibling.id, e.id)

    expect(await idsIn(await folderScopeWhere(me.id, root.id))).toEqual(
      [a.id, b.id, c.id].sort(),
    )
  })

  it('别人的夹 → 什么都不覆盖', async () => {
    const theirs = await folder(other.id, 'theirs')
    const mine = await image(me.id)
    await put(theirs.id, mine.id)

    expect(await idsIn(await folderScopeWhere(me.id, theirs.id))).toEqual([])
  })
})

describe('countFolderItems', () => {
  it('每个夹连子孙一起数、同一张只算一次；按类型过滤；不数别人的', async () => {
    const parent = await folder(me.id, 'parent')
    const kid = await folder(me.id, 'kid', { parentId: parent.id })
    const theirs = await folder(other.id, 'theirs')
    const [a, b, v] = await Promise.all([
      image(me.id),
      image(me.id),
      image(me.id, 'VIDEO'),
    ])
    await put(parent.id, a.id, v.id)
    await put(kid.id, a.id, b.id)
    const t = await image(other.id)
    await put(theirs.id, t.id)

    expect(await countFolderItems(me.id)).toEqual({
      [parent.id]: 3,
      [kid.id]: 2,
    })
    expect(await countFolderItems(me.id, ['IMAGE'])).toEqual({
      [parent.id]: 2,
      [kid.id]: 2,
    })
  })
})

describe('topSortOrder', () => {
  it('比这一层最前面的还靠前一位；空层是 0；已删的不算', async () => {
    const parent = await folder(me.id, 'parent')
    await folder(me.id, 'a', { sortOrder: -2 })
    await folder(me.id, 'b', { sortOrder: 5 })
    await folder(me.id, 'dead', { sortOrder: -9, isDeleted: true })

    // parent 本身也在顶层，sortOrder 0
    expect(await topSortOrder(me.id, null)).toBe(-3)
    expect(await topSortOrder(me.id, parent.id)).toBe(0)
  })
})

describe('add / removeGenerationsFromFolder', () => {
  it('放进只认自己的图、已在的不重复；拿出只拿真在里面的，不删图', async () => {
    const f = await folder(me.id, '收藏')
    const [a, b] = await Promise.all([image(me.id), image(me.id)])
    const theirs = await image(other.id)
    await put(f.id, a.id)

    expect(
      await addGenerationsToFolder(me.id, f.id, [a.id, b.id, theirs.id, b.id]),
    ).toEqual({
      folderName: '收藏',
      added: [b.id],
    })
    const rows = await db.projectItem.findMany({ where: { projectId: f.id } })
    expect(rows.map((row) => row.generationId).sort()).toEqual(
      [a.id, b.id].sort(),
    )

    expect(
      await removeGenerationsFromFolder(me.id, f.id, [a.id, theirs.id]),
    ).toEqual({
      folderName: '收藏',
      removed: [a.id],
    })
    expect(await db.projectItem.count({ where: { projectId: f.id } })).toBe(1)
    expect(await db.generation.count({ where: { id: a.id } })).toBe(1)
  })

  it('别人的夹 / 已删的夹 → null，不写', async () => {
    const theirs = await folder(other.id, 'theirs')
    const dead = await folder(me.id, 'dead', { isDeleted: true })
    const a = await image(me.id)

    expect(await addGenerationsToFolder(me.id, theirs.id, [a.id])).toBeNull()
    expect(await addGenerationsToFolder(me.id, dead.id, [a.id])).toBeNull()
    expect(
      await removeGenerationsFromFolder(me.id, theirs.id, [a.id]),
    ).toBeNull()
    expect(await db.projectItem.count()).toBe(0)
  })
})
