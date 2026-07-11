'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'

import { NODE_STUDIO_INGEST_REJECT_REASON_IDS } from '@/constants/node-studio'
import { isVoiceProfileNode } from '@/lib/node-workflow-graph'
import { cn } from '@/lib/utils'
import {
  evaluateCastIngest,
  findIngestTargetElement,
  playTargetGulpAnimation,
  previewIngestCapacity,
  useCastIngestEngine,
  type BeginCastDragParams,
  type CastIngestBiteChange,
  type CastIngestDragState,
  type CastIngestEvaluation,
  type CastIngestSourceInfo,
} from '@/hooks/node/use-cast-ingest'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

/** S5f B2 快投模式 target classes (CSS in globals.css §S5f B2): legal targets
 *  get a numbered green badge (index via the `--node-qt-index` custom prop),
 *  already-included ones get the ⊘ dim. Applied imperatively — the target
 *  node components never re-render for the mode (same "不进 React state"
 *  discipline as the magnet/bite classes). */
const QUICK_THROW_TARGET_CLASS = 'node-quick-throw-target'
const QUICK_THROW_INCLUDED_CLASS = 'node-quick-throw-included'
const QUICK_THROW_INDEX_PROP = '--node-qt-index'

interface IngestDragContextValue {
  beginDrag(params: BeginCastDragParams): void
  dragState: CastIngestDragState
  /** S5f B2: the card being quick-thrown, or null when not in the mode. */
  quickThrowSource: CastIngestSourceInfo | null
  enterQuickThrow(source: CastIngestSourceInfo): void
  exitQuickThrow(): void
  /** Called by the canvas (workbench onNodeClick) — feeds the quick-throw
   *  source into `targetId` if legal; a no-op otherwise (dimmed targets). */
  feedQuickThrow(targetId: string): void
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

/** S5f B2: imperative bridge to the quick-throw API for consumers that live
 *  OUTSIDE the provider — specifically the workbench's ReactFlow `onNodeClick`
 *  / `onPaneClick` handlers, whose closures are defined in the parent scope
 *  that renders this provider (so `useIngestDrag` isn't reachable there). A
 *  ref (read at click time, not render time) fits: no re-render coupling. */
export interface QuickThrowApi {
  quickThrowSource: CastIngestSourceInfo | null
  feedQuickThrow(targetId: string): void
  exitQuickThrow(): void
}

interface IngestDragProviderProps {
  nodes: NodeWorkflowNode[]
  edges: NodeWorkflowEdge[]
  /** Wraps `workflow.onConnect` — the ONLY data mutation the whole gesture
   *  performs (吞噬 = 纯渲染层折叠 + 复用现有建边路径，任务包 B1-4). */
  onConnect(sourceId: string, targetId: string): void
  /** S5f B2: the provider writes its live quick-throw API here so the
   *  workbench's canvas event handlers (outside the provider) can read it. */
  quickThrowApiRef?: MutableRefObject<QuickThrowApi | null>
  children: ReactNode
}

/**
 * Provider for the S5b 吞噬手势 engine (`use-cast-ingest.ts`). Renders the
 * portal-based drag ghost + 咬不动 reason bubble (§6.3 "portal 渲染拖拽副本")
 * alongside its children, so a single instance near the top of the canvas
 * tree covers every Cast card everywhere in the subtree.
 */
/** S5f B3 张口预览: the mini-list floated above the bite target while a Cast
 *  card hovers a legal (or capacity-full) drop target — a "what am I about to
 *  feed" glance before committing (§6.3). Position captured at bite time; the
 *  target doesn't move during a hover so a static anchor reads fine. */
interface MouthPreviewState {
  x: number
  y: number
  name: string
  imageCount: number
  hasVoice: boolean
  capacity: { current: number; limit: number } | null
  overLimit: boolean
}

/** Card display name for the preview header — mirrors CastCard.getCastCardName's
 *  field precedence but without needing the sectionId (the drag already knows
 *  the source node; this derives a human label from whichever identity field is
 *  set). */
function deriveSourceName(node: NodeWorkflowNode): string | undefined {
  const pick = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined
  return (
    pick(node.data.characterName) ||
    pick(node.data.character?.name) ||
    pick(node.data.backgroundName) ||
    pick(node.data.voiceName) ||
    pick(node.data.mediaLabel) ||
    undefined
  )
}

export function IngestDragProvider({
  nodes,
  edges,
  onConnect,
  quickThrowApiRef,
  children,
}: IngestDragProviderProps) {
  const t = useTranslations('StudioNode.ingest')
  const [preview, setPreview] = useState<MouthPreviewState | null>(null)
  const [quickThrowSource, setQuickThrowSource] =
    useState<CastIngestSourceInfo | null>(null)

  const enterQuickThrow = useCallback((source: CastIngestSourceInfo) => {
    setQuickThrowSource(source)
  }, [])
  const exitQuickThrow = useCallback(() => setQuickThrowSource(null), [])

  const feedQuickThrow = useCallback(
    (targetId: string) => {
      if (!quickThrowSource) return
      const targetNode = nodes.find((node) => node.id === targetId)
      if (!targetNode) return
      // Legality (incl. duplicate/capacity) reuses the same pure check the
      // drag drop uses — an illegal/already-included target is a no-op (it's
      // dimmed in the overlay anyway), so a stray click never mis-feeds.
      if (
        !evaluateCastIngest(quickThrowSource.node, targetNode, edges, nodes)
          .legal
      ) {
        return
      }
      onConnect(quickThrowSource.node.id, targetId)
      playTargetGulpAnimation(findIngestTargetElement(targetId))
      // Mode STAYS active — quick-throw is "feed one, feed another" until Esc.
    },
    [quickThrowSource, nodes, edges, onConnect],
  )

  // S5f B2: light every legal target (reusing the magnet highlight) and dim
  // every already-included one (⊘) while the mode is active. Imperative DOM
  // (like the magnet) — the target node components never re-render for this.
  // Re-runs when nodes/edges change (a feed adds an edge → that target flips
  // from legal-highlight to included-dim on the next pass).
  useEffect(() => {
    if (!quickThrowSource) return
    const touched: HTMLElement[] = []
    let index = 0
    for (const node of nodes) {
      if (node.id === quickThrowSource.node.id) continue
      const el = findIngestTargetElement(node.id)
      if (!el) continue
      const evaluation = evaluateCastIngest(
        quickThrowSource.node,
        node,
        edges,
        nodes,
      )
      if (evaluation.legal) {
        index += 1
        el.classList.add(QUICK_THROW_TARGET_CLASS)
        // CSS `content` needs a quoted string; the number rides a custom prop.
        el.style.setProperty(QUICK_THROW_INDEX_PROP, `"${index}"`)
        touched.push(el)
      } else if (
        evaluation.reason === NODE_STUDIO_INGEST_REJECT_REASON_IDS.duplicate
      ) {
        el.classList.add(QUICK_THROW_INCLUDED_CLASS)
        touched.push(el)
      }
    }
    return () => {
      for (const el of touched) {
        el.classList.remove(
          QUICK_THROW_TARGET_CLASS,
          QUICK_THROW_INCLUDED_CLASS,
        )
        el.style.removeProperty(QUICK_THROW_INDEX_PROP)
      }
    }
  }, [quickThrowSource, nodes, edges])

  // Esc exits the mode (pane-click exit is wired in the workbench).
  useEffect(() => {
    if (!quickThrowSource) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setQuickThrowSource(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [quickThrowSource])

  // S5f B2: publish the live quick-throw API to the workbench's out-of-provider
  // canvas handlers (see QuickThrowApi doc).
  useEffect(() => {
    if (!quickThrowApiRef) return
    quickThrowApiRef.current = {
      quickThrowSource,
      feedQuickThrow,
      exitQuickThrow,
    }
    return () => {
      quickThrowApiRef.current = null
    }
  }, [quickThrowApiRef, quickThrowSource, feedQuickThrow, exitQuickThrow])

  const handleBiteChange = useCallback(
    (change: CastIngestBiteChange | null) => {
      if (!change) {
        setPreview(null)
        return
      }
      const rect = findIngestTargetElement(
        change.targetNode.id,
      )?.getBoundingClientRect()
      if (!rect) {
        setPreview(null)
        return
      }
      const source = change.sourceNode
      const imageCount = Array.isArray(source.data.referenceAssets)
        ? source.data.referenceAssets.length
        : 0
      const hasVoice = edges.some((edge) => {
        if (edge.target !== source.id) return false
        const voiceNode = nodes.find((node) => node.id === edge.source)
        return voiceNode ? isVoiceProfileNode(voiceNode) : false
      })
      setPreview({
        x: rect.left + rect.width / 2,
        y: rect.top,
        name: deriveSourceName(source) ?? t(`preview.fallbackName`),
        imageCount,
        hasVoice,
        capacity: previewIngestCapacity(
          source,
          change.targetNode,
          edges,
          nodes,
        ),
        overLimit:
          change.evaluation.reason ===
          NODE_STUDIO_INGEST_REJECT_REASON_IDS.capacityFull,
      })
    },
    [edges, nodes, t],
  )

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
    onBiteChange: handleBiteChange,
  })

  const value = useMemo<IngestDragContextValue>(
    () => ({
      beginDrag: engine.beginDrag,
      dragState: engine.dragState,
      quickThrowSource,
      enterQuickThrow,
      exitQuickThrow,
      feedQuickThrow,
    }),
    [
      engine.beginDrag,
      engine.dragState,
      quickThrowSource,
      enterQuickThrow,
      exitQuickThrow,
      feedQuickThrow,
    ],
  )

  return (
    <IngestDragContext.Provider value={value}>
      {children}
      <IngestMouthPreview preview={engine.dragState.active ? preview : null} />
      {quickThrowSource ? (
        <div
          role="status"
          className="pointer-events-none fixed left-1/2 top-4 z-50 -translate-x-1/2 whitespace-nowrap rounded-full border border-node-paint/60 bg-node-panel px-3 py-1.5 text-xs font-semibold text-node-foreground shadow-node-panel"
        >
          {t('quickThrow.hint', {
            name:
              deriveSourceName(quickThrowSource.node) ?? quickThrowSource.label,
          })}
        </div>
      ) : null}
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

/**
 * S5f B3 张口预览: the "what am I about to feed" mini-list, portaled above the
 * bite target while a Cast card hovers a legal (or capacity-full) drop target.
 * `overLimit` turns the whole chip red — the capacity ceiling is visible
 * BEFORE the drop's 咬不动 rejection (§6.3 契约校验前置). i18n-free numbers are
 * translated here (engine stays locale-free via the CastIngestBiteChange).
 */
function IngestMouthPreview({
  preview,
}: {
  preview: MouthPreviewState | null
}) {
  const t = useTranslations('StudioNode.ingest')
  if (typeof document === 'undefined' || !preview) {
    return null
  }
  return createPortal(
    <div
      role="status"
      className={cn(
        'pointer-events-none fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-1.5 whitespace-nowrap rounded-lg border bg-node-panel px-2.5 py-1 text-2xs font-medium shadow-node-panel',
        preview.overLimit
          ? 'border-node-status-failed/60 text-node-status-failed'
          : 'border-node-panel-inner/70 text-node-foreground',
      )}
      style={{ left: preview.x, top: preview.y - 8 }}
    >
      <span className="font-semibold">@{preview.name}</span>
      {preview.imageCount > 0 ? (
        <span className="text-node-muted">
          {t('preview.images', { count: preview.imageCount })}
        </span>
      ) : null}
      {preview.hasVoice ? (
        <span className="text-node-muted">{t('preview.voice')}</span>
      ) : null}
      {preview.capacity ? (
        <span className={preview.overLimit ? undefined : 'text-node-muted'}>
          {t('preview.slots', {
            current: preview.capacity.current,
            limit: preview.capacity.limit,
          })}
        </span>
      ) : null}
    </div>,
    document.body,
  )
}
