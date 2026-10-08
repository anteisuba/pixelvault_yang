'use client'

/**
 * 就地重拍栏（v2 第 4 片 4b · 关键切片「② 重拍」）。
 *
 * 就是画布视频卡那条提示词栏 —— 同一份编排件（`useVideoComposer`）、同一个
 * `NodePromptBar`：模型、参考、参数都是来源卡那一份，改了就是改那张卡。
 * - **贴着选中的段往上长**（换皮第二轮 ⑦ C · 样片 S）：横向以那一段为中（夹在舞台里），
 *   贴着走带行上沿；一块浅灰底从段的位置长成栏的大小（380ms 弹簧），栏里的东西随后由
 *   糊变清；收回时东西先糊掉，底再缩回那一段（240ms）淡掉；
 * - 发出去就收起，段上画生成中，可以接着剪；落版自动换上（`useEditDesk` 记账）；
 * - 失败：栏顶一行原因，段上黑虚线框 + 「!」，改一下提示词再发就是重试。
 *
 * ⚠ 花积分的永远是用户按下的这一下：助手 / MCP 不走这里。
 */

import { useEffect, useLayoutEffect, useRef } from 'react'
import {
  animate,
  motion,
  useMotionValue,
  usePresence,
  useReducedMotion,
  useTransform,
} from 'motion/react'
import { useTranslations } from 'next-intl'

import {
  EDIT_RETAKE_BAR,
  EDIT_RETAKE_MOTION,
  type EditTrackId,
} from '@/constants/edit-desk'
import { EASE_IN, LIQUID_TIMING } from '@/constants/motion'
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
  onHeightChange,
}: {
  readonly desk: EditDesk
  readonly row: EditTimelineRow
  readonly track: EditTrackId
  /** 栏量到的高（回执那一摞垫在它上面）；收起 = 0。 */
  onHeightChange?(heightPx: number): void
}) {
  const node = row.source.node
  if (!node || node.data.kind !== NODE_MEDIA_KIND_IDS.video) return null
  return (
    <RetakeBarBody
      desk={desk}
      row={row}
      track={track}
      node={node}
      onHeightChange={onHeightChange}
    />
  )
}

/** 段在屏幕上的框（栏从这里长出来、收回这里）。段不在 DOM 里 = `null`。 */
function clipRect(clipId: string): DOMRect | null {
  const el = document.querySelector(
    `[${EDIT_CLIP_FLASH_ATTRIBUTE}="${CSS.escape(clipId)}"]`,
  )
  return el ? el.getBoundingClientRect() : null
}

function RetakeBarBody({
  desk,
  row,
  track,
  node,
  onHeightChange,
}: {
  readonly desk: EditDesk
  readonly row: EditTimelineRow
  readonly track: EditTrackId
  readonly node: NodeV4
  onHeightChange?(heightPx: number): void
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
  /** 栏在舞台里的横向位置与宽（以段为中，夹在舞台里）。 */
  const left = useMotionValue(0)
  const width = useMotionValue<number>(EDIT_RETAKE_BAR.widthPx)
  /** 那块浅灰底（相对栏）：从段的框长成栏的框。 */
  const shellX = useMotionValue(0)
  const shellY = useMotionValue(0)
  const shellW = useMotionValue(0)
  const shellH = useMotionValue(0)
  const shellRadius = useMotionValue(0)
  const shellOpacity = useMotionValue(0)
  const contentOpacity = useMotionValue(1)
  const contentBlur = useMotionValue(0)
  const contentFilter = useTransform(contentBlur, (px) => `blur(${px}px)`)
  const [isPresent, safeToRemove] = usePresence()
  const isPresentRef = useRef(isPresent)

  /** 按舞台与段算栏的横向位置；返回栏此刻（按算好的位置）在屏幕上的框。 */
  const place = () => {
    const bar = barRef.current
    const stage = bar?.offsetParent?.getBoundingClientRect()
    if (!bar || !stage) return null
    const { widthPx, edgePx } = EDIT_RETAKE_BAR
    const w = Math.max(0, Math.min(widthPx, stage.width - edgePx * 2))
    const clip = clipRect(clipId)
    const centerX = clip
      ? clip.left + clip.width / 2 - stage.left
      : stage.width / 2
    const l = Math.min(
      Math.max(edgePx, centerX - w / 2),
      Math.max(edgePx, stage.width - w - edgePx),
    )
    left.set(l)
    width.set(w)
    const top = bar.getBoundingClientRect().top
    return { left: stage.left + l, top, width: w, height: bar.offsetHeight }
  }

  /** 段的框，换算成相对栏的坐标。 */
  const clipInBar = (bar: { left: number; top: number }) => {
    const clip = clipRect(clipId)
    if (!clip) return null
    return {
      x: clip.left - bar.left,
      y: clip.top - bar.top,
      w: clip.width,
      h: clip.height,
    }
  }

  useLayoutEffect(() => {
    const bar = place()
    const from = reduceMotion || !bar ? null : clipInBar(bar)
    if (!bar || !from) return
    const { rise, contentInDelayS } = EDIT_RETAKE_MOTION
    // 长到最后与提示词栏的圆角对齐（栏的圆角是画布域 token，量出来而不是再写一份）。
    const promptBar = barRef.current?.querySelector('.rounded-node')
    const radius = promptBar
      ? parseFloat(getComputedStyle(promptBar).borderTopLeftRadius) || 0
      : 0
    shellX.set(from.x)
    shellY.set(from.y)
    shellW.set(from.w)
    shellH.set(from.h)
    shellRadius.set(Math.min(from.h / 2, radius))
    shellOpacity.set(1)
    contentOpacity.set(0)
    contentBlur.set(LIQUID_TIMING.blurPx)
    const contentIn = {
      duration: LIQUID_TIMING.swapInS,
      delay: contentInDelayS,
    }
    const controls = [
      animate(shellX, 0, rise),
      animate(shellY, 0, rise),
      animate(shellW, bar.width, rise),
      animate(shellH, bar.height, rise),
      animate(shellRadius, radius, rise),
      animate(contentOpacity, 1, contentIn),
      animate(contentBlur, 0, contentIn),
    ]
    // 栏自己的白底接手之后，浅灰底退掉（⛔ 留一圈灰边从圆角里漏出来）。
    void Promise.all(controls).then(() => shellOpacity.set(0))
    return () => controls.forEach((control) => control.stop())
    // 只在升起那一刻量一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 窗口变了 / 助手开合挤窄了舞台：重新夹一次（不播动画）。
  useEffect(() => {
    const stage = barRef.current?.offsetParent
    if (!stage) return undefined
    const observer = new ResizeObserver(() => {
      if (isPresentRef.current) place()
    })
    observer.observe(stage)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 回执那一摞垫在栏上面：报栏的高。
  useEffect(() => {
    const bar = barRef.current
    if (!bar || !onHeightChange) return undefined
    const observer = new ResizeObserver(() => onHeightChange(bar.offsetHeight))
    observer.observe(bar)
    return () => {
      observer.disconnect()
      onHeightChange(0)
    }
  }, [onHeightChange])

  useEffect(() => {
    isPresentRef.current = isPresent
    if (isPresent) return
    onHeightChange?.(0)
    const box = barRef.current?.getBoundingClientRect()
    const to = reduceMotion || !box ? null : clipInBar(box)
    const { contentOutS, closeS, shellFadeS } = EDIT_RETAKE_MOTION
    const contentOut = { duration: reduceMotion ? 0 : contentOutS }
    const shrink = { duration: closeS, ease: EASE_IN, delay: contentOutS }
    shellX.set(0)
    shellY.set(0)
    shellW.set(box?.width ?? 0)
    shellH.set(box?.height ?? 0)
    shellOpacity.set(to ? 1 : 0)
    const controls = [
      animate(contentOpacity, 0, contentOut),
      animate(contentBlur, LIQUID_TIMING.blurPx, contentOut),
      ...(to
        ? [
            animate(shellX, to.x, shrink),
            animate(shellY, to.y, shrink),
            animate(shellW, to.w, shrink),
            animate(shellH, to.h, shrink),
            animate(shellRadius, Math.min(to.h / 2, shellRadius.get()), shrink),
            animate(shellOpacity, 0, {
              duration: shellFadeS,
              delay: contentOutS + closeS,
            }),
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
      style={{ left, width, bottom: EDIT_RETAKE_BAR.bottomPx }}
      onPointerDown={(event) => event.stopPropagation()}
      className="absolute z-20"
    >
      <motion.div
        style={{ opacity: contentOpacity, filter: contentFilter }}
        className="relative z-10"
      >
        <NodePromptBar
          slotRow={
            failed && composer.failureMessage ? (
              <p
                role="alert"
                data-testid="edit-desk-retake-failed"
                className="mr-3.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs leading-5 text-foreground"
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
          {...(channelGate.blocked
            ? {
                blockedLabel: tPicker('pickChannel'),
                onBlockedClick: channelGate.requestPick,
              }
            : {})}
          generating={composer.generating}
          onCancel={composer.cancelGeneration}
          placeholder={
            row.source.url
              ? tVideo('promptPlaceholder')
              : tVideo('emptyPromptPlaceholder')
          }
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
      </motion.div>
      <motion.div
        aria-hidden
        style={{
          x: shellX,
          y: shellY,
          width: shellW,
          height: shellH,
          borderRadius: shellRadius,
          opacity: shellOpacity,
        }}
        className="pointer-events-none absolute top-0 left-0 bg-muted"
      />
      {composer.overlays}
    </motion.div>
  )
}
