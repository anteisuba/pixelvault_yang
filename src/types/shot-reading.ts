import { z } from 'zod'

import { SHOT_READ, SHOT_READ_FIELDS } from '@/constants/shot-reading'
import { SHOT_SIZES, SHOT_SPEC_LIMITS } from '@/constants/shot-spec'
import { VISION_LIMITS } from '@/constants/vision'
import { LOCALES } from '@/i18n/routing'

/**
 * `POST /api/vision/read-shots` 的入参与回执（拉片 · 读镜，p-canvas-nodes H4b）。
 *
 * 一次请求 = 一批（≤ `SHOT_READ.batchShots` 镜）。分批、排队、失败重试都在客户端；
 * 服务端只管「这几镜那一小段 → 一镜一行」。
 */

/** 一镜：表里的镜号 + 它在参考片上的时间段（秒）。 */
export const ShotReadShotSchema = z
  .object({
    /** 表里的镜号（从 1 数）—— 模型按它回话，客户端按它对回镜头卡。 */
    number: z.number().int().min(1).max(999),
    startSec: z.number().min(0).max(SHOT_SPEC_LIMITS.refMaxSeconds),
    endSec: z.number().min(0).max(SHOT_SPEC_LIMITS.refMaxSeconds),
  })
  .refine((shot) => shot.endSec > shot.startSec, {
    message: 'endSec must be after startSec',
    path: ['endSec'],
  })

export type ShotReadShot = z.infer<typeof ShotReadShotSchema>

export const ShotReadRequestSchema = z
  .object({
    /** 参考片本体（自家 R2 的视频直链）。 */
    videoUrl: z
      .string()
      .trim()
      .min(1)
      .max(VISION_LIMITS.maxUrlLength)
      .refine((url) => /^https?:\/\//.test(url), {
        message: 'Video must be an http(s) URL',
      }),
    /** 用户的哪把 Gemini key。⛔ 不给就不读 —— 读镜不走助手那一家。 */
    apiKeyId: z.string().trim().min(1).max(120),
    /** 运镜 / 说明 / 风格用哪种语言写（= 界面语言）。 */
    locale: z.enum(LOCALES),
    fields: z
      .array(z.enum(SHOT_READ_FIELDS))
      .min(1)
      .max(SHOT_READ_FIELDS.length),
    shots: z.array(ShotReadShotSchema).min(1).max(SHOT_READ.batchShots),
  })
  .superRefine((input, ctx) => {
    const numbers = new Set(input.shots.map((shot) => shot.number))
    if (numbers.size !== input.shots.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['shots'],
        message: 'Shot numbers must be unique within a batch',
      })
    }
  })

export type ShotReadRequest = z.infer<typeof ShotReadRequestSchema>

/** 读回来的一镜。哪格没勾、或模型拿不准，那一格就缺席 —— 空格比猜错好改。 */
export const ShotReadRowSchema = z.object({
  number: z.number().int().min(1),
  size: z.enum(SHOT_SIZES).optional(),
  move: z.string().min(1).max(SHOT_SPEC_LIMITS.moveMaxLength).optional(),
  description: z.string().min(1).max(SHOT_READ.descriptionMaxLength).optional(),
  look: z.string().min(1).max(SHOT_SPEC_LIMITS.lookMaxLength).optional(),
})

export type ShotReadRow = z.infer<typeof ShotReadRowSchema>

export const ShotReadResultSchema = z.object({
  rows: z.array(ShotReadRowSchema),
})

export type ShotReadResult = z.infer<typeof ShotReadResultSchema>
