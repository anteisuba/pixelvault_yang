'use client'

/**
 * v4 workbench 的**落物**：文件拖入 / 系统粘贴 / 素材库拖拽
 * （第三期 · 画布）。
 *
 * ── 一条落法，三个入口 ──────────────────────────────────────────────────
 * 拖入 / 粘贴 / 素材库落的都是**同一件事**：建一个空节点 → 传媒体 → 回填。所以
 * 三个入口汇到 `dropFiles` 一条路径上，⛔ 不各写一份（v3 那边拖入和粘贴各建各的
 * 节点、各回填各的字段，于是「粘贴进来的图没有尺寸」这类差异只能靠对照代码发现）。
 *
 * ⚠ 回填走 `graph.setMedia`（不进撤销栈，见图引擎头注例外 ③）；**建节点**那一步
 * 走 op 表，所以撤销一次退掉的是「多了一张卡」，而不是「图没了但卡还在」。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useReactFlow } from '@xyflow/react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { CANVAS_SHELL_MEDIA_DRAG_MIME } from '@/constants/canvas-shell'
import { NODE_STUDIO_NODE_PLACEMENT } from '@/constants/node-studio'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_AUDIO_SUBTYPE_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import {
  useNodeUploadV4,
  type NodeV4UploadKind,
} from '@/hooks/node/use-node-upload-v4'
import type { NodeGraphV4 } from '@/hooks/node/use-node-graph-v4'
import type { NodeV4Data } from '@/types/node-workflow'

/** 一个文件落成哪种节点。⚠ 判据是 MIME 大类，⛔ 不按扩展名猜。 */
function resolveDropKind(file: File): {
  readonly upload: NodeV4UploadKind
  readonly kind: NodeV4Data['kind']
  readonly subtype: NodeV4Data['subtype']
} | null {
  if (file.type.startsWith('image/')) {
    return {
      upload: 'image',
      kind: NODE_MEDIA_KIND_IDS.image,
      subtype: NODE_V4_IMAGE_SUBTYPE_IDS.result,
    }
  }
  if (file.type.startsWith('video/')) {
    return {
      upload: 'video',
      kind: NODE_MEDIA_KIND_IDS.video,
      subtype: NODE_V4_VIDEO_SUBTYPE_IDS.clip,
    }
  }
  if (file.type.startsWith('audio/')) {
    return {
      upload: 'audio',
      kind: NODE_MEDIA_KIND_IDS.audio,
      subtype: NODE_V4_AUDIO_SUBTYPE_IDS.voice,
    }
  }
  return null
}

/**
 * 左侧面板（角色卡 / 素材库 / 历史）拖进画布的那一份载荷。媒体已经在 R2 上，
 * 落法因此是「建节点 + `setMedia`」，⛔ 不再走一次上传。
 */
export interface ShellMediaDragPayload {
  readonly kind: NodeV4Data['kind']
  readonly subtype: NodeV4Data['subtype']
  readonly url: string
  readonly name?: string
  /**
   * 素材的真实像素。⚠ 带上它卡才知道自己多高 —— 不带的话 `collapsedImageHeight`
   * 退回 16:9，一张竖图落进画布会被 `object-cover` 裁成横的（owner 2026-09-12
   * 真机实测 720×1280 落成 640×408）。
   */
  readonly width?: number
  readonly height?: number
}

/** 读拖投载荷。形状不对就当没有 —— ⛔ 不为一条坏 JSON 建一张空卡。 */
function readShellMediaPayload(
  event: React.DragEvent,
): ShellMediaDragPayload | null {
  const raw = event.dataTransfer?.getData(CANVAS_SHELL_MEDIA_DRAG_MIME)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const candidate = parsed as Record<string, unknown>
    if (
      typeof candidate.kind !== 'string' ||
      typeof candidate.subtype !== 'string' ||
      typeof candidate.url !== 'string' ||
      candidate.url.length === 0
    ) {
      return null
    }
    return {
      kind: candidate.kind as NodeV4Data['kind'],
      subtype: candidate.subtype as NodeV4Data['subtype'],
      url: candidate.url,
      ...(typeof candidate.name === 'string' ? { name: candidate.name } : {}),
      ...(typeof candidate.width === 'number'
        ? { width: candidate.width }
        : {}),
      ...(typeof candidate.height === 'number'
        ? { height: candidate.height }
        : {}),
    }
  } catch {
    return null
  }
}

export interface WorkbenchDndV4Value {
  onDrop(event: React.DragEvent): void
  onDragOver(event: React.DragEvent): void
  /** 添加菜单「上传素材」走的也是这条路。 */
  dropFiles(files: readonly File[], screenPoint: { x: number; y: number }): void
  /**
   * 直接给**画布坐标**的落法。⚠ 存在理由：手机镜头带视图里 ReactFlow 根本没挂载，
   * `screenToFlowPosition` 没有视口可换算 —— 但落卡这件事本身一模一样，所以只把
   * 「屏幕 → 画布」那一步让出来，⛔ 不为手机另写一条上传落卡的路径。
   */
  dropFilesAtFlow(
    files: readonly File[],
    flowPoint: { x: number; y: number },
  ): void
  /**
   * 已经在 R2 上的一份素材，落到给定的**画布坐标**。
   *
   * ⚠ 存在理由：左侧面板里**点一下**也要能落卡 —— HTML5 拖放在触屏上根本不发
   * `dragstart`，而在桌面上从缩略图起手又常被浏览器接管成「拖一张图片」。落卡
   * 这件事与拖投完全一样，所以只把「怎么触发」让出来，⛔ 不另写一条落卡路径。
   */
  placeMediaAtFlow(
    payload: ShellMediaDragPayload,
    flowPoint: { x: number; y: number },
  ): void
  readonly isUploading: boolean
  readonly pendingUploads: readonly { id: string; name: string }[]
}

export interface UseWorkbenchDndV4Options {
  readonly graph: NodeGraphV4
  /** 重浮层开着时不接管粘贴（用户是在往输入框里粘）。 */
  readonly pasteEnabled: boolean
}

export function useWorkbenchDndV4({
  graph,
  pasteEnabled,
}: UseWorkbenchDndV4Options): WorkbenchDndV4Value {
  const t = useTranslations('StudioNode.ingest.looseImage')
  const { screenToFlowPosition } = useReactFlow()
  const upload = useNodeUploadV4()
  const [pendingUploads, setPendingUploads] = useState<
    { id: string; name: string }[]
  >([])

  /**
   * 粘贴的落点 = 鼠标当前位置。⚠ paste 事件**不带坐标**，只能自己跟一份 —— 与 v3
   * workbench 同一条（那边也是 `onMouseMove` 记一笔）。
   */
  const pointerRef = useRef({ x: 0, y: 0 })
  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY }
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  const latest = useRef({ graph, upload, screenToFlowPosition, t })
  useEffect(() => {
    latest.current = { graph, upload, screenToFlowPosition, t }
  }, [graph, upload, screenToFlowPosition, t])

  const dropFilesAtFlow = useCallback(
    (files: readonly File[], origin: { x: number; y: number }) => {
      const accepted = files
        .map((file) => ({ file, plan: resolveDropKind(file) }))
        .filter(
          (
            entry,
          ): entry is { file: File; plan: NonNullable<typeof entry.plan> } =>
            entry.plan !== null,
        )
      if (accepted.length === 0) return

      accepted.forEach((entry, index) => {
        // 多个文件错位铺开，⛔ 不叠在同一个坐标上（叠着的卡看起来只有一张）。
        // 步进复用顶栏 ＋ 那一份（`topbarAddStep`），⛔ 不为落物再定一个数。
        const position = {
          x: origin.x + index * NODE_STUDIO_NODE_PLACEMENT.topbarAddStep.x,
          y: origin.y + index * NODE_STUDIO_NODE_PLACEMENT.topbarAddStep.y,
        }
        const nodeId = latest.current.graph.addNode(
          entry.plan.kind,
          entry.plan.subtype,
          { position },
        )
        if (!nodeId) return
        setPendingUploads((items) => [
          ...items,
          { id: nodeId, name: entry.file.name },
        ])
        void latest.current.upload
          .upload(entry.plan.upload, entry.file, entry.file.name)
          .then((patch) => {
            // 传不上来就把那张空卡留着 + 出声：静默删掉用户刚看见的卡比失败更吓人。
            if (!patch) {
              toast.error(latest.current.t('uploadFailed'))
              return
            }
            latest.current.graph.setMedia(nodeId, patch)
          })
          .finally(() => {
            setPendingUploads((items) =>
              items.filter((item) => item.id !== nodeId),
            )
          })
      })
    },
    [],
  )

  const dropFiles = useCallback(
    (files: readonly File[], screenPoint: { x: number; y: number }) =>
      dropFilesAtFlow(files, latest.current.screenToFlowPosition(screenPoint)),
    [dropFilesAtFlow],
  )

  const placeMediaAtFlow = useCallback(
    (
      payload: ShellMediaDragPayload,
      position: { x: number; y: number },
    ): void => {
      const nodeId = latest.current.graph.addNode(
        payload.kind,
        payload.subtype,
        { position },
      )
      if (!nodeId) return
      /**
       * ⚠ 回填必须用**建卡之后**那份图：`setMedia` 闭包着调用时的图，同一 tick 拿
       * 建卡之前那份写回去，等于把刚建出来的卡一起抹掉 —— 卡片闪都不闪一下，看起来
       * 就是「素材放不进画布」（owner 2026-09-12 真机，两条路都中招）。
       *
       * 与 `use-video-rail-binding.backfillMedia` 同一条等法（等新卡出现在图上，
       * 最多等 10 帧），⛔ 不另发明第二种。
       */
      const backfill = (attempt: number): void => {
        const fresh = latest.current.graph
        if (fresh.nodes.some((item) => item.id === nodeId) || attempt >= 10) {
          fresh.setMedia(nodeId, {
            url: payload.url,
            ...(payload.width && payload.height
              ? { mediaWidth: payload.width, mediaHeight: payload.height }
              : {}),
          })
          return
        }
        requestAnimationFrame(() => backfill(attempt + 1))
      }
      backfill(0)
    },
    [],
  )

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      const payload = readShellMediaPayload(event)
      if (payload) {
        event.preventDefault()
        placeMediaAtFlow(
          payload,
          latest.current.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          }),
        )
        return
      }
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length === 0) return
      event.preventDefault()
      dropFiles(files, { x: event.clientX, y: event.clientY })
    },
    [dropFiles, placeMediaAtFlow],
  )

  useEffect(() => {
    if (!pasteEnabled) return
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? [])
      if (files.length === 0) return
      event.preventDefault()
      dropFiles(files, pointerRef.current)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [pasteEnabled, dropFiles])

  return {
    onDrop,
    onDragOver,
    dropFiles,
    dropFilesAtFlow,
    placeMediaAtFlow,
    isUploading: pendingUploads.length > 0,
    pendingUploads,
  }
}

export function WorkbenchUploadStatus({
  items,
}: {
  readonly items: WorkbenchDndV4Value['pendingUploads']
}) {
  const t = useTranslations('StudioNode.v4.video.rail')
  if (items.length === 0) return null
  return (
    <div
      role="status"
      aria-live="polite"
      data-canvas-upload-status
      className="pointer-events-none fixed bottom-20 left-1/2 z-50 flex w-72 max-w-full -translate-x-1/2 flex-col gap-2 rounded-xl border bg-popover p-3 text-sm text-popover-foreground shadow-lg"
    >
      {items.map((item) => (
        <div key={item.id} className="flex min-w-0 items-center gap-2">
          <Loader2
            aria-hidden
            className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
          />
          <span className="truncate">
            {t('uploading', { name: item.name })}
          </span>
        </div>
      ))}
    </div>
  )
}
