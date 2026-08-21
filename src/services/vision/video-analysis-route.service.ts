import 'server-only'

import {
  ASSISTANT_MEDIA_UNSUPPORTED_ERRORS,
  ASSISTANT_VIDEO_TIERS,
  assistantAdapterSatisfiesVideoTier,
  assistantAdapterVideoTier,
  type AssistantVideoTier,
} from '@/constants/assistant'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  VIDEO_ANALYSIS_DOWNGRADE,
  VIDEO_ANALYSIS_DOWNGRADE_MODES,
  VIDEO_ANALYSIS_TASK_DOWNGRADES,
  VIDEO_ANALYSIS_TASK_TIERS,
  type VideoAnalysisTask,
} from '@/constants/video-analysis'
import { ApiRequestError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import type { VideoAnalysisWindow } from '@/services/llm-text.service'

/**
 * 视频分析走哪一档（AI 导演内核 · 切片 2 · §4.3 第三条 + §4.3.1）。
 *
 * 一处判定，三个结果，⛔ 没有第四条「静默降级」的路：
 *
 * | 情况                                        | 结果                                     |
 * | ------------------------------------------- | ---------------------------------------- |
 * | 任务要 native（自由提问/运镜/节奏/动作）+ 路由是 native | `native`，带按任务算出的成本 window |
 * | 任务要 frames + 有帧集                      | `frames`（便宜、可复跑）                 |
 * | 任务要 frames + 没帧集 + 路由是 native      | `native`（视频本体直接看）               |
 * | 其余                                        | 抛 `ASSISTANT_VIDEO_UNSUPPORTED`         |
 *
 * 最后一行是 Hard Rule 8 的入口：**不禁用 UI，明说「请选择 Gemini」**，
 * 前端据 `errorCode` 路由到 `QuickSetupDialog`（三语文案早已在位）。
 */

export const VIDEO_ANALYSIS_MODES = {
  native: 'native',
  frames: 'frames',
} as const

export type VideoAnalysisMode =
  (typeof VIDEO_ANALYSIS_MODES)[keyof typeof VIDEO_ANALYSIS_MODES]

export interface VideoAnalysisDecision {
  mode: VideoAnalysisMode
  /** 这个任务**要求**的最低档 —— 日志/回执要能说清是谁的要求。 */
  requiredTier: AssistantVideoTier
  /** `native` 档的成本 window（§4.3.1）。`undefined` = 全片默认帧率。 */
  window?: VideoAnalysisWindow
  /** 超阈值自动降级了 —— 调用方据此如实告诉用户「只看了前 60 秒」。 */
  downgraded: boolean
}

export function videoUnsupportedError(reason: string): ApiRequestError {
  const spec = ASSISTANT_MEDIA_UNSUPPORTED_ERRORS.video
  return new ApiRequestError(
    spec.code,
    spec.httpStatus,
    spec.i18nKey,
    `${spec.message} (${reason})`,
  )
}

/**
 * 超阈值时先降级（§4.3.1）。
 *
 * ⛔ **不弹确认卡**。🔬 实测摆着 5%（裁 1 分钟）和 42%（fps 0.2）两个旋钮，
 * 一超时长就打断用户是不必要的摩擦。确认卡留给唯一一种情况：用户**明确要求**
 * 全片满帧分析运镜 —— 那是 UI 层显式传 `window: undefined` 的事。
 *
 * 降哪一档按任务定（`VIDEO_ANALYSIS_TASK_DOWNGRADES`）：在乎整段时间轴的降帧率，
 * 在乎「长什么样」的裁前 60 秒。
 *
 * @param durationSeconds 片长；取不到（`undefined`）**就不降级** —— 猜一个长度
 *   然后据此裁片，是拿一个我们不知道的数去删用户的内容。
 */
export function resolveNativeVideoWindow(
  task: VideoAnalysisTask,
  durationSeconds?: number,
): VideoAnalysisWindow | undefined {
  if (
    durationSeconds === undefined ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= VIDEO_ANALYSIS_DOWNGRADE.fullFrameMaxSeconds
  ) {
    return undefined
  }

  const mode = VIDEO_ANALYSIS_TASK_DOWNGRADES[task]
  if (mode === VIDEO_ANALYSIS_DOWNGRADE_MODES.clip) {
    return {
      startOffset: 0,
      endOffset: VIDEO_ANALYSIS_DOWNGRADE.clipSeconds,
    }
  }
  return { fps: VIDEO_ANALYSIS_DOWNGRADE.reducedFps }
}

export interface VideoAnalysisRouteInput {
  task: VideoAnalysisTask
  adapterType: AI_ADAPTER_TYPES
  /** 本轮有没有现成的帧集（客户端抽好并落库了）。 */
  hasFrames: boolean
  /** 片长，用于成本 window。取不到就别猜。 */
  durationSeconds?: number
}

export function resolveVideoAnalysisRoute(
  input: VideoAnalysisRouteInput,
): VideoAnalysisDecision {
  const requiredTier = VIDEO_ANALYSIS_TASK_TIERS[input.task]

  if (!assistantAdapterSatisfiesVideoTier(input.adapterType, requiredTier)) {
    throw videoUnsupportedError(
      `task=${input.task} needs tier "${requiredTier}", route ${input.adapterType} offers "${String(
        assistantAdapterVideoTier(input.adapterType),
      )}"`,
    )
  }

  // frames 够用的任务优先走 frames：便宜，而且**同一组帧可以复跑**（§4.5 验收）。
  if (requiredTier === ASSISTANT_VIDEO_TIERS.frames && input.hasFrames) {
    return {
      mode: VIDEO_ANALYSIS_MODES.frames,
      requiredTier,
      downgraded: false,
    }
  }

  // ⚠ 没帧集就只剩「把视频本体交出去」这一条 —— 此刻**实际**要的是 native，
  //   哪怕任务本身只要 frames。少了这一道，一条 frames 档的路（OpenAI）会因为
  //   「任务只要 frames」而通过闸，然后带着一个它根本读不了的视频 URL 走到
  //   provider 那儿抛英文裸错 —— 正是这条线要消灭的那种失败。
  if (
    !assistantAdapterSatisfiesVideoTier(
      input.adapterType,
      ASSISTANT_VIDEO_TIERS.native,
    )
  ) {
    throw videoUnsupportedError(
      `task=${input.task} has no frame set, so it needs tier "native"; route ${input.adapterType} offers "${String(
        assistantAdapterVideoTier(input.adapterType),
      )}"`,
    )
  }

  const window = resolveNativeVideoWindow(input.task, input.durationSeconds)
  if (window) {
    logger.info('Video analysis auto-downgraded', {
      task: input.task,
      durationSeconds: input.durationSeconds,
      window,
    })
  }
  return {
    mode: VIDEO_ANALYSIS_MODES.native,
    requiredTier,
    ...(window ? { window } : {}),
    downgraded: Boolean(window),
  }
}
