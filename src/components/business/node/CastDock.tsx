'use client'

import { useMemo, type ComponentType } from 'react'
import { useEdges, useNodes } from '@xyflow/react'
import { FileText, ImageIcon, Mic2, Search, Video } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_IMAGE_ROLE_IDS,
  NODE_IMAGE_ROLE_TO_LEGACY_TYPE,
  NODE_MEDIA_KIND_BY_NODE_TYPE,
  NODE_MEDIA_KIND_IDS,
  NODE_TYPE_IDS,
  type NodeWorkflowMediaKind,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import { resolveNodeDisplayName } from '@/lib/node-display-name'
import { cn } from '@/lib/utils'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import { useNodeWorkflowActions } from './NodeWorkflowActionsContext'

/**
 * Kept for the legacy, no-longer-mounted CastCard module while its ingest
 * animation engine awaits separate deletion. The production CastDock is now
 * an all-node locator and does not use these sections.
 */
export type CastSectionId =
  | typeof NODE_IMAGE_ROLE_IDS.character
  | typeof NODE_IMAGE_ROLE_IDS.background
  | typeof NODE_TYPE_IDS.voice
  | typeof NODE_TYPE_IDS.videoReference

type LocatorGroupId = NodeWorkflowMediaKind

interface LocatorGroupConfig {
  id: LocatorGroupId
  Icon: ComponentType<{ className?: string }>
}

const LOCATOR_GROUPS: readonly LocatorGroupConfig[] = [
  { id: NODE_MEDIA_KIND_IDS.text, Icon: FileText },
  { id: NODE_MEDIA_KIND_IDS.image, Icon: ImageIcon },
  { id: NODE_MEDIA_KIND_IDS.audio, Icon: Mic2 },
  { id: NODE_MEDIA_KIND_IDS.video, Icon: Video },
]

function trimmed(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function resolvePresentationType(node: NodeWorkflowNode): NodeWorkflowNodeType {
  if (node.type !== NODE_TYPE_IDS.image || !node.data.role) {
    return node.type
  }
  return NODE_IMAGE_ROLE_TO_LEGACY_TYPE[node.data.role] ?? node.type
}

// 包 4.5：这条七字段优先链原本就写在这里，且是全仓最全的一条 —— 抽进
// `lib/node-display-name` 成为单一事实源，本处改为消费它。行为零变化。
function getNodeDisplayName(node: NodeWorkflowNode): string | undefined {
  return resolveNodeDisplayName(node.data)
}

function getNodeThumbnail(node: NodeWorkflowNode): string | undefined {
  const kind = NODE_MEDIA_KIND_BY_NODE_TYPE[node.type]
  if (kind === NODE_MEDIA_KIND_IDS.image) {
    return trimmed(node.data.mediaUrl) ?? trimmed(node.data.imageUrl)
  }
  if (kind === NODE_MEDIA_KIND_IDS.audio) {
    return (
      trimmed(node.data.voiceCoverImage) ??
      trimmed(node.data.voiceReferenceCoverImage)
    )
  }
  if (kind === NODE_MEDIA_KIND_IDS.video) {
    return trimmed(node.data.videoThumbnailUrl)
  }
  return undefined
}

function getNodeGroup(node: NodeWorkflowNode): LocatorGroupId {
  return NODE_MEDIA_KIND_BY_NODE_TYPE[node.type] ?? NODE_MEDIA_KIND_IDS.text
}

export function countCanvasNodes(nodes: readonly NodeWorkflowNode[]): number {
  return nodes.length
}

interface CastDockProps {
  /**
   * 搜索词（画布修法 G1，2026-08-26）：曾经是这个组件内部的 `useState`，但
   * `CanvasRosterRail` 下段的收集器卡区需要用**同一个** query 过滤 —— 两段各
   * 管一份 state 就是「同一个搜索框只过滤半个面板」那个 bug 的根因。state 因此
   * 搬去父组件持有，这里改收 controlled props。
   */
  query: string
  onQueryChange: (value: string) => void
  /**
   * 包 H（画布修法《手机 390px》，2026-08-26）：行点击的替代落点。省略时行为
   * 字节不变——仍是 `focusNode`（选中并飞相机到真实画布节点），桌面唯一调用点
   * `CanvasRosterRail` 不传这个 prop。
   *
   * 手机默认形态没有可看的画布相机可飞（画布退到「查看画布」入口后面），点一行
   * 该做的事变成「打开这个节点的只读预览」——传这个 prop 换掉点击目标，而不是
   * 复制一份列表：locator 本身的数据整形/分组/搜索对两边完全一样，见
   * `CanvasMobileView` 的调用点。
   */
  onSelectNode?: (nodeId: string) => void
}

/**
 * All-node locator.
 *
 * This deliberately uses the historical `CastDock` module name to keep the
 * left-panel integration narrow, but none of the old mirror-card semantics
 * remain: no create, delete, detail, rename, drag, or quick throw. Rows project
 * directly from React Flow's live nodes and only call the workbench's
 * `focusNode` (or, on the mobile locator, `onSelectNode`).
 */
export function CastDock({
  query,
  onQueryChange,
  onSelectNode,
}: CastDockProps) {
  const t = useTranslations('StudioNode.castDock')
  const tStudio = useTranslations('StudioNode')
  const nodes = useNodes<NodeWorkflowNode>()
  const edges = useEdges<NodeWorkflowEdge>()
  const { focusNode } = useNodeWorkflowActions()
  const activateRow = onSelectNode ?? focusNode

  const referenceCountByNodeId = useMemo(() => {
    const counts = new Map<string, number>()
    for (const edge of edges) {
      counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1)
    }
    return counts
  }, [edges])

  const entries = useMemo(
    () =>
      nodes.map((node) => {
        const presentationType = resolvePresentationType(node)
        const typeLabel = tStudio(`nodeTypes.${presentationType}`)
        const name = getNodeDisplayName(node) ?? typeLabel
        const searchText = [name, typeLabel, node.data.prompt, node.data.role]
          .filter((value): value is string => typeof value === 'string')
          .join(' ')
          .toLocaleLowerCase()

        return {
          node,
          name,
          typeLabel,
          thumbnailUrl: getNodeThumbnail(node),
          groupId: getNodeGroup(node),
          searchText,
          referenceCount: referenceCountByNodeId.get(node.id) ?? 0,
        }
      }),
    [nodes, referenceCountByNodeId, tStudio],
  )

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredEntries = normalizedQuery
    ? entries.filter((entry) => entry.searchText.includes(normalizedQuery))
    : entries

  const groups = LOCATOR_GROUPS.map((group) => ({
    ...group,
    entries: filteredEntries.filter((entry) => entry.groupId === group.id),
  })).filter((group) => group.entries.length > 0)

  return (
    <div
      className="flex min-h-full flex-col gap-3 p-3"
      data-testid="canvas-node-locator"
    >
      <label className="relative block">
        <span className="sr-only">{t('searchLabel')}</span>
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2"
          style={{ color: 'var(--canvas-ink-subtle)' }}
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          aria-label={t('searchLabel')}
          placeholder={t('searchPlaceholder')}
          className="h-9 w-full rounded-lg border bg-transparent pl-8 pr-2 text-xs outline-none transition-colors placeholder:text-node-subtle focus:border-node-foreground"
          style={{
            borderColor: 'var(--canvas-stroke-regular)',
            color: 'var(--canvas-ink)',
          }}
        />
      </label>

      {nodes.length === 0 ? (
        <p className="px-1 py-6 text-center text-xs text-node-subtle">
          {t('empty')}
        </p>
      ) : groups.length === 0 ? (
        <p className="px-1 py-6 text-center text-xs text-node-subtle">
          {t('noResults')}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <section key={group.id} className="flex flex-col gap-1.5">
              <div
                className="flex items-center gap-1.5 px-1"
                style={{ color: 'var(--canvas-ink-muted)' }}
              >
                <group.Icon className="size-3.5" aria-hidden />
                <h3 className="text-2xs font-semibold">
                  {t(`groups.${group.id}`)}
                </h3>
                <span className="ml-auto text-2xs tabular-nums">
                  {group.entries.length}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                {group.entries.map((entry) => {
                  const Icon = group.Icon
                  return (
                    <button
                      key={entry.node.id}
                      type="button"
                      onClick={() => activateRow?.(entry.node.id)}
                      aria-label={t('locateNode', { name: entry.name })}
                      aria-current={entry.node.selected ? 'true' : undefined}
                      className={cn(
                        'group flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                        entry.node.selected
                          ? 'bg-node-panel-inner'
                          : 'hover:bg-node-panel-inner/70',
                      )}
                    >
                      <span
                        className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md"
                        style={{
                          background: 'var(--canvas-media-bg)',
                          color: 'var(--canvas-ink-muted)',
                        }}
                      >
                        {entry.thumbnailUrl ? (
                          // Arbitrary user/R2 media follows the same raw-img
                          // convention as reference chips.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={entry.thumbnailUrl}
                            alt=""
                            className="size-full object-cover"
                          />
                        ) : (
                          <Icon className="size-4" aria-hidden />
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span
                          className="block truncate text-xs font-medium"
                          style={{ color: 'var(--canvas-ink)' }}
                        >
                          {entry.name}
                        </span>
                        <span
                          className="block truncate text-2xs"
                          style={{ color: 'var(--canvas-ink-subtle)' }}
                        >
                          {entry.typeLabel}
                        </span>
                      </span>

                      {entry.referenceCount > 0 ? (
                        <span
                          className="shrink-0 text-2xs tabular-nums"
                          style={{ color: 'var(--canvas-ink-muted)' }}
                        >
                          {t('referenceCount', {
                            count: entry.referenceCount,
                          })}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
