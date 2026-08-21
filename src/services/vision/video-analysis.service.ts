import 'server-only'

import { assistantAdapterVideoTier } from '@/constants/assistant'
import {
  VIDEO_ANALYSIS_MODES,
  type VideoAnalysisMode,
} from '@/constants/video-analysis'
import type { VisionTask } from '@/constants/vision'
import { logger } from '@/lib/logger'
import {
  persistVideoFrameSet,
  type SubmittedVideoFrame,
} from '@/services/video-frames/video-frame-set.service'
import {
  analyzeVisual,
  type VisionObservationsFor,
} from '@/services/vision/vision-analyzer.service'
import { resolveVideoAnalysisRoute } from '@/services/vision/video-analysis-route.service'
import { resolveVisionRoute } from '@/services/vision/vision-route.service'
import type { AssistantSurfaceId } from '@/types/assistant-conversation'
import type { VisionAnalysisResult } from '@/types/vision'

/**
 * 视频的结构化分析入口（AI 导演内核 · 切片 2 · §4.3）。
 *
 * **一个入口，两条腿**，由 `resolveVideoAnalysisRoute` 一处判：
 *  - `frames` —— 客户端按确定性计划抽好的帧 → 转存 R2 → 当图片分析。
 *    便宜、**可复跑**（同一组帧 URL 再打一次 `/api/vision/analyze` 就行），
 *    任何能看图的路都跑得动。
 *  - `native` —— 没帧集时（YouTube 这类浏览器解不了的链接）把视频本体交给
 *    能看视频的路，并按任务+片长自动降级成本（§4.3.1）。
 *  - 两条都不行 → `ASSISTANT_VIDEO_UNSUPPORTED`（Hard Rule 8 → QuickSetupDialog）。
 *
 * ⛔ **不静默降级**：一份没看过视频、也没看过帧的「观察」比报错坏得多。
 */

export interface AnalyzeVideoParams<TTask extends VisionTask> {
  /** DB user id（不是 clerkId）。 */
  userId: string
  surface: AssistantSurfaceId
  conversationId?: string | null
  projectId?: string | null
  task: TTask
  /** 视频本体的 URL（R2 直链 / 视频文件直链 / YouTube 页面 URL）。 */
  videoUrl: string
  /** 客户端读到的片长。frames 档必给（计划要复算），native 档用于成本 window。 */
  durationSeconds?: number
  /** 客户端按 `planVideoFrames` 抽好的帧。空 = 没有帧集，走 native。 */
  frames?: SubmittedVideoFrame[]
  /** 用户当前选中的 `apiKeyId`。看不了就借一条能看的。 */
  routeHint?: string
  instruction?: string
}

export type AnalyzeVideoResult<TTask extends VisionTask> = Omit<
  VisionAnalysisResult,
  'task' | 'observations'
> & {
  task: TTask
  observations: VisionObservationsFor<TTask>
  /** 这一轮实际走的哪条腿 —— UI 要能如实说「只看了 8 帧」还是「看了视频」。 */
  mode: VideoAnalysisMode
  /** native 档超阈值自动降级了（裁片段 / 降帧率）。 */
  downgraded: boolean
}

export async function analyzeVideo<TTask extends VisionTask>(
  params: AnalyzeVideoParams<TTask>,
): Promise<AnalyzeVideoResult<TTask>> {
  // ⚠ 先解析路由再判档：能不能满足这个任务，取决于**这一轮真正会用的那条路**
  //   （用户选的那把 key 看不了图时 `resolveVisionRoute` 会借一条），
  //   拿用户「选的」那条去判会得出一个和实际执行不符的结论。
  const { route, borrowed } = await resolveVisionRoute(
    params.userId,
    params.routeHint,
  )

  const frames = params.frames ?? []
  const decision = resolveVideoAnalysisRoute({
    task: params.task,
    adapterType: route.adapterType,
    hasFrames: frames.length > 0,
    durationSeconds: params.durationSeconds,
  })

  logger.info('Video analysis routed', {
    task: params.task,
    mode: decision.mode,
    requiredTier: decision.requiredTier,
    routeTier: String(assistantAdapterVideoTier(route.adapterType)),
    borrowed,
    downgraded: decision.downgraded,
  })

  if (decision.mode === VIDEO_ANALYSIS_MODES.frames) {
    const frameSet = await persistVideoFrameSet({
      userId: params.userId,
      sourceVideoUrl: params.videoUrl,
      // frames 档必须有片长 —— 计划就是从它算出来的。到不了这里说明
      // `resolveVideoAnalysisRoute` 判了 frames 却没有计划可复算，那是 bug 不是输入问题。
      durationSeconds: params.durationSeconds ?? 0,
      frames,
    })
    const analysis = await analyzeVisual({
      userId: params.userId,
      surface: params.surface,
      conversationId: params.conversationId,
      projectId: params.projectId,
      task: params.task,
      mediaUrls: frameSet.frames.map((frame) => frame.url),
      routeHint: params.routeHint,
      instruction: params.instruction,
      frameSet,
    })
    return { ...analysis, mode: decision.mode, downgraded: false }
  }

  const analysis = await analyzeVisual({
    userId: params.userId,
    surface: params.surface,
    conversationId: params.conversationId,
    projectId: params.projectId,
    task: params.task,
    mediaUrls: [],
    routeHint: params.routeHint,
    instruction: params.instruction,
    video: {
      url: params.videoUrl,
      ...(decision.window ? { window: decision.window } : {}),
    },
  })
  return { ...analysis, mode: decision.mode, downgraded: decision.downgraded }
}
