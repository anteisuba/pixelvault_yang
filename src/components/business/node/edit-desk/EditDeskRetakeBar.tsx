'use client'

/**
 * 就地重拍栏（v2 第 4 片 4b · 关键切片「② 重拍」）。
 *
 * 就是画布视频卡那条提示词栏 —— 同一份编排件（`useVideoComposer`）、同一个
 * `NodePromptBar`，搬到暗场上：模型、参考、参数都是来源卡那一份，改了就是改那张卡；
 * 弹层经台面的传送落点走暗档（`PortalContainerProvider`）。
 * - 从段在时间线上的位置放大升到预览下方（380ms 弹簧），收回时回到那一段（240ms）；
 * - 发出去就收起，段上画生成中，可以接着剪；落版自动换上（`useEditDesk` 记账）；
 * - 失败：栏顶一行原因，段上描红 + 「!」，改一下提示词再发就是重试。
 *
 * ⚠ 花积分的永远是用户按下的这一下：发送键走警告琥珀（配色 B），助手 / MCP 不走这里。
 */

import { useEffect, useLayoutEffect, useRef } from 'react'
import {
  animate,
  motion,
  useMotionValue,
  usePresence,
  useReducedMotion,
} from 'motion/react'
import { useTranslations } from 'next-intl'

import { EDIT_RETAKE_MOTION, type EditTrackId } from '@/constants/edit-desk'
import { EASE_IN } from '@/constants/motion'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import type { EditTimelineRow } from '@/lib/edit-project'
import { formatShotDisplayName } from '@/lib/node-display-name'
import { VIDEO_RAIL_GROUP_IDS } from '@/lib/video-node-rail'
import type { NodeV4, NodeV4VideoData } from '@/types/node-workflow'

import type { EditDesk } from '@/hooks/node/use-edit-desk'
import { useModelChannelGate } from '@/hooks/use-model-channel-gate'
import { NodePromptBar } from '../nodes/v4/chrome'
import { CharacterMentionRail } from '../nodes/v4/character/CharacterMentionRail'
import { VideoAddMenuItems } from '../nodes/v4/video/VideoNodeMenus'
import { VideoRefRail } from '../nodes/v4/video/VideoRefRail'
import { useVideoComposer } from '../nodes/v4/video/use-video-composer'
import { EDIT_CLIP_FLASH_ATTRIBUTE } from './edit-desk-flash'

export function EditDeskRetakeBar({
  desk,
  row,
  track,
}: {
  readonly desk: EditDesk
  readonly row: EditTimelineRow
  readonly track: EditTrackId
}) {
  const node = row.source.node
  if (!node || node.data.kind !== NODE_MEDIA_KIND_IDS.video) return null
  return <RetakeBarBody desk={desk} row={row} track={track} node={node} />
}

/** 段在屏幕上的中心（栏从这里长出来、收回这里）。段不在 DOM 里 = `null`。 */
function clipCenter(clipId: string): { x: number; y: number } | null {
  const el = document.querySelector(
    `[${EDIT_CLIP_FLASH_ATTRIBUTE}="${CSS.escape(clipId)}"]`,
  )
  if (!el) return null
  const rect = el.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

function RetakeBarBody({
  desk,
  row,
  track,
  node,
}: {
  readonly desk: EditDesk
  readonly row: EditTimelineRow
  readonly track: EditTrackId
  readonly node: NodeV4
}) {
  const t = useTranslations('StudioNode.editDesk.retake')
  const tVideo = useTranslations('StudioNode.v4.video')
  const tPicker = useTranslations('ModelPicker')
  const data = node.data as NodeV4VideoData
  const displayName =
    data.subtype === NODE_V4_VIDEO_SUBTYPE_IDS.shot
      ? formatShotDisplayName(data.label, data.shotNo)
      : data.name
  const composer = useVideoComposer({
    id: node.id,
    videoData: data,
    displayName,
  })
  // 与卡上那颗模型 chip 同一对闸（gateId = 节点 id）。
  const channelGate = useModelChannelGate(NODE_MEDIA_KIND_IDS.video, node.id)
  const clipId = row.clip.id
  const failed = desk.retakes.get(clipId)?.status === 'failed'

  /* ── 从段上长出来 / 收回段上 ─────────────────────────────────────── */
  const reduceMotion = useReducedMotion()
  const barRef = useRef<HTMLDivElement | null>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const scale = useMotionValue(1)
  const opacity = useMotionValue(1)
  const [isPresent, safeToRemove] = usePresence()

  /** 栏中心 → 段中心的位移（量的是此刻两者的位置）。 */
  const offsetToClip = () => {
    const bar = barRef.current?.getBoundingClientRect()
    const target = clipCenter(clipId)
    if (!bar || !target) return null
    return {
      x: target.x - (bar.left + bar.width / 2) + x.get(),
      y: target.y - (bar.top + bar.height / 2) + y.get(),
    }
  }

  useLayoutEffect(() => {
    const from = reduceMotion ? null : offsetToClip()
    if (!from) return
    const rise = EDIT_RETAKE_MOTION.rise
    x.set(from.x)
    y.set(from.y)
    scale.set(EDIT_RETAKE_MOTION.fromScale)
    opacity.set(0)
    const controls = [
      animate(x, 0, rise),
      animate(y, 0, rise),
      animate(scale, 1, rise),
      animate(opacity, 1, { duration: EDIT_RETAKE_MOTION.closeS }),
    ]
    return () => controls.forEach((control) => control.stop())
    // 只在升起那一刻量一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (isPresent) return
    const to = reduceMotion ? null : offsetToClip()
    const close = { duration: EDIT_RETAKE_MOTION.closeS, ease: EASE_IN }
    const controls = [
      animate(opacity, 0, close),
      ...(to
        ? [
            animate(x, to.x, close),
            animate(y, to.y, close),
            animate(scale, EDIT_RETAKE_MOTION.fromScale, close),
          ]
        : []),
    ]
    void Promise.all(controls).then(() => safeToRemove?.())
    // 收回只跑一次（`isPresent` 翻成 false 那一下）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent])

  /* ── 发出这一枪 ───────────────────────────────────────────────────── */
  const submit = () => {
    const run = composer.submitPrompt()
    if (!run) return
    desk.beginRetake(track, clipId)
    desk.closeRetake()
    void run.then((outcome) => desk.settleRetake(clipId, outcome))
  }

  const nextTake = (row.source.version?.count ?? 0) + 1

  return (
    <motion.div
      ref={barRef}
      data-testid="edit-desk-retake-bar"
      style={{ x, y, scale, opacity }}
      onPointerDown={(event) => event.stopPropagation()}
      className="absolute inset-x-0 bottom-3 z-20 mx-auto w-full max-w-170 px-4"
    >
      <NodePromptBar
        slotRow={
          failed && composer.failureMessage ? (
            <p
              role="alert"
              data-testid="edit-desk-retake-failed"
              className="mr-3.5 rounded-lg bg-status-risk-surface px-2.5 py-1.5 text-xs leading-5 text-status-risk"
            >
              {t('failed', { n: nextTake, reason: composer.failureMessage })}
            </p>
          ) : null
        }
        // 与卡上同一条：挂了东西才占这一行（⛔ 空着也留一行白）。
        leadingRow={
          composer.acceptsRefs &&
          (composer.railItems.length > 0 ||
            (composer.railProps.pending?.length ?? 0) > 0 ||
            composer.characterMentions.length > 0) ? (
            <div className="flex min-w-0 max-w-full items-start gap-2">
              <VideoRefRail {...composer.railProps} />
              <CharacterMentionRail
                nodeId={node.id}
                mentions={composer.characterMentions}
                capacity={composer.characterRail.capacity}
                usedImages={composer.characterRail.usedImages}
                disabled={composer.generating}
              />
            </div>
          ) : null
        }
        value={composer.draft}
        onValueChange={composer.setDraft}
        onSubmit={submit}
        submitTone="spend"
        {...(channelGate.blocked
          ? {
              blockedLabel: tPicker('pickChannel'),
              onBlockedClick: channelGate.requestPick,
            }
          : {})}
        generating={composer.generating}
        onCancel={composer.cancelGeneration}
        placeholder={tVideo('promptPlaceholder')}
        ariaLabel={tVideo('promptLabel')}
        className="w-full"
        addMenu={
          <VideoAddMenuItems
            acceptsRefs={composer.acceptsRefs}
            canvasCandidates={composer.canvasCandidates}
            onPickSlotSource={composer.railProps.onPickFromCanvas}
            onUpload={() =>
              composer.acceptsRefs
                ? composer.openReferenceFilePicker()
                : composer.openFilePicker(null)
            }
            onLibrary={() =>
              composer.acceptsRefs
                ? composer.railProps.onLibrary(VIDEO_RAIL_GROUP_IDS.image)
                : composer.openLibrary(null)
            }
          />
        }
        mentionOptions={composer.mentionOptions}
        renderValue={composer.renderPromptValue}
        chips={[composer.paramsChip, composer.modelChip]}
        {...(composer.audioToggle ? { trailing: composer.audioToggle } : {})}
      />
      {composer.overlays}
    </motion.div>
  )
}
