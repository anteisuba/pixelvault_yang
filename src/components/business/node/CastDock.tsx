'use client'

import { useMemo, useState, type ComponentType } from 'react'
import { useEdges, useNodes } from '@xyflow/react'
import {
  ChevronDown,
  LayoutGrid,
  Mountain,
  Plus,
  UserRound,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { NODE_STUDIO_CAST_DOCK } from '@/constants/node-studio'
import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
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
}: CastDockProps) {
  const t = useTranslations('StudioNode.castDock')
  const nodes = useNodes<NodeWorkflowNode>()
  const edges = useEdges<NodeWorkflowEdge>()
  const { setExpandedNodeId, expandedNodeId } = useNodeWorkflowActions()
  const { dragState } = useIngestDrag()
  const [collapsed, setCollapsed] = useState(false)

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

  const barLeft = Math.max(insetLeft, NODE_STUDIO_CAST_DOCK.minimapClearancePx)

  // 【紧急修复②】collapsed vs expanded now anchor at DIFFERENT bottom
  // offsets on purpose: the small pill sits at the SAME height as the
  // toolbar row (`collapsedBottomOffsetPx`, reads as "part of the bottom
  // chrome," never floats over arbitrary canvas content mid-height) and
  // doesn't need the minimap horizontal clearance either — at that height
  // it's well below the minimap's vertical footprint regardless of left
  // offset. The expanded strip keeps floating just above the toolbar
  // (`barBottomOffsetPx` + minimap-cleared `barLeft`), unchanged from before.
  return collapsed ? (
    <button
      type="button"
      aria-label={t('expand')}
      aria-expanded={false}
      title={t('expand')}
      onClick={() => setCollapsed(false)}
      className="pointer-events-auto absolute z-10 inline-flex h-9 items-center gap-1.5 rounded-2xl border border-node-panel-inner/70 bg-node-panel/95 px-3 text-xs font-semibold text-node-foreground shadow-node-panel backdrop-blur-xl transition-colors hover:bg-node-panel-inner md:h-10"
      style={{
        left: insetLeft,
        bottom: NODE_STUDIO_CAST_DOCK.collapsedBottomOffsetPx,
      }}
    >
      <LayoutGrid className="size-3.5" aria-hidden />
      {t('handle', { count: totalCount })}
    </button>
  ) : (
    <div
      className="pointer-events-none absolute z-10"
      style={{
        left: barLeft,
        right: insetRight,
        bottom: NODE_STUDIO_CAST_DOCK.barBottomOffsetPx,
      }}
    >
      <div
        className={cn(
          'pointer-events-auto flex w-full flex-col overflow-hidden rounded-2xl border border-node-panel-inner/70 bg-node-panel/95 shadow-node-panel backdrop-blur-xl transition-opacity duration-base',
          dragState.active && 'opacity-40',
        )}
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
            className="flex size-6 items-center justify-center rounded-lg text-node-muted transition-colors hover:bg-node-panel-inner hover:text-node-foreground"
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
                  'flex h-full shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-node-panel-inner text-node-subtle transition-colors hover:border-node-paint/50 hover:text-node-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-node-paint/60',
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
              className="w-36 rounded-xl border-node-panel-inner/80 bg-node-panel p-1 text-node-foreground shadow-node-panel"
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
    </div>
  )
}
