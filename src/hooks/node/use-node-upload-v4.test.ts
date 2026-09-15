import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS } from '@/constants/node-studio'

const uploadImageFileAPI = vi.hoisted(() => vi.fn())
const compressImageToLimit = vi.hoisted(() => vi.fn())
const readImagePixelSize = vi.hoisted(() => vi.fn())
const notifyGalleryChanged = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-client', () => ({
  uploadImageFileAPI,
  uploadReferenceVideoAPI: vi.fn(),
}))
vi.mock('@/lib/api-client/voices', () => ({
  uploadReferenceAudioAPI: vi.fn(),
}))
vi.mock('@/lib/compress-image', () => ({
  compressImageToLimit,
  readImagePixelSize,
}))
vi.mock('@/lib/gallery-revision', () => ({
  notifyGalleryChanged,
}))
vi.mock('@/lib/video-thumbnail', () => ({
  captureVideoThumbnail: vi.fn(),
}))

import { useNodeUploadV4 } from './use-node-upload-v4'

const file = new File(['pixels'], 'portrait.png', { type: 'image/png' })

beforeEach(() => {
  uploadImageFileAPI.mockReset()
  compressImageToLimit.mockReset()
  readImagePixelSize.mockReset()
  notifyGalleryChanged.mockReset()
  compressImageToLimit.mockResolvedValue({
    file,
    originalBytes: file.size,
    compressedBytes: file.size,
    wasCompressed: false,
  })
})

describe('useNodeUploadV4 · 图片回填带原图像素', () => {
  it('writes mediaWidth / mediaHeight so the collapsed card follows real ratio', async () => {
    readImagePixelSize.mockResolvedValue({ width: 1024, height: 1792 })
    uploadImageFileAPI.mockResolvedValue({
      success: true,
      data: { generation: { url: 'https://cdn.example.com/portrait.png' } },
    })

    const { result } = renderHook(() => useNodeUploadV4())
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
    readImagePixelSize.mockResolvedValue(null)
    uploadImageFileAPI.mockResolvedValue({
      success: true,
      data: { generation: { url: 'https://cdn.example.com/ok.png' } },
    })

    const { result } = renderHook(() => useNodeUploadV4())
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
