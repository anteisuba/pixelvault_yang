/**
 * L2a 真库：素材文件夹（project.service）。夹、归属、作品全走真库（含整层重排那条原生 SQL）。
 * 核库里每个夹的 parentId / sortOrder / pinnedOrder / isDeleted、归属行与返回值。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { PROJECT } from '@/constants/config'
import { db } from '@/lib/db'
import {
  createProject,
  deleteProject,
  getFolderMemberships,
  getProjectHistory,
  listProjects,
  reorderProjects,
  updateFolderItems,
  updateProject,
} from '@/services/project.service'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { seedGeneration } from '@/test/int/seed-generation'

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
})

function seedFolder(
  userId: string,
  name: string,
  extra: { parentId?: string; sortOrder?: number; pinnedOrder?: number } = {},
) {
  return db.project.create({ data: { userId, name, ...extra } })
}

let minute = 0
async function putIn(projectId: string, generationId: string) {
  minute += 1
  return db.projectItem.create({
    data: {
      projectId,
      generationId,
      addedAt: new Date(Date.UTC(2026, 9, 1, 0, minute)),
    },
  })
}

const row = (id: string) => db.project.findUniqueOrThrow({ where: { id } })

/** 一层里按 sortOrder 的名字顺序。 */
async function level(parentId: string | null) {
  const rows = await db.project.findMany({
    where: { userId: me.id, parentId, isDeleted: false },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
  return rows.map((r) => r.name)
}

describe('listProjects（真库）', () => {
  it('没有夹回空；按手动顺序列我的活夹；封面取最近放进来的、画得出来的那张', async () => {
    expect(await listProjects(me.clerkId)).toEqual([])

    const b = await seedFolder(me.id, 'B', { sortOrder: 1 })
    await seedFolder(me.id, 'A', { sortOrder: 0 })
    await seedFolder(me.id, 'gone', { sortOrder: 2 }).then((f) =>
      db.project.update({ where: { id: f.id }, data: { isDeleted: true } }),
    )
    await seedFolder(other.id, 'theirs')

    const image = await seedGeneration(me.id, {
      url: 'https://cdn.test/a.png',
      thumbnailUrl: 'https://cdn.test/a.thumb.webp',
    })
    // 没有派生图的视频：url 是媒体文件，画不出来，跳过
    const video = await seedGeneration(me.id, {
      outputType: 'VIDEO',
      url: 'https://cdn.test/v.mp4',
    })
    await putIn(b.id, image.id)
    await putIn(b.id, video.id)

    const list = await listProjects(me.clerkId)
    expect(list.map((p) => p.name)).toEqual(['A', 'B'])
    expect(list.find((p) => p.id === b.id)?.coverUrl).toBe(
      'https://cdn.test/a.thumb.webp',
    )
  })

  it('自己没图的夹借子孙的封面：近的一层先，同层按手动顺序', async () => {
    const root = await seedFolder(me.id, 'root')
    const child1 = await seedFolder(me.id, 'c1', {
      parentId: root.id,
      sortOrder: 0,
    })
    const child2 = await seedFolder(me.id, 'c2', {
      parentId: root.id,
      sortOrder: 1,
    })
    const grandchild = await seedFolder(me.id, 'g', { parentId: child1.id })
    const deep = await seedGeneration(me.id, {
      url: 'https://cdn.test/deep.png',
    })
    const near = await seedGeneration(me.id, {
      url: 'https://cdn.test/near.png',
    })
    await putIn(grandchild.id, deep.id)

    const cover = async (id: string) =>
      (await listProjects(me.clerkId)).find((p) => p.id === id)?.coverUrl
    expect(await cover(root.id)).toBe('https://cdn.test/deep.png')

    await putIn(child2.id, near.id)
    expect(await cover(root.id)).toBe('https://cdn.test/near.png')
  })
})

describe('createProject（真库）', () => {
  it('新夹排在它那一层最前；子夹能一层层往下建', async () => {
    await seedFolder(me.id, 'old', { sortOrder: 0 })
    const top = await createProject(me.clerkId, { name: 'new' })
    expect(await level(null)).toEqual(['new', 'old'])

    let parent = top
    for (const name of ['L2', 'L3', 'L4']) {
      parent = await createProject(me.clerkId, { name, parentId: parent.id })
    }
    expect(await row(parent.id)).toMatchObject({ name: 'L4', userId: me.id })
    expect(parent.parentId).not.toBeNull()
  })

  it('父夹不是我的活夹：拒；到上限：拒；都不建', async () => {
    const theirs = await seedFolder(other.id, 'theirs')
    await expect(
      createProject(me.clerkId, { name: 'x', parentId: theirs.id }),
    ).rejects.toThrow('Parent folder not found')

    await db.project.createMany({
      data: Array.from({ length: PROJECT.MAX_PROJECTS_PER_USER }, (_, i) => ({
        userId: me.id,
        name: `f${i}`,
      })),
    })
    await expect(
      createProject(me.clerkId, { name: 'one more' }),
    ).rejects.toThrow(
      `Maximum ${PROJECT.MAX_PROJECTS_PER_USER} projects allowed`,
    )
    expect(await db.project.count({ where: { userId: me.id } })).toBe(
      PROJECT.MAX_PROJECTS_PER_USER,
    )
  })
})

describe('updateProject（真库）', () => {
  it('别人的夹回 null，不动', async () => {
    const theirs = await seedFolder(other.id, 'theirs')
    expect(await updateProject(me.clerkId, theirs.id, { name: 'x' })).toBeNull()
    expect((await row(theirs.id)).name).toBe('theirs')
  })

  it('挪到别的夹下（带着子夹）并排在那一层最前', async () => {
    const target = await seedFolder(me.id, 'target')
    await seedFolder(me.id, 'resident', { parentId: target.id, sortOrder: 0 })
    const mover = await seedFolder(me.id, 'mover')
    const sub = await seedFolder(me.id, 'sub', { parentId: mover.id })

    await updateProject(me.clerkId, mover.id, { parentId: target.id })
    expect(await level(target.id)).toEqual(['mover', 'resident'])
    expect((await row(sub.id)).parentId).toBe(mover.id)
  })

  it('挪进自己、挪进自己的子孙：拒，不动', async () => {
    const a = await seedFolder(me.id, 'a')
    const b = await seedFolder(me.id, 'b', { parentId: a.id })
    const c = await seedFolder(me.id, 'c', { parentId: b.id })
    await expect(
      updateProject(me.clerkId, a.id, { parentId: a.id }),
    ).rejects.toThrow('A folder cannot be moved into itself')
    await expect(
      updateProject(me.clerkId, a.id, { parentId: c.id }),
    ).rejects.toThrow('A folder cannot be moved into its own subfolder')
    expect((await row(a.id)).parentId).toBeNull()
  })

  it('置顶排到置顶组最前；取消置顶清成 null', async () => {
    const pinned = await seedFolder(me.id, 'pinned', { pinnedOrder: 0 })
    const fresh = await seedFolder(me.id, 'fresh')
    await updateProject(me.clerkId, fresh.id, { pinned: true })
    expect((await row(fresh.id)).pinnedOrder).toBeLessThan(
      (await row(pinned.id)).pinnedOrder!,
    )
    await updateProject(me.clerkId, fresh.id, { pinned: false })
    expect((await row(fresh.id)).pinnedOrder).toBeNull()
  })
})

describe('reorderProjects（真库）', () => {
  it('同层：给的顺序在前，没提到的按原顺序接后；别人的 id 不认', async () => {
    const a = await seedFolder(me.id, 'a', { sortOrder: 0 })
    const b = await seedFolder(me.id, 'b', { sortOrder: 1 })
    const c = await seedFolder(me.id, 'c', { sortOrder: 2 })
    const theirs = await seedFolder(other.id, 'theirs', { sortOrder: 5 })
    await reorderProjects(me.clerkId, {
      kind: 'tree',
      parentId: null,
      ids: [c.id, theirs.id, a.id],
    })
    expect(await level(null)).toEqual(['c', 'a', 'b'])
    expect((await row(b.id)).sortOrder).toBe(2)
    expect((await row(theirs.id)).sortOrder).toBe(5)
  })

  it('置顶组重排', async () => {
    const p1 = await seedFolder(me.id, 'p1', { pinnedOrder: 0 })
    const p2 = await seedFolder(me.id, 'p2', { pinnedOrder: 1 })
    await reorderProjects(me.clerkId, { kind: 'pins', ids: [p2.id] })
    expect((await row(p2.id)).pinnedOrder).toBe(0)
    expect((await row(p1.id)).pinnedOrder).toBe(1)
  })
})

describe('deleteProject（真库）', () => {
  it('别人的夹：false，不动', async () => {
    const theirs = await seedFolder(other.id, 'theirs')
    expect(await deleteProject(me.clerkId, theirs.id)).toBe(false)
    expect((await row(theirs.id)).isDeleted).toBe(false)
  })

  it('清掉归属不删图，子夹按原顺序挪进它原来的位置，软删', async () => {
    await seedFolder(me.id, 'before', { sortOrder: 0 })
    const doomed = await seedFolder(me.id, 'doomed', {
      sortOrder: 1,
      pinnedOrder: 0,
    })
    await seedFolder(me.id, 'after', { sortOrder: 2 })
    await seedFolder(me.id, 'k1', { parentId: doomed.id, sortOrder: 0 })
    const k2 = await seedFolder(me.id, 'k2', {
      parentId: doomed.id,
      sortOrder: 1,
    })
    const grand = await seedFolder(me.id, 'grand', { parentId: k2.id })
    const gen = await seedGeneration(me.id)
    await putIn(doomed.id, gen.id)

    expect(await deleteProject(me.clerkId, doomed.id)).toBe(true)
    expect(await row(doomed.id)).toMatchObject({
      isDeleted: true,
      pinnedOrder: null,
    })
    expect(await level(null)).toEqual(['before', 'k1', 'k2', 'after'])
    expect((await row(grand.id)).parentId).toBe(k2.id)
    expect(await db.projectItem.count()).toBe(0)
    expect(await db.generation.count({ where: { id: gen.id } })).toBe(1)
  })

  it('删的是子夹：它的子夹挂到它的父夹下', async () => {
    const root = await seedFolder(me.id, 'root')
    const mid = await seedFolder(me.id, 'mid', { parentId: root.id })
    const leaf = await seedFolder(me.id, 'leaf', { parentId: mid.id })
    await deleteProject(me.clerkId, mid.id)
    expect((await row(leaf.id)).parentId).toBe(root.id)
  })
})

describe('归属（真库）', () => {
  it('放进：只回新放进去的；拿出：只回原来在里面的；别人的夹回 null', async () => {
    const folder = await seedFolder(me.id, 'f')
    const [g1, g2] = [await seedGeneration(me.id), await seedGeneration(me.id)]
    await putIn(folder.id, g1.id)

    expect(
      await updateFolderItems(me.clerkId, folder.id, { add: [g1.id, g2.id] }),
    ).toEqual({ added: [g2.id], removed: [] })
    expect(
      await updateFolderItems(me.clerkId, folder.id, { remove: [g1.id] }),
    ).toEqual({ added: [], removed: [g1.id] })
    expect(
      await db.projectItem.findMany({ where: { projectId: folder.id } }),
    ).toMatchObject([{ generationId: g2.id }])

    const theirs = await seedFolder(other.id, 'theirs')
    expect(
      await updateFolderItems(me.clerkId, theirs.id, { add: [g1.id] }),
    ).toBeNull()
    expect(
      await db.projectItem.count({ where: { projectId: theirs.id } }),
    ).toBe(0)
  })

  it('每张图在哪些活夹里；不在的给空；删了的夹不算', async () => {
    const live = await seedFolder(me.id, 'live')
    const gone = await seedFolder(me.id, 'gone')
    const [g1, g2] = [await seedGeneration(me.id), await seedGeneration(me.id)]
    await putIn(live.id, g1.id)
    await putIn(gone.id, g1.id)
    await db.project.update({
      where: { id: gone.id },
      data: { isDeleted: true },
    })

    expect(await getFolderMemberships(me.clerkId, [g1.id, g2.id])).toEqual({
      [g1.id]: [live.id],
      [g2.id]: [],
    })
  })
})

describe('getProjectHistory（真库）', () => {
  it('未归档：只列我的、不在任何夹里的；不算精确总数', async () => {
    const folder = await seedFolder(me.id, 'f')
    const filed = await seedGeneration(me.id)
    await putIn(folder.id, filed.id)
    const loose = await seedGeneration(me.id)
    await seedGeneration(other.id)

    const page = await getProjectHistory(me.clerkId, null)
    expect(page.generations.map((g) => g.id)).toEqual([loose.id])
    expect(page).toMatchObject({ total: 1, hasMore: false })
  })

  it('一个夹连它所有子孙夹一起数、一起列；翻页', async () => {
    const root = await seedFolder(me.id, 'root')
    const child = await seedFolder(me.id, 'child', { parentId: root.id })
    const deep = await seedFolder(me.id, 'deep', { parentId: child.id })
    for (const folder of [root, child, deep]) {
      await putIn(folder.id, (await seedGeneration(me.id)).id)
    }
    await seedGeneration(me.id)

    const first = await getProjectHistory(me.clerkId, root.id, undefined, 2)
    expect(first).toMatchObject({ total: 3, hasMore: true })
    expect(first.generations).toHaveLength(2)
    const second = await getProjectHistory(
      me.clerkId,
      root.id,
      first.generations[1].id,
      2,
    )
    expect(second.generations).toHaveLength(1)
    expect(second.hasMore).toBe(false)
  })
})
