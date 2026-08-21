import { describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  VIDEO_ANALYSIS_DOWNGRADE,
  VIDEO_ANALYSIS_MODES,
  VIDEO_ANALYSIS_TASKS,
} from '@/constants/video-analysis'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { resolveNativeVideoWindow, resolveVideoAnalysisRoute } =
  await import('@/services/vision/video-analysis-route.service')

/**
 * 按任务路由三档（§4.3 第三条）+ 先降级再问（§4.3.1）。
 */
describe('resolveVideoAnalysisRoute —— 三档', () => {
  it('① 要 native 的任务 + native 路由 → native', () => {
    const decision = resolveVideoAnalysisRoute({
      task: VIDEO_ANALYSIS_TASKS.conversational,
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      hasFrames: false,
      durationSeconds: 30,
    })
    expect(decision.mode).toBe(VIDEO_ANALYSIS_MODES.native)
    expect(decision.requiredTier).toBe('native')
    expect(decision.downgraded).toBe(false)
  })

  it('② frames 够用的任务 + 有帧集 → frames（便宜且可复跑，图片档也跑得动）', () => {
    const decision = resolveVideoAnalysisRoute({
      task: VIDEO_ANALYSIS_TASKS.compare,
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      hasFrames: true,
      durationSeconds: 600,
    })
    expect(decision.mode).toBe(VIDEO_ANALYSIS_MODES.frames)
    // 帧集不按时长收费 —— 十分钟的片子也是 8 帧，没有降级这回事。
    expect(decision.downgraded).toBe(false)
    expect(decision.window).toBeUndefined()
  })

  it('②b frames 够用但没帧集 + native 路由 → 回落 native（YouTube 这类浏览器解不了的）', () => {
    const decision = resolveVideoAnalysisRoute({
      task: VIDEO_ANALYSIS_TASKS.characterIdentity,
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      hasFrames: false,
      durationSeconds: 60,
    })
    expect(decision.mode).toBe(VIDEO_ANALYSIS_MODES.native)
  })

  it('③ 运镜/节奏/动作类（conversational）落在 frames 档路由上 → ASSISTANT_VIDEO_UNSUPPORTED', () => {
    expect(() =>
      resolveVideoAnalysisRoute({
        task: VIDEO_ANALYSIS_TASKS.conversational,
        adapterType: AI_ADAPTER_TYPES.OPENAI,
        hasFrames: true,
        durationSeconds: 30,
      }),
    ).toThrowError(
      expect.objectContaining({
        errorCode: 'ASSISTANT_VIDEO_UNSUPPORTED',
        // Hard Rule 8：前端据 errorCode + i18nKey 引到 QuickSetupDialog，
        // 三语文案就是「请选择 Gemini，或移除视频参考」。
        i18nKey: 'errors.assistant.videoUnsupported',
        httpStatus: 400,
      }),
    )
  })

  it('③b 一档都没有的路由 + 没帧集 → 同样结构化报错，⛔ 不静默降级成瞎猜', () => {
    expect(() =>
      resolveVideoAnalysisRoute({
        task: VIDEO_ANALYSIS_TASKS.qualityReview,
        adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
        hasFrames: false,
      }),
    ).toThrowError(
      expect.objectContaining({ errorCode: 'ASSISTANT_VIDEO_UNSUPPORTED' }),
    )
  })
})

describe('resolveNativeVideoWindow —— 先降级再问（⛔ 不弹确认卡）', () => {
  const { fullFrameMaxSeconds, clipSeconds, reducedFps } =
    VIDEO_ANALYSIS_DOWNGRADE

  it('阈值以内不动旋钮', () => {
    expect(
      resolveNativeVideoWindow(
        VIDEO_ANALYSIS_TASKS.conversational,
        fullFrameMaxSeconds,
      ),
    ).toBeUndefined()
  })

  it('超阈值的静态观察类 → 裁前 60 秒（🔬 实测 5% 成本）', () => {
    expect(
      resolveNativeVideoWindow(VIDEO_ANALYSIS_TASKS.characterIdentity, 1200),
    ).toEqual({ startOffset: 0, endOffset: clipSeconds })
    expect(
      resolveNativeVideoWindow(VIDEO_ANALYSIS_TASKS.styleStudy, 1200),
    ).toEqual({ startOffset: 0, endOffset: clipSeconds })
  })

  it('超阈值但在乎整段时间轴的 → 降帧率而不是裁（🔬 42%）', () => {
    expect(
      resolveNativeVideoWindow(VIDEO_ANALYSIS_TASKS.conversational, 1200),
    ).toEqual({ fps: reducedFps })
    // 一致性审片要看的正是「有没有越到后面越漂」，裁掉后半段等于把题目删了。
    expect(
      resolveNativeVideoWindow(VIDEO_ANALYSIS_TASKS.compare, 1200),
    ).toEqual({ fps: reducedFps })
  })

  it('片长取不到就不降级 —— 不拿一个我们不知道的数去删用户的内容', () => {
    expect(
      resolveNativeVideoWindow(VIDEO_ANALYSIS_TASKS.conversational, undefined),
    ).toBeUndefined()
    expect(
      resolveNativeVideoWindow(VIDEO_ANALYSIS_TASKS.conversational, Number.NaN),
    ).toBeUndefined()
  })

  it('超阈值时决策里带 downgraded=true，调用方能如实告诉用户', () => {
    const decision = resolveVideoAnalysisRoute({
      task: VIDEO_ANALYSIS_TASKS.conversational,
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      hasFrames: false,
      durationSeconds: 3600,
    })
    expect(decision.downgraded).toBe(true)
    expect(decision.window).toEqual({ fps: reducedFps })
  })
})
