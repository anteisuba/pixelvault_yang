/**
 * L2a 真库：抠图元素（extracted-element.service）。元素行、来源作品走真库，抠图读 data URL、
 * 量尺寸全真；只假 R2（一个内存桶）。核库里那一行、桶里存了 / 删了什么。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const bucket = vi.hoisted(() => ({
  objects: new Map<string, Buffer>(),
  deleted: [] as string[],
}))
vi.mock('@/services/storage/r2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/storage/r2')>()
  return {
    ...actual,
    uploadToR2: async ({ key, data }: { key: string; data: Buffer }) => {
      bucket.objects.set(key, Buffer.from(data))
      return `https://cdn.test/${key}`
    },
    createImagePreviewAssets: async ({
      sourceStorageKey,
    }: {
      sourceStorageKey: string
    }) => {
      if (!bucket.objects.has(sourceStorageKey))
        throw new Error('source not in R2 yet')
      return {
        thumbnailUrl: `https://cdn.test/${sourceStorageKey}.thumb.webp`,
        thumbnailStorageKey: `${sourceStorageKey}.thumb.webp`,
        previewUrl: `https://cdn.test/${sourceStorageKey}.preview.webp`,
        previewStorageKey: `${sourceStorageKey}.preview.webp`,
      }
    },
    deleteFromR2: async (key: string) => {
      bucket.deleted.push(key)
      bucket.objects.delete(key)
    },
  }
})

import { db } from '@/lib/db'
import {
  createExtractedElement,
  deleteExtractedElement,
  listExtractedElementsForUser,
} from '@/services/extracted-element.service'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { seedGeneration } from '@/test/int/seed-generation'

/** 64×64 的真 PNG。 */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsItjJrMbxgi+hcEKLNP1WgQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQELgteuuE8uE1jwAAAAABJRU5ErkJggg=='
const CUTOUT = `data:image/png;base64,${PNG_BASE64}`
const SOURCE = 'https://example.com/source.png'

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  bucket.objects.clear()
  bucket.deleted = []
})

const create = (
  extra: Partial<Parameters<typeof createExtractedElement>[0]> = {},
) =>
  createExtractedElement({
    userId: me.id,
    extractedImageUrl: CUTOUT,
    sourceImageUrl: SOURCE,
    prompt: 'the red dress',
    invert: false,
    modelId: 'gpt-image-2',
    ...extra,
  })

describe('createExtractedElement（真库 + 内存 R2）', () => {
  it('抠图存进桶、做小图、按图量尺寸，落一行；按模型 id 认出 provider', async () => {
    const record = await create()
    const row = await db.extractedElement.findUniqueOrThrow({
      where: { id: record.id },
    })
    expect(bucket.objects.get(row.extractedStorageKey)).toEqual(
      Buffer.from(PNG_BASE64, 'base64'),
    )
    expect(row).toMatchObject({
      userId: me.id,
      sourceImageUrl: SOURCE,
      extractedUrl: `https://cdn.test/${row.extractedStorageKey}`,
      thumbnailStorageKey: `${row.extractedStorageKey}.thumb.webp`,
      width: 64,
      height: 64,
      name: 'the red dress',
      provider: 'openai',
      modelId: 'gpt-image-2',
    })
    expect(record).toMatchObject({
      id: row.id,
      provider: 'openai',
      createdAt: row.createdAt.toISOString(),
    })
  })

  it('名字：给了用给的，没给用提示词；gemini- / 其他前缀分别认成 gemini / fal', async () => {
    expect(
      await create({ name: '  Dress  ', modelId: 'gemini-3-pro-image' }),
    ).toMatchObject({ name: 'Dress', provider: 'gemini' })
    expect(
      await create({ prompt: '  ', modelId: 'birefnet-v2' }),
    ).toMatchObject({ name: 'Extracted element', provider: 'fal' })
  })

  it('来源作品：是我的就记下；别人的、不存在的悄悄去掉', async () => {
    const mine = await seedGeneration(me.id)
    const theirs = await seedGeneration(other.id)
    expect(
      (await create({ sourceGenerationId: mine.id })).sourceGenerationId,
    ).toBe(mine.id)
    expect(
      (await create({ sourceGenerationId: theirs.id })).sourceGenerationId,
    ).toBeNull()
    expect(
      (await create({ sourceGenerationId: 'missing' })).sourceGenerationId,
    ).toBeNull()
  })
})

describe('listExtractedElementsForUser（真库）', () => {
  it('新的在前、按游标翻页，只列我的', async () => {
    const at = (minute: number) => new Date(Date.UTC(2026, 4, 20, 6, minute))
    for (const minute of [1, 2, 3]) {
      const record = await create({ name: `m${minute}` })
      await db.extractedElement.update({
        where: { id: record.id },
        data: { createdAt: at(minute) },
      })
    }
    await createExtractedElement({
      userId: other.id,
      extractedImageUrl: CUTOUT,
      sourceImageUrl: SOURCE,
      prompt: 'theirs',
      invert: false,
      modelId: 'gpt-image-2',
    })

    const first = await listExtractedElementsForUser(me.id, { limit: 2 })
    expect(first.items.map((item) => item.name)).toEqual(['m3', 'm2'])
    expect(first.nextCursor).toBe(at(2).toISOString())

    const second = await listExtractedElementsForUser(me.id, {
      limit: 2,
      cursor: first.nextCursor!,
    })
    expect(second.items.map((item) => item.name)).toEqual(['m1'])
    expect(second.nextCursor).toBeNull()
  })
})

describe('deleteExtractedElement（真库 + 内存 R2）', () => {
  it('别人的、没有的：不删；我的：删行并清掉桶里原图和小图', async () => {
    const record = await create()
    const row = await db.extractedElement.findUniqueOrThrow({
      where: { id: record.id },
    })

    expect(await deleteExtractedElement(other.id, record.id)).toEqual({
      deleted: false,
    })
    expect(await deleteExtractedElement(me.id, 'missing')).toEqual({
      deleted: false,
    })
    expect(await db.extractedElement.count()).toBe(1)

    expect(await deleteExtractedElement(me.id, record.id)).toEqual({
      deleted: true,
    })
    expect(await db.extractedElement.count()).toBe(0)
    // R2 清理不阻塞返回（尽力而为）：等它跑完再核
    await vi.waitFor(() =>
      expect(bucket.deleted.sort()).toEqual(
        [row.extractedStorageKey, row.thumbnailStorageKey].sort(),
      ),
    )
  })
})
