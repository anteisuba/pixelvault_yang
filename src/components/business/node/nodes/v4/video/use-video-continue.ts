'use client'

/**
 * 续拍 —— 画布视频卡工具条「续拍」与剪辑台选中行「续拍」**同一个动作**（剪辑台 v2
 * 关键切片 ②）：截这一段的末帧 → 末帧图卡 + 下一镜视频卡排在来源卡右边第一个空位
 * （§7 摆放 A「让位」）、末帧连下一镜首帧、来源连下一镜参考 → 回填末帧。
 *
 * 一批 op = 一个撤销；⛔ 不自动生成（花积分的那一下永远是用户按）。`then` 是跟在这一批
 * 后面、同一个撤销里的 op（剪辑台：在这一段后面插一段占位），新视频卡在批内叫
 * `VIDEO_CONTINUE_REFS.shot`。
 */

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_SLOT_IDS } from '@/constants/node-slots'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import type { UseVideoReferenceSlotsValue } from '@/hooks/node/use-video-reference-slots'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type { NodeV4VideoData } from '@/types/node-workflow'

import { useNodeV4Canvas } from '../NodeV4Context'
import { backfillWhenPresent } from './use-video-rail-binding'
import { videoContinueSourceHandle } from './video-node-model'

/** 这一批里的两个别名（只在这一批之内有效）。 */
export const VIDEO_CONTINUE_REFS = { tail: 'tail', shot: 'shot' } as const

export interface VideoContinueInput {
  readonly nodeId: string
  readonly subtype: NodeV4VideoData['subtype']
  /** 截末帧的那一版的地址（剪辑台：段在用的那一版）。 */
  readonly url: string
  readonly displayName: string
  /** 截到这一秒为止（剪辑台：段的出点）。缺席 = 整版片尾。 */
  readonly untilSec?: number
  readonly then?: readonly NodeAssistantOpV4[]
}

export function useVideoContinue(
  frames: Pick<UseVideoReferenceSlotsValue, 'captureLastFrame'>,
): (input: VideoContinueInput) => Promise<{ readonly shotId: string } | null> {
  const tVideo = useTranslations('StudioNode.v4.video')
  const tCapture = useTranslations('VideoAnalysis')
  const canvas = useNodeV4Canvas()
  const latest = useRef(canvas)
  useEffect(() => {
    latest.current = canvas
  })

  return async (input) => {
    const grabbed =
      input.untilSec === undefined
        ? await frames.captureLastFrame(input.url, input.displayName)
        : await frames.captureLastFrame(
            input.url,
            input.displayName,
            input.untilSec,
          )
    if (!grabbed.ok) {
      toast.error(tCapture(`captureReason.${grabbed.reasonKey}` as never))
      return null
    }
    const [tailAt, shotAt] =
      canvas.onPlaceBeside(input.nodeId, [
        {
          kind: NODE_MEDIA_KIND_IDS.image,
          subtype: NODE_V4_IMAGE_SUBTYPE_IDS.shot,
        },
        {
          kind: NODE_MEDIA_KIND_IDS.video,
          subtype: NODE_V4_VIDEO_SUBTYPE_IDS.shot,
        },
      ]) ?? []
    const outcome = await canvas.onApplyBatch([
      {
        op: NODE_ASSISTANT_OP_V4_IDS.addNode,
        kind: NODE_MEDIA_KIND_IDS.image,
        subtype: NODE_V4_IMAGE_SUBTYPE_IDS.shot,
        ref: VIDEO_CONTINUE_REFS.tail,
        name: tVideo('tailFrameName', { name: input.displayName }),
        ...(tailAt ? { position: tailAt } : {}),
      },
      {
        op: NODE_ASSISTANT_OP_V4_IDS.addNode,
        kind: NODE_MEDIA_KIND_IDS.video,
        subtype: NODE_V4_VIDEO_SUBTYPE_IDS.shot,
        ref: VIDEO_CONTINUE_REFS.shot,
        ...(shotAt ? { position: shotAt } : {}),
      },
      {
        op: NODE_ASSISTANT_OP_V4_IDS.connect,
        source: VIDEO_CONTINUE_REFS.tail,
        target: VIDEO_CONTINUE_REFS.shot,
        slot: NODE_SLOT_IDS.firstFrame,
      },
      {
        op: NODE_ASSISTANT_OP_V4_IDS.connect,
        source: input.nodeId,
        sourceHandle: videoContinueSourceHandle(input.subtype),
        target: VIDEO_CONTINUE_REFS.shot,
        slot: NODE_SLOT_IDS.reference,
      },
      ...(input.then ?? []),
    ])
    const [tailId, shotId] = outcome?.createdNodeIds ?? []
    if (tailId) {
      backfillWhenPresent(() => latest.current, tailId, { url: grabbed.url })
    }
    return shotId ? { shotId } : null
  }
}
