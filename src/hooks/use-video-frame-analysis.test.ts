// @vitest-environment jsdom
/**
 * 真 hook + 真抽帧（`video-frame-capture`）；只替浏览器解码那层与网络（api-client）。
 * 断言的是发出去的请求内容与 hook 露给界面的状态。
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { VISION_TASKS } from '@/constants/vision'
import { planVideoFrames } from '@/lib/video-frame-plan'
import { ASSISTANT_SURFACE_IDS } from '@/types/assistant-conversation'
import {
  installFakeVideoDecoding,
  type FakeVideoDecoding,
} from '@/test/fake-video-element'

const mockAnalyzeVideoAPI = vi.fn()
vi.mock('@/lib/api-client/vision', () => ({
  analyzeVideoAPI: (...args: unknown[]) => mockAnalyzeVideoAPI(...args),
}))

import { useVideoFrameAnalysis } from '@/hooks/use-video-frame-analysis'

const VIDEO_URL = 'https://cdn.anteisuba.com/clips/shot.mp4'
const BASE = {
  task: VISION_TASKS.compare,
  video: VIDEO_URL,
  surface: ASSISTANT_SURFACE_IDS.imageStudio,
}

let videos: FakeVideoDecoding

beforeEach(() => {
  vi.clearAllMocks()
  videos = installFakeVideoDecoding()
  mockAnalyzeVideoAPI.mockResolvedValue({
    success: true,
    data: { runId: 'run_1', mode: 'frames', downgraded: false },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useVideoFrameAnalysis', () => {
  it('抽到帧就带帧集送出去（按计划的时间戳），服务端据此走 frames 档', async () => {
    videos.set(VIDEO_URL, { duration: 80 })

    const { result } = renderHook(() => useVideoFrameAnalysis())
    await act(async () => {
      await result.current.run(BASE)
    })

    const payload = mockAnalyzeVideoAPI.mock.calls[0]![0]
    expect(payload).toMatchObject({ videoUrl: VIDEO_URL, durationSeconds: 80 })
    expect(
      payload.frames.map(
        (frame: { timestampSeconds: number }) => frame.timestampSeconds,
      ),
    ).toEqual(
      planVideoFrames(80).entries.map((entry) => entry.timestampSeconds),
    )
    expect(payload.frames[0].dataUrl).toMatch(/^data:image\//)
    expect(result.current.phase).toBe('done')
  })

  it('⚠ 抽帧失败照样发请求（只是不带帧集）—— 让服务端决定 native 还是报错', async () => {
    videos.set(VIDEO_URL, 'tainted')

    const { result } = renderHook(() => useVideoFrameAnalysis())
    await act(async () => {
      await result.current.run(BASE)
    })

    const payload = mockAnalyzeVideoAPI.mock.calls[0]![0]
    expect(payload.frames).toBeUndefined()
    expect(payload.durationSeconds).toBeUndefined()
    expect(result.current.captureFailure).toBe('tainted-canvas')
  })

  it('结构化错误原样带出 errorCode —— Hard Rule 8 靠它路由到 QuickSetupDialog', async () => {
    videos.set(VIDEO_URL, 'loadError')
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

    expect(Object.keys(videos.loads)).toEqual([])
    expect(mockAnalyzeVideoAPI).not.toHaveBeenCalled()
    expect(result.current.phase).toBe('error')
  })
})
