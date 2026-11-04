/**
 * L2a 真库：本地素材上传那几条接口——图 / 视频 / 音频的直传两步（/direct 发签名、/direct/complete
 * 收尾落库）与图片表单上传（/api/upload-image/file）。只假边界：Clerk 登录、R2（一个内存桶）。
 * 文件头识别、尺寸校验、落库全真：核库里那一行作品与桶里留下 / 清掉了什么。
 */
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

/** 内存里的 R2：直传那一步由测试自己往桶里放字节（等于浏览器 PUT 到签名地址）。 */
const bucket = vi.hoisted(() => ({
  objects: new Map<string, Buffer>(),
  presigned: [] as string[],
  thumbnails: [] as string[],
}))
vi.mock('@/services/storage/r2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/storage/r2')>()
  const read = (key: string) => {
    const object = bucket.objects.get(key)
    if (!object) throw new Error(`R2 object not found: ${key}`)
    return object
  }
  return {
    ...actual,
    uploadToR2: vi.fn(async ({ key, data }: { key: string; data: Buffer }) => {
      bucket.objects.set(key, Buffer.from(data))
      return actual.getR2PublicUrl(key)
    }),
    createPresignedR2PutUrl: vi.fn(async ({ key }: { key: string }) => {
      bucket.presigned.push(key)
      return `https://r2.test/put/${key}?sig=1`
    }),
    getR2ObjectBuffer: vi.fn(async ({ key }: { key: string }) => ({
      buffer: read(key),
    })),
    getR2ObjectMetadata: vi.fn(async ({ key }: { key: string }) => ({
      sizeBytes: read(key).byteLength,
    })),
    getR2ObjectRange: vi.fn(
      async ({
        key,
        startByte,
        endByteInclusive,
      }: {
        key: string
        startByte: number
        endByteInclusive: number
      }) => ({ buffer: read(key).subarray(startByte, endByteInclusive + 1) }),
    ),
    deleteFromR2: vi.fn(async (key: string) => {
      bucket.objects.delete(key)
    }),
    createImageThumbnailAsset: vi.fn(
      async ({ sourceStorageKey }: { sourceStorageKey: string }) => {
        bucket.thumbnails.push(sourceStorageKey)
        const thumbnailStorageKey = `${sourceStorageKey}.thumb.webp`
        return {
          thumbnailStorageKey,
          thumbnailUrl: actual.getR2PublicUrl(thumbnailStorageKey),
        }
      },
    ),
  }
})

import {
  createPOST,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import {
  USER_UPLOAD_MAX_BYTES,
  USER_UPLOAD_PROVIDER,
} from '@/constants/uploads'
import { POST as IMAGE_DIRECT } from '@/app/api/upload-image/direct/route'
import { POST as IMAGE_COMPLETE } from '@/app/api/upload-image/direct/complete/route'
import { POST as IMAGE_FILE } from '@/app/api/upload-image/file/route'
import { POST as VIDEO_DIRECT } from '@/app/api/upload-video/direct/route'
import { POST as VIDEO_COMPLETE } from '@/app/api/upload-video/direct/complete/route'
import { POST as AUDIO_DIRECT } from '@/app/api/upload-audio/direct/route'
import { POST as AUDIO_COMPLETE } from '@/app/api/upload-audio/direct/complete/route'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'

type Envelope<T> = { success: boolean; data?: T; error?: string }
type Prepared = {
  uploadUrl: string
  storageKey: string
  publicUrl: string
  headers: Record<string, string>
  maxBytes: number
}
type Completed = {
  generation: { id: string; mimeType: string; outputType: string }
}

/** 64×64 的真 PNG（服务端按文件头认格式、量尺寸）。 */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsItjJrMbxgi+hcEKLNP1WgQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQELgteuuE8uE1jwAAAAABJRU5ErkJggg==',
  'base64',
)
/** 有 `ftyp` 盒的 MP4 头。 */
const MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]),
  Buffer.from('ftypisom', 'ascii'),
  Buffer.alloc(20),
])
/** RIFF/WAVE 头。 */
const WAV = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.alloc(4),
  Buffer.from('WAVEfmt ', 'ascii'),
  Buffer.alloc(16),
])

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  bucket.objects.clear()
  bucket.presigned.length = 0
  bucket.thumbnails.length = 0
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  mockAuthenticated(me.clerkId)
})

async function call<T>(
  route: (req: NextRequest) => Promise<Response>,
  path: string,
  body: unknown,
) {
  const res = await route(createPOST(path, body))
  return { status: res.status, body: await parseJSON<Envelope<T>>(res) }
}

describe('图片直传（真库 + 内存 R2）', () => {
  it('没登录 401；不收的格式 400；都不发签名', async () => {
    mockUnauthenticated()
    expect(
      (
        await call(IMAGE_DIRECT, '/api/upload-image/direct', {
          mimeType: 'image/png',
          sizeBytes: 10,
        })
      ).status,
    ).toBe(401)
    mockAuthenticated(me.clerkId)
    expect(
      (
        await call(IMAGE_DIRECT, '/api/upload-image/direct', {
          mimeType: 'image/svg+xml',
          sizeBytes: 10,
        })
      ).status,
    ).toBe(400)
    expect(bucket.presigned).toEqual([])
  })

  it('两步走通：签到我名下的键 → 放进桶 → 收尾落一行作品（尺寸按文件头量）', async () => {
    const prepared = await call<Prepared>(
      IMAGE_DIRECT,
      '/api/upload-image/direct',
      {
        mimeType: 'image/png',
        sizeBytes: PNG.byteLength,
      },
    )
    expect(prepared.status).toBe(200)
    const pkg = prepared.body.data!
    expect(pkg.storageKey.startsWith(`generations/${me.id}/image/`)).toBe(true)
    expect(pkg).toMatchObject({
      uploadUrl: `https://r2.test/put/${pkg.storageKey}?sig=1`,
      headers: { 'Content-Type': 'image/png', 'If-None-Match': '*' },
      maxBytes: USER_UPLOAD_MAX_BYTES,
    })

    bucket.objects.set(pkg.storageKey, PNG)
    const done = await call<Completed>(
      IMAGE_COMPLETE,
      '/api/upload-image/direct/complete',
      {
        storageKey: pkg.storageKey,
        mimeType: 'image/png',
        sizeBytes: PNG.byteLength,
        note: '参考图',
      },
    )
    expect(done.status).toBe(200)
    expect(
      await db.generation.findUniqueOrThrow({
        where: { id: done.body.data!.generation.id },
      }),
    ).toMatchObject({
      userId: me.id,
      outputType: 'IMAGE',
      storageKey: pkg.storageKey,
      url: pkg.publicUrl,
      mimeType: 'image/png',
      width: 64,
      height: 64,
      prompt: '参考图',
      provider: USER_UPLOAD_PROVIDER,
      thumbnailStorageKey: `${pkg.storageKey}.thumb.webp`,
    })
  })

  it('收尾：别人名下的键 403；大小对不上 / 不是图 400 并清掉桶里那份；都不落库', async () => {
    const theirsKey = `generations/${other.id}/image/x.png`
    bucket.objects.set(theirsKey, PNG)
    expect(
      (
        await call(IMAGE_COMPLETE, '/api/upload-image/direct/complete', {
          storageKey: theirsKey,
          mimeType: 'image/png',
          sizeBytes: PNG.byteLength,
        })
      ).status,
    ).toBe(403)
    expect(bucket.objects.has(theirsKey)).toBe(true)

    const wrongSize = `generations/${me.id}/image/a.png`
    bucket.objects.set(wrongSize, PNG)
    expect(
      (
        await call(IMAGE_COMPLETE, '/api/upload-image/direct/complete', {
          storageKey: wrongSize,
          mimeType: 'image/png',
          sizeBytes: PNG.byteLength + 1,
        })
      ).status,
    ).toBe(400)
    expect(bucket.objects.has(wrongSize)).toBe(false)

    const notImage = `generations/${me.id}/image/b.png`
    bucket.objects.set(notImage, Buffer.from('definitely not a png'))
    expect(
      (
        await call(IMAGE_COMPLETE, '/api/upload-image/direct/complete', {
          storageKey: notImage,
          mimeType: 'image/png',
          sizeBytes: 20,
        })
      ).status,
    ).toBe(400)
    expect(bucket.objects.has(notImage)).toBe(false)

    expect(
      (
        await call(IMAGE_COMPLETE, '/api/upload-image/direct/complete', {
          storageKey: wrongSize,
        })
      ).status,
    ).toBe(400)
    expect(await db.generation.count()).toBe(0)
  })
})

describe('POST /api/upload-image/file（真库 + 内存 R2）', () => {
  const upload = (form: FormData, headers?: Record<string, string>) =>
    IMAGE_FILE(
      new NextRequest(
        new URL('/api/upload-image/file', 'http://localhost:3000'),
        {
          method: 'POST',
          body: form,
          headers,
        },
      ),
    )
  const withImage = (bytes: Buffer, type = 'image/png') => {
    const form = new FormData()
    form.append('image', new File([new Uint8Array(bytes)], 'a.png', { type }))
    return form
  }

  it('原样存进桶、落一行作品（带备注）', async () => {
    const form = withImage(PNG)
    form.append('note', '手绘稿')
    const res = await upload(form)
    expect(res.status).toBe(200)
    const gen = (await parseJSON<Envelope<Completed>>(res)).data!.generation
    const row = await db.generation.findUniqueOrThrow({ where: { id: gen.id } })
    expect(row).toMatchObject({
      userId: me.id,
      prompt: '手绘稿',
      width: 64,
      height: 64,
    })
    expect(bucket.objects.get(row.storageKey)?.equals(PNG)).toBe(true)
  })

  it('没登录 401；没文件 400；Content-Length 超限 413；不是图 400；都不落库', async () => {
    mockUnauthenticated()
    expect((await upload(withImage(PNG))).status).toBe(401)
    mockAuthenticated(me.clerkId)
    expect((await upload(new FormData())).status).toBe(400)
    const big = await IMAGE_FILE(
      new NextRequest(
        new URL('/api/upload-image/file', 'http://localhost:3000'),
        {
          method: 'POST',
          body: 'placeholder',
          headers: { 'content-length': String(USER_UPLOAD_MAX_BYTES * 2) },
        },
      ),
    )
    expect(big.status).toBe(413)
    expect((await parseJSON<{ errorCode: string }>(big)).errorCode).toBe(
      'IMAGE_TOO_LARGE',
    )
    expect((await upload(withImage(Buffer.from('not an image')))).status).toBe(
      400,
    )
    expect(await db.generation.count()).toBe(0)
    expect(bucket.objects.size).toBe(0)
  })
})

describe('视频直传（真库 + 内存 R2）', () => {
  it('没登录 401；不收的格式 400', async () => {
    mockUnauthenticated()
    expect(
      (
        await call(VIDEO_DIRECT, '/api/upload-video/direct', {
          mimeType: 'video/mp4',
          sizeBytes: 10,
        })
      ).status,
    ).toBe(401)
    mockAuthenticated(me.clerkId)
    expect(
      (
        await call(VIDEO_DIRECT, '/api/upload-video/direct', {
          mimeType: 'video/avi',
          sizeBytes: 10,
        })
      ).status,
    ).toBe(400)
    expect(bucket.presigned).toEqual([])
  })

  it('两步走通：落一行 VIDEO（宽高时长按递的）', async () => {
    const pkg = (
      await call<Prepared>(VIDEO_DIRECT, '/api/upload-video/direct', {
        mimeType: 'video/mp4',
        sizeBytes: MP4.byteLength,
      })
    ).body.data!
    expect(pkg.storageKey).toMatch(
      new RegExp(`^generations/${me.id}/video/.+\\.mp4$`),
    )
    bucket.objects.set(pkg.storageKey, MP4)

    const done = await call<Completed>(
      VIDEO_COMPLETE,
      '/api/upload-video/direct/complete',
      {
        storageKey: pkg.storageKey,
        mimeType: 'video/mp4',
        sizeBytes: MP4.byteLength,
        width: 1280,
        height: 720,
        duration: 4.5,
      },
    )
    expect(done.status).toBe(200)
    expect(
      await db.generation.findUniqueOrThrow({
        where: { id: done.body.data!.generation.id },
      }),
    ).toMatchObject({
      userId: me.id,
      outputType: 'VIDEO',
      mimeType: 'video/mp4',
      width: 1280,
      height: 720,
      duration: 4.5,
    })
  })

  it('收尾：缺宽高 400；文件头和声称的类型对不上 400 并清掉；都不落库', async () => {
    const key = `generations/${me.id}/video/a.webm`
    bucket.objects.set(key, MP4)
    expect(
      (
        await call(VIDEO_COMPLETE, '/api/upload-video/direct/complete', {
          storageKey: key,
          mimeType: 'video/webm',
          sizeBytes: MP4.byteLength,
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await call(VIDEO_COMPLETE, '/api/upload-video/direct/complete', {
          storageKey: key,
          mimeType: 'video/webm',
          sizeBytes: MP4.byteLength,
          width: 1,
          height: 1,
        })
      ).status,
    ).toBe(400)
    expect(bucket.objects.has(key)).toBe(false)
    expect(await db.generation.count()).toBe(0)
  })
})

describe('音频直传（真库 + 内存 R2）', () => {
  it('没登录 401；不收的格式 400', async () => {
    mockUnauthenticated()
    expect(
      (
        await call(AUDIO_DIRECT, '/api/upload-audio/direct', {
          mimeType: 'audio/wav',
          sizeBytes: 10,
        })
      ).status,
    ).toBe(401)
    mockAuthenticated(me.clerkId)
    expect(
      (
        await call(AUDIO_DIRECT, '/api/upload-audio/direct', {
          mimeType: 'audio/x-unknown',
          sizeBytes: 10,
        })
      ).status,
    ).toBe(400)
    expect(bucket.presigned).toEqual([])
  })

  it('两步走通：落一行 AUDIO（时长按递的）', async () => {
    const pkg = (
      await call<Prepared>(AUDIO_DIRECT, '/api/upload-audio/direct', {
        mimeType: 'audio/wav',
        sizeBytes: WAV.byteLength,
      })
    ).body.data!
    expect(pkg.storageKey).toMatch(
      new RegExp(`^generations/${me.id}/audio/.+\\.wav$`),
    )
    bucket.objects.set(pkg.storageKey, WAV)

    const done = await call<Completed>(
      AUDIO_COMPLETE,
      '/api/upload-audio/direct/complete',
      {
        storageKey: pkg.storageKey,
        mimeType: 'audio/wav',
        sizeBytes: WAV.byteLength,
        duration: 12,
      },
    )
    expect(done.status).toBe(200)
    expect(
      await db.generation.findUniqueOrThrow({
        where: { id: done.body.data!.generation.id },
      }),
    ).toMatchObject({
      userId: me.id,
      outputType: 'AUDIO',
      mimeType: 'audio/wav',
      duration: 12,
    })
  })

  it('收尾：缺必填 400；别人名下的键 403；都不落库', async () => {
    expect(
      (
        await call(AUDIO_COMPLETE, '/api/upload-audio/direct/complete', {
          mimeType: 'audio/wav',
        })
      ).status,
    ).toBe(400)
    const theirs = `generations/${other.id}/audio/a.wav`
    bucket.objects.set(theirs, WAV)
    expect(
      (
        await call(AUDIO_COMPLETE, '/api/upload-audio/direct/complete', {
          storageKey: theirs,
          mimeType: 'audio/wav',
          sizeBytes: WAV.byteLength,
        })
      ).status,
    ).toBe(403)
    expect(await db.generation.count()).toBe(0)
  })
})
