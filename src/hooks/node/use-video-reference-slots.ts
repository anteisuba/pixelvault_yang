'use client'

/**
 * 视频节点的**抓帧 → 参考槽**（v3 spec §5，画板 `VideoSelected.dc.html` 底注）。
 *
 * 工具条上两颗键各要一张图：
 * · **续拍** = 这段的**最后一帧** → 新镜头的 `firstFrame`；
 * · **抽帧** = **当前画面** → 新图片卡，连线指回这段的 `reference`。
 *
 * 两条都在这里收口，因为它们是同一件事的两半：抓一帧 → 走**与手动上传同一条**回填
 * 链（`useNodeUploadV4`）拿到一个 R2 地址 → 交给调用方发 op。⛔ 这一层不发 op、
 * 不碰画布 state：落槽是 op 表的事（`nodes/v4/CLAUDE.md` 纪律 1）。
 *
 * ── 两种抓法 ──────────────────────────────────────────────────────────
 * 两条都走离屏 `<video>` + `crossOrigin`（`lib/video-frame-capture`，seek 超时与
 * CORS 都在那一层踩平了）：末帧按片尾算，当前帧 seek 到调用方记下的那一秒。
 * ⛔ 不从卡上悬停预览的那只 `<video>` 直接画 —— 它只在鼠标停在画面上时才挂，
 * 手挪到工具条就卸了（抽帧因此永远拿不到它）；它也没打 `crossOrigin`。
 */

import { useCallback, useState } from 'react'

import {
  VIDEO_FRAME_CAPTURE_REASONS,
  type VideoFrameCaptureReason,
} from '@/constants/video-analysis'
import { useNodeUploadV4 } from '@/hooks/node/use-node-upload-v4'
import {
  captureVideoEndpointFrames,
  captureVideoFrameAt,
} from '@/lib/video-frame-capture'

/**
 * 机器可读的失败原因（kebab）→ 已有文案键（camel，`VideoAnalysis.captureReason.*`）。
 * ⚠ 两边的**集合**由 `satisfies` 钉住：枚举里加一条而这里漏了，编译期就红。
 * ⛔ 不为画布另写一套说法：同一个失败在两个域读到两句话，用户会以为是两回事。
 */
export const VIDEO_CAPTURE_REASON_KEYS = {
  [VIDEO_FRAME_CAPTURE_REASONS.unsupportedEnvironment]:
    'unsupportedEnvironment',
  [VIDEO_FRAME_CAPTURE_REASONS.loadFailed]: 'loadFailed',
  [VIDEO_FRAME_CAPTURE_REASONS.unreadableDuration]: 'unreadableDuration',
  [VIDEO_FRAME_CAPTURE_REASONS.taintedCanvas]: 'taintedCanvas',
  [VIDEO_FRAME_CAPTURE_REASONS.timeout]: 'timeout',
  [VIDEO_FRAME_CAPTURE_REASONS.encodeFailed]: 'encodeFailed',
} as const satisfies Record<VideoFrameCaptureReason, string>

export type VideoCaptureReasonKey =
  (typeof VIDEO_CAPTURE_REASON_KEYS)[VideoFrameCaptureReason]

/** 抓帧的两种口味 —— 也是「正在抓哪一张」的读数。 */
export const VIDEO_FRAME_GRABS = ['lastFrame', 'currentFrame'] as const
export type VideoFrameGrab = (typeof VIDEO_FRAME_GRABS)[number]

export type VideoFrameGrabResult =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reasonKey: VideoCaptureReasonKey }

export interface UseVideoReferenceSlotsValue {
  /** 正在抓的那一张；`null` = 空闲。工具条按它置灰。 */
  readonly grabbing: VideoFrameGrab | null
  /** 上传失败时的原文（`useNodeUploadV4.error`）。 */
  readonly uploadError: string | null
  /** `untilSec` = 截到这一秒为止的末帧（剪辑台：段的出点）；缺席 = 整版片尾。 */
  captureLastFrame(
    videoUrl: string,
    name: string,
    untilSec?: number,
  ): Promise<VideoFrameGrabResult>
  /** `atSec` = 用户最后看到的那一秒（悬停播放停下的位置；没放过 = 0，即封面那帧）。 */
  captureFrameAt(
    videoUrl: string,
    atSec: number,
    name: string,
  ): Promise<VideoFrameGrabResult>
}

/** `data:` → `File`，让抓到的帧走与手动上传**同一条**回填链。 */
function dataUrlToFile(dataUrl: string, name: string): File | null {
  const [header, body] = dataUrl.split(',')
  if (!header || !body) return null
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? 'image/webp'
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new File([bytes], name, { type: mime })
}

export function useVideoReferenceSlots(): UseVideoReferenceSlotsValue {
  const upload = useNodeUploadV4()
  const [grabbing, setGrabbing] = useState<VideoFrameGrab | null>(null)

  const push = useCallback(
    async (dataUrl: string, name: string): Promise<VideoFrameGrabResult> => {
      const file = dataUrlToFile(dataUrl, `${name}.webp`)
      if (!file) {
        return {
          ok: false,
          reasonKey: VIDEO_CAPTURE_REASON_KEYS['encode-failed'],
        }
      }
      const patch = await upload.upload('image', file, name)
      if (!patch?.url) {
        return {
          ok: false,
          reasonKey: VIDEO_CAPTURE_REASON_KEYS['load-failed'],
        }
      }
      return { ok: true, url: patch.url }
    },
    [upload],
  )

  const captureLastFrame = useCallback(
    async (
      videoUrl: string,
      name: string,
      untilSec?: number,
    ): Promise<VideoFrameGrabResult> => {
      setGrabbing('lastFrame')
      try {
        const result = await captureVideoEndpointFrames(videoUrl, untilSec)
        if (!result.ok) {
          return {
            ok: false,
            reasonKey: VIDEO_CAPTURE_REASON_KEYS[result.reason],
          }
        }
        // `planVideoEndpointFrames` 的 index 2 = 末帧（0=首 / 1=中 / 2=末）——
        // 下标与序号在那一层就是同一个数，⛔ 这里不按数组位置猜。
        const frame =
          result.frames.find((item) => item.index === 2) ?? result.frames.at(-1)
        if (!frame) {
          return {
            ok: false,
            reasonKey: VIDEO_CAPTURE_REASON_KEYS['unreadable-duration'],
          }
        }
        return await push(frame.dataUrl, name)
      } finally {
        setGrabbing(null)
      }
    },
    [push],
  )

  const captureFrameAt = useCallback(
    async (
      videoUrl: string,
      atSec: number,
      name: string,
    ): Promise<VideoFrameGrabResult> => {
      setGrabbing('currentFrame')
      try {
        const result = await captureVideoFrameAt(videoUrl, atSec)
        if (!result.ok) {
          return {
            ok: false,
            reasonKey: VIDEO_CAPTURE_REASON_KEYS[result.reason],
          }
        }
        const frame = result.frames[0]
        if (!frame) {
          return {
            ok: false,
            reasonKey: VIDEO_CAPTURE_REASON_KEYS['unreadable-duration'],
          }
        }
        return await push(frame.dataUrl, name)
      } finally {
        setGrabbing(null)
      }
    },
    [push],
  )

  return {
    grabbing,
    uploadError: upload.error,
    captureLastFrame,
    captureFrameAt,
  }
}
