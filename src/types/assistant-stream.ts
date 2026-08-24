import { z } from 'zod'

import { LoraCandidateSearchResultSchema } from '@/types/lora-candidate'
import { ResearchReceiptSchema } from '@/types/research'

/**
 * 助手流各帧的载荷契约。
 *
 * ⚠ **客户端一律 `safeParse`，解不出来就丢这一帧**——一帧坏载荷不该让整条对话
 * 失败。这与旧的响应头方案是同一条纪律（「回执坏了不该让一次对话失败」），
 * 只是现在它落在 schema 上而不是一个 try/catch 里。
 */

/** ⚠ `delta` 是**增量**，不是累积全文。客户端自己攒。 */
export const AssistantStreamTextFrameSchema = z.object({
  delta: z.string(),
})
export type AssistantStreamTextFrame = z.infer<
  typeof AssistantStreamTextFrameSchema
>

/**
 * 与 API 错误信封同形（`error` / `errorCode` / `i18nKey`），这样客户端能把它直接
 * 喂给 `getApiErrorMessage`，不用为「流中途的错」单开一条文案路径。
 */
export const AssistantStreamErrorFrameSchema = z.object({
  error: z.string(),
  errorCode: z.string().optional(),
  i18nKey: z.string().optional(),
})
export type AssistantStreamErrorFrame = z.infer<
  typeof AssistantStreamErrorFrameSchema
>

/** 回执与候选整个原样进流——没有响应头上限，因此没有降级档位。 */
export const AssistantStreamResearchFrameSchema = ResearchReceiptSchema
export const AssistantStreamLoraFrameSchema = LoraCandidateSearchResultSchema
