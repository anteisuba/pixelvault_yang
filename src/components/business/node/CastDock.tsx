'use client'

import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { useEdges, useNodes } from '@xyflow/react'
import {
  ChevronDown,
  LayoutGrid,
  Mountain,
  Plus,
  UserRound,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import {
  NODE_STUDIO_CAST_DOCK,
  NODE_STUDIO_INGEST_MAGNET,
} from '@/constants/node-studio'
import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { motionTransition } from '@/constants/motion'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { isCloseupNode, isVoiceProfileNode } from '@/lib/node-workflow-graph'
import { cn } from '@/lib/utils'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import { CastCard } from './CastCard'
import { useIngestDrag } from './IngestDragLayer'
import { useNodeWorkflowActions } from './NodeWorkflowActionsContext'

/**
 * Cast dock section ids. S5d owner correction (2026-07-10, §6.0 回写):
 * the dock only ever holds COLLECTOR cards (角色卡/场景卡) — voice /
 * videoReference are 素材 like images, not collectors, and no longer render
 * here (they still get the SAME hidden-when-referenced canvas fold, see
 * `isCastIdentityNode` below, just never a dock registry entry). The type
 * stays a superset (4 members) purely for backward compat with `CastCard` /
 * `use-cast-ingest.ts`'s `CastSectionId` prop (task packet: "CastCard 组件
 * 不动" — narrowing the exported type would ripple into their switches for
 * no gain since they still handle all 4 cases correctly).
 */
export type CastSectionId =
  | typeof NODE_IMAGE_ROLE_IDS.character
  | typeof NODE_IMAGE_ROLE_IDS.background
  | typeof NODE_TYPE_IDS.voice
  | typeof NODE_TYPE_IDS.videoReference

interface CastSectionConfig {
  id: CastSectionId
  Icon: ComponentType<{ className?: string }>
  /** A node belongs to this section, including the legacy pre-unification
   *  per-role types (characterImage/backgroundImage) — see Source of Truth
   *  §6.1 / task packet reconnaissance notes. */
  match(node: NodeWorkflowNode): boolean
}

/**
 * Dock-VISIBLE sections — collector cards only (§6.0 修正①「卡匣只放卡
 * 片」). Driven by this list so a future S5e collector type (画风卡/道具卡)
 * is one more entry, not a rewrite (owner's "分区由类型清单驱动渲染"
 * extensibility ask).
 */
const CAST_SECTIONS: readonly CastSectionConfig[] = [
  {
    id: NODE_IMAGE_ROLE_IDS.character,
    Icon: UserRound,
    match: (node) =>
      (node.type === NODE_TYPE_IDS.image &&
        node.data.role === NODE_IMAGE_ROLE_IDS.character) ||
      node.type === NODE_TYPE_IDS.characterImage,
  },
  {
    id: NODE_IMAGE_ROLE_IDS.background,
    Icon: Mountain,
    match: (node) =>
      (node.type === NODE_TYPE_IDS.image &&
        node.data.role === NODE_IMAGE_ROLE_IDS.background) ||
      node.type === NODE_TYPE_IDS.backgroundImage,
  },
] as const

/** Voice/videoReference matchers — NOT dock sections anymore (§6.0 修正②
 *  「音色/参考视频=素材」), but still part of the hidden-when-referenced
 *  render fold `isCastIdentityNode` feeds (StudioNodeWorkbench treats all
 *  four the same way for that ONE purpose). */
const MATERIAL_IDENTITY_MATCHERS: readonly ((
  node: NodeWorkflowNode,
) => boolean)[] = [
  (node) => node.type === NODE_TYPE_IDS.voice,
  (node) => node.type === NODE_TYPE_IDS.videoReference,
]

/**
 * Whether a node participates in the "hidden once eaten, visible when
 * zero-referenced" canvas render fold (§6.0 S5d 修正②，扩至音色/参考视频=
 * 素材 2026-07-10 owner 追加拍板). Exported so `StudioNodeWorkbench` can fold
 * exactly these into ReactFlow `hidden` nodes without re-deriving the match
 * rules — single source of truth, even though only the first two (角色/场景)
 * ALSO render as dock cards (`CAST_SECTIONS` above).
 */
export function isCastIdentityNode(node: NodeWorkflowNode): boolean {
  return (
    CAST_SECTIONS.some((section) => section.match(node)) ||
    MATERIAL_IDENTITY_MATCHERS.some((match) => match(node))
  )
}

interface CastDockProps {
  /** Create a role-stamped node for this section and wire it onto the
   *  canvas (role preset — see StudioNodeWorkbench.handleCastCreate). */
  onCreateCard(sectionId: CastSectionId): void
  /** Horizontal insets (px) shared with the toolbar row — keeps the
   *  assistant dock clear on the right; the left inset is additionally
   *  maxed against `minimapClearancePx` so the strip never covers the
   *  minimap (§6.2, unchanged avoidance math from the flyout era). */
  insetLeft: number
  insetRight: number
  /** S5f B4 把手热区: true while an ingest-source canvas node is being
   *  dragged. When the dock is collapsed and the pointer nears the handle
   *  during such a drag, the strip auto-expands (and re-collapses on drag
   *  end) so a card can be grabbed without breaking the drag. */
  canvasDragActive?: boolean
  /**
   * `inline` — sit next to CanvasBottomDock in the shared bottom row
   * (handle always; strip expands upward). `absolute` — legacy free-floating
   * strip with inset positioning.
   */
  layout?: 'absolute' | 'inline'
  /**
   * R3-4 (canvas-relationship-v3 §4.2): the workbench flips this true when a
   * higher tier claims the L5/L6 slot (add menu opens, 详情面板/重编辑工作区
   * opens) — the strip collapses itself in response. Auto-expand-during-drag
   * stays this component's own business; this is only ever a request to shut
   * on the strip's manually-opened state.
   */
  forceCollapse?: boolean
  /**
   * R3-4: reports every collapsed⇄expanded transition upward so the
   * workbench can (a) close the other L5 citizen (add menu) when this one
   * opens, and (b) fold "cast dock expanded" into the Esc ladder + focus
   * return. CastDock stays the owner of `collapsed` itself — this is a
   * one-way mirror, not a lift.
   */
  onExpandedChange?(expanded: boolean): void
}

/**
 * Cast 卡匣（references/pages/node-canvas.md §6.2）— S5d ①「卡匣回横匣」:
 * reverted from the S5b/S5c popover-flyout form back to an ALWAYS-VISIBLE
 * horizontal strip (owner-flagged regression — hiding the dock behind an
 * extra click made it easy to forget it existed). Four sections laid out
 * side by side in one `overflow-x-auto` row ("整条横向滚动" — picked over
 * per-section independent scroll: a single scroll gesture reads simpler than
 * nested scroll regions, and the whole-strip approach is what the S5a
 * original design already specified). A collapse handle folds it to a small
 * pill (zero footprint) without losing the count.
 *
 * `CastCard` itself is UNCHANGED (task packet: "CastCard 组件与徽章不动") —
 * it renders `w-full` (S5c's grid-column sizing), so each card here is
 * wrapped in a fixed-width flex item (`NODE_STUDIO_CAST_DOCK.barCardWidthClass`)
 * instead of touching that component.
 */
export function CastDock({
  onCreateCard,
  insetLeft,
  insetRight,
  canvasDragActive = false,
  layout = 'absolute',
  forceCollapse = false,
  onExpandedChange,
}: CastDockProps) {
  const t = useTranslations('StudioNode.castDock')
  const nodes = useNodes<NodeWorkflowNode>()
  const edges = useEdges<NodeWorkflowEdge>()
  const { setExpandedNodeId, expandedNodeId } = useNodeWorkflowActions()
  const { dragState } = useIngestDrag()
  const [collapsed, setCollapsed] = useState(false)
  const collapsedHandleRef = useRef<HTMLButtonElement | null>(null)
  // A4: 展开/收起过渡走全站 motion 刻度（面板展开折叠档 = slow/320ms，同
  // NodeDetailPanel 的 AnimatePresence 用法），reducedMotion 时长自动归零。
  const reducedMotion = useReducedMotion()
  const expandTransition = motionTransition('slow', reducedMotion)

  // Canvas insert menu can request the 卡匣 strip (Haivis companion entry).
  useEffect(() => {
    const expand = () => setCollapsed(false)
    window.addEventListener('pixelvault:expand-cast-dock', expand)
    return () => {
      window.removeEventListener('pixelvault:expand-cast-dock', expand)
    }
  }, [])

  // R3-4 §4.2 rule 3: a higher tier (add menu / 详情面板 / 重编辑工作区) just
  // claimed the L5/L6 slot — collapse regardless of how we got expanded.
  useEffect(() => {
    if (forceCollapse) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing to a parent-owned external signal (higher overlay tier opened), same pattern as the drag-triggered re-collapse effect above
      setCollapsed(true)
    }
  }, [forceCollapse])

  // R3-4 §4.2: report every transition upward (see prop doc for why this is
  // a mirror, not a lift).
  useEffect(() => {
    onExpandedChange?.(!collapsed)
  }, [collapsed, onExpandedChange])
  // S5f B4: remembers a drag-triggered auto-expand so the strip re-collapses
  // when the drag ends (a manual expand mid-drag would NOT set this, so it
  // stays open — only the automatic one snaps back).
  const autoExpandedByDragRef = useRef(false)

  // S5f B4 把手热区: while collapsed AND a canvas ingest drag is in flight,
  // watch the pointer; entering the handle's hot zone auto-expands the strip
  // so the dragged entity can reach a card. The proximity math lives here
  // (per-move, but only during a collapsed-dock drag — a narrow window), not
  // in the workbench, keeping the handle's own geometry private to this file.
  useEffect(() => {
    if (!collapsed || !canvasDragActive) return
    const handlePointerMove = (event: PointerEvent) => {
      const rect = collapsedHandleRef.current?.getBoundingClientRect()
      if (!rect) return
      const dx = Math.max(
        rect.left - event.clientX,
        0,
        event.clientX - rect.right,
      )
      const dy = Math.max(
        rect.top - event.clientY,
        0,
        event.clientY - rect.bottom,
      )
      if (Math.hypot(dx, dy) <= NODE_STUDIO_INGEST_MAGNET.handleHotZonePx) {
        autoExpandedByDragRef.current = true
        setCollapsed(false)
      }
    }
    window.addEventListener('pointermove', handlePointerMove)
    return () => window.removeEventListener('pointermove', handlePointerMove)
  }, [collapsed, canvasDragActive])

  // Re-collapse when the drag that auto-expanded us ends. This IS a genuine
  // "sync to an external system" effect (ReactFlow's node-drag lifecycle lives
  // outside React state, surfaced here via the `canvasDragActive` prop) — not
  // the "you might not need an effect" anti-pattern — so the guarded one-shot
  // setState is intentional (same accepted pattern as VideoComposer).
  useEffect(() => {
    if (!canvasDragActive && autoExpandedByDragRef.current) {
      autoExpandedByDragRef.current = false
      // eslint-disable-next-line react-hooks/set-state-in-effect -- external drag ended; restore the pre-drag collapsed state
      setCollapsed(true)
    }
  }, [canvasDragActive])

  const performanceCountBySourceId = useMemo(() => {
    const counts = new Map<string, number>()
    for (const edge of edges) {
      counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1)
    }
    return counts
  }, [edges])

  // S5c 二.1 紧凑卡肚子徽章「📷N ♪N」: one pass over edges (not one pass per
  // card) — closeup edges add to the target's photo count, voice edges flag
  // "有" (existence, not count — §6 badge spec is "voice 边有无"). Keyed by
  // target node id so CastCard just looks itself up, same pattern as
  // performanceCountBySourceId above.
  const identityBadgeStatsByNodeId = useMemo(() => {
    const nodeById = new Map(nodes.map((node) => [node.id, node]))
    const stats = new Map<
      string,
      { referenceCount: number; hasVoice: boolean }
    >()
    const ensure = (id: string) => {
      let entry = stats.get(id)
      if (!entry) {
        entry = { referenceCount: 0, hasVoice: false }
        stats.set(id, entry)
      }
      return entry
    }
    for (const edge of edges) {
      const source = nodeById.get(edge.source)
      if (!source) continue
      if (isCloseupNode(source)) {
        ensure(edge.target).referenceCount += 1
      } else if (isVoiceProfileNode(source)) {
        ensure(edge.target).hasVoice = true
      }
    }
    return stats
  }, [edges, nodes])

  const sections = useMemo(
    () =>
      CAST_SECTIONS.map((section) => ({
        ...section,
        cards: nodes.filter((node) => section.match(node)),
      })),
    [nodes],
  )
  // §6.0 修正①「空分区不占位」: a section with zero cards renders nothing —
  // no label tile, no per-section ＋新建 (that collapsed into the single
  // trailing entry below).
  const visibleSections = useMemo(
    () => sections.filter((section) => section.cards.length > 0),
    [sections],
  )
  const totalCount = sections.reduce(
    (sum, section) => sum + section.cards.length,
    0,
  )

  // 【紧急修复】(owner 实测发现，2026-07-11): the trailing ＋新建 tile's type
  // picker must be a REAL Popover (Radix, portals to document.body) — a
  // hand-rolled `absolute` menu here gets clipped by the strip's own
  // `overflow-hidden`/`overflow-x-auto` ancestors (confirmed via chrome DOM
  // inspection: the menu existed with a valid on-screen rect but never
  // painted). Popover sidesteps that entirely and gets outside-click/Esc
  // dismissal for free.
  const [addMenuOpen, setAddMenuOpen] = useState(false)

  // Mirror view: nothing to show until the canvas has at least one node. The
  // empty-canvas guide (A2) already owns the first-run affordance.
  if (nodes.length === 0) {
    return null
  }

  // A4 ①: 展开横匣撑满画布列——barLeft 复用与底部工具条行同一套 inset
  // （StudioNodeWorkbench 传入的 insetLeft/insetRight = NODE_STUDIO_BOTTOM_DOCK.
  // canvasInsetPx，与助手 rail 已经隔开的画布列边界），再 max 上既有
  // minimapClearancePx 语义，保证撑满后不压 minimap（右端保持贴 insetRight，
  // 只有左端在需要时让给 minimap）。`inline` 布局下把手仍嵌在工具条行内，
  // 但展开条脱离把手自身的窄框，改为相对底部工具条行本身定位（详见下方
  // isInline 分支），所以这里额外把 barLeft 换算成"行内局部坐标"
  // （减去行自身已经带的 insetLeft）。
  const barLeft = Math.max(insetLeft, NODE_STUDIO_CAST_DOCK.minimapClearancePx)
  const inlineStripLeftPx = Math.max(0, barLeft - insetLeft)
  const isInline = layout === 'inline'

  const handleButton = (
    <button
      ref={collapsedHandleRef}
      type="button"
      aria-label={collapsed ? t('expand') : t('collapse')}
      aria-expanded={!collapsed}
      title={collapsed ? t('expand') : t('collapse')}
      onClick={() => setCollapsed((value) => !value)}
      className={cn(
        'pointer-events-auto inline-flex h-9 items-center gap-1.5 rounded-xl border border-node-panel-inner bg-node-panel px-3 text-xs font-semibold text-node-foreground shadow-sm transition-all duration-fast ease-standard hover:bg-node-panel-inner active:scale-95 md:h-10',
        // R3-4 §4.1 L4: 折叠态的把手是常驻工作区 chrome（legacy `absolute`
        // layout；当前生产用法走 `inline`，见下方 stripBody 的 L5 展开层）。
        !isInline &&
          'absolute z-canvas-chrome rounded-2xl border-node-panel-inner/70 bg-node-panel/95 shadow-node-panel backdrop-blur-xl',
      )}
      style={
        isInline
          ? undefined
          : {
              left: insetLeft,
              bottom: NODE_STUDIO_CAST_DOCK.collapsedBottomOffsetPx,
            }
      }
    >
      <LayoutGrid className="size-3.5" aria-hidden />
      {t('handle', { count: totalCount })}
    </button>
  )

  const stripBody = (
    // A4 ②: 半透明 L4 chrome（owner 实测反馈——之前 `/95` 太实）。降到 `/90`
    // + 轻 `backdrop-blur-sm`（不回到 L5 曾经的重玻璃档，R3-4 已把那个减
    // 掉）。对比度自查（确定性计算，见任务报告）：worst case = 一张
    // 纸卡 `--node-card-paper` #ebe5d8 整面填在条底正后方，`/90` 混合后背景
    // ≈#2e2a25，header 的 `text-node-muted` 在该底上仍 ≈4.9:1（AA 达标）；
    // `+新建` 原用更弱的 `text-node-subtle`（同底只 ≈2.6:1，且在不透明
    // `/95` 原状下本就只有 ≈3.4:1），随手升到 `text-node-muted` 一并修
    // （见下方按钮）。卡面本体（CastCard）挂 `.node-card-paper` 局部变量
    // 覆写、自带不透明 `bg-node-panel`（解析成纸面色，非本容器的深色
    // token），完全不受这层透明度影响，无需改动。
    <div
      className={cn(
        'pointer-events-auto flex w-full flex-col overflow-hidden rounded-2xl border border-node-panel-inner/70 bg-node-panel/90 backdrop-blur-sm transition-opacity duration-base',
        dragState.active && 'opacity-40',
      )}
      style={{ boxShadow: 'var(--shadow-canvas-menu)' }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-node-panel-inner/70 px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
          <LayoutGrid className="size-3" aria-hidden />
          {t('title')} · {totalCount}
        </span>
        <button
          type="button"
          aria-label={t('collapse')}
          aria-expanded={true}
          title={t('collapse')}
          onClick={() => setCollapsed(true)}
          className="flex size-6 items-center justify-center rounded-lg text-node-muted transition-all duration-fast ease-standard hover:bg-node-panel-inner hover:text-node-foreground active:scale-90"
        >
          <ChevronDown className="size-3.5" aria-hidden />
        </button>
      </div>

      <div className="flex items-stretch gap-3 overflow-x-auto p-3">
        {/* No explicit height here — the row sizes naturally to its
                tallest child (CastCard's own `h-36`); a fixed row height
                would clip the cards under this row's own padding. */}
        {visibleSections.map((section, sectionIndex) => (
          <div key={section.id} className="flex shrink-0 items-stretch gap-2">
            {sectionIndex > 0 ? (
              <div
                className="my-1 w-px shrink-0 bg-node-panel-inner"
                aria-hidden
              />
            ) : null}
            <div
              className={cn(
                'flex shrink-0 flex-col items-center justify-center gap-1 rounded-md text-node-muted',
                NODE_STUDIO_CAST_DOCK.barSectionLabelWidthClass,
              )}
            >
              <section.Icon className="size-4" aria-hidden />
              <span className="text-2xs font-semibold">
                {t(`sections.${section.id}`)}
              </span>
              <span className="tabular-nums text-2xs">
                {section.cards.length}
              </span>
            </div>
            {section.cards.map((node) => {
              const badgeStats = identityBadgeStatsByNodeId.get(node.id)
              const referenceAssetCount = Array.isArray(
                node.data.referenceAssets,
              )
                ? node.data.referenceAssets.length
                : 0
              return (
                <div
                  key={node.id}
                  className={cn(
                    'shrink-0',
                    NODE_STUDIO_CAST_DOCK.barCardWidthClass,
                  )}
                >
                  <CastCard
                    node={node}
                    sectionId={section.id}
                    Icon={section.Icon}
                    performanceCount={
                      performanceCountBySourceId.get(node.id) ?? 0
                    }
                    referenceCount={
                      referenceAssetCount + (badgeStats?.referenceCount ?? 0)
                    }
                    hasVoice={badgeStats?.hasVoice ?? false}
                    selected={node.id === expandedNodeId}
                    onSelect={() => setExpandedNodeId(node.id)}
                  />
                </div>
              )
            })}
          </div>
        ))}

        {/* §6.0 修正①「＋新建收敛为匣尾一个统一入口」: one trailing tile,
                opens a 2-item type picker (角色/场景) instead of each section
                owning its own ＋. Popover (not a hand-rolled absolute div) —
                portals past the strip's own overflow-hidden/overflow-x-auto
                ancestors, which otherwise clip it invisible (owner-caught). */}
        <Popover open={addMenuOpen} onOpenChange={setAddMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t('create')}
              title={t('create')}
              className={cn(
                // A4 ②对比度自查：半透明条底上 text-node-subtle 太弱（见
                // stripBody 顶部注释），升一档到 text-node-muted。
                'flex h-full shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-node-panel-inner text-node-muted transition-all duration-fast ease-standard hover:border-node-paint/50 hover:text-node-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-node-paint/60 active:scale-95',
                NODE_STUDIO_CAST_DOCK.barCardWidthClass,
              )}
            >
              <Plus className="size-4" aria-hidden />
              <span className="text-2xs font-medium">{t('create')}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="start"
            sideOffset={8}
            // A4 ③新建菜单弹出过渡：ui/popover.tsx 的 PopoverContent 已带
            // data-[state]:animate-in/out（tw-animate-css），这里补
            // duration-base 对齐全站 motion 刻度（popover/menu 档），不用改
            // 共享的 ui/popover.tsx 本体。
            className="w-36 rounded-xl border-node-panel-inner/80 bg-node-panel p-1 text-node-foreground shadow-node-panel duration-base"
          >
            {CAST_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => {
                  onCreateCard(section.id)
                  setAddMenuOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-node-foreground transition-colors hover:bg-node-panel-inner"
              >
                <section.Icon
                  className="size-3.5 text-node-muted"
                  aria-hidden
                />
                {t(`sections.${section.id}`)}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )

  if (isInline) {
    return (
      // A4 ①: 这层故意不再是 `relative`——展开条要撑满到工具条行本身的宽度
      // （助手 rail 边界），而不是被这个把手窄框限死。不设 `relative` 后，
      // 下面 motion.div 的 `absolute` 会往上找最近的已定位祖先，落在
      // StudioNodeWorkbench 里那条 `bottom-3` 工具条行上（它本身就是
      // `absolute` + 与 CastDock 同一份 insetLeft/insetRight），于是
      // `left: inlineStripLeftPx, right: 0` 就是"行内局部坐标"，天然等价
      // 于 barLeft/insetRight 在整条画布列坐标系下的位置——助手宽度不用在
      // 这里重算一遍。
      <div className="pointer-events-none flex flex-col items-end">
        <AnimatePresence>
          {!collapsed ? (
            // R3-4 §4.1 L5: 卡匣展开浮层——CanvasAddMenu 打开时会强制收起这个
            // 展开态（互踢，见 StudioNodeWorkbench 的 castDockExpanded 协调）。
            // A4 ③: 展开/收起挂载与卸载都走 AnimatePresence，不再是硬切—
            // 透明度 + 轻微上滑，slow(320ms) 面板展开折叠档，
            // useReducedMotion 时长自动归零。
            <motion.div
              key="cast-dock-strip"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={expandTransition}
              className="pointer-events-none absolute bottom-full z-canvas-transient mb-2"
              style={{ left: inlineStripLeftPx, right: 0 }}
            >
              {stripBody}
            </motion.div>
          ) : null}
        </AnimatePresence>
        {handleButton}
      </div>
    )
  }

  // Absolute layout: handle when collapsed; full-width strip when open.
  if (collapsed) {
    return handleButton
  }

  return (
    <div
      className="pointer-events-none absolute z-canvas-transient"
      style={{
        left: barLeft,
        right: insetRight,
        bottom: NODE_STUDIO_CAST_DOCK.barBottomOffsetPx,
      }}
    >
      {stripBody}
    </div>
  )
}
