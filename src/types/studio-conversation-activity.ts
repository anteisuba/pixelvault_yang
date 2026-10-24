import { z } from 'zod'

import { STUDIO_SHELL_RECENT_LIMIT } from '@/constants/studio-shell'

/** 左边列表那几段对话的封面 / 进度 / 最近出完的时间（第 9f 步 9f-3）。 */
export const StudioConversationActivityQuerySchema = z.object({
  /** 逗号分隔的对话编号（列表上那几段）。 */
  ids: z
    .string()
    .trim()
    .min(1)
    .transform((raw) => [...new Set(raw.split(',').filter(Boolean))])
    .pipe(
      z.array(z.string().min(1).max(64)).min(1).max(STUDIO_SHELL_RECENT_LIMIT),
    ),
})

export const StudioConversationActivitySchema = z.object({
  id: z.string(),
  /** 最新出的那一张（缩略图优先）；还没出过 = null。 */
  cover: z.string().nullable(),
  /** 有任务在跑：这一批出好了几个 / 一共几个；都跑完了 = null。 */
  progress: z
    .object({ done: z.number().int(), total: z.number().int() })
    .nullable(),
  /** 最近一次出完的时间（ISO）；小点拿它和本机记的「最后看它的时间」比。 */
  latestDoneAt: z.string().nullable(),
})

export type StudioConversationActivity = z.infer<
  typeof StudioConversationActivitySchema
>
