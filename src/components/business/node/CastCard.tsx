'use client'

import type { ComponentType, PointerEvent as ReactPointerEvent } from 'react'
import { Send, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { NODE_STUDIO_CAST_DOCK } from '@/constants/node-studio'
import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { cn } from '@/lib/utils'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import type { CastSectionId } from './CastDock'
import { useIngestDrag } from './IngestDragLayer'
import { useNodeWorkflowActions } from './NodeWorkflowActionsContext'

interface CastCardProps {
  node: NodeWorkflowNode
  sectionId: CastSectionId
  /** Section glyph — rendered as the empty-thumbnail fallback and the
   *  type badge overlaid on a real thumbnail. */
  Icon: ComponentType<{ className?: string }>
  /** "出演 N 镜" — count of edges where this card's node is the source. */
  performanceCount: number
  /** S5c 二.1 紧凑卡肚子徽章「📷N」: referenceAssets 数 + closeup 边数之和
   *  (CastDock 一次遍历算好传入，避免每张卡各自查一遍全图边)。0 则不渲染。 */
  referenceCount?: number
  /** 徽章「♪」: 是否有 voice 边指向这张卡——存在性，不是数量。 */
  hasVoice?: boolean
  selected: boolean
  onSelect(): void
}

function trimmedOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** Card display name — same field precedence as `NodeMediaPreview.getHeaderTitle`
 *  / `NodeDetailPanel.getNodeName`, extended to the two non-image sections. */
function getCastCardName(
  node: NodeWorkflowNode,
  sectionId: CastSectionId,
): string | undefined {
  switch (sectionId) {
    case NODE_IMAGE_ROLE_IDS.character:
      return (
        trimmedOrUndefined(node.data.characterName) ||
        trimmedOrUndefined(node.data.character?.name)
      )
    case NODE_IMAGE_ROLE_IDS.background:
      return trimmedOrUndefined(node.data.backgroundName)
    case NODE_TYPE_IDS.voice:
      return (
        trimmedOrUndefined(node.data.voiceName) ||
        trimmedOrUndefined(node.data.voiceId)
      )
    case NODE_TYPE_IDS.videoReference:
      return trimmedOrUndefined(node.data.mediaLabel)
    default:
      return undefined
  }
}

/** Card thumbnail source — the node's own image for character/background,
 *  voice cover art for voice, poster frame for a reference video clip. */
function getCastCardThumbnail(
  node: NodeWorkflowNode,
  sectionId: CastSectionId,
): string | undefined {
  switch (sectionId) {
    case NODE_IMAGE_ROLE_IDS.character:
    case NODE_IMAGE_ROLE_IDS.background:
      return trimmedOrUndefined(node.data.mediaUrl)
    case NODE_TYPE_IDS.voice:
      return (
        trimmedOrUndefined(node.data.voiceCoverImage) ||
        trimmedOrUndefined(node.data.voiceReferenceCoverImage)
      )
    case NODE_TYPE_IDS.videoReference:
      return trimmedOrUndefined(node.data.videoThumbnailUrl)
    default:
      return undefined
  }
}

/**
 * §6.2 静置微倾: deterministic per-node tilt via a tiny string hash (never
 * `Math.random` — the same card must render the same angle every time).
 */
function getTiltClass(nodeId: string): string {
  const buckets = NODE_STUDIO_CAST_DOCK.tiltClasses
  let hash = 0
  for (let i = 0; i < nodeId.length; i += 1) {
    hash = (hash + nodeId.charCodeAt(i)) % buckets.length
  }
  return buckets[hash]
}

/**
 * A single Polaroid-style card in the Cast dock (§6.2). A mirrored
 * presentation of an existing canvas node — a plain tap/keyboard activation
 * opens its ⤢ detail panel (`onSelect`); a pointer drag past the threshold
 * (§6.3, `use-cast-ingest.ts`) hands it to the ingest engine to feed a
 * target node instead. The two never double-fire: the drag engine only
 * calls `onSelect` when the gesture never crossed the drag threshold, and
 * the native `onClick` only fires it for keyboard/AT activation
 * (`event.detail === 0` — a real pointer click never reaches `onClick`
 * because pointerup lands on a different element once a drag starts, or is
 * consumed by the engine's own tap path when it doesn't).
 */
export function CastCard({
  node,
  sectionId,
  Icon,
  performanceCount,
  referenceCount = 0,
  hasVoice = false,
  selected,
  onSelect,
}: CastCardProps) {
  const t = useTranslations('StudioNode.castDock')
  const tIngest = useTranslations('StudioNode.ingest')
  const { beginDrag, enterQuickThrow } = useIngestDrag()
  const { deleteNode } = useNodeWorkflowActions()
  const fallbackName = t(`sections.${sectionId}`)
  const name = getCastCardName(node, sectionId) || fallbackName
  const thumbnailUrl = getCastCardThumbnail(node, sectionId)
  const tiltClass = getTiltClass(node.id)
  const hasIdentityBadge = referenceCount > 0 || hasVoice
  const identityBadgeAria = [
    referenceCount > 0
      ? t('referenceCountAria', { count: referenceCount })
      : null,
    hasVoice ? t('voiceBoundAria') : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ')

  const quickThrowSourceInfo = { node, sectionId, label: name, thumbnailUrl }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    beginDrag({
      source: quickThrowSourceInfo,
      pointerEvent: event,
      originElement: event.currentTarget,
      onTap: onSelect,
      // S5f B2: touch entry into quick-throw — a long-press before the drag
      // threshold. Desktop uses the hover button below instead.
      onLongPress: () => enterQuickThrow(quickThrowSourceInfo),
    })
  }

  return (
    // A <div role="button"> (not <button>) — the hover-reveal delete affordance
    // below is a REAL <button>, and interactive content can't nest inside a
    // native <button> (invalid HTML / inconsistent a11y tree). Keyboard
    // activation is wired by hand (Enter/Space) to keep the same contract.
    <div
      role="button"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onClick={(event) => {
        // Keyboard/assistive-tech activation only (detail===0) — a real
        // pointer click is handled by the drag engine's tap fallback above,
        // never by this handler (see doc comment).
        if (event.detail === 0) onSelect()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
      aria-pressed={selected}
      title={name}
      // S3c 散图融合循环 §三.3 命中检测挂钩：把手/浮层内角色卡的包围盒判定
      // 读这个属性（StudioNodeWorkbench 的 onNodeDragStop），不吃 React state。
      data-cast-card-node-id={node.id}
      data-cast-section-id={sectionId}
      className={cn(
        // S5c 一.1/一.2：宽度改跟随网格列（w-full）而不是固定 w-24——固定宽度
        // 曾比 CastDock 算出的实际列宽还宽，被网格强制 overflow-x:auto 裁切
        // （DOM 实测 scrollWidth 368 > clientWidth 348，即微倾卡被裁切的根因）。
        // 高度 h-32→h-36：给新增的徽章行留出空间，不挤压已有的名字/@token/出演行。
        'node-card-paper group relative flex h-36 w-full shrink-0 cursor-pointer flex-col items-center gap-1 rounded-md border bg-node-panel p-1.5 pt-2 text-center shadow-node-panel transition-all duration-base ease-standard hover:-translate-y-0.5 hover:rotate-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-node-paint/60',
        selected
          ? 'border-node-paint/70 ring-2 ring-node-paint/60'
          : 'border-node-card-line hover:border-node-card-ink-subtle',
        tiltClass,
      )}
    >
      <button
        type="button"
        aria-label={t('deleteCard', { name })}
        title={t('deleteCard', { name })}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          deleteNode(node.id)
        }}
        className="absolute -right-1.5 -top-1.5 z-10 flex size-5 items-center justify-center rounded-full border border-node-panel-inner bg-node-panel text-node-muted opacity-0 transition-opacity hover:text-node-status-failed focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X className="size-3" aria-hidden />
      </button>
      {/* S5f B2 快投模式 (desktop entry): hover-reveal button → enter mode so
          every legal target lights up and one click per target feeds it.
          Touch uses the long-press in handlePointerDown instead. */}
      <button
        type="button"
        aria-label={tIngest('quickThrow.toggleAria', { name })}
        title={tIngest('quickThrow.toggleAria', { name })}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          enterQuickThrow(quickThrowSourceInfo)
        }}
        className="absolute -left-1.5 -top-1.5 z-10 flex size-5 items-center justify-center rounded-full border border-node-panel-inner bg-node-panel text-node-muted opacity-0 transition-opacity hover:text-node-paint focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Send className="size-2.5" aria-hidden />
      </button>
      <span className="node-card-window relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-node-card-window">
        {thumbnailUrl ? (
          <>
            {/* Reference art comes from R2/third-party covers, not a fixed set
                of app assets — same raw-img convention as ReferenceTokenChip. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbnailUrl} alt="" className="size-full object-cover" />
            <span className="absolute bottom-0 right-0 flex size-3.5 items-center justify-center rounded-tl bg-node-canvas/85 text-node-foreground">
              <Icon className="size-2" aria-hidden />
            </span>
          </>
        ) : (
          <Icon className="size-6 text-node-foreground" aria-hidden />
        )}
      </span>
      <span className="w-full truncate text-2xs font-semibold text-node-foreground">
        {name}
      </span>
      <span className="w-full truncate font-mono text-2xs text-node-subtle">
        @{name}
      </span>
      {hasIdentityBadge ? (
        <span
          className="w-full truncate text-2xs text-node-muted"
          aria-label={identityBadgeAria}
        >
          {referenceCount > 0 ? `📷${referenceCount}` : null}
          {referenceCount > 0 && hasVoice ? ' ' : null}
          {hasVoice ? '♪' : null}
        </span>
      ) : null}
      {performanceCount > 0 ? (
        <span className="w-full truncate text-2xs text-node-muted">
          {t('performanceCount', { count: performanceCount })}
        </span>
      ) : null}
    </div>
  )
}
