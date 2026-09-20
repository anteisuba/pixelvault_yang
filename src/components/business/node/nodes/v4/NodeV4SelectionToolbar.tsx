'use client'

/**
 * 选中节点的**浮动工具条**（legacy `CanvasImageSelectionToolbar` 的 v4 落点）。
 *
 * legacy 那一版是画布级单例 + 一张「能力区注册表」按 `nodeType` switch 出五种
 * 变体（1232 行）。v4 不再需要那张表：卡自己知道自己是什么，工具条挂在卡上
 * （ReactFlow `NodeToolbar`，随缩放自动定位，⛔ 不用再手算 `transform[2]` 的
 * offset 补偿），能力差异由**调用方传 `extra`** 表达。
 *
 * ⚠ 多选时整条不渲染 —— 每张卡各弹一条自己的工具条是 v3 被抓到的老毛病
 * （legacy `multiSelectActive` 的同一条判据，判据在 `NodeV4Context.selectedNodeIds`）。
 *
 * ── 形态（HIG 定稿 2026-09-08）────────────────────────────────────────────
 * 玻璃胶囊（`surface-glass` + vibrancy + 大扩散低不透明阴影）+ 30px 胶囊按钮，
 * 按语义分**三组**（编辑 ‖ 输出 ‖ 危险），组间一条竖线。**纯图标 + tooltip**
 * （owner 定：图标+文字在缩放态下太占画布）。危险项常态红字、hover 才上淡红底。
 */

import { NodeToolbar, Position } from '@xyflow/react'
import { useTranslations } from 'next-intl'
import {
  AlignVerticalJustifyStart,
  Copy,
  Download,
  Trash2,
} from '@/components/icons'
import type { ReactNode } from 'react'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import type { NodeV4 } from '@/types/node-workflow'

import { useNodeV4Canvas } from './NodeV4Context'

/**
 * 下载：`<a download>` 一次性点击。⛔ 不 fetch 成 blob —— R2 是跨域的，blob 路线
 * 要么被 CORS 拦、要么把整张图读进内存换不来任何好处。
 */
export function triggerNodeV4Download(url: string) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  anchor.download = ''
  anchor.click()
}

export function NodeV4ToolbarButton({
  label,
  icon: Icon,
  onClick,
  disabled,
  testId,
  danger,
}: {
  label: string
  icon: typeof Trash2
  onClick(): void
  disabled?: boolean
  testId: string
  /** 危险项：常态红字，hover 才上 10% 淡红底。 */
  danger?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          data-toolbar-action={testId}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            'nodrag nopan flex h-7.5 min-w-7.5 items-center justify-center rounded-full transition-[background-color,transform] duration-spring-press ease-spring-press active:scale-95 disabled:opacity-40',
            danger
              ? 'text-status-risk hover:bg-status-risk-surface'
              : 'hover:bg-surface-fill-hover',
          )}
        >
          <Icon aria-hidden className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** 组间的一条竖线（语义分组，⛔ 不是装饰）。 */
function ToolbarDivider() {
  return <span aria-hidden className="mx-1 h-4 w-px self-center bg-border" />
}

export interface NodeV4SelectionToolbarProps {
  readonly node: NodeV4
  readonly selected?: boolean
  /** 可下载的媒体 URL；没有就把下载钮置灰（⛔ 不隐藏——位置会跳）。 */
  readonly mediaUrl?: string
  /** kind 专属的额外按钮（图片的审核、文本的角色切换…）。 */
  readonly extra?: ReactNode
}

export function NodeV4SelectionToolbar({
  node,
  selected,
  mediaUrl,
  extra,
}: NodeV4SelectionToolbarProps) {
  const t = useTranslations('StudioNode.v4')
  const canvas = useNodeV4Canvas()
  const multiSelect = canvas.selectedNodeIds.length >= 2

  return (
    <TooltipProvider delayDuration={300}>
      <NodeToolbar
        isVisible={Boolean(selected) && !multiSelect}
        position={Position.Top}
        className="flex items-center gap-0.5 rounded-full border p-1.5 text-foreground surface-glass shadow-node-chrome"
        data-node-toolbar={node.id}
      >
        {/* 编辑组 */}
        <NodeV4ToolbarButton
          testId="clone"
          label={t('toolbar.clone')}
          icon={Copy}
          onClick={() =>
            // 克隆 = **同类空节点**（owner 定），⛔ 不复制媒体：一张图两个节点指向
            // 同一个 R2 对象，删任一个都会让另一个静默变空白。
            void canvas.onApplyOp({
              op: NODE_ASSISTANT_OP_V4_IDS.addNode,
              kind: node.data.kind,
              subtype: node.data.subtype,
              ...(node.data.shotNo === undefined
                ? {}
                : { shotNo: node.data.shotNo }),
            })
          }
        />
        {extra}
        <ToolbarDivider />
        {/* 输出组 */}
        <NodeV4ToolbarButton
          testId="download"
          label={t('toolbar.download')}
          icon={Download}
          disabled={!mediaUrl}
          onClick={() => mediaUrl && triggerNodeV4Download(mediaUrl)}
        />
        <NodeV4ToolbarButton
          testId="tidy"
          label={t('toolbar.tidy')}
          icon={AlignVerticalJustifyStart}
          onClick={() => canvas.onTidyLayout()}
        />
        <ToolbarDivider />
        {/* 危险组 */}
        <NodeV4ToolbarButton
          testId="delete"
          danger
          label={t('toolbar.delete')}
          icon={Trash2}
          onClick={() =>
            void canvas.onApplyOp({
              op: NODE_ASSISTANT_OP_V4_IDS.delete,
              target: node.id,
            })
          }
        />
      </NodeToolbar>
    </TooltipProvider>
  )
}
