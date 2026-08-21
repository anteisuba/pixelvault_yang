import 'server-only'

import { randomBytes } from 'node:crypto'

import {
  VIDEO_FRAME_EVIDENCE_ID_PREFIX,
  VIDEO_FRAME_LIMITS,
  VIDEO_FRAME_STORAGE_PREFIX,
  VIDEO_FRAMES_INVALID_ERROR,
} from '@/constants/video-analysis'
import {
  VISION_EVIDENCE_SOURCE_ID,
  VISION_EVIDENCE_SOURCE_TIER,
} from '@/constants/vision'
import { ApiRequestError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import {
  findFramePlanMismatches,
  formatFrameTimestamp,
  planVideoFrames,
} from '@/lib/video-frame-plan'
import { detectTrustedImageMime, uploadToR2 } from '@/services/storage/r2'
import type { EvidenceItem } from '@/types/research'

/**
 * 帧集落库（AI 导演内核 · 切片 2 · §4.3「帧集可回溯」）。
 *
 * 三件事，缺一条帧集就不再可回溯：
 *  1. **复算计划再核对** —— 客户端说它按计划抽的，服务端自己算一遍逐帧对时间戳。
 *     不核对的话「确定性」只是客户端的一句承诺。
 *  2. **落 R2** —— 帧必须有稳定 URL，否则 owner 翻案时看到的是一堆过期的 blob。
 *  3. **进 `ResearchRun.evidence`（`kind:'image'` / `sourceId: vision_input`）**，
 *     并把**抽帧参数**（时间戳 / 帧数 / 策略版本 / 来源视频 URL）一起写下去。
 *
 * ⚠ 本服务**只管帧集**，不调模型、不写 `ResearchRun` —— 那一行由
 * `analyzeVisual` 统一落（一次分析一行，证据序号 `[n]` 和结论对得上）。
 * 拆两行的话「帧集」和「用这组帧得出的结论」就成了两条要靠人对齐的记录。
 */

export interface SubmittedVideoFrame {
  index: number
  timestampSeconds: number
  /** `data:image/…;base64,…`。⚠ 客户端可控输入，下面按魔数验真。 */
  dataUrl: string
}

export interface PersistVideoFrameSetInput {
  /** DB user id（不是 clerkId）——与 `analyzeVisual` 同一约定。 */
  userId: string
  /** 帧从哪个视频来的。写进每条证据的 `url`，回看时点得开原视频。 */
  sourceVideoUrl: string
  durationSeconds: number
  frames: SubmittedVideoFrame[]
}

export interface PersistedVideoFrame {
  index: number
  timestampSeconds: number
  /** R2 公开 URL。 */
  url: string
  width: number
  height: number
}

/**
 * 一组帧 + 它是怎么来的。**参数和产物长在一起** —— 只存 URL 的话，
 * 三个月后没人说得清这 8 张是按哪个策略、从哪个视频、在哪几秒抽的。
 */
export interface VideoFrameSet {
  sourceVideoUrl: string
  durationSeconds: number
  planVersion: number
  strategy: string
  frames: PersistedVideoFrame[]
}

function invalidFrames(reason: string): ApiRequestError {
  return new ApiRequestError(
    VIDEO_FRAMES_INVALID_ERROR.code,
    VIDEO_FRAMES_INVALID_ERROR.httpStatus,
    VIDEO_FRAMES_INVALID_ERROR.i18nKey,
    `${VIDEO_FRAMES_INVALID_ERROR.message} (${reason})`,
  )
}

/** `data:image/webp;base64,xxx` → Buffer。⛔ 不接受非 base64 的 data URL。 */
function decodeDataUrl(dataUrl: string): Buffer {
  // ⚠ 不用 `s` 标志：本仓 tsconfig 的 target 低于 es2018，`s` 会让全量 tsc 报
  //   TS1501（定向测试全绿照过）。`[\s\S]` 是等价写法，且不挑 target。
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(dataUrl)
  if (!match) throw invalidFrames('frame is not a base64 data URL')
  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.byteLength === 0) throw invalidFrames('frame decoded to 0 bytes')
  if (buffer.byteLength > VIDEO_FRAME_LIMITS.maxFrameBytes) {
    throw invalidFrames(
      `frame is ${buffer.byteLength} bytes, over the ${VIDEO_FRAME_LIMITS.maxFrameBytes} cap`,
    )
  }
  return buffer
}

/**
 * 帧集在 R2 里的落点。一次抽帧 = 一个目录（随机组 id），组内按序号命名。
 *
 * ⚠ **组 id 随机、内容确定** —— 确定的是「同一个视频同一份参数抽出同样的画面」，
 * 不是「同一个 key」。复用 key 会让两次分析互相覆盖，回看时看到的是最后一次的帧。
 */
function buildFrameStorageKey(
  userId: string,
  groupId: string,
  index: number,
  format: string,
): string {
  const paddedIndex = String(index + 1).padStart(2, '0')
  return `${VIDEO_FRAME_STORAGE_PREFIX}/${userId}/${groupId}/frame-${paddedIndex}.${format}`
}

/**
 * 核对 + 转存 + 出帧集。**会抛** `VIDEO_FRAMES_INVALID`：不按计划抽的帧集
 * 静默收下就等于库里躺着一组「声称可复跑、其实不可」的证据。
 */
export async function persistVideoFrameSet(
  input: PersistVideoFrameSetInput,
): Promise<VideoFrameSet> {
  const plan = planVideoFrames(input.durationSeconds)
  if (plan.entries.length === 0) {
    throw invalidFrames(
      `duration ${input.durationSeconds}s yields no deterministic plan`,
    )
  }
  if (input.frames.length !== plan.entries.length) {
    throw invalidFrames(
      `expected ${plan.entries.length} frames, received ${input.frames.length}`,
    )
  }

  const mismatches = findFramePlanMismatches(plan, input.frames)
  if (mismatches.length > 0) {
    // 说清楚**第几帧差多少** —— 只回一句「不确定性」的话线上无从查起。
    throw invalidFrames(
      `timestamps off plan: ${mismatches
        .map(
          (mismatch) =>
            `#${mismatch.index}: expected ${mismatch.expected}s, got ${mismatch.received}s`,
        )
        .join('; ')}`,
    )
  }

  const groupId = randomBytes(8).toString('hex')
  const ordered = [...input.frames].sort((a, b) => a.index - b.index)

  const frames = await Promise.all(
    ordered.map(async (frame): Promise<PersistedVideoFrame> => {
      const buffer = decodeDataUrl(frame.dataUrl)
      // ⚠ 按**魔数**验真，不信 data URL 头里那个 mime：那一段是客户端写的。
      const image = await detectTrustedImageMime(buffer)
      const url = await uploadToR2({
        data: buffer,
        key: buildFrameStorageKey(
          input.userId,
          groupId,
          frame.index,
          image.format,
        ),
        mimeType: image.mimeType,
      })
      return {
        index: frame.index,
        timestampSeconds: frame.timestampSeconds,
        url,
        width: image.width,
        height: image.height,
      }
    }),
  )

  logger.info('Video frame set persisted', {
    groupId,
    frameCount: frames.length,
    planVersion: plan.planVersion,
    durationSeconds: plan.durationSeconds,
  })

  return {
    sourceVideoUrl: input.sourceVideoUrl,
    durationSeconds: plan.durationSeconds,
    planVersion: plan.planVersion,
    strategy: plan.strategy,
    frames,
  }
}

/**
 * 帧集 → `ResearchRun.evidence`。
 *
 * - `imageUrl` = 那一帧（R2）；`url` = **来源视频**。两者不同是有意的：
 *   点开引用要能回到视频本身，而不是回到一张裁下来的图。
 * - `title` 带序号和时间戳（`Frame 3/8 @ 0:12`）——「哪一帧说的」是审片时的第一个问题。
 */
export function buildVideoFrameEvidence(
  frameSet: VideoFrameSet,
): EvidenceItem[] {
  const retrievedAt = new Date().toISOString()
  return frameSet.frames.map((frame) => ({
    id: `${VIDEO_FRAME_EVIDENCE_ID_PREFIX}-${frame.index + 1}`,
    kind: 'image' as const,
    sourceId: VISION_EVIDENCE_SOURCE_ID,
    sourceTier: VISION_EVIDENCE_SOURCE_TIER,
    retrievedAt,
    title: `Frame ${frame.index + 1}/${frameSet.frames.length} @ ${formatFrameTimestamp(
      frame.timestampSeconds,
    )}`,
    url: frameSet.sourceVideoUrl.slice(0, 2000),
    imageUrl: frame.url,
    width: frame.width,
    height: frame.height,
  }))
}

/**
 * 抽帧参数的一行摘要，拼进 `ResearchRun.query`。
 *
 * ⭐ 复跑靠的就是这一行 + 证据里的帧 URL：策略版本、帧数、片长、时间戳、来源视频
 * 全在，任何人拿它都能算出同一组时间戳并对上同一组帧。
 */
export function describeVideoFrameSet(frameSet: VideoFrameSet): string {
  const stamps = frameSet.frames
    .map((frame) => frame.timestampSeconds.toFixed(2))
    .join(',')
  return `frames v${frameSet.planVersion}/${frameSet.strategy} · ${frameSet.frames.length}f · ${frameSet.durationSeconds}s · t=[${stamps}] · src=${frameSet.sourceVideoUrl}`
}
