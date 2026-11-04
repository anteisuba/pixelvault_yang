/**
 * L2a 真库：视频 / 3D 封面上传（generation-poster.service）。作品、用户走真库，
 * 图片格式按字节真认；只假 R2 上传。核库里写进了哪几格、传上去的是什么。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const uploaded = vi.hoisted(
  () => [] as Array<{ key: string; mimeType: string }>,
)
vi.mock('@/services/storage/r2', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/storage/r2')>()),
  uploadToR2: vi.fn(
    async ({ key, mimeType }: { key: string; mimeType: string }) => {
      uploaded.push({ key, mimeType })
      return `https://cdn.test/${key}`
    },
  ),
}))

import { db } from '@/lib/db'
import { uploadGenerationPoster } from '@/services/generation-poster.service'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { seedGeneration } from '@/test/int/seed-generation'
import { pngChunk } from '@/test/png-fixture'

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  uploaded.length = 0
})

/** 640×360 的 PNG 头：够认格式与尺寸。 */
function posterPng(): Buffer {
  const ihdr = new Uint8Array(13)
  new DataView(ihdr.buffer).setUint32(0, 640)
  new DataView(ihdr.buffer).setUint32(4, 360)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...pngChunk('IHDR', ihdr),
    ...pngChunk('IEND', new Uint8Array(0)),
  ])
}

const row = (id: string) => db.generation.findUniqueOrThrow({ where: { id } })

describe('uploadGenerationPoster（真库）', () => {
  it('视频：原视频地址不动，封面写进 thumbnail 两格；再传一次不重传', async () => {
    const gen = await seedGeneration(me.id, {
      outputType: 'VIDEO',
      url: 'https://cdn.test/v.mp4',
    })
    const result = await uploadGenerationPoster(
      me.clerkId,
      gen.id,
      posterPng(),
      'image/webp',
    )

    expect(uploaded).toHaveLength(1)
    expect(uploaded[0].mimeType).toBe('image/png')
    const saved = await row(gen.id)
    expect(saved).toMatchObject({
      url: 'https://cdn.test/v.mp4',
      storageKey: gen.storageKey,
      thumbnailUrl: `https://cdn.test/${uploaded[0].key}`,
      thumbnailStorageKey: uploaded[0].key,
    })
    expect(result.thumbnailUrl).toBe(saved.thumbnailUrl)

    await uploadGenerationPoster(me.clerkId, gen.id, posterPng(), 'image/png')
    expect(uploaded).toHaveLength(1)
  })

  it('3D：封面顶替 url，GLB 留在 modelUrl', async () => {
    const gen = await seedGeneration(me.id, {
      outputType: 'MODEL_3D',
      url: 'https://cdn.test/m.glb',
      modelUrl: 'https://cdn.test/m.glb',
    })
    await uploadGenerationPoster(me.clerkId, gen.id, posterPng(), 'image/png')
    expect(await row(gen.id)).toMatchObject({
      url: `https://cdn.test/${uploaded[0].key}`,
      storageKey: uploaded[0].key,
      mimeType: 'image/png',
      modelUrl: 'https://cdn.test/m.glb',
    })
  })

  it('别人的、没有的、图片作品、空的、不是图的都拒，库不动', async () => {
    const theirs = await seedGeneration(other.id, { outputType: 'VIDEO' })
    const image = await seedGeneration(me.id, { outputType: 'IMAGE' })

    await expect(
      uploadGenerationPoster(me.clerkId, theirs.id, posterPng(), 'image/png'),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      uploadGenerationPoster(me.clerkId, 'missing', posterPng(), 'image/png'),
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      uploadGenerationPoster(me.clerkId, image.id, posterPng(), 'image/png'),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      uploadGenerationPoster(
        me.clerkId,
        image.id,
        Buffer.alloc(0),
        'image/png',
      ),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      uploadGenerationPoster(
        me.clerkId,
        theirs.id,
        Buffer.from('<svg></svg>'),
        'image/svg+xml',
      ),
    ).rejects.toMatchObject({ status: 400 })

    expect(uploaded).toHaveLength(0)
    expect((await row(theirs.id)).thumbnailUrl).toBeNull()
  })
})
