// @vitest-environment jsdom
/**
 * 真 hook + 真压图 / 读像素 / 视频取封面 / 产物库招呼；只假网络（api-client）。
 * jsdom 不会解码图片和视频：`createImageBitmap` 与 `<video>`/`<canvas>` 用浏览器层小桩替。
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS } from '@/constants/node-studio'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const uploadImageFileAPI = vi.hoisted(() => vi.fn())
const uploadVideoFileAPI = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-client', () => ({
  uploadImageFileAPI,
  uploadVideoFileAPI,
}))
vi.mock('@/lib/api-client/voices', () => ({
  uploadReferenceAudioAPI: vi.fn(),
}))

import { useGalleryRevision } from '@/lib/gallery-revision'
import { installFakeVideoDecoding } from '@/test/fake-video-element'

import { useNodeUploadV4 } from './use-node-upload-v4'

const file = new File(['pixels'], 'portrait.png', { type: 'image/png' })

/** 浏览器把这张图解出来是多大（null = 解不出来）。 */
function browserDecodesImageAs(size: { width: number; height: number } | null) {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => {
      if (!size) throw new DOMException('decode failed', 'EncodingError')
      return { ...size, close: vi.fn() }
    }),
  )
}

function renderUpload() {
  return renderHook(() => ({
    ...useNodeUploadV4(),
    galleryRevision: useGalleryRevision(),
  }))
}

beforeEach(() => {
  uploadImageFileAPI.mockReset()
  uploadVideoFileAPI.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useNodeUploadV4 · 图片回填带原图像素', () => {
  it('writes mediaWidth / mediaHeight so the collapsed card follows real ratio', async () => {
    browserDecodesImageAs({ width: 1024, height: 1792 })
    uploadImageFileAPI.mockResolvedValue({
      success: true,
      data: { generation: { url: 'https://cdn.example.com/portrait.png' } },
    })

    const { result } = renderUpload()
    let patch: Awaited<ReturnType<typeof result.current.upload>> = null
    await act(async () => {
      patch = await result.current.upload('image', file, '生成图')
    })

    expect(patch).toEqual({
      url: 'https://cdn.example.com/portrait.png',
      sizeBytes: file.size,
      imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
      mediaWidth: 1024,
      mediaHeight: 1792,
    })
  })

  it('omits dims when decode fails so the card can still land', async () => {
    browserDecodesImageAs(null)
    uploadImageFileAPI.mockResolvedValue({
      success: true,
      data: { generation: { url: 'https://cdn.example.com/ok.png' } },
    })

    const { result } = renderUpload()
    let patch: Awaited<ReturnType<typeof result.current.upload>> = null
    await act(async () => {
      patch = await result.current.upload('image', file, '生成图')
    })

    expect(patch).toEqual({
      url: 'https://cdn.example.com/ok.png',
      sizeBytes: file.size,
      imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
    })
    expect(patch).not.toHaveProperty('mediaWidth')
    expect(patch).not.toHaveProperty('mediaHeight')
  })
})

describe('useNodeUploadV4 · 视频走浏览器直传', () => {
  const video = new File(['frames'], 'clip.mp4', { type: 'video/mp4' })

  beforeEach(() => {
    // jsdom 没有 object URL：按文件名给一个，好让假 `<video>` 认出是哪段。
    Object.assign(URL, {
      createObjectURL: (blob: File) => `blob:${blob.name}`,
      revokeObjectURL: () => {},
    })
    installFakeVideoDecoding({
      'blob:clip.mp4': { duration: 5, width: 1280, height: 720 },
    })
  })

  it('uploads through the direct R2 path and backfills url + poster + dims', async () => {
    uploadVideoFileAPI.mockResolvedValue({
      success: true,
      data: {
        generation: {
          url: 'https://cdn.example.com/clip.mp4',
          thumbnailUrl: 'https://cdn.example.com/clip.webp',
        },
      },
    })

    const { result } = renderUpload()
    const revisionBefore = result.current.galleryRevision
    let patch: Awaited<ReturnType<typeof result.current.upload>> = null
    await act(async () => {
      patch = await result.current.upload('video', video, '参考片段')
    })

    expect(uploadVideoFileAPI).toHaveBeenCalledWith(
      video,
      expect.objectContaining({
        width: 1280,
        height: 720,
        duration: 5,
        poster: expect.objectContaining({ type: 'image/webp' }),
        note: '参考片段',
      }),
    )
    expect(patch).toEqual({
      url: 'https://cdn.example.com/clip.mp4',
      sizeBytes: video.size,
      videoThumbnailUrl: 'https://cdn.example.com/clip.webp',
      mediaWidth: 1280,
      mediaHeight: 720,
    })
    // 产物库那边被叫了一声（会重拉一页）。
    expect(result.current.galleryRevision).toBeGreaterThan(revisionBefore)
  })

  it('returns null with a localized retryable error when the upload fails', async () => {
    uploadVideoFileAPI.mockResolvedValue({
      success: false,
      error: 'Video storage rejected the upload (status 403)',
    })

    const { result } = renderUpload()
    let patch: Awaited<ReturnType<typeof result.current.upload>> = null
    await act(async () => {
      patch = await result.current.upload('video', video, '参考片段')
    })

    expect(patch).toBeNull()
    // 原话 ⛔ 进界面：只给本地化的「上传失败」。
    expect(result.current.error).toBe('upload.failed')
    expect(result.current.canRetry).toBe(true)
  })
})
