import { ASSISTANT_MEDIA_UNSUPPORTED_ERRORS } from '@/constants/assistant'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { ApiRequestError } from '@/lib/errors'

/**
 * 旧内核那道「媒体直传只认 Gemini」的闸：视频 / 音频原样进模型（`videoData` / `audioData`），
 * 只有 Gemini 收，别家整轮拒（`ASSISTANT_MEDIA_UNSUPPORTED_ERRORS`）。
 *
 * ⚠ v3 看片不走这条（看图期第二段）：被指着的片子由浏览器抽帧随 `videoClips` 上来，所以 v3
 *   进 `prepareOperatorTurn` 之前先摘掉视频附件 —— 否则看帧完全够用的 Claude / GPT / Grok /
 *   DeepSeek 在这里就被拒了。纯函数单拎出来，v3 的单测因此能拿**真闸**核对这件事。
 */
export function assertAssistantMediaRoute(
  mediaAttachments: readonly { kind: 'video' | 'audio' }[],
  adapterType: AI_ADAPTER_TYPES,
): void {
  if (!mediaAttachments.length || adapterType === AI_ADAPTER_TYPES.GEMINI)
    return
  const spec = ASSISTANT_MEDIA_UNSUPPORTED_ERRORS[mediaAttachments[0]!.kind]
  throw new ApiRequestError(
    spec.code,
    spec.httpStatus,
    spec.i18nKey,
    spec.message,
  )
}
