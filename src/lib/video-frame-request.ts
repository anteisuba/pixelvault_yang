import { z } from 'zod'

import {
  VIDEO_FRAME_LIMITS,
  VIDEO_FRAME_PLAN,
} from '@/constants/video-analysis'
import { VISION_LIMITS, VISION_TASK_VALUES } from '@/constants/vision'
import { AssistantSurfaceSchema } from '@/types/assistant-conversation'

/**
 * `POST /api/vision/analyze-video` 的入参契约（AI 导演内核 · 切片 2 · §4.3）。
 *
 * ⚠ **为什么不在 `src/types/vision.ts`**：那个文件本轮有别的批次在改，两边同时动
 * 必撞 —— 与 `VISION_ANALYZE_ENDPOINT` 当初没进 `API_ENDPOINTS` 是同一个理由。
 * 合批时整体挪进 `types/vision.ts` 即可，消费方只认这几个导出名。
 */

const videoUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(VISION_LIMITS.maxUrlLength)
  .refine((url) => url.startsWith('http://') || url.startsWith('https://'), {
    message: 'Video must be an http(s) URL',
  })

/**
 * 一帧。`index` 是**计划里的序号**，不是数组下标 —— 服务端按它对时间戳，
 * 顺序在传输里错乱了也对得上账。
 */
export const VideoFrameSubmissionSchema = z.object({
  index: z
    .number()
    .int()
    .min(0)
    .max(VIDEO_FRAME_PLAN.frameCount - 1),
  timestampSeconds: z.number().min(0),
  /**
   * `data:image/webp;base64,…`。
   * 上限按**字节上限的 2 倍字符**给（base64 膨胀 ~4/3，留出余量）——
   * 真正说了算的是服务端解码后的字节数与魔数校验，这里只挡住离谱载荷。
   */
  dataUrl: z
    .string()
    .min(1)
    .max(VIDEO_FRAME_LIMITS.maxFrameBytes * 2),
})

export type VideoFrameSubmission = z.infer<typeof VideoFrameSubmissionSchema>

export const VideoAnalyzeRequestSchema = z
  .object({
    /** 四个结构化任务。运镜/节奏/动作那类没有 schema，走聊天里的 native 路。 */
    task: z.enum(VISION_TASK_VALUES),
    videoUrl: videoUrlSchema,
    /** 客户端从 `<video>.duration` 读到的片长。 */
    durationSeconds: z.number().positive().optional(),
    /** 按 `planVideoFrames` 抽好的帧。省略 = 让服务端走 native 档。 */
    frames: z
      .array(VideoFrameSubmissionSchema)
      .max(VIDEO_FRAME_PLAN.frameCount)
      .optional(),
    surface: AssistantSurfaceSchema,
    conversationId: z.string().trim().max(120).optional(),
    projectId: z.string().trim().max(120).optional(),
    instruction: z
      .string()
      .trim()
      .max(VISION_LIMITS.instructionChars)
      .optional(),
    apiKeyId: z.string().trim().max(120).optional(),
  })
  .superRefine((input, ctx) => {
    if (!input.frames || input.frames.length === 0) return
    // 帧集必须**整组**送来：缺一帧的帧集复跑不出同一组结论，而它看起来完全正常。
    if (input.frames.length !== VIDEO_FRAME_PLAN.frameCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['frames'],
        message: `A frame set must carry exactly ${VIDEO_FRAME_PLAN.frameCount} frames`,
      })
    }
    if (input.durationSeconds === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['durationSeconds'],
        message:
          'durationSeconds is required with a frame set — the server re-derives the extraction plan from it',
      })
    }
  })

export type VideoAnalyzeRequest = z.infer<typeof VideoAnalyzeRequestSchema>
