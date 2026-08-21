import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { VISION_TASKS } from '@/constants/vision'
import { ASSISTANT_SURFACE_IDS } from '@/types/assistant-conversation'

const mockCaptureVideoFrames = vi.fn()
vi.mock('@/lib/video-frame-capture', () => ({
  captureVideoFrames: (...args: unknown[]) => mockCaptureVideoFrames(...args),
}))

const mockAnalyzeVideoAPI = vi.fn()
vi.mock('@/lib/api-client/vision', () => ({
  analyzeVideoAPI: (...args: unknown[]) => mockAnalyzeVideoAPI(...args),
}))

const { useVideoFrameAnalysis } =
  await import('@/hooks/use-video-frame-analysis')

const VIDEO_URL = 'https://cdn.anteisuba.com/clips/shot.mp4'
const BASE = {
  task: VISION_TASKS.compare,
  video: VIDEO_URL,
  surface: ASSISTANT_SURFACE_IDS.imageStudio,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAnalyzeVideoAPI.mockResolvedValue({
    success: true,
    data: { runId: 'run_1', mode: 'frames', downgraded: false },
  })
})

describe('useVideoFrameAnalysis', () => {
  it('抽到帧就带帧集送出去（服务端据此走 frames 档）', async () => {
    mockCaptureVideoFrames.mockResolvedValue({
      ok: true,
      durationSeconds: 80,
      frames: [
        { index: 0, timestampSeconds: 5, dataUrl: 'data:image/webp;base64,A' },
      ],
    })

    const { result } = renderHook(() => useVideoFrameAnalysis())
    await act(async () => {
      await result.current.run(BASE)
    })

    expect(mockAnalyzeVideoAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        videoUrl: VIDEO_URL,
        durationSeconds: 80,
        frames: [
          {
            index: 0,
            timestampSeconds: 5,
            dataUrl: 'data:image/webp;base64,A',
          },
        ],
      }),
    )
    expect(result.current.phase).toBe('done')
  })

  it('⚠ 抽帧失败照样发请求（只是不带帧集）—— 让服务端决定 native 还是报错', async () => {
    mockCaptureVideoFrames.mockResolvedValue({
      ok: false,
      reason: 'tainted-canvas',
      message: 'SecurityError',
    })

    const { result } = renderHook(() => useVideoFrameAnalysis())
    await act(async () => {
      await result.current.run(BASE)
    })

    const payload = mockAnalyzeVideoAPI.mock.calls[0][0]
    expect(payload.frames).toBeUndefined()
    expect(payload.durationSeconds).toBeUndefined()
    expect(result.current.captureFailure).toBe('tainted-canvas')
  })

  it('结构化错误原样带出 errorCode —— Hard Rule 8 靠它路由到 QuickSetupDialog', async () => {
    mockCaptureVideoFrames.mockResolvedValue({
      ok: false,
      reason: 'load-failed',
    })
    mockAnalyzeVideoAPI.mockResolvedValue({
      success: false,
      error: 'no video-capable route',
      errorCode: 'ASSISTANT_VIDEO_UNSUPPORTED',
      i18nKey: 'errors.assistant.videoUnsupported',
    })

    const { result } = renderHook(() => useVideoFrameAnalysis())
    await act(async () => {
      await result.current.run(BASE)
    })

    expect(result.current.phase).toBe('error')
    expect(result.current.error).toMatchObject({
      errorCode: 'ASSISTANT_VIDEO_UNSUPPORTED',
      i18nKey: 'errors.assistant.videoUnsupported',
    })
  })

  it('本地文件没先上传就没有可落库的来源 URL —— 当场停，不去抽帧', async () => {
    const { result } = renderHook(() => useVideoFrameAnalysis())
    await act(async () => {
      await result.current.run({
        ...BASE,
        video: new File(['bytes'], 'clip.mp4', { type: 'video/mp4' }),
      })
    })

    expect(mockCaptureVideoFrames).not.toHaveBeenCalled()
    expect(mockAnalyzeVideoAPI).not.toHaveBeenCalled()
    expect(result.current.phase).toBe('error')
  })
})
