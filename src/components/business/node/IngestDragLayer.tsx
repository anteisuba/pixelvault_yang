'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'

import { NODE_STUDIO_INGEST_REJECT_REASON_IDS } from '@/constants/node-studio'
import {
  useCastIngestEngine,
  type BeginCastDragParams,
  type CastIngestDragState,
  type CastIngestEvaluation,
} from '@/hooks/node/use-cast-ingest'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

interface IngestDragContextValue {
  beginDrag(params: BeginCastDragParams): void
  dragState: CastIngestDragState
}

const IngestDragContext = createContext<IngestDragContextValue | null>(null)

/** Consumed by `CastCard` (to start a drag) and `CastDock` (to dim the
 *  flyout while one of its own cards is being dragged, §6.2 B0-3). */
export function useIngestDrag(): IngestDragContextValue {
  const context = useContext(IngestDragContext)
  if (!context) {
    throw new Error('IngestDragProvider is missing')
  }
  return context
}

interface IngestDragProviderProps {
  nodes: NodeWorkflowNode[]
  edges: NodeWorkflowEdge[]
  /** Wraps `workflow.onConnect` — the ONLY data mutation the whole gesture
   *  performs (吞噬 = 纯渲染层折叠 + 复用现有建边路径，任务包 B1-4). */
  onConnect(sourceId: string, targetId: string): void
  children: ReactNode
}

/**
 * Provider for the S5b 吞噬手势 engine (`use-cast-ingest.ts`). Renders the
 * portal-based drag ghost + 咬不动 reason bubble (§6.3 "portal 渲染拖拽副本")
 * alongside its children, so a single instance near the top of the canvas
 * tree covers every Cast card everywhere in the subtree.
 */
export function IngestDragProvider({
  nodes,
  edges,
  onConnect,
  children,
}: IngestDragProviderProps) {
  const t = useTranslations('StudioNode.ingest')

  const translateReason = useCallback(
    (evaluation: CastIngestEvaluation): string => {
      switch (evaluation.reason) {
        case NODE_STUDIO_INGEST_REJECT_REASON_IDS.duplicate:
          return t('reasons.duplicate')
        case NODE_STUDIO_INGEST_REJECT_REASON_IDS.capacityFull:
          return evaluation.limit !== undefined &&
            evaluation.current !== undefined
            ? t('reasons.capacityFullWithLimit', {
                current: evaluation.current,
                limit: evaluation.limit,
              })
            : t('reasons.capacityFull')
        default:
          return t('reasons.typeMismatch')
      }
    },
    [t],
  )

  const engine = useCastIngestEngine({
    nodes,
    edges,
    onConnect,
    translateReason,
  })

  const value = useMemo<IngestDragContextValue>(
    () => ({ beginDrag: engine.beginDrag, dragState: engine.dragState }),
    [engine.beginDrag, engine.dragState],
  )

  return (
    <IngestDragContext.Provider value={value}>
      {children}
      <IngestGhostPortal
        dragState={engine.dragState}
        registerGhostElement={engine.registerGhostElement}
      />
    </IngestDragContext.Provider>
  )
}

interface IngestGhostPortalProps {
  dragState: CastIngestDragState
  registerGhostElement(el: HTMLDivElement | null): void
}

/**
 * The dragged card's floating copy + the 咬不动 reason bubble, portaled to
 * `document.body` so they escape ReactFlow's transformed/zoomed viewport and
 * any `overflow:hidden` ancestor (§6.3). The ghost's per-frame position is
 * written directly to its DOM node by the engine (`registerGhostElement`
 * hands the node over) — React only re-renders this tree on the rare
 * discrete transitions (drag start/end, reason shown/cleared), never per
 * pointer-move, so 60fps tracking never fights a React re-render.
 */
function IngestGhostPortal({
  dragState,
  registerGhostElement,
}: IngestGhostPortalProps) {
  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <>
      {dragState.ghost ? (
        <div
          ref={registerGhostElement}
          aria-hidden
          className="node-card-paper pointer-events-none fixed left-0 top-0 z-50 flex items-center justify-center overflow-hidden rounded-md border border-node-card-line bg-node-panel shadow-node-panel"
          style={{
            width: dragState.ghost.width,
            height: dragState.ghost.height,
            transform: `translate(${dragState.ghost.originX}px, ${dragState.ghost.originY}px)`,
          }}
        >
          {dragState.ghost.thumbnailUrl ? (
            // Same raw-img convention as CastCard's own thumbnail (arbitrary
            // R2/third-party hosts, not a fixed asset set).
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={dragState.ghost.thumbnailUrl}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <span className="px-1 text-center text-2xs font-semibold text-node-card-ink">
              {dragState.ghost.label}
            </span>
          )}
        </div>
      ) : null}
      {dragState.reason ? (
        <div
          role="status"
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full border border-node-status-failed/60 bg-node-panel px-3 py-1.5 text-xs font-semibold text-node-status-failed shadow-node-panel"
          style={{ left: dragState.reason.x, top: dragState.reason.y - 8 }}
        >
          {dragState.reason.text}
        </div>
      ) : null}
    </>,
    document.body,
  )
}
