import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { VISION_TASKS } from '@/constants/vision'
import { VIDEO_ANALYSIS_DOWNGRADE } from '@/constants/video-analysis'
import { ASSISTANT_SURFACE_IDS } from '@/types/assistant-conversation'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockResolveVisionRoute = vi.fn()
vi.mock('@/services/vision/vision-route.service', () => ({
  resolveVisionRoute: (...args: unknown[]) => mockResolveVisionRoute(...args),
}))

const mockPersistVideoFrameSet = vi.fn()
vi.mock('@/services/video-frames/video-frame-set.service', () => ({
  persistVideoFrameSet: (...args: unknown[]) =>
    mockPersistVideoFrameSet(...args),
}))

const mockAnalyzeVisual = vi.fn()
vi.mock('@/services/vision/vision-analyzer.service', () => ({
  analyzeVisual: (...args: unknown[]) => mockAnalyzeVisual(...args),
}))

const { analyzeVideo } =
  await import('@/services/vision/video-analysis.service')

const VIDEO_URL = 'https://cdn.test.com/clip.mp4'
const BASE = {
  userId: 'db_user_1',
  surface: ASSISTANT_SURFACE_IDS.imageStudio,
  videoUrl: VIDEO_URL,
}

function frames() {
  return [
    { index: 0, timestampSeconds: 5, dataUrl: 'data:image/webp;base64,AAA' },
    { index: 1, timestampSeconds: 15, dataUrl: 'data:image/webp;base64,BBB' },
  ]
}

function routeOf(adapterType: AI_ADAPTER_TYPES) {
  return {
    route: {
      adapterType,
      providerConfig: { label: adapterType, baseUrl: 'https://x.test' },
      apiKey: 'key',
    },
    borrowed: false,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAnalyzeVisual.mockResolvedValue({
    runId: 'run_1',
    task: VISION_TASKS.compare,
    grounded: false,
    observations: { task: VISION_TASKS.compare },
    conclusions: [],
    model: 'openai',
    borrowedRoute: false,
  })
  mockPersistVideoFrameSet.mockImplementation(
    ({ frames: submitted }: { frames: { index: number }[] }) =>
      Promise.resolve({
        sourceVideoUrl: VIDEO_URL,
        durationSeconds: 80,
        planVersion: 1,
        strategy: 'segment-midpoints',
        frames: submitted.map((frame) => ({
          index: frame.index,
          timestampSeconds: (frame.index + 0.5) * 10,
          url: `https://cdn.test.com/frames/frame-0${frame.index + 1}.webp`,
          width: 640,
          height: 360,
        })),
      }),
  )
})

describe('analyzeVideo —— 一个入口两条腿', () => {
  it('frames 档：帧集先落 R2，再拿帧 URL 当图片分析（图片模型也跑得动）', async () => {
    mockResolveVisionRoute.mockResolvedValue(routeOf(AI_ADAPTER_TYPES.OPENAI))

    const result = await analyzeVideo({
      ...BASE,
      task: VISION_TASKS.compare,
      durationSeconds: 80,
      frames: frames(),
    })

    expect(mockPersistVideoFrameSet).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceVideoUrl: VIDEO_URL,
        durationSeconds: 80,
      }),
    )
    const analyzeArgs = mockAnalyzeVisual.mock.calls[0][0]
    expect(analyzeArgs.mediaUrls).toEqual([
      'https://cdn.test.com/frames/frame-01.webp',
      'https://cdn.test.com/frames/frame-02.webp',
    ])
    expect(analyzeArgs.frameSet.planVersion).toBe(1)
    expect(analyzeArgs.video).toBeUndefined()
    expect(result.mode).toBe('frames')
    expect(result.downgraded).toBe(false)
  })

  it('native 档：没帧集 + 能看视频的路 → 视频本体直传，超阈值自动降级', async () => {
    mockResolveVisionRoute.mockResolvedValue(routeOf(AI_ADAPTER_TYPES.GEMINI))

    const result = await analyzeVideo({
      ...BASE,
      task: VISION_TASKS.characterIdentity,
      durationSeconds: 1200,
    })

    expect(mockPersistVideoFrameSet).not.toHaveBeenCalled()
    const analyzeArgs = mockAnalyzeVisual.mock.calls[0][0]
    expect(analyzeArgs.mediaUrls).toEqual([])
    expect(analyzeArgs.video).toEqual({
      url: VIDEO_URL,
      // 静态观察类超阈值 → 裁前 60 秒（⛔ 不是弹确认卡）。
      window: {
        startOffset: 0,
        endOffset: VIDEO_ANALYSIS_DOWNGRADE.clipSeconds,
      },
    })
    expect(result.mode).toBe('native')
    expect(result.downgraded).toBe(true)
  })

  it('都不行：没帧集 + 看不了视频的路 → ASSISTANT_VIDEO_UNSUPPORTED，且什么都不做', async () => {
    mockResolveVisionRoute.mockResolvedValue(routeOf(AI_ADAPTER_TYPES.OPENAI))

    await expect(
      analyzeVideo({
        ...BASE,
        task: VISION_TASKS.qualityReview,
        durationSeconds: 30,
      }),
    ).rejects.toMatchObject({ errorCode: 'ASSISTANT_VIDEO_UNSUPPORTED' })

    expect(mockPersistVideoFrameSet).not.toHaveBeenCalled()
    expect(mockAnalyzeVisual).not.toHaveBeenCalled()
  })

  it('⚠ 按**借到的那条路**判档，不是用户选的那条', async () => {
    // 用户选了 DeepSeek（看不了图），借路借到了 Gemini —— 于是 native 成立。
    mockResolveVisionRoute.mockResolvedValue({
      ...routeOf(AI_ADAPTER_TYPES.GEMINI),
      borrowed: true,
    })

    const result = await analyzeVideo({
      ...BASE,
      task: VISION_TASKS.styleStudy,
      routeHint: 'key_deepseek',
      durationSeconds: 30,
    })

    expect(result.mode).toBe('native')
  })
})
