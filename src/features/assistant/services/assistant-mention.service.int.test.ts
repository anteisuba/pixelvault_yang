import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createTestUser, resetDatabase } from '@/test/int/db'
import { createTestFolder, createTestGeneration } from '@/test/int/generations'

import {
  lookupMentionAssets,
  searchMentionLibrary,
} from './assistant-mention.service'

/**
 * `@` 菜单素材库那一组的检索（设计方案 §10b「服务端多字段检索」）——真库（L2a）：
 * 只查这个人自己的、多词 AND、`#12` 只认序号、下钻按文件夹子树。
 */
let me = ''
let stranger = ''

beforeEach(async () => {
  await resetDatabase()
  me = (await createTestUser()).id
  stranger = (await createTestUser()).id
})

const idsOf = (result: { items: { id: string }[] }) =>
  result.items.map((item) => item.id).sort()

describe('searchMentionLibrary（真库）', () => {
  it('⭐ 只查这个人自己的、完成了的；多词 = 每个词都要对上', async () => {
    const poster = await createTestGeneration(me, {
      prompt: '夜景海报',
      seq: 12,
    })
    await createTestFolder(me, '海报', { generationIds: [poster.id] })
    await createTestGeneration(me, { prompt: '白天的海报' })
    await createTestGeneration(me, { prompt: '夜景海报', status: 'FAILED' })
    await createTestGeneration(stranger, { prompt: '夜景海报' })

    const result = await searchMentionLibrary(me, {
      q: '海报 夜景',
      limit: 50,
    })

    expect(idsOf(result)).toEqual([poster.id])
    expect(result.items[0]).toMatchObject({
      kind: 'image',
      thumb: poster.url,
      seq: 12,
      folders: ['海报'],
    })
  })

  it('一页的上限由服务端夹住', async () => {
    for (let i = 0; i < 25; i += 1) await createTestGeneration(me)
    const result = await searchMentionLibrary(me, { q: '', limit: 50 })
    expect(result.items).toHaveLength(20)
  })

  it('`#12` 只认序号，不去搜提示词；也不列文件夹', async () => {
    const twelve = await createTestGeneration(me, { seq: 12 })
    await createTestGeneration(me, { seq: 3, prompt: '#12 写在提示词里' })
    await createTestFolder(me, '#12')

    const result = await searchMentionLibrary(me, { q: '#12', limit: 20 })

    expect(idsOf(result)).toEqual([twelve.id])
    expect(result.folders).toEqual([])
  })

  it('类型词（视频）收窄到那一类', async () => {
    const video = await createTestGeneration(me, { outputType: 'VIDEO' })
    await createTestGeneration(me, { outputType: 'IMAGE' })

    const result = await searchMentionLibrary(me, { q: '视频', limit: 20 })

    expect(idsOf(result)).toEqual([video.id])
  })

  it('下钻：按文件夹子树收窄；空查询时列这一层的子夹', async () => {
    const inParent = await createTestGeneration(me)
    const inChild = await createTestGeneration(me)
    await createTestGeneration(me)
    const parent = await createTestFolder(me, '角色', {
      generationIds: [inParent.id],
    })
    const child = await createTestFolder(me, '长离', {
      parentId: parent.id,
      generationIds: [inChild.id],
    })
    await createTestFolder(me, '别的顶层')

    const result = await searchMentionLibrary(me, {
      q: '',
      folderId: parent.id,
      limit: 20,
    })

    expect(idsOf(result)).toEqual([inParent.id, inChild.id].sort())
    expect(result.folders).toEqual([
      { id: child.id, name: '长离', parentId: parent.id },
    ])
  })
})

describe('lookupMentionAssets（真库）', () => {
  it('按地址查名字，只查这个人的；没地址就是空', async () => {
    expect(await lookupMentionAssets(me, [])).toEqual([])
    const mine = await createTestGeneration(me)
    const theirs = await createTestGeneration(stranger)

    const items = await lookupMentionAssets(me, [mine.url, theirs.url])

    expect(items.map((item) => item.id)).toEqual([mine.id])
  })

  it('按图的编号查（回复里的 图_N 换缩略图，第 9d 步），只查这个人的', async () => {
    const mine = await createTestGeneration(me, { seq: 12 })
    await createTestGeneration(stranger, { seq: 12 })

    const items = await lookupMentionAssets(me, [], [12])

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: mine.id, seq: 12, thumb: mine.url })
  })
})
