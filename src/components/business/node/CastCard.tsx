'use client'

import type { ComponentType, PointerEvent as ReactPointerEvent } from 'react'
import { Send, X } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { NODE_STUDIO_CAST_DOCK } from '@/constants/node-studio'
import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import {
  countPulseInitial,
  countPulseTransition,
  useCountPulse,
} from '@/hooks/node/use-count-pulse'
import { resolveNodeDisplayName } from '@/lib/node-display-name'
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

/** Card display name — single source of truth is `resolveNodeDisplayName`
 *  (画布修法 08-A：这里此前手抄了一份按 sectionId 分支的同款优先链，绕开了
 *  读侧的机器值守卫——「选已有图」写入口把上传备注常量当名字写进
 *  characterName/backgroundName/mediaLabel 时，这张卡会照单展示。四个
 *  section 各自只有一个专属身份字段，与共享解析器的优先链结果一致，故这里
 *  不再需要按 sectionId 分支；`voiceId` 兜底是本卡独有的（resolver 不认
 *  id 类字段），单独保留）。 */
function getCastCardName(node: NodeWorkflowNode): string | undefined {
  return (
    resolveNodeDisplayName(node.data) ?? trimmedOrUndefined(node.data.voiceId)
  )
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
  const reducedMotion = useReducedMotion()
  // 画布修法 05 节「拖了必有回音」：素材拖进这张卡对应的角色/场景后，
  // referenceCount 会变大——▦N/📷N 是同一语义的两处显示，共享同一个
  // pulse hook（见 IdentityCollectorCard 里的姊妹用法）。
  const pulseKey = useCountPulse(referenceCount)
  const fallbackName = t(`sections.${sectionId}`)
  const name = getCastCardName(node) || fallbackName
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
      // A4 ③按下反馈实测发现：`.node-card-paper`（globals.css，未入
      // @layer，S2 场记卡作用域）自带 `transition: rotate var(--duration-base)
      // ...`——未分层的 CSS 优先级恒高于 Tailwind 生成的分层 utility 类，导致
      // 挂在同一元素上的 `transition-all duration-fast` className 从未真正
      // 生效（DevTools 确定性验证：computed transitionProperty 一直是
      // `rotate`，hover 上浮/边框变色全程硬切，只有微倾 rotate 真的在过渡）。
      // 用行内 style 覆盖（行内样式恒压过外部样式表，不分层级）拿回
      // `transition: all`，press/hover/归正才真正跑动画；ReactFlow 的拖拽回
      // 正选择器（`.react-flow__node.dragging .node-card-paper`）只命中真实
      // 画布节点卡（NodeShell），不命中卡匣里的这张镜像卡，互不干扰，也不改
      // 这条全局共享规则本身（NodeShell 等其它消费者维持原样）。
      style={{ transition: 'all var(--duration-fast) var(--ease-standard)' }}
      data-selected={selected ? 'true' : undefined}
      className={cn(
        // S5c 一.1/一.2：宽度改跟随网格列（w-full）而不是固定 w-24——固定宽度
        // 曾比 CastDock 算出的实际列宽还宽，被网格强制 overflow-x:auto 裁切
        // （DOM 实测 scrollWidth 368 > clientWidth 348，即微倾卡被裁切的根因）。
        // 高度 h-32→h-36：给新增的徽章行留出空间，不挤压已有的名字/@token/出演行。
        // A4 ③按下反馈：active:scale-95，与工具条按压同规格 fast(120ms，见
        // 上方 style 覆盖注释)。
        // v0.2（2026-07-27）：换成 canvas-card（白卡/发丝边/8 圆角/hover 抬升
        // 投影），退掉 .node-card-paper 暖纸皮——该类另一个作用（拖拽微倾的
        // transition:rotate）从不命中这张镜像卡（见 NodeShell 拖拽回正一节的
        // 注释），删掉零副作用。选中态从旧 --node-paint 绿环改成 canvas-card
        // 自带的 data-selected 蓝环（--canvas-accent），与全域「选中=强调蓝」
        // 语义统一，不再单独留一份绿色选中语义。
        'canvas-card group relative flex h-36 w-full shrink-0 cursor-pointer flex-col items-center gap-1 p-1.5 pt-2 text-center hover:-translate-y-0.5 hover:rotate-0 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
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
        // R3-4 §4.1 L3: hover-reveal chrome riding above this card's own
        // thumbnail content, same tier as the selection/magnet badges.
        className="canvas-cast-badge-btn absolute -right-1.5 -top-1.5 z-canvas-selection flex size-5 items-center justify-center rounded-full opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
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
        className="canvas-cast-badge-btn canvas-cast-badge-btn--accent absolute -left-1.5 -top-1.5 z-canvas-selection flex size-5 items-center justify-center rounded-full opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Send className="size-2.5" aria-hidden />
      </button>
      {/* v0.2（2026-07-27）：媒体窗底换 --canvas-media-bg（规格 §10），退掉
          .node-card-window 的深监视器皮——那套是给 video/audio kind 的
          NodeMediaPreview 用的，不再适合这里。角标沿用「深底浮标 + 浅字」
          结构不变（贴在任意缩略图上都要保证可读，跟整体明暗档无关），只是
          颜色源换成 v0.2 的 ink/action-fg 字面值。 */}
      <span
        className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-sm"
        style={{
          background: 'var(--canvas-media-bg)',
          color: 'var(--canvas-ink-muted)',
        }}
      >
        {thumbnailUrl ? (
          <>
            {/* Reference art comes from R2/third-party covers, not a fixed set
                of app assets — same raw-img convention as ReferenceTokenChip. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbnailUrl} alt="" className="size-full object-cover" />
            <span
              className="absolute bottom-0 right-0 flex size-3.5 items-center justify-center rounded-tl"
              style={{
                background: 'rgba(10, 10, 10, 0.85)',
                color: 'var(--canvas-action-fg)',
              }}
            >
              <Icon className="size-2" aria-hidden />
            </span>
          </>
        ) : (
          <Icon className="size-6" aria-hidden />
        )}
      </span>
      <span
        className="w-full truncate text-2xs font-semibold"
        style={{ color: 'var(--canvas-ink)' }}
      >
        {name}
      </span>
      <span
        className="w-full truncate font-mono text-2xs"
        style={{ color: 'var(--canvas-ink-subtle)' }}
      >
        @{name}
      </span>
      {hasIdentityBadge ? (
        <motion.span
          key={pulseKey}
          initial={countPulseInitial(pulseKey)}
          animate={{ scale: 1 }}
          transition={countPulseTransition(reducedMotion)}
          className="w-full truncate text-2xs"
          style={{ color: 'var(--canvas-ink-muted)' }}
          aria-label={identityBadgeAria}
        >
          {referenceCount > 0 ? `📷${referenceCount}` : null}
          {referenceCount > 0 && hasVoice ? ' ' : null}
          {hasVoice ? '♪' : null}
        </motion.span>
      ) : null}
      {performanceCount > 0 ? (
        <span
          className="w-full truncate text-2xs"
          style={{ color: 'var(--canvas-ink-muted)' }}
        >
          {t('performanceCount', { count: performanceCount })}
        </span>
      ) : null}
    </div>
  )
}
