'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import {
  Handle,
  NodeToolbar,
  Position,
  useEdges,
  useNodes,
} from '@xyflow/react'
import {
  AudioWaveform,
  Mountain,
  Play,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_TOKEN_BADGE_LABELS,
  type NodeTokenType,
} from '@/constants/node-tokens'
import { NODE_TYPE_IDS, type NodeWorkflowStatus } from '@/constants/node-types'
import { IMEAwareInput } from '@/components/business/node/inspector/IMEAwareField'
import { resolveNodePresentationType } from '@/lib/node-presentation'
import { focusUnlessTouch } from '@/lib/touch'
import { getUpstreamNodes } from '@/lib/node-workflow-graph'
import { cn } from '@/lib/utils'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import type { NodeWorkflowNodeData } from '@/types/node-workflow'

import { NodeSelectionToolbarChrome } from '../CanvasImageSelectionToolbar'
import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { NodeStatusBadge } from './NodeStatusBadge'

/** S2 成分栏最多展示的 chip 数，溢出折叠为「+N」（施工图改动清单⑤）。 */
const MAX_VISIBLE_INGREDIENTS = 4

interface NodeShellRootProps {
  type: NodeTokenType
  /** When set, a Figma-style floating toolbar (⤢ / delete) shows on select. */
  nodeId?: string
  selected?: boolean
  /**
   * The node's own data, read by the selection toolbar (R3-3
   * `NodeSelectionToolbarChrome`): when it carries an image URL the toolbar
   * expands into the Haivis-aligned image-edit capability strip; for every
   * other type it feeds the registry-driven identity/capability/universal
   * regions (rename field, generate/合成/更换 buttons, download). Renamed
   * from `imageEditData` — it's no longer image-specific.
   */
  toolbarData?: NodeWorkflowNodeData
  /** When `failed`, the card gets a red border (must-1 失败态). Optional so
   *  existing callers are unaffected; node cards pass their `data.status`. */
  status?: NodeWorkflowStatus
  children: ReactNode
  showSourceHandle?: boolean
  showTargetHandle?: boolean
  /** Shot-override signal (§5.1): the node's model differs from the canvas
   *  default → a neutral dashed border (no amber, per D1) so it's scannable. */
  overridden?: boolean
  /**
   * True only for the character/background archive-card face
   * (`IdentityCollectorCard`) — see `NodeSelectionToolbarChrome`'s doc for
   * why this can't be inferred from `type` alone (a `closeup` image node
   * shares the same legacy `characterImage` type).
   */
  isCollector?: boolean
  /** Extra classes on the card root — e.g. an override width when expanded. */
  className?: string
}

interface NodeShellHeaderProps {
  type: NodeTokenType
  status: NodeWorkflowStatus
  /**
   * Optional override for the header's display name. Defaults to the
   * localized node-type label (e.g. "角色图"). Used by nodes that carry
   * a user-editable identity — for example a Character Image node shows
   * its characterName here so the canvas card title tracks renames done
   * in the Inspector.
   */
  title?: string
  /** Optional clickable breadcrumb crumb rendered before the title (e.g. a
   *  "图片 /" link on image cards that returns to the role chooser). */
  titleCrumb?: ReactNode
  /** Optional control rendered next to the status badge (e.g. a ⤢ toggle). */
  action?: ReactNode
  /**
   * When provided, the on-card title becomes click-to-edit
   * (canvas-image-card.md §1 "原地可编辑") instead of a read-only span —
   * Enter/blur commits the trimmed value through this callback, Esc reverts
   * without calling it. Never invoked with an empty string: an empty submit
   * silently reverts instead (§1 "名字升为一等公民" — a written-through empty
   * name is the exact bug class that once left the assistant unable to
   * resolve a node's name). Omit for node types with no nameable field
   * (e.g. ComposerNode/AgentNode), which keeps today's read-only label.
   */
  onRenameCommit?: (nextTitle: string) => void
}

export interface EditableNodeLabelProps {
  /** Raw current value — the custom name only, never the type-label
   *  fallback. Empty when no custom name has been set yet. */
  value: string
  /** Shown as the read-only text when `value` is empty, and reused as the
   *  input's placeholder while editing, so nothing visually jumps at the
   *  read/edit transition. */
  placeholder: string
  /** Accessible name for both the read-only trigger and the input. */
  ariaLabel: string
  /** Called with the trimmed, non-empty next value on Enter/blur. Guarded
   *  against empty submits by the caller (`EditableNodeLabel` itself never
   *  invokes this with `''`). */
  onCommit: (nextValue: string) => void
  /** Classes for the read-only trigger button. */
  className?: string
}

/**
 * Shared click-to-edit label — S4 fix for the on-card name (S1 moved it
 * outside the card, but never gave it an edit path; the near-field toolbar's
 * OWN duplicate rename input was then deleted as redundant, leaving
 * media-bearing image cards with no rename entry point at all).
 *
 * Used by `NodeShellHeader` below and by `LooseImageCard` (which doesn't go
 * through `NodeShell` and keeps its own label markup — see that file) — same
 * extraction shape as `NodeCardPorts`: shared interaction, caller-owned
 * layout/typography via `className`.
 */
export function EditableNodeLabel({
  value,
  placeholder,
  ariaLabel,
  onCommit,
  className,
}: EditableNodeLabelProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  // Enter/Esc both close the input, which can fire a native `blur` as a side
  // effect of React unmounting the still-focused element. Without this guard
  // that spurious blur would re-run the commit/cancel logic a second time —
  // harmless for Enter (same value), but for Esc it would resurrect the
  // draft `applyCommit` was told to discard. Set right before the
  // keydown-driven state change, consumed (and cleared) by the next blur.
  const suppressBlurRef = useRef(false)

  useEffect(() => {
    if (isEditing) {
      focusUnlessTouch(inputRef.current, { select: true })
    }
  }, [isEditing])

  const beginEdit = () => {
    setDraft(value)
    setIsEditing(true)
  }

  const applyCommit = () => {
    const trimmed = draft.trim()
    if (trimmed.length === 0) {
      // 空名字不静默接受（canvas-image-card.md §1）：回退到原值，不落库。
      setDraft(value)
      return
    }
    if (trimmed !== value) {
      onCommit(trimmed)
    }
  }

  const handleBlur = () => {
    if (suppressBlurRef.current) {
      suppressBlurRef.current = false
      return
    }
    applyCommit()
    setIsEditing(false)
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    // IME guard (project convention — see prompt-input.tsx): React's
    // KeyboardEvent<T> type doesn't declare `isComposing`, so it's read off
    // the native event. Enter is how many CJK IMEs confirm a candidate
    // mid-composition; without this, that keystroke would prematurely commit
    // whatever partial buffer IMEAwareInput was still assembling.
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Enter') {
      event.preventDefault()
      suppressBlurRef.current = true
      applyCommit()
      setIsEditing(false)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      suppressBlurRef.current = true
      setDraft(value)
      setIsEditing(false)
    }
  }

  if (isEditing) {
    return (
      <IMEAwareInput
        inputRef={inputRef}
        value={draft}
        onValueChange={setDraft}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        aria-label={ariaLabel}
        placeholder={placeholder}
        size={Math.min(Math.max((draft || placeholder).length, 6), 30)}
        className="canvas-label-input nodrag nopan nowheel pointer-events-auto min-w-0"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={beginEdit}
      title={value || placeholder}
      aria-label={ariaLabel}
      className={cn(
        'canvas-label-trigger nodrag pointer-events-auto min-w-0 truncate text-left',
        className,
      )}
    >
      {value || placeholder}
    </button>
  )
}

interface NodeShellSlotProps {
  children: ReactNode
  className?: string
}

// §2.3 端口图标：4 个导演元素族各一个 glyph，渲在端口内（pointer-events-none，
// 不抢 ReactFlow 的拖拽热区）；通用节点无 glyph（纯点）。
const PORT_GLYPHS: Partial<Record<NodeTokenType, LucideIcon>> = {
  characterImage: UserRound,
  backgroundImage: Mountain,
  voice: AudioWaveform,
  seedance: Play,
  videoReference: Play,
  videoMerge: Play,
  video: Play,
}

// R3-1 端口锚点化退场（canvas-relationship-v3 §2.4）: the Handle DOM stays —
// ReactFlow still anchors edges to its bounding box — but it's visually
// inert. No type-color dot, no glyph, no hover affordance, not connectable
// (binding only happens via 吞噬/快投 now). The 墨点 that used to live here
// moved onto the edge itself (NodeWorkflowStatusEdge's target-end dot), so it
// only appears where an edge is actually visible, not on every idle port.
// Kept at the same footprint as the old dot (`!size-5`) so the edge anchor
// point doesn't shift.
// R3-4 §4.1 L3: 端口是节点自身内容之上的选中/连接 chrome，只需盖过卡片内
// 无显式层级的兄弟元素——token 化不改变数值关系（局部栈内任意正值皆可）。
const HANDLE_BASE =
  '!z-canvas-selection !size-5 !border-0 !bg-transparent pointer-events-none'

/**
 * S1 端口族（规格 §7）：形状是主编码、色是辅编码。四族与节点类型的映射——
 * 图片族含全部 image 类型（统一 `image` + 三个 legacy 兼容类型 + shot），
 * 视频族含 seedance / videoReference / videoMerge，voice 是音频族；
 * 身份族由 `isCollector` 单独判定（收集器卡是「一致性身份」不是散图）。
 */
type NodePortFamily = 'image' | 'audio' | 'video' | 'identity'

const PORT_FAMILY_BY_TYPE: Partial<Record<NodeTokenType, NodePortFamily>> = {
  image: 'image',
  characterImage: 'image',
  backgroundImage: 'image',
  frameImage: 'image',
  shot: 'image',
  voice: 'audio',
  seedance: 'video',
  videoReference: 'video',
  videoMerge: 'video',
  video: 'video',
}

function resolvePortFamily(
  type: NodeTokenType,
  isCollector: boolean | undefined,
): NodePortFamily {
  if (isCollector) return 'identity'
  return PORT_FAMILY_BY_TYPE[type] ?? 'image'
}

export interface NodeCardPortsProps {
  type: NodeTokenType
  isCollector?: boolean
  showSource?: boolean
  showTarget?: boolean
}

/**
 * The two edge anchors every canvas card needs. Exported because not every
 * card goes through `NodeShell` — `LooseImageCard` (散图 / 有图的镜头图) is a
 * bare `<div>` by design (its size is owned by React Flow + NodeResizer, it
 * has no card chrome to hang off a shell), yet it still has to give ReactFlow
 * something to anchor an edge to. Without these handles the library has no
 * bounds to resolve and simply **doesn't render the edge at all** — which is
 * how 「散图→组装台」and「出了图的镜头图→组装台」(a BACKBONE edge) both went
 * invisible. Shared rather than copied so the footprint (`!size-5`) and the
 * family encoding stay in one place — an anchor that drifts moves every edge
 * endpoint on the canvas.
 *
 * Inert by design (`isConnectable={false}`) — binding happens through the drag
 * gesture, not by dragging a wire out of a port.
 */
export function NodeCardPorts({
  type,
  isCollector,
  showSource = true,
  showTarget = true,
}: NodeCardPortsProps) {
  const portFamily = resolvePortFamily(type, isCollector)
  return (
    <>
      {showTarget ? (
        <Handle
          type="target"
          position={Position.Left}
          isConnectable={false}
          className={cn(HANDLE_BASE, 'canvas-port')}
          data-family={portFamily}
        />
      ) : null}
      {showSource ? (
        <Handle
          type="source"
          position={Position.Right}
          isConnectable={false}
          className={cn(HANDLE_BASE, 'canvas-port')}
          data-family={portFamily}
        />
      ) : null}
    </>
  )
}

function NodeShellRoot({
  type,
  nodeId,
  selected,
  toolbarData,
  status,
  children,
  showSourceHandle = true,
  showTargetHandle = true,
  overridden = false,
  isCollector,
  className,
}: NodeShellRootProps) {
  // R3-7 §7 red line: suppress this card's own single-node toolbar while a
  // multi-select is active, so it can never overlap the selection-bounding-
  // box "合成 N 段" bar (or just clutter the canvas with N floating
  // toolbars) — see `multiSelectActive`'s doc comment for why this can't
  // just rely on NodeToolbar's own library default.
  const { multiSelectActive } = useNodeWorkflowActions()

  return (
    <article
      data-node-type={type}
      data-selected={selected ? 'true' : undefined}
      data-status={status}
      className={cn(
        // S1（2026-07-26）：`canvas-card` 是画布域皮肤 v0.2 的卡框（canvas.css），
        // 特异度 0,2,0 高于下面的 Tailwind 工具类，所以背景/圆角/边/投影由它接管。
        // `node-card-paper` 仍保留——它做的是容器级 --node-* 变量覆盖，让卡内
        // 子组件（Body/Footer/成分栏）在白卡上继续是深字，S1 不动卡内。
        // 选中态与失败态改由 data-selected / data-status 驱动（见 canvas.css），
        // 原来的 ring + border 组合去掉，避免和 canvas-card 的 box-shadow 打架。
        'group relative w-node-card overflow-visible node-card-paper canvas-card',
        overridden && 'border-dashed',
        className,
      )}
    >
      {nodeId ? (
        <NodeToolbar
          nodeId={nodeId}
          isVisible={Boolean(selected) && !multiSelectActive}
          position={Position.Top}
          // S1：卡名移出卡框后占了卡顶上方 28px（24 行高 + 4 间距），工具条
          // 要让开它，否则两者叠在一起。
          offset={36}
        >
          <NodeSelectionToolbarChrome
            nodeId={nodeId}
            data={toolbarData}
            selected={selected}
            nodeType={type}
            isCollector={isCollector}
          />
        </NodeToolbar>
      ) : null}
      <NodeCardPorts
        type={type}
        isCollector={isCollector}
        showSource={showSourceHandle}
        showTarget={showTargetHandle}
      />
      {children}
    </article>
  )
}

function NodeShellHeader({
  type,
  status,
  title,
  titleCrumb,
  action,
  onRenameCommit,
}: NodeShellHeaderProps) {
  const t = useTranslations('StudioNode.nodeTypes')
  const tToolbar = useTranslations('StudioNode.nodeToolbar')
  const trimmedTitle = title?.trim() ?? ''
  const typeFallback = t(type)
  const displayTitle = trimmedTitle.length > 0 ? trimmedTitle : typeFallback

  return (
    // S1（2026-07-26）：卡名移到卡「外」上方。用 canvas-card-label 的
    // absolute + bottom:100% 脱离文档流——卡的 box 尺寸一点不变，React Flow 的
    // 节点测量与端口锚点因此完全不受影响，15 个调用方也不用改签名。
    // 卡内自此是纯媒体（规格 §12.1）。状态徽章暂随卡名走；把它挪进媒体窗左上角
    // 浮标是 S4 的事，本片不动卡内。
    <header className="canvas-card-label">
      <div className="flex min-w-0 items-center gap-2">
        {/* 族图标：与端口同一套形状 + 族色编码（canvas.css .canvas-label-glyph）。
            旧皮那个带字母的方牌在 24px 标签行里太挤，也和端口的语言对不上。
            `title` 保留原来的徽标字母，读屏与 hover 仍能拿到类型。 */}
        <span
          className="canvas-label-glyph"
          data-family={PORT_FAMILY_BY_TYPE[type] ?? 'image'}
          title={NODE_TOKEN_BADGE_LABELS[type]}
          aria-hidden
        />
        <div className="flex min-w-0 items-center gap-1.5">
          {titleCrumb}
          {onRenameCommit ? (
            // S4：卡外名字原地可编辑（canvas-image-card.md §1）。placeholder
            // 复用 typeFallback——和只读态刚显示的文字完全一致，进入编辑态时
            // 屏幕上不会有任何东西突然跳变。
            <EditableNodeLabel
              value={trimmedTitle}
              placeholder={typeFallback}
              ariaLabel={tToolbar('rename')}
              onCommit={onRenameCommit}
            />
          ) : (
            <span className="truncate" title={displayTitle}>
              {displayTitle}
            </span>
          )}
        </div>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {action}
        <NodeStatusBadge status={status} />
      </div>
    </header>
  )
}

interface NodeShellIngredientsProps {
  /** The node whose incoming edges are summarized. Matches the `nodeId` this
   *  card already passes to `NodeShellRoot` — same graph-store read pattern
   *  as the Inspector reference chips (ShotInspector), just compact + inert. */
  nodeId: string
}

/**
 * S2 成分栏，S5b B1-7 只读升级为可解绑：片头条下的 chip 行，摘要「这张卡吃了
 * 哪些上游连线」，hover 露出 × 解除对应边（= 吞噬「胃取出」的紧凑卡等效，和
 * 详情面板参考素材分区的「取出」同一颗 deleteEdge）。新 chip 首次挂载播放
 * 消化落定 pop（§8，globals.css `.node-ingest-chip-pop`，只在挂载时播放一次，
 * 已存在的 chip 重渲染不会重放）。空（叶子节点/未连线）则不渲染整行。
 */
function NodeShellIngredients({ nodeId }: NodeShellIngredientsProps) {
  const tTypes = useTranslations('StudioNode.nodeTypes')
  const tVideo = useTranslations('StudioNode.videoGeneration')
  const tIngest = useTranslations('StudioNode.ingest')
  const allNodes = useNodes<NodeWorkflowNode>()
  const edges = useEdges<NodeWorkflowEdge>()
  const { deleteEdge } = useNodeWorkflowActions()

  const upstream = useMemo(
    () => getUpstreamNodes(nodeId, edges, allNodes),
    [nodeId, edges, allNodes],
  )

  if (upstream.length === 0) {
    return null
  }

  const visible = upstream.slice(0, MAX_VISIBLE_INGREDIENTS)
  const overflow = upstream.length - visible.length

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 border-b border-node-card-line px-5 py-2"
      title={tVideo('upstreamTitle')}
    >
      {visible.map((sourceNode) => {
        const presentationType = resolveNodePresentationType(sourceNode)
        const Glyph = PORT_GLYPHS[presentationType]
        const data = sourceNode.data
        // Named sources (character/background/shot/voice) show their own
        // name — mirrors NodeMediaPreview's per-role header title so the same
        // node reads with the same label everywhere. Everything else falls
        // back to the localized type label (identical to NodeShell.Header's
        // own fallback for an untitled card).
        const customName =
          presentationType === NODE_TYPE_IDS.characterImage
            ? data.characterName?.trim() || data.character?.name?.trim()
            : presentationType === NODE_TYPE_IDS.backgroundImage
              ? data.backgroundName?.trim()
              : presentationType === NODE_TYPE_IDS.shot
                ? data.shotName?.trim()
                : presentationType === NODE_TYPE_IDS.voice
                  ? data.voiceName?.trim()
                  : undefined
        const label = customName || tTypes(presentationType)
        const edgeId = edges.find(
          (edge) => edge.source === sourceNode.id && edge.target === nodeId,
        )?.id

        return (
          <span
            key={sourceNode.id}
            className="node-ingest-chip-pop group/chip inline-flex max-w-28 items-center gap-1 rounded-full bg-node-panel-soft py-0.5 pl-2 pr-1 text-2xs font-medium text-node-muted"
          >
            {Glyph ? <Glyph aria-hidden className="size-3 shrink-0" /> : null}
            <span className="truncate">{label}</span>
            {edgeId ? (
              <button
                type="button"
                aria-label={tIngest('removeIngredient', { name: label })}
                title={tIngest('removeIngredient', { name: label })}
                onClick={() => deleteEdge(edgeId)}
                className="nodrag flex size-3.5 shrink-0 items-center justify-center rounded-full text-node-subtle opacity-0 transition-opacity hover:text-node-status-failed focus-visible:opacity-100 group-hover/chip:opacity-100"
              >
                <X className="size-2.5" aria-hidden />
              </button>
            ) : null}
          </span>
        )
      })}
      {overflow > 0 ? (
        <span className="shrink-0 text-2xs font-medium text-node-subtle">
          +{overflow}
        </span>
      ) : null}
    </div>
  )
}

function NodeShellBody({ children, className }: NodeShellSlotProps) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>
}

function NodeShellFooter({ children, className }: NodeShellSlotProps) {
  return (
    <footer
      className={cn(
        'flex items-center justify-between gap-2 border-t border-node-card-line px-5 py-4',
        className,
      )}
    >
      {children}
    </footer>
  )
}

export const NodeShell = Object.assign(NodeShellRoot, {
  Header: NodeShellHeader,
  Ingredients: NodeShellIngredients,
  Body: NodeShellBody,
  Footer: NodeShellFooter,
})
