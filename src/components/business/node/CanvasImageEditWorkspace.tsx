'use client'

import { useCallback, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

import { ImageEditSurface } from '@/components/business/studio-shared/editor/ImageEditSurface'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import {
  NODE_GENERATION_STATUS_IDS,
  NODE_STATUS_IDS,
} from '@/constants/node-types'
import type {
  CanvasDerivedImageOutput,
  ReadyCanvasImageEditCapabilityId,
} from '@/types/canvas-image-edit'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

import { useNodeWorkflowActions } from './NodeWorkflowActionsContext'

/**
 * 画布侧的编辑宿主 —— 只负责三件事：**弹窗外壳**、把节点数据翻成源图、把结果
 * 落成派生节点。能力怎么跑、面板长什么样，全在共用躯干
 * `studio-shared/editor/ImageEditSurface` 里（工作台舞台共用同一份）。
 *
 * ⚠ 2026-08-19 拆分。拆之前这些逻辑和画布节点是长在一起的，工作台要用就只能
 * 复制一份 —— 那是 E5「画布对齐工作台」最不该留下的东西。
 */

interface CanvasImageEditWorkspaceProps {
  nodeId: string
  data: NodeWorkflowNodeData
  defaultTask?: ReadyCanvasImageEditCapabilityId
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function getSourceUrl(data: NodeWorkflowNodeData): string {
  if (typeof data.mediaUrl === 'string') return data.mediaUrl
  if (typeof data.imageUrl === 'string') return data.imageUrl
  return ''
}

function getDeclaredDimension(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined
}

export function CanvasImageEditWorkspace({
  nodeId,
  data,
  defaultTask = 'upscale',
  open,
  onOpenChange,
}: CanvasImageEditWorkspaceProps) {
  const t = useTranslations('StudioImageEdit')
  const tCommon = useTranslations('Common')
  const { placeDerivedImages, focusNode, updateNodeData } =
    useNodeWorkflowActions()
  const [uncontrolledOpen, setUncontrolledOpen] = useState(true)

  const dialogOpen = open ?? uncontrolledOpen
  const sourceUrl = useMemo(() => getSourceUrl(data), [data])
  const sourceGenerationId =
    typeof data.generationId === 'string'
      ? data.generationId
      : typeof data.sourceGenerationId === 'string'
        ? data.sourceGenerationId
        : undefined

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) setUncontrolledOpen(nextOpen)
      onOpenChange?.(nextOpen)
    },
    [onOpenChange, open],
  )

  // ⚠ 躯干还会传一个 `summary`（这一步做了什么）—— 那是工作台编辑历史用的，
  // 画布落派生节点用不上，这里故意不接。
  const placeOutputs = useCallback(
    (outputs: CanvasDerivedImageOutput[]): boolean => {
      const derivedNodeIds = placeDerivedImages?.(nodeId, outputs) ?? []
      if (derivedNodeIds.length === 0) return false

      focusNode?.(derivedNodeIds[0])
      return true
    },
    [focusNode, nodeId, placeDerivedImages],
  )

  // C2: 进度要长在源对象上，不只在弹窗里。⚠ 三态各写各的 —— 失败必须写成
  // failed，否则节点会在编辑失败后显示成功。
  const handleRunStateChange = useCallback(
    (state: 'running' | 'success' | 'error') => {
      updateNodeData(nodeId, {
        generationStatus:
          state === 'running'
            ? NODE_GENERATION_STATUS_IDS.pending
            : state === 'success'
              ? NODE_GENERATION_STATUS_IDS.success
              : NODE_GENERATION_STATUS_IDS.error,
        status:
          state === 'running'
            ? NODE_STATUS_IDS.running
            : state === 'success'
              ? NODE_STATUS_IDS.done
              : NODE_STATUS_IDS.failed,
      })
    },
    [nodeId, updateNodeData],
  )

  return (
    <ResponsiveDialog open={dialogOpen} onOpenChange={handleOpenChange}>
      <ResponsiveDialogContent
        closeLabel={tCommon('close')}
        // ⚠ 两个都是必须的，2026-08-18 真机量出来的：
        // ① `sm:max-w-none` —— `DialogContent` 基类尾巴是 `sm:max-w-lg`(32rem)，
        //    不带 `sm:` 前缀的 `max-w-none` 压不住它，于是 1920 的窗口上这个
        //    弹窗实际只有 512px 宽，右栏可用 262px：蒙版编辑器被挤到横向滚动、
        //    提示词输入框窄成一个字一行的竖条。
        // ② `flex flex-col` —— 基类是 `display: grid`，而正文写的是 flex
        //    语汇（`flex-1` / `min-h-0`）。grid 不认 `flex-1`，两行 auto 轨道被
        //    拉伸平分高度，标题条因此从 44px 涨到 149px。
        className="dark flex h-[min(760px,calc(100svh-2rem))] w-[min(1120px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden border-node-panel-inner bg-node-panel p-0 text-node-foreground shadow-node-panel sm:max-w-none"
        mobileBodyClassName="px-0 pt-0"
        // R3-4 §4.2 rule 4: 档3 重编辑工作区只认显式关闭（Esc / X / 取消按
        // 钮）——防止误触画布空白区把重绘进度点没了。
        preventOutsideDismiss
      >
        <ResponsiveDialogHeader className="min-h-11 justify-center border-b border-node-panel-inner px-4 py-2.5 text-left">
          <ResponsiveDialogTitle className="text-sm font-semibold text-node-foreground">
            {t('title')}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="sr-only">
            {t('title')}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <ImageEditSurface
          sourceUrl={sourceUrl}
          sourceGenerationId={sourceGenerationId}
          declaredWidth={getDeclaredDimension(data.mediaWidth ?? data.width)}
          declaredHeight={getDeclaredDimension(data.mediaHeight ?? data.height)}
          defaultTask={defaultTask}
          onApplied={placeOutputs}
          onRunStateChange={handleRunStateChange}
          onCancel={() => handleOpenChange(false)}
        />
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
