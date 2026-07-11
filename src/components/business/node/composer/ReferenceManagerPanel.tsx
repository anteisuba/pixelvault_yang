'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  EllipsisVertical,
  Link2Off,
  Locate,
  Mic2,
  Plus,
  ScanFace,
  Search,
  Video,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_IMAGE_ROLE_IDS,
  NODE_TYPE_IDS,
  type NodeImageRole,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import type { ComposerReferenceToken } from '@/hooks/node/use-video-composer'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from '@/components/ui/responsive-dialog'
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
}

const IMAGE_KINDS: readonly ReferenceTokenKind[] = [
  'character',
  'background',
  'shot',
  'closeup',
]

/** V-3a 管理素材面板（取代 DepartmentStrip 五分区，设计稿 §4）: a compact "已引用"
 *  strip always visible above the prompt, plus a "管理素材" drawer listing every
 *  connected reference with type tabs + search + per-row insert/status/⋮. Every
 *  DepartmentStrip capability survives the reshuffle — insert @token, delete an
 *  edge, autospawn a new character/scene/shot/video/voice reference, and a
 *  character's ＋配音/＋特写 — just relocated into the drawer's tab toolbar / row
 *  overflow menu instead of five always-expanded cards. */
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
}: ReferenceManagerPanelProps) {
  const tc = useTranslations('StudioNode.videoComposer')
  const [managerOpen, setManagerOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<ManagerTabId>('all')
  const [search, setSearch] = useState('')

  const referencedTokens = useMemo(
    () => tokens.filter((token) => referencedTokenIds.has(token.id)),
    [tokens, referencedTokenIds],
  )

  const referencedImageCount = useMemo(
    () =>
      referencedTokens.filter((token) => IMAGE_KINDS.includes(token.kind))
        .length,
    [referencedTokens],
  )
  const overCapacity =
    typeof maxReferenceImages === 'number' &&
    referencedImageCount > maxReferenceImages

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
        <span className="text-2xs tabular-nums text-node-subtle">
          {tc('references.counter', {
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
            count: referencedImageCount,
            max: maxReferenceImages,
          })}
        </p>
      ) : null}

      <ResponsiveDialog open={managerOpen} onOpenChange={setManagerOpen}>
        <ResponsiveDialogTrigger asChild>
          <button
            type="button"
            className="nodrag flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-node-panel-inner px-3 py-1.5 text-2xs font-semibold text-node-muted transition-colors hover:border-node-edge hover:text-node-foreground"
          >
            {tc('references.manageButton', { count: tokens.length })}
          </button>
        </ResponsiveDialogTrigger>
        <ResponsiveDialogContent className="dark border-node-panel-inner bg-node-panel text-node-foreground sm:max-w-lg">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle className="text-node-foreground">
              {tc('references.manageTitle')}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription className="text-node-muted">
              {tc('references.manageDescription')}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <div className="space-y-3">
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

            {onAddReference ? (
              <TabAddButtons
                activeTab={activeTab}
                onAddReference={onAddReference}
              />
            ) : null}

            <div className="max-h-80 space-y-1 overflow-y-auto">
              {filteredTokens.length === 0 ? (
                <p className="px-1 py-4 text-center text-2xs text-node-subtle">
                  {tc('references.managerEmpty')}
                </p>
              ) : (
                filteredTokens.map((token) => (
                  <ManagerRow
                    key={token.id}
                    token={token}
                    referenced={referencedTokenIds.has(token.id)}
                    onInsert={onInsert}
                    onLocate={onLocate}
                    onRemove={onRemove}
                    onAddVoice={onAddVoice}
                    onAddCloseup={onAddCloseup}
                  />
                ))
              )}
            </div>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  )
}

/** Drawer tab toolbar ＋ buttons — the autospawn affordances DepartmentStrip's
 *  per-card ＋ tile offered, relocated here. 镜头 tab merges two node types
 *  (shot image / reference video) so it gets two buttons; 全部 offers none
 *  (ambiguous which type to spawn). */
function TabAddButtons({
  activeTab,
  onAddReference,
}: {
  activeTab: ManagerTabId
  onAddReference(request: AddReferenceRequest): void
}) {
  const tc = useTranslations('StudioNode.videoComposer')

  const fire = (config: AddSpawnConfig) =>
    onAddReference({
      nodeType: config.nodeType,
      role: config.role,
      mediaType: config.mediaType,
    })

  if (activeTab === 'all') return null

  const buttons: Array<{ key: string; label: string; config: AddSpawnConfig }> =
    activeTab === 'character'
      ? [
          {
            key: 'character',
            label: tc('references.addButtons.character'),
            config: ADD_SPAWN_CONFIG.character,
          },
        ]
      : activeTab === 'scene'
        ? [
            {
              key: 'scene',
              label: tc('references.addButtons.scene'),
              config: ADD_SPAWN_CONFIG.scene,
            },
          ]
        : activeTab === 'shot'
          ? [
              {
                key: 'shotImage',
                label: tc('references.addButtons.shotImage'),
                config: ADD_SPAWN_CONFIG.shotImage,
              },
              {
                key: 'video',
                label: tc('references.addButtons.video'),
                config: ADD_SPAWN_CONFIG.video,
              },
            ]
          : [
              {
                key: 'voice',
                label: tc('references.addButtons.voice'),
                config: ADD_SPAWN_CONFIG.voice,
              },
            ]

  return (
    <div className="flex flex-wrap gap-1.5">
      {buttons.map((button) => (
        <button
          key={button.key}
          type="button"
          onClick={() => fire(button.config)}
          className="nodrag flex items-center gap-1 rounded-full border border-dashed border-node-panel-inner px-2 py-1 text-2xs font-semibold text-node-muted transition-colors hover:border-node-edge hover:text-node-foreground"
        >
          <Plus className="size-3" />
          {button.label}
        </button>
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

/** A row inside the 管理素材 drawer's list: thumbnail + name + kind + @token +
 *  status (已引用 badge / 插入 button / a hint for why it can't be inserted) +
 *  a ⋮ overflow for locate / disconnect / character-only add-voice/add-closeup. */
function ManagerRow({
  token,
  referenced,
  onInsert,
  onLocate,
  onRemove,
  onAddVoice,
  onAddCloseup,
}: {
  token: ComposerReferenceToken
  referenced: boolean
  onInsert(data: ReferenceTokenData, originEl: HTMLElement): void
  onLocate?(nodeId: string): void
  onRemove?(token: ComposerReferenceToken): void
  onAddVoice?(characterNodeId: string): void
  onAddCloseup?(characterNodeId: string): void
}) {
  const tc = useTranslations('StudioNode.videoComposer')
  const thumb = tokenThumb(token)
  const insertable = token.insertable !== false && Boolean(token.token)
  const displayName = token.label || tc(`refKind.${token.kind}`)

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

  const hasMenu = Boolean(
    (onLocate && token.id) ||
    (onRemove && token.edgeId) ||
    (onAddVoice && token.kind === 'character' && !token.boundVoice) ||
    (onAddCloseup && token.kind === 'character'),
  )

  return (
    <div className="flex items-center gap-2 rounded-lg border border-node-panel-inner bg-node-panel-soft px-2 py-1.5">
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-node-panel-inner',
          token.kind === 'character' || token.kind === 'voice'
            ? 'rounded-full'
            : 'rounded-md',
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
      </div>

      {referenced ? (
        <span className="shrink-0 rounded-full bg-node-panel-inner px-2 py-0.5 text-3xs font-semibold text-node-foreground">
          {tc('references.statusReferenced')}
        </span>
      ) : insertable ? (
        <button
          type="button"
          onClick={(event) => onInsert(token, event.currentTarget)}
          className="nodrag shrink-0 rounded-full border border-node-panel-inner px-2 py-0.5 text-3xs font-semibold text-node-muted transition-colors hover:border-node-edge hover:text-node-foreground"
        >
          {tc('references.statusInsert')}
        </button>
      ) : noInsertHint ? (
        <span
          className={cn(
            'shrink-0 text-3xs leading-4',
            token.dimmed ? 'text-node-status-failed' : 'text-node-subtle',
          )}
        >
          {noInsertHint}
        </span>
      ) : null}

      {hasMenu ? (
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
      ) : null}
    </div>
  )
}
