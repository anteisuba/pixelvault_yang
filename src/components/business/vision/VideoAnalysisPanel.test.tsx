import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { VIDEO_ANALYSIS_MODES } from '@/constants/video-analysis'
import { VISION_TASKS } from '@/constants/vision'
import { RESEARCH_CONCLUSION_BASES } from '@/constants/research'
import {
  analyzeVideoAPI,
  type VideoAnalysisResult,
} from '@/lib/api-client/vision'
import { ASSISTANT_SURFACE_IDS } from '@/types/assistant-conversation'
import { renderWithApp } from '@/test/app-harness'
import { installFakeVideo } from '@/test/fake-video'
import { text } from '@/test/i18n-text'

import { VideoAnalysisPanel } from './VideoAnalysisPanel'

/**
 * 「分析这个视频」面板的四态（空 / 进行中 / 成功 / 失败）+ 两条不许含糊的规矩：
 *  - 抽帧失败**即使这一轮最后成功了也要说出来**（走的是 native，不是帧集）；
 *  - `tainted-canvas` 有自己的文案（修法是配 CORS，不是换视频）。
 *
 * ⚠ 这里不 mock hook，也不 mock 抽帧：真抽帧代码跑在假的浏览器媒体上（jsdom 不解码视频），
 * 只假网络那一跳 —— 面板与 `useVideoFrameAnalysis` 的接线（surface / task / videoUrl
 * 有没有真传下去）正是这批要防的漏接。
 */
vi.mock('@/lib/api-client/vision', () => ({
  analyzeVideoAPI: vi.fn(),
}))

const mockAnalyze = vi.mocked(analyzeVideoAPI)

const VIDEO_URL = 'https://cdn.anteisuba.com/clips/shot.mp4'

/** `ApiResult<…>` 在 api-client 里没导出 —— 从返回类型上取，别抄一份。 */
type AnalyzeVideoResponse = Awaited<ReturnType<typeof analyzeVideoAPI>>

const T = (key: string, values?: Record<string, string | number>) =>
  text(`VideoAnalysis.${key}`, values)

function renderPanel() {
  return renderWithApp(<VideoAnalysisPanel videoUrl={VIDEO_URL} />)
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
      mode: VIDEO_ANALYSIS_MODES.frames,
      downgraded: false,
      ...overrides,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => vi.restoreAllMocks())

describe('VideoAnalysisPanel', () => {
  it('空态：只有说明 + 分析按钮，没有回执', () => {
    renderPanel()

    expect(screen.getByText(T('title'))).toBeInTheDocument()
    expect(screen.getByText(T('description', { count: 8 }))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: T('run') })).toBeInTheDocument()
    expect(screen.queryByText(/读了抽出来的/)).not.toBeInTheDocument()
  })

  it('进行中分两段（抽帧 / 分析），成功后出结论 + 回执', async () => {
    let releaseCapture: (value?: unknown) => void = () => {}
    let releaseAnalyze: (value: AnalyzeVideoResponse) => void = () => {}
    installFakeVideo({
      metadataGate: new Promise((resolve) => {
        releaseCapture = resolve
      }),
    })
    mockAnalyze.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseAnalyze = resolve
        }),
    )

    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: T('run') }))

    // ⚠ 抽帧要几秒，必须有自己的进行中态 —— 一句笼统的「处理中」会让人以为卡死。
    expect(
      await screen.findByText(T('extracting', { count: 8 })),
    ).toBeInTheDocument()

    await act(async () => {
      releaseCapture()
    })
    expect(await screen.findByText(T('analyzing'))).toBeInTheDocument()

    await act(async () => {
      releaseAnalyze(analysisResult())
    })

    expect(
      await screen.findByText('[anatomy/major] 右手多了一根手指'),
    ).toBeInTheDocument()
    expect(screen.getByText(T('basis.observation'))).toBeInTheDocument()
    expect(screen.getByText('第 5 帧动态模糊，看不清手')).toBeInTheDocument()
    // 回执如实说这一轮看了什么。
    expect(
      screen.getByText(T('receiptFrames', { count: 8, version: 1 })),
    ).toBeInTheDocument()
    expect(
      screen.getByText(T('receiptModel', { model: 'gemini-2.5-flash' })),
    ).toBeInTheDocument()
    expect(screen.queryByText(T('receiptNative'))).not.toBeInTheDocument()
  })

  it('接线：videoUrl / task / surface 真的传到了请求里', async () => {
    const video = installFakeVideo({ duration: 16, width: 1920, height: 1080 })
    mockAnalyze.mockResolvedValue(analysisResult())

    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: T('run') }))

    await waitFor(() => {
      expect(mockAnalyze).toHaveBeenCalledTimes(1)
    })
    expect(mockAnalyze).toHaveBeenCalledWith(
      expect.objectContaining({
        videoUrl: VIDEO_URL,
        task: VISION_TASKS.qualityReview,
        surface: ASSISTANT_SURFACE_IDS.videoStudio,
        durationSeconds: 16,
      }),
    )
    // 真抽到了计划的 8 帧，长边压过尺寸。
    const request = mockAnalyze.mock.calls[0]![0] as {
      frames?: unknown[]
      width?: number
    }
    expect(request.frames).toHaveLength(8)
    expect(video.loadedSources).toEqual([VIDEO_URL])
  })

  it('⛔ 抽帧失败不静默：这一轮走了 native 也要说「没抽到帧」，且给 tainted-canvas 专属文案', async () => {
    installFakeVideo({ tainted: true })
    mockAnalyze.mockResolvedValue(
      analysisResult({ mode: VIDEO_ANALYSIS_MODES.native }),
    )

    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: T('run') }))

    expect(await screen.findByText(T('captureFailedTitle'))).toBeInTheDocument()
    expect(
      screen.getByText(T('captureReason.taintedCanvas')),
    ).toBeInTheDocument()
    // 走的是 native —— 回执不能说「读了 8 帧」。
    expect(screen.getByText(T('receiptNative'))).toBeInTheDocument()
    expect(screen.queryByText(/读了抽出来的/)).not.toBeInTheDocument()
  })

  it('失败态：errorCode 带来的 i18nKey 优先于原始英文串', async () => {
    installFakeVideo()
    mockAnalyze.mockResolvedValue({
      success: false,
      error: 'no video-capable route',
      errorCode: 'ASSISTANT_VIDEO_UNSUPPORTED',
      i18nKey: 'errors.assistant.videoUnsupported',
    })

    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: T('run') }))

    expect(
      await screen.findByText(text('Errors.assistant.videoUnsupported')),
    ).toBeInTheDocument()
    expect(screen.queryByText('no video-capable route')).not.toBeInTheDocument()
    // 失败之后按钮变「重新分析」，⛔ 不禁用（Hard Rule 8：缺 key 也不锁 UI）。
    const retry = screen.getByRole('button', { name: T('rerun') })
    expect(retry).toBeEnabled()
  })
})
