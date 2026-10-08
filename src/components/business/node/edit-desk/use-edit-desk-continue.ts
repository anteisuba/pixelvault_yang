'use client'

/**
 * 剪辑台续拍（v2 第 4 片 4c）：与画布卡「续拍」**同一个动作**（`useVideoContinue`），多两样：
 * - 末帧截在**段的出点**（剪下来的最后一帧），⛔ 不是整版片尾；
 * - 同一批里在这一段后面插一段**占位**（来源 = 刚建的下一镜卡），一个撤销全回。
 * 然后在占位段上升起新卡的提示词栏；新版落到卡上，占位段就照重拍那条路换成真段
 * （整段在用，长度跟新版走，后面的镜头让位）。
 */

import { useState } from 'react'

import { EDIT_CLIP_SPEED_DEFAULT, EDIT_TRACK_IDS } from '@/constants/edit-desk'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import { EDIT_CLIP_FALLBACK_DURATION_SEC } from '@/lib/edit-project'
import { formatShotDisplayName } from '@/lib/node-display-name'

import type { EditDesk } from '@/hooks/node/use-edit-desk'
import { useVideoReferenceSlots } from '@/hooks/node/use-video-reference-slots'
import {
  useVideoContinue,
  VIDEO_CONTINUE_REFS,
} from '../nodes/v4/video/use-video-continue'

export function useEditDeskContinue({
  desk,
  mintId,
}: {
  readonly desk: EditDesk
  mintId(prefix: string): string
}): {
  /** 续拍这一段（主线）。返回落没落下去。 */
  run(clipId: string): Promise<boolean>
  /** 正在截末帧 / 落卡（选中行那颗键按它置灰）。 */
  readonly busy: boolean
} {
  const frames = useVideoReferenceSlots()
  const continueVideo = useVideoContinue(frames)
  const [running, setRunning] = useState(false)

  const run = async (clipId: string): Promise<boolean> => {
    const track = EDIT_TRACK_IDS.video
    const row = desk.rows[track].find((item) => item.clip.id === clipId)
    const node = row?.source.node
    const url = row?.source.url
    if (!row || !node || node.data.kind !== NODE_MEDIA_KIND_IDS.video || !url) {
      return false
    }
    const data = node.data
    const placeholderId = mintId('clip')
    setRunning(true)
    try {
      const result = await continueVideo({
        nodeId: node.id,
        subtype: data.subtype,
        url,
        displayName:
          data.subtype === NODE_V4_VIDEO_SUBTYPE_IDS.shot
            ? formatShotDisplayName(data.label, data.shotNo)
            : data.name,
        untilSec: row.clip.out,
        then: [
          {
            op: NODE_ASSISTANT_OP_V4_IDS.editAddClip,
            track,
            index: row.index + 1,
            clip: {
              id: placeholderId,
              sourceNodeId: VIDEO_CONTINUE_REFS.shot,
              in: 0,
              out: EDIT_CLIP_FALLBACK_DURATION_SEC,
              speed: EDIT_CLIP_SPEED_DEFAULT,
              muted: false,
            },
          },
        ],
      })
      if (!result) return false
      // 播放头落到占位段开头，栏从那一段上升起来。
      desk.setPlayhead(row.startSec + row.durationSec)
      desk.openRetake(track, placeholderId)
      return true
    } finally {
      setRunning(false)
    }
  }

  return { run, busy: running || frames.grabbing !== null }
}
