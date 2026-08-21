import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  VIDEO_ANALYSIS_MODES,
  VIDEO_FRAME_CAPTURE_REASONS,
} from '@/constants/video-analysis'
import { VISION_TASKS } from '@/constants/vision'
import { RESEARCH_CONCLUSION_BASES } from '@/constants/research'
import {
  analyzeVideoAPI,
  type VideoAnalysisResult,
} from '@/lib/api-client/vision'
import {
  captureVideoFrames,
  type VideoFrameCaptureResult,
  type VideoFrameCaptureSuccess,
} from '@/lib/video-frame-capture'
import { ASSISTANT_SURFACE_IDS } from '@/types/assistant-conversation'

import { VideoAnalysisPanel } from './VideoAnalysisPanel'

/**
 * 「分析这个视频」面板的四态（空 / 进行中 / 成功 / 失败）+ 两条不许含糊的规矩：
 *  - 抽帧失败**即使这一轮最后成功了也要说出来**（走的是 native，不是帧集）；
 *  - `tainted-canvas` 有自己的文案（修法是配 CORS，不是换视频）。
 *
 * ⚠ 这里不 mock hook，只 mock 它下面那两跳 —— 面板与 `useVideoFrameAnalysis`
 * 的接线（surface / task / videoUrl 有没有真传下去）正是这批要防的漏接。
 */
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    const translate = (key: string) => `${namespace}:${key}`
    // `getApiErrorMessage` 要 `.has`；只认这一个键，好验「errorCode 走了 i18n」。
    translate.has = (key: string) => key === 'assistant.videoUnsupported'
    return translate
  },
}))

vi.mock('@/lib/video-frame-capture', () => ({
  captureVideoFrames: vi.fn(),
}))

vi.mock('@/lib/api-client/vision', () => ({
  analyzeVideoAPI: vi.fn(),
}))

const mockCapture = vi.mocked(captureVideoFrames)
const mockAnalyze = vi.mocked(analyzeVideoAPI)

const VIDEO_URL = 'https://cdn.anteisuba.com/clips/shot.mp4'

/** `ApiResult<…>` 在 api-client 里没导出 —— 从返回类型上取，别抄一份。 */
type AnalyzeVideoResponse = Awaited<ReturnType<typeof analyzeVideoAPI>>

const CAPTURED: VideoFrameCaptureSuccess = {
  ok: true,
  plan: {
    durationSeconds: 16,
    frameCount: 8,
    planVersion: 1,
    strategy: 'segment-midpoints',
    entries: [],
  },
  durationSeconds: 16,
  width: 1024,
  height: 576,
  frames: [
    { index: 0, timestampSeconds: 1, dataUrl: 'data:image/webp;base64,A' },
  ],
}

function analysisResult(overrides: Partial<VideoAnalysisResult> = {}): {
  success: true
  data: VideoAnalysisResult
} {
  return {
    success: true,
    data: {
      runId: 'run_1',
      task: VISION_TASKS.qualityReview,
      grounded: false,
      observations: {
        task: VISION_TASKS.qualityReview,
        defects: [],
        strengths: [],
        uncertainties: ['第 5 帧动态模糊，看不清手'],
      },
      conclusions: [
        {
          statement: '[anatomy/major] 右手多了一根手指',
          basis: RESEARCH_CONCLUSION_BASES.observation,
          evidenceRefs: [1],
        },
      ],
      model: 'gemini-2.5-flash',
      borrowedRoute: false,
      mode: VIDEO_ANALYSIS_MODES.frames,
      downgraded: false,
      ...overrides,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('VideoAnalysisPanel', () => {
  it('空态：只有说明 + 分析按钮，没有回执', () => {
    render(<VideoAnalysisPanel videoUrl={VIDEO_URL} />)

    expect(screen.getByText('VideoAnalysis:title')).toBeInTheDocument()
    expect(screen.getByText('VideoAnalysis:description')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'VideoAnalysis:run' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('VideoAnalysis:receiptFrames'),
    ).not.toBeInTheDocument()
  })

  it('进行中分两段（抽帧 / 分析），成功后出结论 + 回执', async () => {
    let releaseCapture: (value: VideoFrameCaptureResult) => void = () => {}
    let releaseAnalyze: (value: AnalyzeVideoResponse) => void = () => {}
    mockCapture.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseCapture = resolve
        }),
    )
    mockAnalyze.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseAnalyze = resolve
        }),
    )

    render(<VideoAnalysisPanel videoUrl={VIDEO_URL} />)
    fireEvent.click(screen.getByRole('button', { name: 'VideoAnalysis:run' }))

    // ⚠ 抽帧要几秒，必须有自己的进行中态 —— 一句笼统的「处理中」会让人以为卡死。
    expect(
      await screen.findByText('VideoAnalysis:extracting'),
    ).toBeInTheDocument()

    await act(async () => {
      releaseCapture(CAPTURED)
    })
    expect(
      await screen.findByText('VideoAnalysis:analyzing'),
    ).toBeInTheDocument()

    await act(async () => {
      releaseAnalyze(analysisResult())
    })

    expect(
      await screen.findByText('[anatomy/major] 右手多了一根手指'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('VideoAnalysis:basis.observation'),
    ).toBeInTheDocument()
    expect(screen.getByText('第 5 帧动态模糊，看不清手')).toBeInTheDocument()
    // 回执如实说这一轮看了什么。
    expect(screen.getByText('VideoAnalysis:receiptFrames')).toBeInTheDocument()
    expect(screen.getByText('VideoAnalysis:receiptModel')).toBeInTheDocument()
    expect(
      screen.queryByText('VideoAnalysis:receiptNative'),
    ).not.toBeInTheDocument()
  })

  it('接线：videoUrl / task / surface 真的传到了请求里', async () => {
    mockCapture.mockResolvedValue(CAPTURED)
    mockAnalyze.mockResolvedValue(analysisResult())

    render(<VideoAnalysisPanel videoUrl={VIDEO_URL} projectId="proj_1" />)
    fireEvent.click(screen.getByRole('button', { name: 'VideoAnalysis:run' }))

    await waitFor(() => {
      expect(mockAnalyze).toHaveBeenCalledTimes(1)
    })
    expect(mockAnalyze).toHaveBeenCalledWith(
      expect.objectContaining({
        videoUrl: VIDEO_URL,
        task: VISION_TASKS.qualityReview,
        surface: ASSISTANT_SURFACE_IDS.videoStudio,
        projectId: 'proj_1',
        durationSeconds: 16,
      }),
    )
    expect(mockCapture).toHaveBeenCalledWith(VIDEO_URL)
  })

  it('⛔ 抽帧失败不静默：这一轮走了 native 也要说「没抽到帧」，且给 tainted-canvas 专属文案', async () => {
    mockCapture.mockResolvedValue({
      ok: false,
      reason: VIDEO_FRAME_CAPTURE_REASONS.taintedCanvas,
      message: 'SecurityError',
    })
    mockAnalyze.mockResolvedValue(
      analysisResult({ mode: VIDEO_ANALYSIS_MODES.native }),
    )

    render(<VideoAnalysisPanel videoUrl={VIDEO_URL} />)
    fireEvent.click(screen.getByRole('button', { name: 'VideoAnalysis:run' }))

    expect(
      await screen.findByText('VideoAnalysis:captureFailedTitle'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('VideoAnalysis:captureReason.taintedCanvas'),
    ).toBeInTheDocument()
    // 走的是 native —— 回执不能说「读了 8 帧」。
    expect(screen.getByText('VideoAnalysis:receiptNative')).toBeInTheDocument()
    expect(
      screen.queryByText('VideoAnalysis:receiptFrames'),
    ).not.toBeInTheDocument()
  })

  it('失败态：errorCode 带来的 i18nKey 优先于原始英文串', async () => {
    mockCapture.mockResolvedValue(CAPTURED)
    mockAnalyze.mockResolvedValue({
      success: false,
      error: 'no video-capable route',
      errorCode: 'ASSISTANT_VIDEO_UNSUPPORTED',
      i18nKey: 'errors.assistant.videoUnsupported',
    })

    render(<VideoAnalysisPanel videoUrl={VIDEO_URL} />)
    fireEvent.click(screen.getByRole('button', { name: 'VideoAnalysis:run' }))

    expect(
      await screen.findByText('Errors:assistant.videoUnsupported'),
    ).toBeInTheDocument()
    // 失败之后按钮变「重新分析」，⛔ 不禁用（Hard Rule 8：缺 key 也不锁 UI）。
    const retry = screen.getByRole('button', { name: 'VideoAnalysis:rerun' })
    expect(retry).toBeEnabled()
  })
})
