'use client'

import { NodeToolbar, Position } from '@xyflow/react'
import { Combine } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { ToolbarLabelButton } from './CanvasImageSelectionToolbar'

interface VideoMergeComposeToolbarProps {
  /**
   * The currently-selected node ids eligible for one-click compose (already
   * filtered + validated by the workbench via
   * `canComposeVideoMergeSelection` — this component trusts the caller and
   * only re-checks the length floor defensively). Empty/undefined when the
   * selection isn't compose-eligible; the toolbar renders nothing.
   */
  nodeIds: string[] | null
  onCompose(): void
}

/**
 * R3-7 (canvas-relationship-v3 §3.0b/§7): the multi-select "一键成盒" entry —
 * "多选视频类节点 → 出现「合成」入口 → 一键自动创建片盒节点并把所选全部吞入".
 *
 * Rendered as a SIBLING of the node types inside `<ReactFlow>`, not attached
 * to any single node's own `NodeShell` — React Flow's `NodeToolbar` accepts
 * an ARRAY of node ids (not just one) and positions itself over their union
 * bounding box, converting flow→screen coordinates and re-tracking on every
 * pan/zoom internally (`getInternalNodesBounds` + the store's live
 * transform). That is exactly "定位在多选包围盒上方（画布坐标→屏幕坐标换算
 * 用库 API）...视口平移/缩放时跟随" from the task brief — no hand-rolled
 * `flowToScreenPosition` math needed, and no per-frame recompute wiring: the
 * library's own store subscription re-renders this on every relevant
 * transform/position change.
 *
 * `isVisible` is passed explicitly (`true`) because React Flow's own default
 * ("show only when exactly one node is selected") would otherwise NEVER show
 * a multi-id toolbar — passing an id array already fails that default's
 * `nodes.size === 1` check, so this is the documented override path, not a
 * workaround.
 */
export function VideoMergeComposeToolbar({
  nodeIds,
  onCompose,
}: VideoMergeComposeToolbarProps) {
  const t = useTranslations('StudioNode.nodeToolbar')

  if (!nodeIds || nodeIds.length < 2) return null

  const count = nodeIds.length
  const label = t('compose', { count })
  const ariaLabel = t('composeAria', { count })

  return (
    <NodeToolbar
      nodeId={nodeIds}
      isVisible
      position={Position.Top}
      offset={16}
      align="center"
    >
      {/* No explicit z-canvas-selection token here: `NodeToolbar` already
          portals into `.react-flow__renderer` and computes its own z-index
          from the toolbar's node internals (always above L2 node cards) —
          the same L3-equivalent placement every per-node selection toolbar
          in this codebase already relies on without setting the token
          itself (see `GenericSelectionToolbar` in CanvasImageSelectionToolbar.tsx,
          whose shell classes this div mirrors). */}
      <div
        role="toolbar"
        aria-label={ariaLabel}
        className="flex h-11 items-center gap-1 rounded-xl border border-node-panel-inner bg-node-panel/95 p-1 text-node-foreground shadow-node-panel backdrop-blur"
      >
        <ToolbarLabelButton
          icon={Combine}
          label={label}
          ariaLabel={ariaLabel}
          onClick={onCompose}
        />
      </div>
    </NodeToolbar>
  )
}
