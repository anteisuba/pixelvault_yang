import { ASSISTANT_MENTION_KIND_IDS } from '@/constants/assistant-mention'
import { ASSISTANT_OPERATOR_LIMITS } from '@/constants/assistant-operator'
import { ASSISTANT_V3_CLIP_LIMITS } from '@/constants/assistant-v3'
import type { VideoFrameCaptureReason } from '@/constants/video-analysis'
import {
  captureClipFrames,
  type VideoFrameCaptureResult,
} from '@/lib/video-frame-capture'
import type { AssistantMention } from '@/types/assistant-mention'
import {
  AssistantOperatorVideoClipSchema,
  type AssistantOperatorVideoClip,
} from '@/types/assistant-operator'

/**
 * v3 助手这一轮「被指着的片子」（看图期第二段，owner 2026-10-15）：浏览器在请求发出去之前
 * 认出来、按 `planClipFrames` 抽好帧，随 `videoClips` 上去。
 *
 * ⭐ 被指着 = 三种指法，按这个顺序占位：
 *  ① `@` 的视频（画布上的视频卡、结果、素材库都算，带地址的才算）；
 *  ② 📎 附上的视频；
 *  ③ 视频台上挂着的参考视频（`video-N`，与板子上的称呼同一个）。
 * ⚠ 一轮最多 `ASSISTANT_V3_CLIP_LIMITS.maxClips` 段；多出来的⛔ 不静默丢，调用方留一条系统行。
 * ⚠ 抽帧失败也照样上去（只是没有帧）：Gemini 还能看片子本体，别家如实说没看成。
 */

export interface PointedClip {
  readonly sourceUrl: string
  readonly label: string
  readonly nodeId?: string
}

/** 与请求契约同一把尺（直接用那条 schema，⛔ 另写一份会漂）。 */
function sendableUrl(url: string): boolean {
  return AssistantOperatorVideoClipSchema.shape.sourceUrl.safeParse(url).success
}

export function resolvePointedClips(input: {
  readonly mentions: readonly AssistantMention[]
  readonly attachments: readonly {
    kind: string
    url: string
    label: string
  }[]
  /** 视频台快照里挂着的参考视频（缺席 = 不在视频台上）。 */
  readonly referenceVideos?: readonly { url: string }[]
}): { clips: PointedClip[]; overflow: number } {
  const all: PointedClip[] = []
  const add = (clip: PointedClip) => {
    // ⚠ 地址不合请求契约（太长 / 不是 URL）就不算：整条请求会因为它 400。
    if (!sendableUrl(clip.sourceUrl)) return
    if (all.some((other) => other.sourceUrl === clip.sourceUrl)) return
    all.push({
      ...clip,
      label:
        clip.label.trim().slice(0, ASSISTANT_OPERATOR_LIMITS.maxLabelChars) ||
        'clip',
      ...(clip.nodeId &&
      clip.nodeId.length <= ASSISTANT_OPERATOR_LIMITS.maxIdChars
        ? { nodeId: clip.nodeId }
        : {}),
    })
  }
  for (const mention of input.mentions)
    if (mention.kind === ASSISTANT_MENTION_KIND_IDS.video && mention.url)
      add({
        sourceUrl: mention.url,
        label: mention.label,
        ...(mention.nodeId ? { nodeId: mention.nodeId } : {}),
      })
  for (const attachment of input.attachments)
    if (attachment.kind === 'video')
      add({ sourceUrl: attachment.url, label: attachment.label })
  input.referenceVideos?.forEach((video, index) =>
    add({ sourceUrl: video.url, label: `video-${index + 1}` }),
  )
  const cap = ASSISTANT_V3_CLIP_LIMITS.maxClips
  return { clips: all.slice(0, cap), overflow: Math.max(0, all.length - cap) }
}

/**
 * 抽过的片子按地址记几段：同一段片子连着问几轮（视频台上挂着的那几段每轮都在）不必每轮
 * 重新解码。只记成功的 —— 失败的下一轮再试（可能是这一下网络抖了）。
 */
const CAPTURE_CACHE_SIZE = 4
const captured = new Map<string, Promise<VideoFrameCaptureResult>>()

function captureCached(url: string): Promise<VideoFrameCaptureResult> {
  const hit = captured.get(url)
  if (hit) return hit
  const capturing = captureClipFrames(url).then((result) => {
    if (!result.ok) captured.delete(url)
    return result
  })
  captured.set(url, capturing)
  while (captured.size > CAPTURE_CACHE_SIZE)
    captured.delete(captured.keys().next().value!)
  return capturing
}

/** 一段一段抽（⛔ 不并行：两个 `<video>` 同时解码只会两段都慢）。 */
export async function capturePointedClips(
  clips: readonly PointedClip[],
): Promise<{
  videoClips: AssistantOperatorVideoClip[]
  failures: VideoFrameCaptureReason[]
}> {
  const videoClips: AssistantOperatorVideoClip[] = []
  const failures: VideoFrameCaptureReason[] = []
  for (const clip of clips) {
    const result = await captureCached(clip.sourceUrl)
    const base = {
      sourceUrl: clip.sourceUrl,
      label: clip.label,
      ...(clip.nodeId ? { nodeId: clip.nodeId } : {}),
    }
    if (result.ok)
      videoClips.push({
        ...base,
        durationSeconds: result.durationSeconds,
        frames: result.frames,
      })
    else {
      videoClips.push(base)
      failures.push(result.reason)
    }
  }
  return { videoClips, failures }
}

/** 测试用：清掉抽帧缓存。 */
export function resetPointedClipCaptureCache(): void {
  captured.clear()
}
