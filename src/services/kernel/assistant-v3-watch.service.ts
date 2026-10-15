import 'server-only'

import type { UserContent } from 'ai'

import { ASSISTANT_VIDEO_TIERS } from '@/constants/assistant'
import {
  ASSISTANT_V3_CLIP_LIMITS,
  ASSISTANT_V3_PICTURE_FORMATS,
} from '@/constants/assistant-v3'
import { logger } from '@/lib/logger'
import { planClipFrames } from '@/lib/video-frame-plan'
import { detectTrustedVideoMime } from '@/lib/video-mime'
import type { AssistantOperatorVideoClip } from '@/types/assistant-operator'
import type { AssistantV3ClipRef } from '@/types/assistant-v3'
import type { V3Picture } from '@/services/kernel/assistant-v3-look.service'
import type { V3Context } from '@/services/kernel/assistant-v3-steps.service'
import { fetchAsBuffer } from '@/services/storage/r2'
import { verifyVideoFrameSet } from '@/services/video-frames/video-frame-set.service'

/**
 * v3 看片：**Denia 自己看**（看图期第二段，owner 2026-10-15）。
 *
 * ⭐ 与看图同一种看法：片子（或它的帧）连同创作者的问题摆到**主模型**眼前，由它带着整段对话
 *   自己判断。⛔ 不另起看片子调用，⛔ 不填评审表，⛔ 不按固定三个问题逐帧问。怎么看写在系统
 *   提示的 WATCHING CLIPS 一段里。
 *
 * ── 两种摆法 ─────────────────────────────────────────────────────
 * - **片子本体**（`native` 档 = Gemini）：服务端按地址下载（`fetchAsBuffer`，防 SSRF 的那条），
 *   按文件头认容器，单段不超过 `ASSISTANT_V3_CLIP_LIMITS.inlineMaxBytes`，内联进消息。
 * - **帧**（别家，或 Gemini 下不来 / 太大时）：浏览器按 `planClipFrames` 抽好随请求上来，服务端
 *   复算同一份计划逐帧核对时间戳、按魔数验真（`verifyVideoFrameSet`），通过才摆上去。
 * ⛔ 不借别家的 key：所选模型看不了图，片子一段也不看（`cannotSeeOutcome`）。
 *
 * ⚠ 字节只活在这次请求里（与图同一条）：本轮记录只存地址与称呼，帧每一跳由客户端原样再带。
 */

/** 下好的一段片子。`mediaType` 是按文件头认的、Gemini 收的写法。 */
export interface V3Clip {
  readonly data: Buffer
  readonly mediaType: string
}

export type V3ClipLoad =
  | { readonly ok: true; readonly clip: V3Clip }
  /** `tooLarge` = 超过内联上限；`unloadable` = 下不来 / 不是认得的视频容器。 */
  | { readonly ok: false; readonly reason: 'tooLarge' | 'unloadable' }

/** 这次请求里下过的片子：同一个地址只下一次。 */
export interface V3ClipCache {
  readonly maxBytes: number
  readonly loads: Map<string, Promise<V3ClipLoad>>
}

export function createClipCache(): V3ClipCache {
  return { maxBytes: ASSISTANT_V3_CLIP_LIMITS.inlineMaxBytes, loads: new Map() }
}

/**
 * 按文件头认出来的容器 → Gemini 收的写法。⚠ QuickTime 在 Gemini 的视频格式表里叫
 * `video/mov`（不是 `video/quicktime`），写错整步 400。
 */
function geminiVideoMime(trusted: string): string {
  return trusted === 'video/quicktime' ? 'video/mov' : trusted
}

/** 只下 http(s)：`blob:` 是创作者浏览器里的地址，服务端下不了（那种只能靠帧）。 */
function downloadable(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

export function loadClip(
  cache: V3ClipCache,
  url: string,
  signal?: AbortSignal,
): Promise<V3ClipLoad> {
  const cached = cache.loads.get(url)
  if (cached) return cached
  const loading = (async (): Promise<V3ClipLoad> => {
    if (!downloadable(url)) return { ok: false, reason: 'unloadable' }
    try {
      const { buffer } = await fetchAsBuffer(url, {
        maxBytes: cache.maxBytes,
        signal,
      })
      return {
        ok: true,
        clip: {
          data: buffer,
          mediaType: geminiVideoMime(detectTrustedVideoMime(buffer)),
        },
      }
    } catch (error) {
      signal?.throwIfAborted()
      const message = error instanceof Error ? error.message : String(error)
      logger.warn('assistant v3 clip not loaded', { error: message })
      // `fetchAsBuffer` 超限时（声明的或实收的）一律是这句话。
      return {
        ok: false,
        reason: /exceeds maximum size/i.test(message)
          ? 'tooLarge'
          : 'unloadable',
      }
    }
  })()
  cache.loads.set(url, loading)
  return loading
}

/** 一段片子里的一帧：序号、时间点、图。 */
export interface V3ClipFrame {
  readonly index: number
  readonly timestampSeconds: number
  readonly picture: V3Picture
}

export type V3ClipFrames =
  | {
      readonly ok: true
      readonly durationSeconds: number
      readonly frames: readonly V3ClipFrame[]
    }
  | { readonly ok: false; readonly reason: 'missing' | 'invalid' }

/**
 * 请求里那组帧过一遍关：按片长复算 `planClipFrames` → 帧数、逐帧时间戳在容差内 → 每帧是真
 * 图片（只收那三种）且不超过所选那家的单图上限（Claude 是原图约 7.5 MB，与看图同一个数）。
 * ⚠ 一帧不过 = 整组不用（半组帧已经不是那份计划的产物）。
 */
export async function verifyClipFrames(
  clip: AssistantOperatorVideoClip | undefined,
  maxPictureBytes: number,
): Promise<V3ClipFrames> {
  if (!clip?.frames?.length || !clip.durationSeconds)
    return { ok: false, reason: 'missing' }
  try {
    const verified = await verifyVideoFrameSet({
      durationSeconds: clip.durationSeconds,
      frames: clip.frames,
      plan: planClipFrames(clip.durationSeconds),
      allowedFormats: ASSISTANT_V3_PICTURE_FORMATS,
    })
    if (verified.frames.some((frame) => frame.buffer.length > maxPictureBytes))
      return { ok: false, reason: 'invalid' }
    return {
      ok: true,
      durationSeconds: verified.plan.durationSeconds,
      frames: verified.frames.map((frame) => ({
        index: frame.index,
        timestampSeconds: frame.timestampSeconds,
        picture: {
          data: frame.buffer,
          mediaType: frame.mimeType,
          width: frame.width,
          height: frame.height,
        },
      })),
    }
  } catch (error) {
    logger.warn('assistant v3 clip frames rejected', {
      error: error instanceof Error ? error.message : String(error),
    })
    return { ok: false, reason: 'invalid' }
  }
}

/** 一段被指着的片子这一跳怎么摆。 */
export type V3ClipView =
  | {
      readonly kind: 'video'
      readonly ref: AssistantV3ClipRef
      readonly clip: V3Clip
    }
  | {
      readonly kind: 'frames'
      readonly ref: AssistantV3ClipRef
      readonly durationSeconds: number
      readonly frames: readonly V3ClipFrame[]
    }
  | {
      readonly kind: 'none'
      readonly ref: AssistantV3ClipRef
      readonly note: string
    }

/**
 * 创作者这一轮指着的几段片子（板子上的 `clips`）这一跳各自怎么摆。
 *
 * ⭐ `native` 档（Gemini）**先看片子本体，帧只是退路**：运镜、动作快慢与是否连贯、一个动作
 *   落在第几秒，只有看片子本体才看得见 —— 帧是几个时间点的样本，两帧之间发生了什么帧本身
 *   不说。所以片子在内联上限内就交片子，超了 / 下不来才用浏览器抽好的那组帧。
 * 别家只有帧；帧没抽成、或没过服务端那一关，就如实写一句没看成，⛔ 不猜。
 */
export async function viewPointedClips(
  context: V3Context,
  refs: readonly AssistantV3ClipRef[],
): Promise<V3ClipView[]> {
  const signal = context.prepared.run.signal
  const submitted = context.request.videoClips ?? []
  return Promise.all(
    refs.map(async (ref): Promise<V3ClipView> => {
      let tooLarge = false
      if (context.clipTier === ASSISTANT_VIDEO_TIERS.native) {
        const load = await loadClip(context.clips, ref.url, signal)
        if (load.ok) return { kind: 'video', ref, clip: load.clip }
        tooLarge = load.reason === 'tooLarge'
      }
      const frames = await verifyClipFrames(
        submitted.find((clip) => clip.sourceUrl === ref.url),
        context.pictures.maxBytes,
      )
      if (frames.ok)
        return {
          kind: 'frames',
          ref,
          durationSeconds: frames.durationSeconds,
          frames: frames.frames,
        }
      return {
        kind: 'none',
        ref,
        note: [
          tooLarge
            ? `too large to watch directly (over ${Math.round(ASSISTANT_V3_CLIP_LIMITS.inlineMaxBytes / 1024 / 1024)} MB)`
            : null,
          frames.reason === 'missing'
            ? 'its frames could not be sampled in the browser'
            : 'its frames did not pass the check',
        ]
          .filter(Boolean)
          .join('; '),
      }
    }),
  )
}

function seconds(value: number): string {
  return `${Number(value.toFixed(1))} s`
}

/**
 * 「CLIPS THE CREATOR POINTED AT」那一段：每段先一行称呼，再跟片子本体或一张张帧。
 * 帧逐张写清「clip 「名字」 · frame k/N at t s」—— 模型要知道每张是哪一刻，才说得清
 * 「第 3 秒那里人物换了脸」，也才知道两帧之间隔了多久、哪些事它其实没看见。
 */
export function pointedClipParts(
  views: readonly V3ClipView[],
): Exclude<UserContent, string> {
  if (views.length === 0) return []
  const parts: Exclude<UserContent, string> = [
    {
      type: 'text',
      text: `CLIPS THE CREATOR POINTED AT (in order): ${views
        .map(
          (view, index) =>
            `${index + 1} = clip 「${view.ref.label}」${
              view.kind === 'video'
                ? ' (the clip itself)'
                : view.kind === 'frames'
                  ? ` (${view.frames.length} frames sampled across ${seconds(view.durationSeconds)})`
                  : ` (not shown: ${view.note})`
            }`,
        )
        .join(' · ')}`,
    },
  ]
  for (const view of views) parts.push(...clipViewParts(view))
  return parts
}

/** 一段片子的那几块：片子本体一块，或每帧一行字 + 一张图。 */
export function clipViewParts(view: V3ClipView): Exclude<UserContent, string> {
  if (view.kind === 'video')
    return [
      { type: 'text', text: `clip 「${view.ref.label}」:` },
      { type: 'file', data: view.clip.data, mediaType: view.clip.mediaType },
    ]
  if (view.kind === 'frames')
    return view.frames.flatMap((frame, position) => [
      {
        type: 'text' as const,
        text: `clip 「${view.ref.label}」 · frame ${position + 1}/${view.frames.length} at ${seconds(frame.timestampSeconds)}`,
      },
      {
        type: 'image' as const,
        image: frame.picture.data,
        mediaType: frame.picture.mediaType,
      },
    ])
  return []
}
