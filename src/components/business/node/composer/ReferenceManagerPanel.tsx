'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronRight,
  EllipsisVertical,
  Flag,
  Link2Off,
  Locate,
  Mic2,
  Plus,
  RotateCcw,
  ScanFace,
  Search,
  Star,
  Video,
  X,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import {
  NODE_IMAGE_ROLE_IDS,
  NODE_TYPE_IDS,
  type NodeImageRole,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import { motionTransition } from '@/constants/motion'
import type { ComposerReferenceToken } from '@/hooks/node/use-video-composer'
import { useOverlayFocusReturn } from '@/hooks/node/use-overlay-focus-return'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

import { IMEAwareInput } from '../inspector/IMEAwareField'
import {
  ReferenceTokenChip,
  type ReferenceTokenData,
  type ReferenceTokenKind,
} from './ReferenceTokenChip'

/** What the ＋添加位 hands back to the composer (§7.1, carried over from
 *  DepartmentStrip unchanged): which node type to autospawn, its image role,
 *  and which media library to open. The composer resolves an asset then calls
 *  `spawnReference`. */
export interface AddReferenceRequest {
  nodeType: NodeWorkflowNodeType
  role?: NodeImageRole
  mediaType: 'image' | 'voice' | 'video'
  /** Autospawn target override — defaults to the video node, but ＋配音 on a
   *  character row targets the CHARACTER node so the voice becomes its 音色. */
  targetNodeId?: string
}

/** Port-family accent per token kind — carried over from DepartmentStrip so
 *  the strip's left accent bar / flying-token glyph keep the same colors. */
export const TOKEN_PORT_COLOR_VAR: Record<ReferenceTokenKind, string> = {
  character: 'var(--node-port-character)',
  background: 'var(--node-port-background)',
  shot: 'var(--node-port-image)',
  keyframe: 'var(--node-port-image)',
  closeup: 'var(--node-port-image)',
  voice: 'var(--node-port-voice)',
  video: 'var(--node-port-video)',
}

type ManagerTabId = 'all' | 'character' | 'scene' | 'shot' | 'voice'

const MANAGER_TABS: readonly ManagerTabId[] = [
  'all',
  'character',
  'scene',
  'shot',
  'voice',
]

// V-3a 管理素材面板（设计稿 §4）把七种 ReferenceTokenKind 折进四个类型 tab ——
// 镜头 tab 吸收 shot/keyframe/closeup/video（都是"画面/运镜"类，非角色不是场景），
// 这样 tab 数量对齐 owner 截图（全部/角色/场景/镜头/声音），同时不丢失视频引用的
// 可见性（既有 DepartmentStrip 的"动作"卡）。
const TAB_KINDS: Record<
  Exclude<ManagerTabId, 'all'>,
  readonly ReferenceTokenKind[]
> = {
  character: ['character', 'closeup'],
  scene: ['background'],
  shot: ['shot', 'keyframe', 'video'],
  voice: ['voice'],
}

function tabForKind(kind: ReferenceTokenKind): Exclude<ManagerTabId, 'all'> {
  for (const tab of MANAGER_TABS) {
    if (tab === 'all') continue
    if (TAB_KINDS[tab].includes(kind)) return tab
  }
  return 'shot'
}

// A5: 文件夹 = 收集器卡（角色/场景，图集陈列 + 出场组的载体，§3.0a）；其余七种
// kind 里剩下的都是「文件」——单图/单音/单视频，可直接被视频吃，业务模型 v3.1
// 素材三同权本就成立，这里只是把它在列表结构里显性区分出来。
const FOLDER_KINDS: readonly ReferenceTokenKind[] = ['character', 'background']

function isFolderToken(token: ComposerReferenceToken): boolean {
  return FOLDER_KINDS.includes(token.kind)
}

interface AddSpawnConfig {
  nodeType: NodeWorkflowNodeType
  mediaType: 'image' | 'voice' | 'video'
  role?: NodeImageRole
}

const ADD_SPAWN_CONFIG: Record<
  'character' | 'scene' | 'shotImage' | 'video' | 'voice',
  AddSpawnConfig
> = {
  character: {
    nodeType: NODE_TYPE_IDS.image,
    mediaType: 'image',
    role: NODE_IMAGE_ROLE_IDS.character,
  },
  scene: {
    nodeType: NODE_TYPE_IDS.image,
    mediaType: 'image',
    role: NODE_IMAGE_ROLE_IDS.background,
  },
  shotImage: {
    nodeType: NODE_TYPE_IDS.image,
    mediaType: 'image',
    role: NODE_IMAGE_ROLE_IDS.shot,
  },
  video: { nodeType: NODE_TYPE_IDS.videoReference, mediaType: 'video' },
  voice: { nodeType: NODE_TYPE_IDS.voice, mediaType: 'voice' },
}

// A5: 面板底部三组添加位（图片/音频/视频）—— 取代旧版按 activeTab 隐藏/显示
// 的 TabAddButtons（只有匹配的 tab 才看得到对应＋），现在全部常驻可见，按媒体
// 类型分组展示；图片组内保留角色/场景/镜头图三个角色化子按钮，不因为"只剩三个
// 添加位"就丢失 role 区分（那会是真的功能倒退）。
const ADD_GROUPS: ReadonlyArray<{
  key: 'image' | 'voice' | 'video'
  buttons: ReadonlyArray<{
    key: 'character' | 'scene' | 'shotImage' | 'video' | 'voice'
    config: AddSpawnConfig
  }>
}> = [
  {
    key: 'image',
    buttons: [
      { key: 'character', config: ADD_SPAWN_CONFIG.character },
      { key: 'scene', config: ADD_SPAWN_CONFIG.scene },
      { key: 'shotImage', config: ADD_SPAWN_CONFIG.shotImage },
    ],
  },
  { key: 'voice', buttons: [{ key: 'voice', config: ADD_SPAWN_CONFIG.voice }] },
  { key: 'video', buttons: [{ key: 'video', config: ADD_SPAWN_CONFIG.video }] },
]

interface ReferenceManagerPanelProps {
  tokens: ComposerReferenceToken[]
  /** V-3a: ids of tokens whose `@token` currently appears in the node's own
   *  prompt text — drives the "已引用" strip + drawer row status. */
  referencedTokenIds: ReadonlySet<string>
  onInsert(data: ReferenceTokenData, originEl: HTMLElement): void
  onLocate?(nodeId: string): void
  /** §7.1: 删除槽位 = 删连线（节点保留）。Only offered for tokens with a
   *  direct edge into this video node (`edgeId` set). */
  onRemove?(token: ComposerReferenceToken): void
  /** §7.1 ＋添加位: fired when the drawer's per-tab ＋ resolves to a
   *  (nodeType, role, mediaType) request. Absent = ＋ affordances hidden. */
  onAddReference?(request: AddReferenceRequest): void
  /** cast-redesign: ＋配音 on a character row with no voice yet. */
  onAddVoice?(characterNodeId: string): void
  /** §9 B ＋特写 on a character row. */
  onAddCloseup?(characterNodeId: string): void
  /** V-3b 容量护栏: current model's image reference cap (Seedance ≤9).
   *  undefined = unknown model, warning suppressed rather than guessed. */
  maxReferenceImages?: number
  /** R3-6b §1 容量透明: URLs the model's cap actually CUT, mapped to an
   *  optional source label — this is `useVideoComposer`'s
   *  `sendPreview.overflow`, the exact same `assembleReferenceImagePayload`
   *  output the real generate request uses, passed straight through so this
   *  panel never recomputes truncation with its own (weaker, token-level)
   *  arithmetic. undefined/empty = nothing known to be cut. */
  imageOverflow?: ReadonlyMap<string, string | undefined>
  /** R3-6b §1: post-cap candidate count (`sendPreview.assembledImageCount`)
   *  — the number capacity math compares against `maxReferenceImages`.
   *  Distinct from `referencedTokens.length` (which only counts tokens whose
   *  @name is typed into the prompt, and undercounts a collector's onStage
   *  extras — the very gap R3-6b closes). */
  assembledImageCount?: number
  /** R3-6b §3 每镜覆写: toggle whether `assetUrl` (a gallery entry inside a
   *  folder token) rides THIS video's stage set. Only called from a folder
   *  row's per-thumbnail checkbox. */
  onToggleStage?(
    token: ComposerReferenceToken,
    assetUrl: string,
    checked: boolean,
  ): void
  /** R3-6b §3: clear a folder token's edge-level override, reverting to the
   *  card's own onStage curation. Only shown when the token's
   *  `stageOverrideActive` is true. */
  onRestoreDefaultStage?(token: ComposerReferenceToken): void
}

/** V-3a 管理素材面板（取代 DepartmentStrip 五分区，设计稿 §4）: a compact "已引用"
 *  strip always visible above the prompt, plus a "管理素材" overlay listing every
 *  connected reference with type tabs + search + per-row insert/status/⋮. Every
 *  DepartmentStrip capability survives the reshuffle — insert @token, delete an
 *  edge, autospawn a new character/scene/shot/video/voice reference, and a
 *  character's ＋配音/＋特写 — just relocated into the overlay's row overflow menu
 *  / bottom add bar instead of five always-expanded cards.
 *
 *  A5 (canvas-relationship-v3 §7b): the drawer used to be a nested
 *  ResponsiveDialog (a dialog inside the ⤢ detail panel — "画中框", owner
 *  vetoed). It's now a right-half slide-over that overlays the host detail
 *  panel in place — see the `relative` wrapper comment in VideoComposer.tsx
 *  for how the positioning anchors without prop-drilling a ref down here. */
export function ReferenceManagerPanel({
  tokens,
  referencedTokenIds,
  onInsert,
  onLocate,
  onRemove,
  onAddReference,
  onAddVoice,
  onAddCloseup,
  maxReferenceImages,
  imageOverflow,
  assembledImageCount,
  onToggleStage,
  onRestoreDefaultStage,
}: ReferenceManagerPanelProps) {
  const tc = useTranslations('StudioNode.videoComposer')
  const reducedMotion = useReducedMotion()
  const [managerOpen, setManagerOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<ManagerTabId>('all')
  const [search, setSearch] = useState('')
  const [expandedFolderIds, setExpandedFolderIds] = useState<
    ReadonlySet<string>
  >(new Set())

  // R3-4 §4.2 焦点还原: captures whatever had focus (the "管理素材" trigger
  // button, normally) the moment the overlay opens, restores it on close.
  useOverlayFocusReturn(managerOpen)

  // A5: Esc closes just this overlay, not the whole ⤢ 详情面板 behind it
  // (R3-4 §4.2 "一次一层"). NodeDetailPanel listens on `window`; a keydown
  // bubbles target → … → document → window, so a `document`-level listener
  // always runs first — stopPropagation() here keeps NodeDetailPanel's own
  // listener from also firing on the same keypress, without this component
  // needing to know NodeDetailPanel exists.
  useEffect(() => {
    if (!managerOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return
      event.stopPropagation()
      setManagerOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [managerOpen])

  const toggleFolder = (id: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const referencedTokens = useMemo(
    () => tokens.filter((token) => referencedTokenIds.has(token.id)),
    [tokens, referencedTokenIds],
  )

  // R3-6b §1 容量透明: driven by `imageOverflow` (the ACTUAL
  // `assembleReferenceImagePayload` output for this video, passed down from
  // `useVideoComposer`'s `sendPreview`), not a second independent count. The
  // old `referencedTokens`-based tally undercounted a collector's onStage
  // extras (one token, several sent URLs) — exactly the gap R3-6b closes.
  const overflowCount = imageOverflow?.size ?? 0
  const overCapacity = overflowCount > 0
  const totalImageCandidateCount = (assembledImageCount ?? 0) + overflowCount

  const searchNeedle = search.trim().toLowerCase()
  const filteredTokens = useMemo(
    () =>
      tokens.filter((token) => {
        if (activeTab !== 'all' && tabForKind(token.kind) !== activeTab) {
          return false
        }
        if (!searchNeedle) return true
        const haystack = `${token.label} ${token.token}`.toLowerCase()
        return haystack.includes(searchNeedle)
      }),
    [tokens, activeTab, searchNeedle],
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
          {tc('references.label')}
        </span>
        <span
          className={cn(
            'text-2xs tabular-nums',
            overCapacity
              ? 'font-semibold text-node-status-failed'
              : 'text-node-subtle',
          )}
        >
          {overCapacity && typeof maxReferenceImages === 'number'
            ? tc('references.counterOverflow', {
                sent: assembledImageCount ?? maxReferenceImages,
                max: maxReferenceImages,
              })
            : tc('references.counter', {
                referenced: referencedTokens.length,
                connected: tokens.length,
              })}
        </span>
      </div>

      {referencedTokens.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {referencedTokens.map((token) => (
            <StripItem
              key={token.id}
              token={token}
              onInsert={onInsert}
              onLocate={onLocate}
              onRemove={onRemove}
            />
          ))}
        </div>
      ) : (
        <p className="px-0.5 text-2xs leading-4 text-node-subtle">
          {tokens.length > 0
            ? tc('references.stripEmptyHint')
            : tc('references.emptyDept')}
        </p>
      )}

      {overCapacity ? (
        <p className="flex items-center gap-1.5 px-0.5 text-2xs leading-4 text-node-status-failed">
          <AlertTriangle className="size-3 shrink-0" />
          {tc('references.capacityWarning', {
            count: totalImageCandidateCount,
            max: maxReferenceImages ?? totalImageCandidateCount,
            truncated: overflowCount,
          })}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => setManagerOpen(true)}
        aria-expanded={managerOpen}
        className="nodrag flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-node-panel-inner px-3 py-1.5 text-2xs font-semibold text-node-muted transition-colors hover:border-node-edge hover:text-node-foreground"
      >
        {tc('references.manageButton', { count: tokens.length })}
      </button>

      <AnimatePresence>
        {managerOpen ? (
          <motion.div
            key="reference-manager-overlay"
            role="dialog"
            aria-label={tc('references.manageTitle')}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={motionTransition('slow', reducedMotion)}
            // A5: 右半覆盖，非全局 L 层——z 只需盖过本卷同级的静态内容（监视器/
            // 双栏），不进 R3-4 的 --z-index-canvas-* 阶梯（那是画布级 L0-L8）。
            className="absolute inset-y-0 right-0 z-10 flex w-full flex-col overflow-hidden border-l border-node-panel-inner bg-node-panel shadow-node-panel @2xl:w-1/2"
          >
            <div className="flex shrink-0 items-start justify-between gap-2 border-b border-node-panel-inner px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-node-foreground">
                  {tc('references.manageTitle')}
                </p>
                <p className="truncate text-2xs text-node-muted">
                  {tc('references.manageDescription')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManagerOpen(false)}
                aria-label={tc('references.closeManager')}
                title={tc('references.closeManager')}
                className="nodrag flex size-7 shrink-0 items-center justify-center rounded-md text-node-muted transition-colors hover:bg-node-panel-inner hover:text-node-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="shrink-0 space-y-2 border-b border-node-panel-inner p-2.5">
              <Tabs
                value={activeTab}
                onValueChange={(value) => setActiveTab(value as ManagerTabId)}
              >
                <TabsList className="w-full bg-node-panel-inner">
                  {MANAGER_TABS.map((tab) => (
                    <TabsTrigger
                      key={tab}
                      value={tab}
                      className="text-2xs data-[state=active]:bg-node-panel data-[state=active]:text-node-foreground"
                    >
                      {tc(`references.tabs.${tab}`)}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-node-subtle" />
                <IMEAwareInput
                  value={search}
                  onValueChange={setSearch}
                  placeholder={tc('references.searchPlaceholder')}
                  aria-label={tc('references.searchPlaceholder')}
                  className="h-8 w-full rounded-lg border border-node-panel-inner bg-node-panel-soft py-1.5 pl-8 pr-2.5 text-2xs text-node-foreground outline-none placeholder:text-node-subtle focus-visible:border-node-edge"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain p-2.5">
              {filteredTokens.length === 0 ? (
                <p className="px-1 py-4 text-center text-2xs text-node-subtle">
                  {tc('references.managerEmpty')}
                </p>
              ) : (
                filteredTokens.map((token) =>
                  isFolderToken(token) ? (
                    <FolderRow
                      key={token.id}
                      token={token}
                      referenced={referencedTokenIds.has(token.id)}
                      expanded={expandedFolderIds.has(token.id)}
                      onToggleExpand={() => toggleFolder(token.id)}
                      onInsert={onInsert}
                      onLocate={onLocate}
                      onRemove={onRemove}
                      onAddVoice={onAddVoice}
                      onAddCloseup={onAddCloseup}
                      imageOverflow={imageOverflow}
                      onToggleStage={onToggleStage}
                      onRestoreDefaultStage={onRestoreDefaultStage}
                    />
                  ) : (
                    <ManagerRow
                      key={token.id}
                      token={token}
                      referenced={referencedTokenIds.has(token.id)}
                      onInsert={onInsert}
                      onLocate={onLocate}
                      onRemove={onRemove}
                      onAddVoice={onAddVoice}
                      onAddCloseup={onAddCloseup}
                      imageOverflow={imageOverflow}
                    />
                  ),
                )
              )}
            </div>

            {onAddReference ? (
              <PanelAddBar onAddReference={onAddReference} />
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

/** A5 面板底部常驻添加位——按媒体类型分三组（图片/音频/视频），图片组内保留
 *  角色/场景/镜头图三个 role 化子按钮。取代旧版仅在匹配 tab 下才现身的
 *  TabAddButtons：所有＋现在任何 tab 都摸得到，纯呈现层改动，spawnReference /
 *  AssetSelectorDialog 通道不变（VideoComposer 侧 onAddReference 实现不动）。 */
function PanelAddBar({
  onAddReference,
}: {
  onAddReference(request: AddReferenceRequest): void
}) {
  const tc = useTranslations('StudioNode.videoComposer')

  const fire = (config: AddSpawnConfig) =>
    onAddReference({
      nodeType: config.nodeType,
      role: config.role,
      mediaType: config.mediaType,
    })

  return (
    <div className="shrink-0 space-y-1.5 border-t border-node-panel-inner p-2.5">
      {ADD_GROUPS.map((group) => (
        <div key={group.key} className="flex flex-wrap items-center gap-1.5">
          <span className="text-3xs font-semibold uppercase tracking-nav-dense text-node-subtle">
            {tc(`references.addGroups.${group.key}`)}
          </span>
          {group.buttons.map((button) => (
            <button
              key={button.key}
              type="button"
              onClick={() => fire(button.config)}
              className="nodrag flex items-center gap-1 rounded-full border border-dashed border-node-panel-inner px-2 py-1 text-2xs font-semibold text-node-muted transition-colors hover:border-node-edge hover:text-node-foreground"
            >
              <Plus className="size-3" />
              {tc(`references.addButtons.${button.key}`)}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

function tokenThumb(token: ComposerReferenceToken): string | undefined {
  return token.kind === 'voice' ? token.coverImage : token.mediaUrl
}

function KindIcon({ kind }: { kind: ReferenceTokenKind }) {
  if (kind === 'voice') return <Mic2 className="size-4" />
  if (kind === 'video') return <Video className="size-4" />
  return null
}

/** 已引用 strip pill — thin wrapper around the existing ReferenceTokenChip (its
 *  hover preview / click-to-insert stays byte-identical) plus a hover-× that
 *  detaches the edge, carried over from DepartmentStrip's slot overlay. */
function StripItem({
  token,
  onInsert,
  onLocate,
  onRemove,
}: {
  token: ComposerReferenceToken
  onInsert(data: ReferenceTokenData, originEl: HTMLElement): void
  onLocate?(nodeId: string): void
  onRemove?(token: ComposerReferenceToken): void
}) {
  const tc = useTranslations('StudioNode.videoComposer')
  return (
    <span className="group/strip relative inline-flex">
      <ReferenceTokenChip
        data={token}
        onInsert={onInsert}
        onLocate={onLocate}
      />
      {onRemove && token.edgeId ? (
        <button
          type="button"
          aria-label={tc('references.remove', {
            name: token.label || token.token || tc(`refKind.${token.kind}`),
          })}
          onClick={() => onRemove(token)}
          className="absolute -right-1.5 -top-1.5 z-10 flex size-5 items-center justify-center rounded-full border border-node-panel-inner bg-node-panel text-node-muted opacity-0 transition-opacity hover:text-node-foreground focus-visible:opacity-100 group-hover/strip:opacity-100"
        >
          <Link2Off className="size-3" />
        </button>
      ) : null}
    </span>
  )
}

/** Shared row-level ⋮ overflow: locate / disconnect / character-only
 *  add-voice+add-closeup. Used by both the folder row and the file row so the
 *  menu contents never drift between the two shapes. */
function RowOverflowMenu({
  token,
  displayName,
  onLocate,
  onRemove,
  onAddVoice,
  onAddCloseup,
}: {
  token: ComposerReferenceToken
  displayName: string
  onLocate?(nodeId: string): void
  onRemove?(token: ComposerReferenceToken): void
  onAddVoice?(characterNodeId: string): void
  onAddCloseup?(characterNodeId: string): void
}) {
  const tc = useTranslations('StudioNode.videoComposer')
  const hasMenu = Boolean(
    (onLocate && token.id) ||
    (onRemove && token.edgeId) ||
    (onAddVoice && token.kind === 'character' && !token.boundVoice) ||
    (onAddCloseup && token.kind === 'character'),
  )
  if (!hasMenu) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={tc('references.rowMenu')}
          className="nodrag flex size-6 shrink-0 items-center justify-center rounded-md text-node-muted transition-colors hover:text-node-foreground"
        >
          <EllipsisVertical className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onLocate ? (
          <DropdownMenuItem onClick={() => onLocate(token.id)}>
            <Locate className="size-3.5" />
            {tc('references.rowLocate')}
          </DropdownMenuItem>
        ) : null}
        {onAddVoice && token.kind === 'character' && !token.boundVoice ? (
          <DropdownMenuItem onClick={() => onAddVoice(token.id)}>
            <Mic2 className="size-3.5" />
            {tc('references.addVoice', { name: displayName })}
          </DropdownMenuItem>
        ) : null}
        {onAddCloseup && token.kind === 'character' ? (
          <DropdownMenuItem onClick={() => onAddCloseup(token.id)}>
            <ScanFace className="size-3.5" />
            {tc('references.addCloseup', { name: displayName })}
          </DropdownMenuItem>
        ) : null}
        {onRemove && token.edgeId ? (
          <DropdownMenuItem
            variant="destructive"
            onClick={() => onRemove(token)}
          >
            <Link2Off className="size-3.5" />
            {tc('references.rowRemove')}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Shared referenced/insert/hint trailing status — identical between the
 *  folder row and the file row (a collector's own @token inserts its ★主图,
 *  same insert semantics as any other reference). */
function RowStatus({
  token,
  referenced,
  onInsert,
}: {
  token: ComposerReferenceToken
  referenced: boolean
  onInsert(data: ReferenceTokenData, originEl: HTMLElement): void
}) {
  const tc = useTranslations('StudioNode.videoComposer')
  const insertable = token.insertable !== false && Boolean(token.token)
  const noInsertHint = insertable
    ? undefined
    : !token.token
      ? token.kind === 'keyframe'
        ? tc('references.keyframeHint')
        : token.kind === 'voice'
          ? tc('references.voiceNotReadyHint')
          : tc('references.unnamedHint')
      : token.kind === 'video'
        ? tc('references.videoAutoHint')
        : undefined

  if (referenced) {
    return (
      <span className="shrink-0 rounded-full bg-node-panel-inner px-2 py-0.5 text-3xs font-semibold text-node-foreground">
        {tc('references.statusReferenced')}
      </span>
    )
  }
  if (insertable) {
    return (
      <button
        type="button"
        onClick={(event) => onInsert(token, event.currentTarget)}
        className="nodrag shrink-0 rounded-full border border-node-panel-inner px-2 py-0.5 text-3xs font-semibold text-node-muted transition-colors hover:border-node-edge hover:text-node-foreground"
      >
        {tc('references.statusInsert')}
      </button>
    )
  }
  if (noInsertHint) {
    return (
      <span
        className={cn(
          'shrink-0 text-3xs leading-4',
          token.dimmed ? 'text-node-status-failed' : 'text-node-subtle',
        )}
      >
        {noInsertHint}
      </span>
    )
  }
  return null
}

/** R3-6b §1 容量透明: whether `url` is one of the model-cap-truncated
 *  candidates — the SAME `assembleReferenceImagePayload` output
 *  `sendPreview.overflow` reports, never recomputed here. */
function isUrlOverflowed(
  url: string | undefined,
  imageOverflow: ReadonlyMap<string, string | undefined> | undefined,
): boolean {
  return Boolean(url && imageOverflow?.has(url))
}

/** R3-6b §1: small ⚠ corner badge for a truncated thumbnail — same visual
 *  language as the folder grid's ★/🏳 corner badges, just warning-colored. */
function OverflowCornerBadge({ title }: { title: string }) {
  return (
    <span
      title={title}
      className="absolute bottom-0.5 right-0.5 flex size-3.5 items-center justify-center rounded-full bg-node-status-failed text-node-status-failed-fg"
    >
      <AlertTriangle className="size-2" />
    </span>
  )
}

/** A row inside the 管理素材 overlay's list: thumbnail + name + kind + @token +
 *  status (已引用 badge / 插入 button / a hint for why it can't be inserted) +
 *  a ⋮ overflow for locate / disconnect / character-only add-voice/add-closeup.
 *  Handles the "file" kinds — shot/keyframe/closeup/voice/video, everything
 *  that ISN'T a collector (see `FolderRow` for character/background). */
function ManagerRow({
  token,
  referenced,
  onInsert,
  onLocate,
  onRemove,
  onAddVoice,
  onAddCloseup,
  imageOverflow,
}: {
  token: ComposerReferenceToken
  referenced: boolean
  onInsert(data: ReferenceTokenData, originEl: HTMLElement): void
  onLocate?(nodeId: string): void
  onRemove?(token: ComposerReferenceToken): void
  onAddVoice?(characterNodeId: string): void
  onAddCloseup?(characterNodeId: string): void
  imageOverflow?: ReadonlyMap<string, string | undefined>
}) {
  const tc = useTranslations('StudioNode.videoComposer')
  const thumb = tokenThumb(token)
  const displayName = token.label || tc(`refKind.${token.kind}`)
  const overflowed = isUrlOverflowed(token.mediaUrl, imageOverflow)

  return (
    <div className="flex items-center gap-2 rounded-lg border border-node-panel-inner bg-node-panel-soft px-2 py-1.5">
      <span
        className={cn(
          'relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-node-panel-inner',
          token.kind === 'voice' ? 'rounded-full' : 'rounded-md',
          overflowed && 'opacity-40',
        )}
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="size-full object-cover" />
        ) : (
          <span
            className="flex size-full items-center justify-center text-node-muted"
            style={{ background: `${TOKEN_PORT_COLOR_VAR[token.kind]}33` }}
          >
            <KindIcon kind={token.kind} />
          </span>
        )}
        {overflowed ? (
          <OverflowCornerBadge title={tc('references.willNotSendHint')} />
        ) : null}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-2xs font-semibold text-node-foreground">
          {displayName}
        </p>
        <p className="flex items-center gap-1 text-3xs text-node-subtle">
          <span>{tc(`refKind.${token.kind}`)}</span>
          {token.token ? (
            <span className="font-mono">{token.token}</span>
          ) : null}
        </p>
        {overflowed ? (
          <p className="text-3xs font-semibold text-node-status-failed">
            {tc('references.willNotSendHint')}
          </p>
        ) : null}
      </div>

      <RowStatus token={token} referenced={referenced} onInsert={onInsert} />
      <RowOverflowMenu
        token={token}
        displayName={displayName}
        onLocate={onLocate}
        onRemove={onRemove}
        onAddVoice={onAddVoice}
        onAddCloseup={onAddCloseup}
      />
    </div>
  )
}

/** A5 / R3-6b §3: the "folder" row for a collector token (character/
 *  background) — a card-thumbnail head (name + role + gallery count + 已绑
 *  音色 badge + R3-6b "恢复默认" when an override is active) that expands into
 *  a thumbnail grid of the card's `referenceAssets` gallery. Picking ★主图,
 *  adding, or deleting a gallery entry stays the job of
 *  `CharacterImageReferenceControls` (that card's OWN detail panel) — this
 *  panel adds exactly one interaction on top of the read-only preview: a
 *  per-thumbnail 出场 checkbox that writes THIS video's edge-level
 *  `stageOverrideUrls` (§3.0a 每镜覆写), since this panel is the one place
 *  that's inherently per-video. The leading gutter before the expand chevron
 *  stays a reserved empty placeholder (unrelated to the checkbox, which lives
 *  on each grid thumbnail instead — see `onToggleStage`). */
function FolderRow({
  token,
  referenced,
  expanded,
  onToggleExpand,
  onInsert,
  onLocate,
  onRemove,
  onAddVoice,
  onAddCloseup,
  imageOverflow,
  onToggleStage,
  onRestoreDefaultStage,
}: {
  token: ComposerReferenceToken
  referenced: boolean
  expanded: boolean
  onToggleExpand(): void
  onInsert(data: ReferenceTokenData, originEl: HTMLElement): void
  onLocate?(nodeId: string): void
  onRemove?(token: ComposerReferenceToken): void
  onAddVoice?(characterNodeId: string): void
  onAddCloseup?(characterNodeId: string): void
  imageOverflow?: ReadonlyMap<string, string | undefined>
  onToggleStage?(
    token: ComposerReferenceToken,
    assetUrl: string,
    checked: boolean,
  ): void
  onRestoreDefaultStage?(token: ComposerReferenceToken): void
}) {
  const tc = useTranslations('StudioNode.videoComposer')
  const thumb = tokenThumb(token)
  const displayName = token.label || tc(`refKind.${token.kind}`)
  const gallery = token.galleryAssets ?? []
  const canEditStage = Boolean(onToggleStage && token.edgeId)

  return (
    <div className="overflow-hidden rounded-lg border border-node-panel-inner bg-node-panel-soft">
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        {/* R3-6 出场勾选位预留 — 空占位，先不接交互（见下方网格内每张缩略的
            出场复选框，才是 R3-6b 的实际交互落点） */}
        <span aria-hidden className="size-1 shrink-0" />
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          aria-label={
            expanded
              ? tc('references.folderCollapse', { name: displayName })
              : tc('references.folderExpand', { name: displayName })
          }
          className="nodrag flex size-6 shrink-0 items-center justify-center rounded-md text-node-muted transition-colors hover:bg-node-panel-inner hover:text-node-foreground"
        >
          <ChevronRight
            className={cn(
              'size-3.5 transition-transform',
              expanded && 'rotate-90',
            )}
          />
        </button>

        <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-node-panel-inner">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="size-full object-cover" />
          ) : (
            <span
              className="flex size-full items-center justify-center text-node-muted"
              style={{ background: `${TOKEN_PORT_COLOR_VAR[token.kind]}33` }}
            />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-2xs font-semibold text-node-foreground">
            {displayName}
          </p>
          <p className="flex flex-wrap items-center gap-1 text-3xs text-node-subtle">
            <span>{tc(`refKind.${token.kind}`)}</span>
            <span aria-hidden>·</span>
            <span>
              {gallery.length > 0
                ? tc('references.galleryCount', { count: gallery.length })
                : tc('references.galleryEmpty')}
            </span>
            {token.kind === 'character' && token.boundVoice ? (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-node-panel-inner px-1.5 py-0.5 text-3xs font-semibold text-node-foreground">
                <Mic2 className="size-2.5" />
                {tc('references.voiceBoundBadge')}
              </span>
            ) : null}
          </p>
        </div>

        <RowStatus token={token} referenced={referenced} onInsert={onInsert} />
        {token.stageOverrideActive && onRestoreDefaultStage ? (
          <button
            type="button"
            onClick={() => onRestoreDefaultStage(token)}
            aria-label={tc('references.restoreDefaultStage', {
              name: displayName,
            })}
            title={tc('references.restoreDefaultStage', { name: displayName })}
            className="nodrag flex size-6 shrink-0 items-center justify-center rounded-md text-node-muted transition-colors hover:bg-node-panel-inner hover:text-node-foreground"
          >
            <RotateCcw className="size-3.5" />
          </button>
        ) : null}
        <RowOverflowMenu
          token={token}
          displayName={displayName}
          onLocate={onLocate}
          onRemove={onRemove}
          onAddVoice={onAddVoice}
          onAddCloseup={onAddCloseup}
        />
      </div>

      <div className="node-collapsible" data-open={expanded || undefined}>
        <div>
          <div className="grid grid-cols-4 gap-1.5 border-t border-node-panel-inner p-2">
            {gallery.length === 0 ? (
              <p className="col-span-4 py-2 text-center text-3xs text-node-subtle">
                {tc('references.galleryEmpty')}
              </p>
            ) : (
              gallery.map((asset) => {
                const overflowed = isUrlOverflowed(asset.url, imageOverflow)
                return (
                  <span
                    key={asset.id}
                    className={cn(
                      'node-card-window relative aspect-square overflow-hidden rounded-md border border-node-panel-inner bg-node-card-window',
                      overflowed && 'opacity-40',
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={asset.url}
                      alt=""
                      className="size-full object-cover"
                    />
                    {asset.isPrimary ? (
                      <span className="absolute right-0.5 top-0.5 flex size-3.5 items-center justify-center rounded-full bg-node-paint/90 text-node-canvas">
                        <Star className="size-2" fill="currentColor" />
                      </span>
                    ) : null}
                    {/* R3-6a §4: read-only mirror of CharacterImageReferenceControls'
                        〈出场〉章 — the primary is implicitly always on stage (its
                        own ★ badge above already says so), so this only marks a
                        NON-primary onStage extra. */}
                    {!asset.isPrimary && asset.onStage ? (
                      <span
                        title={tc('references.onStageBadge')}
                        className="absolute bottom-0.5 left-0.5 flex size-3.5 items-center justify-center rounded-full bg-node-foreground/80 text-node-canvas"
                      >
                        <Flag className="size-2" fill="currentColor" />
                      </span>
                    ) : null}
                    {overflowed ? (
                      <OverflowCornerBadge
                        title={tc('references.willNotSendHint')}
                      />
                    ) : null}
                    {/* R3-6b §3 每镜覆写: per-thumbnail 出场 checkbox — the
                        panel's one interactive control (§ FolderRow doc
                        comment). Primary stays forced-on + disabled (覆写
                        不能让主图消失, see getNodeStageMediaUrls). */}
                    {asset.isPrimary ? (
                      <span
                        title={tc('references.primaryAlwaysStaged')}
                        className="absolute left-0.5 top-0.5 flex size-5 items-center justify-center rounded-md bg-node-canvas/80"
                      >
                        <input
                          type="checkbox"
                          checked
                          disabled
                          aria-label={tc('references.stageCheckboxLabel', {
                            name: displayName,
                          })}
                          className="size-3.5 accent-node-paint"
                        />
                      </span>
                    ) : canEditStage ? (
                      <label className="absolute left-0.5 top-0.5 flex size-5 cursor-pointer items-center justify-center rounded-md bg-node-canvas/80">
                        <input
                          type="checkbox"
                          checked={Boolean(asset.stagedForVideo)}
                          onChange={(event) =>
                            onToggleStage?.(
                              token,
                              asset.url,
                              event.target.checked,
                            )
                          }
                          aria-label={tc('references.stageCheckboxLabel', {
                            name: displayName,
                          })}
                          className="size-3.5 accent-node-paint"
                        />
                      </label>
                    ) : null}
                  </span>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
