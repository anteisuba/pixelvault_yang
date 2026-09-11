'use client'

/**
 * 视频卡的**参考轨绑定**（S6b 的那条路径：上传 / 素材库 / 画布上的卡 → 新建卡 +
 * 连槽 → 回填媒体）。
 *
 * ⚠ 为什么与 `use-video-composer` 分开：手机镜头带的**列表卡**上就有一条参考条
 * （画板 `MobileCanvas.dc.html`：44px 缩略横滑 + 末尾加号），一屏可能有几十张。
 * 整份编排件带着模型选择器（要跑一遍全模型分组）与参数弹层，摆进列表每张卡都
 * 算一遍。所以「轨」这一半单独拿出来：列表卡只要它，抽屉要整份。
 *
 * ⛔ 这一层不认识提示词、不认识模型、不发生成。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_SLOT_IDS, type NodeSlotId } from '@/constants/node-slots'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import { useNodeUploadV4 } from '@/hooks/node/use-node-upload-v4'
import {
  readVideoRail,
  VIDEO_RAIL_GROUP_IDS,
  type VideoRailEntry,
  type VideoRailGroupId,
} from '@/lib/video-node-rail'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type { NodeV4, NodeWorkflowModelSelection } from '@/types/node-workflow'

import { useNodeV4Canvas } from '../NodeV4Context'
import type { VideoRailPendingItem, VideoRefRailProps } from './VideoRefRail'
import { videoRailCapacity } from './video-node-model'

/** 「抽帧」与「+ 上传落槽」那一批里指代新建素材卡的别名。 */
export const ASSET_BATCH_REF = 'asset'

/**
 * 参考轨三组各自的 **kind 与落点**（画板 `VideoRefs.dc.html` 方向 A）。
 *
 * 图与视频同落 `reference`（图默认作参考，首 / 尾是它的角色，在轨上点图改），
 * 语音落 `voice`。⛔ 这不是合法性判据 —— 落不落得下仍由 `canConnect` 说。
 */
export const RAIL_GROUP_TARGETS: Readonly<
  Record<
    VideoRailGroupId,
    { readonly kind: 'image' | 'video' | 'audio'; readonly slot: NodeSlotId }
  >
> = {
  [VIDEO_RAIL_GROUP_IDS.image]: {
    kind: NODE_MEDIA_KIND_IDS.image,
    slot: NODE_SLOT_IDS.reference,
  },
  [VIDEO_RAIL_GROUP_IDS.video]: {
    kind: NODE_MEDIA_KIND_IDS.video,
    slot: NODE_SLOT_IDS.reference,
  },
  [VIDEO_RAIL_GROUP_IDS.voice]: {
    kind: NODE_MEDIA_KIND_IDS.audio,
    slot: NODE_SLOT_IDS.voice,
  },
}

/** 上传 / 素材库落进轨时新建的那张卡是什么子型。 */
const RAIL_SUBTYPE_OF: Readonly<Record<'image' | 'video' | 'audio', string>> = {
  [NODE_MEDIA_KIND_IDS.image]: NODE_V4_IMAGE_SUBTYPE_IDS.shot,
  [NODE_MEDIA_KIND_IDS.video]: NODE_V4_VIDEO_SUBTYPE_IDS.clip,
  [NODE_MEDIA_KIND_IDS.audio]: 'voice',
}

export interface VideoRailBindingOptions {
  readonly id: string
  /** 卡上显示的名字 —— 上传时当备注写。 */
  readonly displayName: string
  /** 这张卡生效的模型（决定每组上限与「有没有参考变体」）。 */
  readonly model: NodeWorkflowModelSelection | undefined
  /** 生成中：轨整条禁用。 */
  readonly disabled?: boolean
}

export interface VideoRailBinding {
  readonly node: NodeV4 | undefined
  readonly items: readonly VideoRailEntry[]
  /** 参考轨的整份 props —— 桌面栏、画中框、手机抽屉摆的是同一个组件。 */
  readonly railProps: Omit<VideoRefRailProps, 'className'>
  readonly capacity: ReturnType<typeof videoRailCapacity>
  candidatesOf(group: VideoRailGroupId): readonly { id: string; name: string }[]
  /** 上传：`null` 组 = 换这张卡自己的成片。 */
  runUpload(file: File, group: VideoRailGroupId | null): void
  openFilePicker(group: VideoRailGroupId | null): void
  /** 从系统相册 / 文件选一份落进某一组（手机端参考条的加号走它）。 */
  readonly selfUploading: boolean
  readonly uploadProgress: number
  /** 一批 op 之后的媒体回填（抽帧 / 续拍 / 素材库共用一条写入通道）。 */
  backfillMedia(nodeId: string, patch: { readonly url: string }): void
  /** 隐藏的 file input 与素材库对话框 —— 调用方必须把它渲染出来。 */
  readonly overlays: ReactNode
}

export function useVideoRailBinding({
  id,
  displayName,
  model,
  disabled = false,
}: VideoRailBindingOptions): VideoRailBinding {
  const tVideo = useTranslations('StudioNode.v4.video')
  const canvas = useNodeV4Canvas()
  const upload = useNodeUploadV4()

  /** 素材库开在哪一组（`null` = 没开）。 */
  const [assetPicker, setAssetPicker] = useState<VideoRailGroupId | null>(null)
  /**
   * 正在上传、还没落成卡的那几格。⚠ 只有**这一条**在跑的那一格有真实进度
   * （`useNodeUploadV4` 是单飞的），⛔ 不给排队的格子编一个假进度。
   */
  const [pendingUploads, setPendingUploads] = useState<
    readonly {
      readonly id: string
      readonly group: VideoRailGroupId
      readonly name: string
      readonly file: File
      readonly error?: string | null
    }[]
  >([])
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null)
  const [selfUploading, setSelfUploading] = useState(false)
  /** `+` / 轨上加号的「上传」要落到哪一组；`null` = 落到这张卡自己（成片）。 */
  const pendingTargetRef = useRef<VideoRailGroupId | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ⚠ 走「最新值 ref」而不是把依赖列进 `useCallback`：`useNodeUploadV4()` 每次渲染
  // 都返回一个新对象，列进去等于每渲染一次就把回调拆装一遍。
  const latest = useRef({ upload, canvas, id, name: displayName })
  useEffect(() => {
    latest.current = { upload, canvas, id, name: displayName }
  })

  /**
   * 一批 op **之后**的媒体回填。
   *
   * ⚠ 必须用**批之后**那份 `canvas`：`onSetMedia` 闭包着调用时的图，拿批之前那
   * 份写回去，等于把刚建出来的卡与边一起抹掉（2026-09-10 真机实测：素材库落卡
   * 后节点凭空消失）。
   */
  const backfillMedia = useCallback(
    (nodeId: string, patch: { readonly url: string }) => {
      const step = (attempt: number): void => {
        const fresh = latest.current.canvas
        if (fresh.nodes.some((item) => item.id === nodeId) || attempt >= 10) {
          fresh.onSetMedia(nodeId, patch)
          return
        }
        requestAnimationFrame(() => step(attempt + 1))
      }
      step(0)
    },
    [],
  )

  /**
   * 新建一张卡挂进轨的某一组 —— **上传与素材库共用这一条**（S6b）。手机端参考条
   * 的加号走的也是它。
   */
  const attachToRail = useCallback(
    async (group: VideoRailGroupId, patch: { readonly url: string }) => {
      const bound = latest.current
      const target = RAIL_GROUP_TARGETS[group]
      const outcome = await bound.canvas.onApplyBatch([
        {
          op: NODE_ASSISTANT_OP_V4_IDS.addNode,
          kind: target.kind,
          subtype: RAIL_SUBTYPE_OF[target.kind],
          ref: ASSET_BATCH_REF,
        },
        {
          op: NODE_ASSISTANT_OP_V4_IDS.connect,
          source: ASSET_BATCH_REF,
          target: bound.id,
          slot: target.slot,
        },
      ] as readonly NodeAssistantOpV4[])
      const created = outcome?.createdNodeIds?.[0]
      if (created) backfillMedia(created, patch)
    },
    [backfillMedia],
  )

  /**
   * 轨上那一格的上传本体 —— 新建占位项之后与「重试」共用这一条。
   * 成功 = 占位项换成真卡（`attachToRail`）；失败 = 占位项变红留在原位。
   */
  const startRailUpload = useCallback(
    (pendingId: string, group: VideoRailGroupId, file: File) => {
      const bound = latest.current
      setActiveUploadId(pendingId)
      setPendingUploads((list) =>
        list.map((item) =>
          item.id === pendingId ? { ...item, error: null } : item,
        ),
      )
      void bound.upload
        .upload(RAIL_GROUP_TARGETS[group].kind, file, bound.name)
        .then((patch) => {
          setActiveUploadId((current) =>
            current === pendingId ? null : current,
          )
          if (!patch?.url) {
            setPendingUploads((list) =>
              list.map((item) =>
                item.id === pendingId
                  ? {
                      ...item,
                      error: tVideo('rail.uploadFailed', { name: item.name }),
                    }
                  : item,
              ),
            )
            return
          }
          setPendingUploads((list) =>
            list.filter((item) => item.id !== pendingId),
          )
          void attachToRail(group, { ...patch, url: patch.url })
        })
    },
    [attachToRail, tVideo],
  )

  const runUpload = useCallback(
    (file: File, group: VideoRailGroupId | null) => {
      const bound = latest.current
      if (!group) {
        setSelfUploading(true)
        void bound.upload
          .upload(NODE_MEDIA_KIND_IDS.video, file, bound.name)
          .then((patch) => {
            setSelfUploading(false)
            if (patch?.url) bound.canvas.onSetMedia(bound.id, patch)
          })
        return
      }
      const pendingId = `${Date.now()}-${file.name}`
      setPendingUploads((list) => [
        ...list,
        { id: pendingId, group, name: file.name, file },
      ])
      startRailUpload(pendingId, group, file)
    },
    [startRailUpload],
  )

  const openFilePicker = useCallback((group: VideoRailGroupId | null) => {
    pendingTargetRef.current = group
    fileRef.current?.click()
  }, [])

  const node = canvas.nodes.find((item) => item.id === id) as NodeV4 | undefined
  const items = node ? readVideoRail(node, canvas.edges, canvas.nodes) : []
  const capacity = videoRailCapacity(model)

  /** 「画布上的 X ›」的候选。⚠ 只列**有产物**的卡。 */
  const candidatesOf = (group: VideoRailGroupId) => {
    const kind = RAIL_GROUP_TARGETS[group].kind
    return canvas.nodes
      .filter(
        (item) =>
          item.id !== id &&
          item.data.kind === kind &&
          'url' in item.data &&
          Boolean(item.data.url),
      )
      .map((item) => ({ id: item.id, name: item.data.name }))
  }

  const pending: readonly VideoRailPendingItem[] = pendingUploads.map(
    (item) => ({
      id: item.id,
      group: item.group,
      name: item.name,
      progress: item.id === activeUploadId ? upload.progress : 0,
      ...(item.error ? { error: item.error } : {}),
    }),
  )

  const railProps: Omit<VideoRefRailProps, 'className'> = {
    items,
    pending,
    capacity,
    referenceUnavailable: capacity.referenceUnavailable,
    disabled,
    onOpen: canvas.onFocusNode,
    onRemove: (edgeId: string) =>
      void canvas.onApplyOp({
        op: NODE_ASSISTANT_OP_V4_IDS.disconnect,
        edgeId,
      }),
    // 换角色 = 同一批 `disconnect + connect(slot)` —— **一条撤销**（⛔ 不发两个
    // op：那会让用户按两次 ⌘Z 才回到原样，中间还路过一个断开态）。
    onChangeRole: (item: VideoRailEntry, slot: NodeSlotId) =>
      void canvas.onApplyBatch([
        { op: NODE_ASSISTANT_OP_V4_IDS.disconnect, edgeId: item.edgeId },
        {
          op: NODE_ASSISTANT_OP_V4_IDS.connect,
          source: item.sourceNodeId,
          target: id,
          slot,
        },
      ] as readonly NodeAssistantOpV4[]),
    candidatesOf,
    onPickFromCanvas: (group: VideoRailGroupId, sourceNodeId: string) =>
      void canvas.onApplyOp({
        op: NODE_ASSISTANT_OP_V4_IDS.connect,
        source: sourceNodeId,
        target: id,
        slot: RAIL_GROUP_TARGETS[group].slot,
      }),
    onUpload: (group: VideoRailGroupId) => openFilePicker(group),
    // ⚠ 弹层要等菜单**关完**再开：Radix 的菜单与对话框各自往 `body` 上写
    // `pointer-events:none`，同一帧里一开一关会把它留在 body 上，整页从此点不动。
    onLibrary: (group: VideoRailGroupId) =>
      window.setTimeout(() => setAssetPicker(group), 0),
    onRetryPending: (pendingId: string) => {
      const item = pendingUploads.find((entry) => entry.id === pendingId)
      if (item) startRailUpload(item.id, item.group, item.file)
    },
    onRemovePending: (pendingId: string) =>
      setPendingUploads((list) => list.filter((item) => item.id !== pendingId)),
  }

  const overlays = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="video/*,image/*,audio/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) runUpload(file, pendingTargetRef.current)
          pendingTargetRef.current = null
          event.target.value = ''
        }}
      />
      {assetPicker ? (
        <AssetSelectorDialog
          open
          onOpenChange={(next) => {
            if (!next) setAssetPicker(null)
          }}
          mediaType={RAIL_GROUP_TARGETS[assetPicker].kind}
          title={tVideo('add.library')}
          description={tVideo('add.library')}
          onSelect={(record) => {
            // 素材库与上传落的是**同一条**创建路径。
            if (record.url) void attachToRail(assetPicker, { url: record.url })
            setAssetPicker(null)
          }}
        />
      ) : null}
    </>
  )

  return {
    node,
    items,
    railProps,
    capacity,
    candidatesOf,
    runUpload,
    openFilePicker,
    selfUploading,
    uploadProgress: upload.progress,
    backfillMedia,
    overlays,
  }
}
