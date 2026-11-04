/**
 * L2a 真库：本地素材上传的三个服务（upload-image / upload-video / upload-audio.service）。
 * 用户、作品、项目走真库，文件头识别全真；只假 R2（一个内存桶，记下每次读了哪段）。
 * 核库里落的那一行、桶里留下 / 清掉了什么、收尾时只读了文件头。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const bucket = vi.hoisted(() => ({
  objects: new Map<string, Buffer>(),
  presigned: [] as Array<{ key: string; mimeType: string }>,
  ranges: [] as Array<[number, number]>,
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
    uploadToR2: async ({ key, data }: { key: string; data: Buffer }) => {
      bucket.objects.set(key, Buffer.from(data))
      return actual.getR2PublicUrl(key)
    },
    createPresignedR2PutUrl: async ({
      key,
      mimeType,
    }: {
      key: string
      mimeType: string
    }) => {
      bucket.presigned.push({ key, mimeType })
      return `https://r2.test/put/${key}?sig=1`
    },
    getR2ObjectBuffer: async ({ key }: { key: string }) => ({
      buffer: read(key),
    }),
    getR2ObjectMetadata: async ({ key }: { key: string }) => ({
      sizeBytes: read(key).byteLength,
    }),
    getR2ObjectRange: async ({
      key,
      startByte,
      endByteInclusive,
    }: {
      key: string
      startByte: number
      endByteInclusive: number
    }) => {
      bucket.ranges.push([startByte, endByteInclusive])
      return { buffer: read(key).subarray(startByte, endByteInclusive + 1) }
    },
    deleteFromR2: async (key: string) => {
      bucket.objects.delete(key)
    },
    createImageThumbnailAsset: async ({
      sourceStorageKey,
    }: {
      sourceStorageKey: string
    }) => {
      // 缩略图由 Worker 从桶里读原图做：原图此刻必须已经在桶里
      read(sourceStorageKey)
      bucket.thumbnails.push(sourceStorageKey)
      const thumbnailStorageKey = `${sourceStorageKey}.thumb.webp`
      return {
        thumbnailStorageKey,
        thumbnailUrl: actual.getR2PublicUrl(thumbnailStorageKey),
      }
    },
  }
})

import {
  USER_AUDIO_UPLOAD_MAX_BYTES,
  USER_UPLOAD_MAX_BYTES,
  USER_UPLOAD_PROVIDER,
} from '@/constants/uploads'
import { db } from '@/lib/db'
import {
  completeUserAudioDirectUpload,
  createUserAudioDirectUpload,
  detectTrustedAudioMime,
} from '@/services/upload-audio.service'
import {
  completeUserImageDirectUpload,
  createUserImageDirectUpload,
  uploadUserImageFile,
} from '@/services/upload-image.service'
import {
  completeUserVideoDirectUpload,
  createUserVideoDirectUpload,
} from '@/services/upload-video.service'
import { createTestUser, resetDatabase } from '@/test/int/db'

/** 64×64 的真 PNG。 */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsItjJrMbxgi+hcEKLNP1WgQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQELgteuuE8uE1jwAAAAABJRU5ErkJggg==',
  'base64',
)
const MP4_HEAD = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]),
  Buffer.from('ftypisom', 'ascii'),
  Buffer.alloc(20),
])
const MP3_HEAD = Buffer.concat([
  Buffer.from('ID3', 'ascii'),
  Buffer.from([4, 0, 0, 0, 0, 0, 0]),
])
/** 文件头 + 一大段正文：收尾只该读前 4096 字节。 */
const withBody = (head: Buffer) => Buffer.concat([head, Buffer.alloc(20_000)])

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  bucket.objects.clear()
  bucket.presigned.length = 0
  bucket.ranges.length = 0
  bucket.thumbnails.length = 0
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
})

describe('upload-image（真库 + 内存 R2）', () => {
  it('表单上传：原样存进桶，只做缩略图，尺寸按文件头量，落一行作品', async () => {
    const project = await db.project.create({
      data: { userId: me.id, name: 'P' },
    })
    const gen = await uploadUserImageFile(me.clerkId, {
      fileBuffer: PNG,
      claimedMimeType: 'image/jpeg',
      note: 'holiday',
      projectId: project.id,
    })

    expect(bucket.objects.get(gen.storageKey)).toEqual(PNG)
    expect(bucket.thumbnails).toEqual([gen.storageKey])
    expect(
      await db.generation.findUniqueOrThrow({ where: { id: gen.id } }),
    ).toMatchObject({
      userId: me.id,
      outputType: 'IMAGE',
      mimeType: 'image/png',
      width: 64,
      height: 64,
      prompt: 'holiday',
      provider: USER_UPLOAD_PROVIDER,
      model: USER_UPLOAD_PROVIDER,
      thumbnailStorageKey: `${gen.storageKey}.thumb.webp`,
      previewUrl: null,
    })
    expect(
      await db.projectItem.count({
        where: { projectId: project.id, generationId: gen.id },
      }),
    ).toBe(1)
  })

  it('表单上传：超限、不是图都拒，桶和库都不动', async () => {
    await expect(
      uploadUserImageFile(me.clerkId, {
        fileBuffer: Buffer.alloc(USER_UPLOAD_MAX_BYTES + 1),
      }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      uploadUserImageFile(me.clerkId, { fileBuffer: Buffer.from('nope') }),
    ).rejects.toMatchObject({ status: 400 })
    expect(bucket.objects.size).toBe(0)
    expect(await db.generation.count()).toBe(0)
  })

  it('直传：签到我名下的键 → 放进桶 → 收尾落库', async () => {
    const prepared = await createUserImageDirectUpload(me.clerkId, {
      fileName: 'a.png',
      mimeType: 'image/png',
      sizeBytes: PNG.byteLength,
    })
    expect(prepared.storageKey.startsWith(`generations/${me.id}/image/`)).toBe(
      true,
    )
    expect(prepared.headers).toEqual({
      'Content-Type': 'image/png',
      'If-None-Match': '*',
    })
    expect(bucket.presigned).toEqual([
      { key: prepared.storageKey, mimeType: 'image/png' },
    ])

    bucket.objects.set(prepared.storageKey, PNG)
    const gen = await completeUserImageDirectUpload(me.clerkId, {
      storageKey: prepared.storageKey,
      mimeType: 'image/png',
      sizeBytes: PNG.byteLength,
    })
    expect(gen).toMatchObject({ width: 64, height: 64, mimeType: 'image/png' })
    expect(await db.generation.count()).toBe(1)
  })

  it('直传收尾：别人名下的键 403；大小对不上 400 并清掉桶里那份', async () => {
    const theirs = `generations/${other.id}/image/x.png`
    bucket.objects.set(theirs, PNG)
    await expect(
      completeUserImageDirectUpload(me.clerkId, {
        storageKey: theirs,
        mimeType: 'image/png',
        sizeBytes: PNG.byteLength,
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect(bucket.objects.has(theirs)).toBe(true)

    const mine = `generations/${me.id}/image/x.png`
    bucket.objects.set(mine, PNG)
    await expect(
      completeUserImageDirectUpload(me.clerkId, {
        storageKey: mine,
        mimeType: 'image/png',
        sizeBytes: PNG.byteLength + 1,
      }),
    ).rejects.toMatchObject({ status: 400 })
    expect(bucket.objects.has(mine)).toBe(false)
    expect(await db.generation.count()).toBe(0)
  })
})

describe('upload-video（真库 + 内存 R2）', () => {
  it('直传两步：只读文件头，落一行 VIDEO（宽高时长按递的）', async () => {
    const file = withBody(MP4_HEAD)
    const prepared = await createUserVideoDirectUpload(me.clerkId, {
      fileName: 'v.mp4',
      mimeType: 'video/mp4',
      sizeBytes: file.byteLength,
    })
    expect(prepared.headers['Content-Type']).toBe('video/mp4')

    bucket.objects.set(prepared.storageKey, file)
    const gen = await completeUserVideoDirectUpload(me.clerkId, {
      storageKey: prepared.storageKey,
      mimeType: 'video/mp4',
      sizeBytes: file.byteLength,
      width: 1920,
      height: 1080,
      duration: 12.5,
    })
    expect(bucket.ranges).toEqual([[0, 4095]])
    expect(
      await db.generation.findUniqueOrThrow({ where: { id: gen.id } }),
    ).toMatchObject({
      userId: me.id,
      outputType: 'VIDEO',
      mimeType: 'video/mp4',
      width: 1920,
      height: 1080,
      duration: 12.5,
    })
  })

  it('文件头和声称的类型对不上：400 并清掉，不落库', async () => {
    const key = `generations/${me.id}/video/x.mp4`
    const file = Buffer.from('not a video at all')
    bucket.objects.set(key, file)
    await expect(
      completeUserVideoDirectUpload(me.clerkId, {
        storageKey: key,
        mimeType: 'video/mp4',
        sizeBytes: file.byteLength,
        width: 1,
        height: 1,
      }),
    ).rejects.toMatchObject({ status: 400 })
    expect(bucket.objects.has(key)).toBe(false)
    expect(await db.generation.count()).toBe(0)
  })
})

describe('upload-audio（真库 + 内存 R2）', () => {
  it('认得 MP3、WAV、FLAC、OGG、M4A、WebM 的文件头', () => {
    expect(detectTrustedAudioMime(MP3_HEAD)).toBe('audio/mpeg')
    expect(
      detectTrustedAudioMime(
        Buffer.concat([
          Buffer.from('RIFF', 'ascii'),
          Buffer.alloc(4),
          Buffer.from('WAVE', 'ascii'),
        ]),
      ),
    ).toBe('audio/wav')
    expect(detectTrustedAudioMime(Buffer.from('fLaCaudio'))).toBe('audio/flac')
    expect(detectTrustedAudioMime(Buffer.from('OggSaudio'))).toBe('audio/ogg')
    expect(
      detectTrustedAudioMime(
        Buffer.concat([Buffer.alloc(4), Buffer.from('ftypM4A ', 'ascii')]),
      ),
    ).toBe('audio/mp4')
    expect(
      detectTrustedAudioMime(
        Buffer.concat([
          Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
          Buffer.from('webm', 'ascii'),
        ]),
      ),
    ).toBe('audio/webm')
  })

  it('直传两步：只读文件头，落一行 AUDIO（时长按递的）', async () => {
    const file = withBody(MP3_HEAD)
    const prepared = await createUserAudioDirectUpload(me.clerkId, {
      fileName: 'track.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: file.byteLength,
    })
    expect(prepared).toMatchObject({
      headers: { 'Content-Type': 'audio/mpeg', 'If-None-Match': '*' },
      maxBytes: USER_AUDIO_UPLOAD_MAX_BYTES,
    })

    bucket.objects.set(prepared.storageKey, file)
    const gen = await completeUserAudioDirectUpload(me.clerkId, {
      storageKey: prepared.storageKey,
      mimeType: 'audio/mpeg',
      sizeBytes: file.byteLength,
      duration: 120.5,
    })
    expect(bucket.ranges).toEqual([[0, 4095]])
    expect(
      await db.generation.findUniqueOrThrow({ where: { id: gen.id } }),
    ).toMatchObject({
      outputType: 'AUDIO',
      mimeType: 'audio/mpeg',
      width: 0,
      height: 0,
      duration: 120.5,
      provider: USER_UPLOAD_PROVIDER,
    })
  })

  it('不是音频：400 并清掉，不落库', async () => {
    const key = `generations/${me.id}/audio/x.mp3`
    const file = Buffer.from('not an audio file')
    bucket.objects.set(key, file)
    await expect(
      completeUserAudioDirectUpload(me.clerkId, {
        storageKey: key,
        mimeType: 'audio/mpeg',
        sizeBytes: file.byteLength,
      }),
    ).rejects.toMatchObject({ status: 400 })
    expect(bucket.objects.has(key)).toBe(false)
    expect(await db.generation.count()).toBe(0)
  })
})
