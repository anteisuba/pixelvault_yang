'use client'

/**
 * 视频节点 = **镜头**（node-canvas-v2 §1.3 / §2.2）。
 *
 * 展开态是**固定版式**：上排文本槽摘要，下排 首帧 / 尾帧 / 参考（多）/ 语音 四槽卡。
 * 收起态 = 缩略图 + 稳定名 + 状态点（槽格在左缘那一列）。
 *
 * ⛔ 槽的顺序不在这里重写一遍——它是 `NODE_V4_PORTS['video.shot'].inputs` 的数组
 * 顺序（§6：画布上「左边这一摞的顺序」= 「槽的顺序」，两处不许各排各的）。
 */

import type { NodeProps } from '@xyflow/react'
import { useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'

import {
  getNodeV4Ports,
  NODE_SLOT_IDS,
  NODE_SLOT_TEXT_ROLE_FALLBACK,
} from '@/constants/node-slots'
import { NODE_V4_VIDEO_SUBTYPE_IDS } from '@/constants/node-types'
import { NODE_V4_CARD } from '@/constants/node-studio'
import { Button } from '@/components/ui/button'
import { useNodeUploadV4 } from '@/hooks/node/use-node-upload-v4'
import { formatShotDisplayName } from '@/lib/node-display-name'
import type { NodeV4, NodeV4VideoData } from '@/types/node-workflow'

import { useNodeV4Canvas } from './NodeV4Context'
import { NodeV4GenerateDesk } from './NodeV4GenerateDesk'
import { NodeV4SlotCard } from './NodeV4SlotCard'
import { NodeV4Shell, NodeV4Thumbnail } from './NodeV4Shell'
import { VideoNodeV4Merge } from './VideoNodeV4Merge'
import { VideoNodeV4Player } from './VideoNodeV4Player'

/** `data:` → `File`，供抓到的帧走与手动上传**同一条**回填链。 */
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

export function VideoNodeV4({ id, data, selected }: NodeProps) {
  const t = useTranslations('StudioNode.v4')
  const canvas = useNodeV4Canvas()
  const videoData = data as unknown as NodeV4VideoData
  const upload = useNodeUploadV4()
  // 抓帧 → 上传 → 回填 `videoThumbnailUrl`：**与手动上传同一条链**（
  // `useNodeUploadV4` + `onSetMedia`），⛔ 不为封面另开一条写入通道。
  // 取中间那一帧（`index === 1`）：首帧常是黑场。
  const onCaptureFrames = useCallback(
    (frames: readonly { index: number; dataUrl: string }[]) => {
      const mid = frames.find((frame) => frame.index === 1) ?? frames[0]
      if (!mid) return
      const file = dataUrlToFile(mid.dataUrl, 'poster.webp')
      if (!file) return
      void upload.upload('image', file, 'poster').then((patch) => {
        if (patch?.url) canvas.onSetMedia(id, { videoThumbnailUrl: patch.url })
      })
    },
    [upload, canvas, id],
  )
  /**
   * 片段节点的**上传 / 替换**（盘点 §1 `VideoReferenceNode`(348) / §2
   * `VideoReferenceDetailBody`(193)）。
   *
   * ⚠ 与封面那条**各用一个钩子实例**：`retry()` 重放的是「上一次失败的那个
   * File」，两条路共用一份就会出现「点重试上传封面，结果重传了整段视频」。
   */
  const clipUpload = useNodeUploadV4()
  const clipFileRef = useRef<HTMLInputElement>(null)
  const runClipUpload = useCallback(
    async (file: File) => {
      const patch = await clipUpload.upload('video', file, videoData.name)
      if (patch) canvas.onSetMedia(id, patch)
    },
    [clipUpload, canvas, id, videoData.name],
  )
  const retryClipUpload = useCallback(async () => {
    const patch = await clipUpload.retry()
    if (patch) canvas.onSetMedia(id, patch)
  }, [clipUpload, canvas, id])
  const retryPoster = useCallback(async () => {
    const patch = await upload.retry()
    if (patch?.url) canvas.onSetMedia(id, { videoThumbnailUrl: patch.url })
  }, [upload, canvas, id])
  const node = canvas.nodes.find((item) => item.id === id) as NodeV4 | undefined
  if (!node) return null

  // `label` 只在 `subtype === 'shot'` 上必填（`NodeV4VideoDataSchema` 是按 subtype
  // 的 discriminatedUnion），所以读它之前先收窄，⛔ 不用 `?.` 糊过去。
  // 显示串 = `S02·有人还在`，**渲染时才拼**：落库的是 `label` 与 `shotNo` 两个字段。
  const displayName =
    videoData.subtype === NODE_V4_VIDEO_SUBTYPE_IDS.shot
      ? formatShotDisplayName(videoData.label, videoData.shotNo)
      : videoData.name

  const expanded = canvas.expandedNodeId === id
  const ports = getNodeV4Ports(node.data.kind, node.data.subtype)
  const mediaSlots = (ports?.inputs ?? []).filter(
    (spec) => spec.slot !== NODE_SLOT_IDS.text,
  )
  const textBinding = node.data.slots?.[NODE_SLOT_IDS.text]
  // 未生成时缩略取首帧槽（§1.2 缩略图来源）。
  const firstFrameSourceId = node.data.slots?.firstFrame?.versions.find(
    (version) => version.id === node.data.slots?.firstFrame?.cur,
  )?.sourceNodeId
  const firstFrameSource = canvas.nodes.find(
    (item) => item.id === firstFrameSourceId,
  )
  // poster 三级：落库的封面 → 成片本身 → 首帧槽的源图（§1.2 缩略图来源）。
  // ⚠ `videoThumbnailUrl` 排第一：它就是为「有视频但还没解码出画面」这一刻存的。
  const posterUrl =
    videoData.videoThumbnailUrl ??
    videoData.url ??
    (firstFrameSource?.data.kind === 'image'
      ? firstFrameSource.data.url
      : undefined)
  const isMerge = videoData.subtype === NODE_V4_VIDEO_SUBTYPE_IDS.merge
  const isClip = videoData.subtype === NODE_V4_VIDEO_SUBTYPE_IDS.clip

  return (
    <NodeV4Shell
      node={node}
      selected={selected}
      width={
        expanded ? NODE_V4_CARD.expandedWidth : NODE_V4_CARD.shotCollapsedWidth
      }
      title={displayName}
      slotRail={
        expanded ? undefined : (
          <div className="flex flex-col gap-1">
            {(ports?.inputs ?? []).map((spec) => (
              <NodeV4SlotCard
                key={spec.slot}
                nodeId={node.id}
                slot={spec.slot}
                binding={node.data.slots?.[spec.slot]}
              />
            ))}
          </div>
        )
      }
      collapsedBody={
        <NodeV4Thumbnail
          url={posterUrl}
          alt={displayName}
          kind={
            videoData.url && !videoData.videoThumbnailUrl ? 'video' : 'image'
          }
        />
      }
      expandedBody={
        <div className="flex flex-col gap-5" data-shot-layout>
          {/* 播放面（媒体永远排第一：展开第一眼要看到产物本身）。v4 展开态此前是
              裸 `<video muted>`，一个控件都没有（盘点 §1 `NodeVideoSurface`）。 */}
          <VideoNodeV4Player
            url={videoData.url}
            posterUrl={posterUrl}
            title={displayName}
            onCaptureFrames={onCaptureFrames}
          />
          {/* 文本槽摘要 */}
          <div
            data-shot-row="text"
            className="rounded-xl bg-surface-fill p-3 text-2sm corner-squircle"
          >
            <span className="text-muted-foreground">
              {t('slots.text')}
              {' · '}
            </span>
            {textBinding && textBinding.versions.length > 0
              ? textBinding.versions.map((version, index) => {
                  const role = version.role ?? NODE_SLOT_TEXT_ROLE_FALLBACK
                  return (
                    <span key={version.id} data-text-role={role}>
                      {index > 0 ? ' / ' : null}
                      {canvas.nodes.find(
                        (item) => item.id === version.sourceNodeId,
                      )?.data.name ?? version.sourceNodeId}
                      {/* 角色小标：同一个槽里剧本 / 风格 / 角色三档去向不同，
                          不标出来就分不清哪段会被当画面描述念出来。 */}
                      <span className="ml-1 rounded-full bg-surface-fill-hover px-1.5 py-0.5 text-3xs">
                        {t(`textRoles.${role}`)}
                      </span>
                    </span>
                  )
                })
              : t('slotEmpty')}
          </div>
          {/* 槽轨：首帧 / 尾帧 / 参考 / 语音。480 内一屏 4 格整齐、第 5 格露
              24px —— 露出的那 24px 本身就是「还有」的提示。 */}
          <div
            data-shot-row="media"
            data-slot-rail="horizontal"
            style={{ gap: NODE_V4_CARD.slotCardGap }}
            className="nowheel flex snap-x snap-proximity overflow-x-auto pb-1"
          >
            {mediaSlots.map((spec) => (
              <NodeV4SlotCard
                key={spec.slot}
                nodeId={node.id}
                slot={spec.slot}
                binding={node.data.slots?.[spec.slot]}
                layout="horizontal"
              />
            ))}
          </div>
          {/* 抓帧本身失败有自己的文案（`VideoAnalysis.captureReason.*`）；这里说的是
              **抓到了但传不上去**。重试重放同一个 File（`useNodeUploadV4.retry`），
              ⛔ 不让用户再抓一次帧。 */}
          {upload.error ? (
            <div data-poster-upload-failed className="space-y-1">
              <p className="text-3xs text-destructive">
                {t('player.posterFailed', { reason: upload.error })}
              </p>
              {upload.canRetry ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-poster-retry
                  disabled={upload.isUploading}
                  onClick={() => void retryPoster()}
                >
                  {t('player.posterRetry')}
                </Button>
              ) : null}
            </div>
          ) : null}
          {/* 片段节点：上传 / 替换。⚠ 只有 `clip` 子型有 —— 镜头的成片来自生成，
              合并的成片来自合并，两者都不该摆一颗「传一个上来」。 */}
          {isClip ? (
            <div className="space-y-1">
              <input
                ref={clipFileRef}
                type="file"
                accept="video/*"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void runClipUpload(file)
                  event.target.value = ''
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-clip-upload
                disabled={clipUpload.isUploading}
                onClick={() => clipFileRef.current?.click()}
              >
                {clipUpload.isUploading
                  ? t('player.uploadingVideo')
                  : videoData.url
                    ? t('player.replaceVideo')
                    : t('player.uploadVideo')}
              </Button>
              {clipUpload.error ? (
                <div data-clip-upload-failed className="space-y-1">
                  <p className="text-3xs text-destructive">
                    {t('player.videoUploadFailed', {
                      reason: clipUpload.error,
                    })}
                  </p>
                  {clipUpload.canRetry ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      data-clip-upload-retry
                      onClick={() => void retryClipUpload()}
                    >
                      {t('player.videoUploadRetry')}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {/* 合并节点：九槽阵列 + 逐段裁剪。⚠ 只有 `merge` 子型有，⛔ 不给镜头
              卡摆一块它用不上的面板。 */}
          {isMerge ? <VideoNodeV4Merge node={node} /> : null}
          {/* 生成编排区：镜头的模型 / 参数 / 提示词 / 槽架 / 生成按钮。⚠ 这一块
              取代 v3 里 `SeedanceNode` 的右侧侧车（内嵌整个 `VideoComposer`）——
              盘点的第一风险项「video.shot 的生成能力整块无落点」的落点。 */}
          <NodeV4GenerateDesk node={node} />
        </div>
      }
    />
  )
}
