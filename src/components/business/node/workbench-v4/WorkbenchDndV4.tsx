'use client'

/**
 * v4 workbench 的**落物**：文件拖入 / 系统粘贴 / 素材库拖拽
 * （第三期 · 画布 C3c-③d-3「写好不接」）。
 *
 * ⛔ 生产调用方为 0 —— 接线在 ③d-4。
 *
 * ── 一条落法，三个入口 ──────────────────────────────────────────────────
 * 拖入 / 粘贴 / 素材库落的都是**同一件事**：建一个空节点 → 传媒体 → 回填。所以
 * 三个入口汇到 `dropFiles` 一条路径上，⛔ 不各写一份（v3 那边拖入和粘贴各建各的
 * 节点、各回填各的字段，于是「粘贴进来的图没有尺寸」这类差异只能靠对照代码发现）。
 *
 * ⚠ 回填走 `graph.setMedia`（不进撤销栈，见图引擎头注例外 ③）；**建节点**那一步
 * 走 op 表，所以撤销一次退掉的是「多了一张卡」，而不是「图没了但卡还在」。
 */

import { useCallback, useEffect, useRef } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

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

export interface WorkbenchDndV4Value {
  onDrop(event: React.DragEvent): void
  onDragOver(event: React.DragEvent): void
  /** 添加菜单「上传素材」走的也是这条路。 */
  dropFiles(files: readonly File[], screenPoint: { x: number; y: number }): void
  readonly isUploading: boolean
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

  const dropFiles = useCallback(
    (files: readonly File[], screenPoint: { x: number; y: number }) => {
      const accepted = files
        .map((file) => ({ file, plan: resolveDropKind(file) }))
        .filter(
          (
            entry,
          ): entry is { file: File; plan: NonNullable<typeof entry.plan> } =>
            entry.plan !== null,
        )
      if (accepted.length === 0) return

      const origin = latest.current.screenToFlowPosition(screenPoint)
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
      })
    },
    [],
  )

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length === 0) return
      event.preventDefault()
      dropFiles(files, { x: event.clientX, y: event.clientY })
    },
    [dropFiles],
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

  return { onDrop, onDragOver, dropFiles, isUploading: upload.isUploading }
}
