'use client'

import { useCallback, useState } from 'react'

import type { VideoFrameCaptureReason } from '@/constants/video-analysis'
import type { VisionTask } from '@/constants/vision'
import {
  analyzeVideoAPI,
  type VideoAnalysisResult,
} from '@/lib/api-client/vision'
import { captureVideoFrames } from '@/lib/video-frame-capture'
import type { AssistantSurfaceId } from '@/types/assistant-conversation'

/**
 * 「分析这个视频」的客户端一跳（AI 导演内核 · 切片 2 · §4.3）。
 *
 * 抽帧在浏览器、落库与分析在服务端，中间那一步是这个 hook：
 * `captureVideoFrames`（确定性计划）→ `POST /api/vision/analyze-video`
 * （核对计划 → 转存 R2 → 落 `ResearchRun` → 出结构化观察）。
 *
 * ⚠ **抽不到帧不等于分析不了**：抽帧失败（跨域被挡 / 容器读不出时长 / YouTube 这类
 * 浏览器根本解不了的链接）时**照样把请求发出去**，只是不带 `frames` ——
 * 服务端会走 native 档（能看视频的路直接看），或者如实抛
 * `ASSISTANT_VIDEO_UNSUPPORTED` 让 UI 引用户配一把 Gemini key（Hard Rule 8）。
 * ⛔ 不在这里替服务端做「那就算了吧」的决定。
 */

export type VideoFrameAnalysisPhase =
  | 'idle'
  | 'extracting'
  | 'analyzing'
  | 'done'
  | 'error'

export interface VideoFrameAnalysisError {
  message: string
  /** `ASSISTANT_VIDEO_UNSUPPORTED` → QuickSetupDialog。 */
  errorCode?: string
  i18nKey?: string
}

export interface RunVideoAnalysisParams {
  task: VisionTask
  /** R2 直链 / 视频文件直链 / YouTube 页面 URL，或者用户刚选的本地文件。 */
  video: string | File
  /** 送去分析的那条 URL。`video` 是 `File` 时必给（本地文件先上传拿到 URL）。 */
  videoUrl?: string
  surface: AssistantSurfaceId
  conversationId?: string
  projectId?: string
  instruction?: string
  apiKeyId?: string
}

export function useVideoFrameAnalysis() {
  const [phase, setPhase] = useState<VideoFrameAnalysisPhase>('idle')
  const [result, setResult] = useState<VideoAnalysisResult | null>(null)
  const [error, setError] = useState<VideoFrameAnalysisError | null>(null)
  /**
   * 抽帧没成时的机器可读原因（`tainted-canvas` 等），给日志和提示用。
   *
   * ⚠ **窄成枚举而不是 `string`**：UI 要按它穷举文案（六条原因六种修法），
   * `string` 会让「加了一条原因但没写文案」在编译期毫无反应。
   */
  const [captureFailure, setCaptureFailure] =
    useState<VideoFrameCaptureReason | null>(null)

  const run = useCallback(
    async (
      params: RunVideoAnalysisParams,
    ): Promise<VideoAnalysisResult | null> => {
      const videoUrl =
        params.videoUrl ??
        (typeof params.video === 'string' ? params.video : undefined)
      if (!videoUrl) {
        const failure: VideoFrameAnalysisError = {
          message: 'A stored video URL is required before analysis.',
        }
        setPhase('error')
        setError(failure)
        return null
      }

      setPhase('extracting')
      setError(null)
      setResult(null)
      setCaptureFailure(null)

      const captured = await captureVideoFrames(params.video)
      setCaptureFailure(captured.ok ? null : captured.reason)

      setPhase('analyzing')
      const response = await analyzeVideoAPI({
        task: params.task,
        videoUrl,
        surface: params.surface,
        ...(captured.ok
          ? {
              durationSeconds: captured.durationSeconds,
              frames: captured.frames,
            }
          : {}),
        ...(params.conversationId
          ? { conversationId: params.conversationId }
          : {}),
        ...(params.projectId ? { projectId: params.projectId } : {}),
        ...(params.instruction ? { instruction: params.instruction } : {}),
        ...(params.apiKeyId ? { apiKeyId: params.apiKeyId } : {}),
      })

      if (!response.success) {
        setPhase('error')
        setError({
          message: response.error,
          ...(response.errorCode ? { errorCode: response.errorCode } : {}),
          ...(response.i18nKey ? { i18nKey: response.i18nKey } : {}),
        })
        return null
      }

      setPhase('done')
      setResult(response.data)
      return response.data
    },
    [],
  )

  return { phase, result, error, captureFailure, run }
}
