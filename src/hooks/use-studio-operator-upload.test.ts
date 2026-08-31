import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { GenerationRecord } from '@/types'

import {
  toOperatorAttachment,
  useStudioOperatorUpload,
} from './use-studio-operator-upload'

/**
 * P3-A 上传三通道的契约闸。
 *
 * 钉三件事，每一件都对应一个**编译期看不见**的失效：
 *  ① 分派只看 MIME（台账 BH：`/api/upload-image` 产物一律 `.png` 后缀，
 *    按扩展名判型会把一段 mp4 当成图片发去图片通道）；
 *  ② 出口只有 https —— 在飞的 `blob:` 预览**永远不会**变成附件
 *    （台账 BG 的近亲：附件里塞进一个助手取不到的地址）；
 *  ③ 失败不静默：失败项留在队列里、带原因、可重试、可摘除。
 */

const uploadImageFileAPI = vi.hoisted(() => vi.fn())
const uploadVideoFileAPI = vi.hoisted(() => vi.fn())
const uploadAudioFileAPI = vi.hoisted(() => vi.fn())

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string) => key
    t.has = () => false
    return t
  },
}))

vi.mock('@/lib/api-client/generation', () => ({
  uploadImageFileAPI,
  uploadVideoFileAPI,
  uploadAudioFileAPI,
}))

// 元数据探测在 jsdom 里没有解码器 —— 它们本来就是 best-effort，桩掉。
vi.mock('@/lib/audio-metadata', () => ({
  readAudioFileMetadata: vi.fn().mockResolvedValue({ duration: 3 }),
}))
vi.mock('@/lib/video-thumbnail', () => ({
  readVideoFileMetadata: vi.fn().mockResolvedValue({
    width: 1920,
    height: 1080,
    duration: 30,
  }),
  captureVideoThumbnail: vi.fn().mockResolvedValue(null),
}))
// 小文件走不到压缩分支，但模块顶层会 import sonner —— 桩掉更省事。
vi.mock('@/lib/prepare-image-upload', () => ({
  prepareImageUpload: vi.fn(async (file: File) => file),
}))

function generation(overrides: Record<string, unknown> = {}): GenerationRecord {
  return {
    id: 'gen-1',
    url: 'https://cdn.example.com/a.png',
    thumbnailUrl: null,
    prompt: '',
    model: 'user-upload',
    outputType: 'IMAGE',
    ...overrides,
  } as unknown as GenerationRecord
}

function setup() {
  const onUploaded = vi.fn()
  const view = renderHook(() => useStudioOperatorUpload({ onUploaded }))
  return { onUploaded, view }
}

beforeEach(() => {
  vi.clearAllMocks()
  // jsdom 没有 object URL —— chip 的本地预览要用它。
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:local-preview')
  globalThis.URL.revokeObjectURL = vi.fn()
})

describe('useStudioOperatorUpload · 按 MIME 分派三通道', () => {
  it('图片走图片通道，成功后出列并交出一个 https 附件（label 用文件名，不是 user-upload）', async () => {
    uploadImageFileAPI.mockResolvedValue({
      success: true,
      data: { generation: generation() },
    })
    const { onUploaded, view } = setup()

    act(() => {
      view.result.current.uploadFiles([
        new File(['x'], 'shot.png', { type: 'image/png' }),
      ])
    })

    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1))
    expect(uploadImageFileAPI).toHaveBeenCalledTimes(1)
    expect(uploadVideoFileAPI).not.toHaveBeenCalled()
    expect(uploadAudioFileAPI).not.toHaveBeenCalled()
    expect(onUploaded.mock.calls[0]?.[0]).toEqual({
      id: 'gen-1',
      url: 'https://cdn.example.com/a.png',
      // ⭐ 空 prompt 回落到 `model` 会得到 `user-upload`（P2 遗留 ④）——
      //   上传通道知道文件叫什么，就写文件名。
      label: 'shot.png',
      kind: 'image',
      thumbnailUrl: 'https://cdn.example.com/a.png',
    })
    // ⭐ 出口只有 https：blob 预览止步于 chip。
    expect(onUploaded.mock.calls[0]?.[0].url.startsWith('https://')).toBe(true)
    // 成功即出列 —— 队列里不留一个 `done` 档，否则 chip 会出现两遍。
    await waitFor(() => expect(view.result.current.uploads).toHaveLength(0))
  })

  it('视频走视频通道（⛔ 不按 .mp4 这个后缀判，按 video/mp4 这个 MIME 判）', async () => {
    uploadVideoFileAPI.mockResolvedValue({
      success: true,
      data: {
        generation: generation({
          id: 'gen-v',
          url: 'https://cdn.example.com/clip.mp4',
          outputType: 'VIDEO',
        }),
      },
    })
    const { onUploaded, view } = setup()

    act(() => {
      view.result.current.uploadFiles([
        // ⚠ 名字故意写成 `.png`：判型只许看 MIME。
        new File(['x'], 'trap.png', { type: 'video/mp4' }),
      ])
    })

    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1))
    expect(uploadVideoFileAPI).toHaveBeenCalledTimes(1)
    expect(uploadImageFileAPI).not.toHaveBeenCalled()
    expect(onUploaded.mock.calls[0]?.[0].kind).toBe('video')
    // 视频没有缩略图时不给 —— 回落到 url 会让 next/image 碎掉。
    expect(onUploaded.mock.calls[0]?.[0]).not.toHaveProperty('thumbnailUrl')
  })

  it('音频走音频通道', async () => {
    uploadAudioFileAPI.mockResolvedValue({
      success: true,
      data: {
        generation: generation({
          id: 'gen-a',
          url: 'https://cdn.example.com/voice.mp3',
          outputType: 'AUDIO',
        }),
      },
    })
    const { onUploaded, view } = setup()

    act(() => {
      view.result.current.uploadFiles([
        new File(['x'], 'voice.mp3', { type: 'audio/mpeg' }),
      ])
    })

    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1))
    expect(uploadAudioFileAPI).toHaveBeenCalledTimes(1)
    expect(onUploaded.mock.calls[0]?.[0].kind).toBe('audio')
  })

  it('在飞的那件只有 blob 预览，且**不会**进附件（附件必须有 https URL）', async () => {
    let resolveUpload: (value: unknown) => void = () => {}
    uploadImageFileAPI.mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve
      }),
    )
    const { onUploaded, view } = setup()

    act(() => {
      view.result.current.uploadFiles([
        new File(['x'], 'shot.png', { type: 'image/png' }),
      ])
    })

    await waitFor(() => expect(view.result.current.uploads).toHaveLength(1))
    expect(view.result.current.uploads[0]?.status).toBe('uploading')
    expect(view.result.current.uploads[0]?.previewUrl).toBe(
      'blob:local-preview',
    )
    expect(onUploaded).not.toHaveBeenCalled()

    await act(async () => {
      resolveUpload({ success: true, data: { generation: generation() } })
    })
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1))
  })
})

describe('useStudioOperatorUpload · 失败不静默', () => {
  it('失败留在队列里带原因，重试走同一条通道', async () => {
    uploadImageFileAPI.mockResolvedValueOnce({
      success: false,
      error: 'R2 rejected the upload',
    })
    const { onUploaded, view } = setup()

    act(() => {
      view.result.current.uploadFiles([
        new File(['x'], 'shot.png', { type: 'image/png' }),
      ])
    })

    await waitFor(() =>
      expect(view.result.current.uploads[0]?.status).toBe('error'),
    )
    expect(view.result.current.uploads[0]?.error).toBe('R2 rejected the upload')
    expect(onUploaded).not.toHaveBeenCalled()

    uploadImageFileAPI.mockResolvedValueOnce({
      success: true,
      data: { generation: generation() },
    })
    act(() => {
      view.result.current.retryUpload(view.result.current.uploads[0]!.id)
    })

    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1))
    expect(uploadImageFileAPI).toHaveBeenCalledTimes(2)
  })

  it('认不得的类型也进队列（⛔ 不是「拖进去什么都没发生」）', async () => {
    const { view } = setup()

    act(() => {
      view.result.current.uploadFiles([
        new File(['x'], 'layers.psd', { type: 'image/vnd.adobe.photoshop' }),
      ])
    })

    await waitFor(() => expect(view.result.current.uploads).toHaveLength(1))
    expect(view.result.current.uploads[0]?.status).toBe('error')
    expect(view.result.current.uploads[0]?.error).toBe(
      'attach.upload.unsupported',
    )
    expect(uploadImageFileAPI).not.toHaveBeenCalled()
  })

  it('传到一半摘掉：结果回来时**不会**把它挂回去', async () => {
    let resolveUpload: (value: unknown) => void = () => {}
    uploadImageFileAPI.mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve
      }),
    )
    const { onUploaded, view } = setup()

    act(() => {
      view.result.current.uploadFiles([
        new File(['x'], 'shot.png', { type: 'image/png' }),
      ])
    })
    await waitFor(() => expect(view.result.current.uploads).toHaveLength(1))

    act(() => {
      view.result.current.dismissUpload(view.result.current.uploads[0]!.id)
    })
    expect(view.result.current.uploads).toHaveLength(0)

    await act(async () => {
      resolveUpload({ success: true, data: { generation: generation() } })
    })
    // 用户明明删掉了它 —— 几秒后它自己冒出来是最刺眼的那种 bug。
    expect(onUploaded).not.toHaveBeenCalled()
  })
})

describe('useStudioOperatorUpload · 探不到本地元数据不许把上传判死', () => {
  // ⚠ 2026-08-30 真机实证：标签页隐藏时 `<video>` / `<audio>` 的 loadedmetadata
  //   / seeked / error 一个都不派发，探测的 Promise 永远不落地。时间预算因此落
  //   在**探测函数内部**（见 `video-thumbnail.test.ts` / `audio-metadata.test.ts`
  //   的 `probe time budget`：外层 race 救得了调用方，救不了那个元素和它的
  //   object URL）。预算耗尽后它们返回 `null` —— 这一组钉的是这个 `null` 到了
  //   hook 手里之后不许变成一次失败的上传。
  it('视频探测回 null 时照样传，服务端收 0 尺寸、封面缺席', async () => {
    const { readVideoFileMetadata, captureVideoThumbnail } =
      await import('@/lib/video-thumbnail')
    vi.mocked(readVideoFileMetadata).mockResolvedValueOnce(null)
    vi.mocked(captureVideoThumbnail).mockResolvedValueOnce(null)
    uploadVideoFileAPI.mockResolvedValue({
      success: true,
      data: {
        generation: generation({
          id: 'gen-v',
          url: 'https://cdn.example.com/clip.mp4',
          outputType: 'VIDEO',
        }),
      },
    })
    const { onUploaded, view } = setup()

    act(() => {
      view.result.current.uploadFiles([
        new File(['x'], 'clip.mp4', { type: 'video/mp4' }),
      ])
    })

    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1))
    expect(uploadVideoFileAPI).toHaveBeenCalledTimes(1)
    expect(uploadVideoFileAPI.mock.calls[0]?.[1]).toMatchObject({
      width: 0,
      height: 0,
      poster: null,
    })
  })

  it('音频探测回 null 时照样传，只是没时长', async () => {
    const { readAudioFileMetadata } = await import('@/lib/audio-metadata')
    vi.mocked(readAudioFileMetadata).mockResolvedValueOnce(null)
    uploadAudioFileAPI.mockResolvedValue({
      success: true,
      data: {
        generation: generation({
          id: 'gen-a',
          url: 'https://cdn.example.com/voice.mp3',
          outputType: 'AUDIO',
        }),
      },
    })
    const { onUploaded, view } = setup()

    act(() => {
      view.result.current.uploadFiles([
        new File(['x'], 'voice.mp3', { type: 'audio/mpeg' }),
      ])
    })

    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1))
    expect(uploadAudioFileAPI).toHaveBeenCalledTimes(1)
    expect(uploadAudioFileAPI.mock.calls[0]?.[1]).toMatchObject({
      duration: undefined,
    })
  })
})

describe('toOperatorAttachment', () => {
  it('三处共用同一个映射：3D 也认得，缩略图缺席时不回落到 url', () => {
    expect(
      toOperatorAttachment(
        generation({
          id: 'gen-3d',
          url: 'https://cdn.example.com/mesh.glb',
          outputType: 'MODEL_3D',
          prompt: '一只小狐狸',
        }),
      ),
    ).toEqual({
      id: 'gen-3d',
      url: 'https://cdn.example.com/mesh.glb',
      label: '一只小狐狸',
      kind: 'model3d',
    })
  })
})
