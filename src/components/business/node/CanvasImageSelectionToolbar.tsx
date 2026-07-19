'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useEdges, useReactFlow } from '@xyflow/react'
import {
  Download,
  Eraser,
  Expand,
  Film,
  IdCard,
  Layers3,
  Library,
  ListOrdered,
  Maximize2,
  MoreHorizontal,
  Paintbrush,
  PencilLine,
  Play,
  Scissors,
  Sparkles,
  Tags,
  Trash2,
  Users,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_STUDIO_AUDIO_INPUT,
  NODE_STUDIO_CHARACTER_IMAGE_REFERENCES,
  NODE_STUDIO_DOCK,
  NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID,
  NODE_STUDIO_REFERENCE_ROLES,
  NODE_STUDIO_VOICE_PROFILE,
  NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS,
} from '@/constants/node-studio'
import { READY_CANVAS_IMAGE_EDIT_CAPABILITIES } from '@/constants/canvas-image-edit-capabilities'
import { getMaxReferenceImages } from '@/constants/provider-capabilities'
import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeTokenType } from '@/constants/node-tokens'
import { IMEAwareInput } from '@/components/business/node/inspector/IMEAwareField'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { useVideoMergeAction } from '@/hooks/node/use-video-merge-action'
import { cn } from '@/lib/utils'
import type { ReadyCanvasImageEditCapabilityId } from '@/types/canvas-image-edit'
import type { GenerationRecord, NodeWorkflowReferenceRole } from '@/types'
import type {
  NodeWorkflowEdge,
  NodeWorkflowNode,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'

import { CanvasImageEditWorkspace } from './CanvasImageEditWorkspace'
import { CharacterImageReferenceControls } from './CharacterImageReferenceControls'
import { FishVoiceLibraryDialog } from './FishVoiceLibraryDialog'
import { useNodeWorkflowActions } from './NodeWorkflowActionsContext'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface CanvasImageSelectionToolbarProps {
  nodeId: string
  data: NodeWorkflowNodeData
  quickEditOpen?: boolean
  onQuickEditOpenChange?(open: boolean): void
  /** R3-3 (canvas-relationship-v3 §3.2): a type-specific capability button
   *  appended alongside quick-edit/delete — today only 镜头图 (role=shot)
   *  passes its 生成/重生成 button here. The image family's own toolbar
   *  chrome otherwise stays exactly as it was ("保留不动"). */
  extra?: ReactNode
}

const TASK_ICONS = {
  upscale: Sparkles,
  'remove-background': Eraser,
  inpaint: Paintbrush,
  outpaint: Expand,
  decompose: Layers3,
  'extract-element': Scissors,
} as const satisfies Record<ReadyCanvasImageEditCapabilityId, typeof Sparkles>

const MORE_EDIT_TASKS = [
  'upscale',
  'remove-background',
  'inpaint',
  'outpaint',
  'decompose',
  'extract-element',
] as const satisfies readonly ReadyCanvasImageEditCapabilityId[]

/** Not image-specific despite the name's origin — every node kind (image /
 *  video / audio) stores its result under the same `mediaUrl` (legacy
 *  `imageUrl`) field, so this doubles as the generic "does this node have a
 *  downloadable result" + download-source resolver for the R3-3 registry
 *  toolbar too. */
function getNodeMediaUrl(data: NodeWorkflowNodeData): string {
  if (typeof data.mediaUrl === 'string' && data.mediaUrl.trim()) {
    return data.mediaUrl
  }
  if (typeof data.imageUrl === 'string' && data.imageUrl.trim()) {
    return data.imageUrl
  }
  return ''
}

function triggerMediaDownload(url: string) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  anchor.download = ''
  anchor.click()
}

export function canOfferCanvasImageEdit(data: NodeWorkflowNodeData): boolean {
  return Boolean(getNodeMediaUrl(data))
}

/**
 * The image-family types — the only ones whose result is actually an image,
 * so the only ones the AI quick-edit suite (upscale/inpaint/outpaint/…) is
 * meaningful for. `NodeSelectionToolbarChrome` gates on this (in addition to
 * `canOfferCanvasImageEdit`) now that every node type feeds it a `data` with
 * `mediaUrl` — without the gate, a video/audio result would also read as
 * "has an image to edit" since both share the same generic `mediaUrl` field.
 */
const IMAGE_FAMILY_NODE_TYPES = new Set<NodeTokenType>([
  NODE_TYPE_IDS.characterImage,
  NODE_TYPE_IDS.backgroundImage,
  NODE_TYPE_IDS.frameImage,
  NODE_TYPE_IDS.shot,
  NODE_TYPE_IDS.image,
])

/**
 * Project-native image selection toolbar (not a Haivis copy):
 * primary = rename · category · expand · download · quick-edit
 * everything else (AI edit suite, delete) lives in "more".
 */
export function CanvasImageSelectionToolbar({
  nodeId,
  data,
  quickEditOpen = false,
  onQuickEditOpenChange,
  extra,
}: CanvasImageSelectionToolbarProps) {
  const t = useTranslations('StudioNode.nodeToolbar')
  const tSource = useTranslations('StudioNode.imageSourceStarter')
  const tRoles = useTranslations('StudioNode.characterImage.reference')
  const tTasks = useTranslations('StudioImageEdit.tasks')
  const {
    setExpandedNodeId,
    deleteNode,
    updateNodeData,
    setImageEditWorkspaceOpen,
  } = useNodeWorkflowActions()
  const [activeTask, setActiveTask] =
    useState<ReadyCanvasImageEditCapabilityId | null>(null)
  const [nameDraft, setNameDraft] = useState(
    () =>
      (typeof data.mediaLabel === 'string' && data.mediaLabel) ||
      (typeof data.sourceLabel === 'string' && data.sourceLabel) ||
      '',
  )

  const readyIds = useMemo(
    () => new Set(READY_CANVAS_IMAGE_EDIT_CAPABILITIES.map(({ id }) => id)),
    [],
  )

  // R3-4 §4.2 rule 3: mirror this dialog's own open/closed state up to the
  // workbench (one-way — `activeTask` itself stays local) so opening it
  // closes the L5 transient layer + any node's L3 quick-edit panel too.
  useEffect(() => {
    if (activeTask === null) return
    setImageEditWorkspaceOpen(true)
    return () => setImageEditWorkspaceOpen(false)
  }, [activeTask, setImageEditWorkspaceOpen])

  if (!canOfferCanvasImageEdit(data)) return null

  const openTask = (task: ReadyCanvasImageEditCapabilityId) => {
    if (!readyIds.has(task)) return
    onQuickEditOpenChange?.(false)
    setActiveTask(task)
  }

  const commitName = (value: string) => {
    const next = value.trim()
    updateNodeData(nodeId, {
      mediaLabel: next || undefined,
      sourceLabel: next || undefined,
    })
  }

  const handleDownload = () => {
    const url = getNodeMediaUrl(data)
    if (!url) return
    triggerMediaDownload(url)
  }

  return (
    <>
      <div
        role="toolbar"
        aria-label={t('imageEditToolbar')}
        className="flex h-11 max-w-[min(28rem,calc(100vw-2rem))] items-center gap-0.5 rounded-xl border border-node-panel-inner bg-node-panel/95 p-1 text-node-foreground shadow-node-panel backdrop-blur"
      >
        <label className="flex h-9 min-w-0 items-center gap-1 rounded-lg bg-node-panel-soft px-2">
          <PencilLine className="size-3.5 shrink-0 text-node-muted" />
          <IMEAwareInput
            value={nameDraft}
            onValueChange={setNameDraft}
            onBlur={() => commitName(nameDraft)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur()
              }
            }}
            aria-label={t('rename')}
            placeholder={tSource('namePlaceholder')}
            className="nodrag nopan nowheel h-7 w-24 min-w-0 border-0 bg-transparent px-0 text-xs font-medium text-node-foreground shadow-none outline-none placeholder:text-node-subtle focus-visible:ring-0 sm:w-28"
          />
        </label>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t('category')}
              title={t('category')}
              className="relative flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-node-muted transition-colors hover:bg-node-panel-inner hover:text-node-foreground coarse:before:absolute coarse:before:-inset-y-1 coarse:before:inset-x-0 coarse:before:content-['']"
            >
              <Tags className="size-3.5" />
              <span className="hidden max-w-16 truncate sm:inline">
                {data.imageCategory
                  ? data.imageCategory === NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID
                    ? data.imageCategoryLabel || tSource('categoryCustomLabel')
                    : tRoles(`roles.${data.imageCategory}`)
                  : t('category')}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="min-w-40 border-node-panel-inner bg-node-panel text-node-foreground"
          >
            <DropdownMenuLabel className="text-2xs text-node-muted">
              {t('category')}
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() =>
                updateNodeData(nodeId, {
                  imageCategory: undefined,
                  imageCategoryLabel: undefined,
                })
              }
              className="focus:bg-node-panel-inner"
            >
              {tSource('categoryUnset')}
            </DropdownMenuItem>
            {NODE_STUDIO_REFERENCE_ROLES.map((role) => (
              <DropdownMenuItem
                key={role}
                onClick={() =>
                  updateNodeData(nodeId, {
                    imageCategory: role as NodeWorkflowReferenceRole,
                    imageCategoryLabel:
                      role === NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID
                        ? data.imageCategoryLabel
                        : undefined,
                  })
                }
                className="focus:bg-node-panel-inner"
              >
                {tRoles(`roles.${role}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          onClick={() => setExpandedNodeId(nodeId)}
          aria-label={t('expand')}
          title={t('expand')}
          className="relative flex size-9 items-center justify-center rounded-lg text-node-muted transition-colors hover:bg-node-panel-inner hover:text-node-foreground coarse:before:absolute coarse:before:-inset-y-1 coarse:before:inset-x-0 coarse:before:content-['']"
        >
          <Maximize2 className="size-3.5" />
        </button>

        <button
          type="button"
          onClick={handleDownload}
          aria-label={t('download')}
          title={t('download')}
          className="relative flex size-9 items-center justify-center rounded-lg text-node-muted transition-colors hover:bg-node-panel-inner hover:text-node-foreground coarse:before:absolute coarse:before:-inset-y-1 coarse:before:inset-x-0 coarse:before:content-['']"
        >
          <Download className="size-3.5" />
        </button>

        <span className="mx-0.5 h-5 w-px bg-node-panel-inner" aria-hidden />

        <button
          type="button"
          onClick={() => onQuickEditOpenChange?.(!quickEditOpen)}
          aria-pressed={quickEditOpen}
          aria-label={t('quickEdit')}
          title={t('quickEdit')}
          className={cn(
            "relative flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold transition-colors coarse:before:absolute coarse:before:-inset-y-1 coarse:before:inset-x-0 coarse:before:content-['']",
            quickEditOpen
              ? 'bg-node-paint text-node-paint-fg'
              : 'text-node-foreground hover:bg-node-panel-inner',
          )}
        >
          <WandSparkles className="size-3.5" />
          <span className="hidden sm:inline">{t('quickEdit')}</span>
        </button>

        {extra}

        <button
          type="button"
          onClick={() => deleteNode(nodeId)}
          aria-label={t('delete')}
          title={t('delete')}
          className="relative flex size-9 items-center justify-center rounded-lg text-node-muted transition-colors hover:bg-node-status-failed/40 hover:text-node-status-failed-fg coarse:before:absolute coarse:before:-inset-y-1 coarse:before:inset-x-0 coarse:before:content-['']"
        >
          <Trash2 className="size-3.5" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t('more')}
              title={t('more')}
              className="relative flex size-9 items-center justify-center rounded-lg text-node-muted transition-colors hover:bg-node-panel-inner hover:text-node-foreground coarse:before:absolute coarse:before:-inset-y-1 coarse:before:inset-x-0 coarse:before:content-['']"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-48 border-node-panel-inner bg-node-panel text-node-foreground"
          >
            <DropdownMenuLabel className="text-2xs text-node-muted">
              {t('moreEdits')}
            </DropdownMenuLabel>
            {MORE_EDIT_TASKS.map((taskId) => {
              const Icon = TASK_ICONS[taskId]
              return (
                <DropdownMenuItem
                  key={taskId}
                  onClick={() => openTask(taskId)}
                  className="gap-2 focus:bg-node-panel-inner"
                >
                  <Icon className="size-3.5" />
                  {tTasks(`${taskId}.label`)}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {activeTask ? (
        <CanvasImageEditWorkspace
          nodeId={nodeId}
          data={data}
          defaultTask={activeTask}
          open
          onOpenChange={(open) => {
            if (!open) setActiveTask(null)
          }}
        />
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// R3-3 registry toolbar (canvas-relationship-v3 §3.2/§7): the non-image-edit
// families (collector / seedance / videoMerge / voice / videoReference /
// shotText / image-family-without-media) share one shell — identity region |
// capability region (type-specific, ≤2 buttons today) | universal region
// (⤢详情 · 下载 · 删除). Every action below calls an EXISTING channel
// (NodeWorkflowActionsContext, a shared hook, or a shared component) — no
// new generation/upload endpoint is introduced by this registry.
// ---------------------------------------------------------------------------

interface ToolbarIconButtonProps {
  icon: LucideIcon
  label: string
  onClick(): void
  danger?: boolean
  disabled?: boolean
}

/** Icon-only, 36px visual (size-9) — the universal region's shape. R3-4
 *  §7 触屏命中区: coarse pointer gets an invisible `::before` hit-area
 *  expansion up to 44px vertically (fine stays the tight 36px visual). */
function ToolbarIconButton({
  icon: Icon,
  label,
  onClick,
  danger,
  disabled,
}: ToolbarIconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "relative flex size-9 items-center justify-center rounded-lg text-node-muted transition-colors coarse:before:absolute coarse:before:-inset-y-1 coarse:before:inset-x-0 coarse:before:content-[''] hover:bg-node-panel-inner hover:text-node-foreground disabled:pointer-events-none disabled:opacity-50",
        danger &&
          'hover:bg-node-status-failed/40 hover:text-node-status-failed-fg',
      )}
    >
      <Icon className="size-3.5" />
    </button>
  )
}

interface ToolbarLabelButtonProps {
  icon: LucideIcon
  label: string
  onClick(): void
  ariaLabel?: string
  disabled?: boolean
}

/** Icon + text, h-9 — the capability region's shape (mirrors the existing
 *  quick-edit toggle button in `CanvasImageSelectionToolbar`). Same R3-4
 *  coarse-pointer hit-area expansion as `ToolbarIconButton` above. Exported
 *  (R3-7) so `VideoMergeComposeToolbar` — a selection-bounding-box bar, not a
 *  per-node one, so it can't go through `NodeSelectionToolbarChrome`'s
 *  registry — still gets the exact same button shape instead of a second
 *  hand-rolled copy. */
export function ToolbarLabelButton({
  icon: Icon,
  label,
  onClick,
  ariaLabel,
  disabled,
}: ToolbarLabelButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      title={ariaLabel ?? label}
      className="relative flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 text-xs font-semibold text-node-foreground transition-colors coarse:before:absolute coarse:before:-inset-y-1 coarse:before:inset-x-0 coarse:before:content-[''] hover:bg-node-panel-inner disabled:pointer-events-none disabled:opacity-50"
    >
      <Icon className="size-3.5" />
      <span>{label}</span>
    </button>
  )
}

/** Universal region — ⤢详情 · 下载(仅有媒体时) · 删除, identical across every
 *  node type (§3.2 "同一层级、同一位置、同一解剖"). */
function UniversalToolbarActions({
  nodeId,
  data,
}: {
  nodeId: string
  data?: NodeWorkflowNodeData
}) {
  const t = useTranslations('StudioNode.nodeToolbar')
  const { setExpandedNodeId, deleteNode } = useNodeWorkflowActions()
  const mediaUrl = data ? getNodeMediaUrl(data) : ''

  return (
    <>
      <ToolbarIconButton
        icon={Maximize2}
        label={t('expand')}
        onClick={() => setExpandedNodeId(nodeId)}
      />
      {mediaUrl ? (
        <ToolbarIconButton
          icon={Download}
          label={t('download')}
          onClick={() => triggerMediaDownload(mediaUrl)}
        />
      ) : null}
      <ToolbarIconButton
        icon={Trash2}
        label={t('delete')}
        danger
        onClick={() => deleteNode(nodeId)}
      />
    </>
  )
}

/** FB-4 named-field registry: which data field a given node type's title
 *  actually reads (see each card's own title source — NodeMediaPreview's
 *  `getHeaderTitle`, VoiceNode's `voiceTitle`, SeedanceNode/VideoReferenceNode's
 *  `data.mediaLabel` reads) — the rename input below must write THAT field or
 *  the card never visibly changes. `shot` covers both the legacy `shot` type
 *  and a unified `image` node with `role: 'shot'` — `NodeShellRoot`'s own
 *  `type` prop (which becomes this `nodeType`) already resolves a role to its
 *  legacy type via `NODE_IMAGE_ROLE_TO_LEGACY_TYPE` before it ever reaches the
 *  toolbar, so no separate `data.role` check is needed here. `closeup` is
 *  deliberately NOT special-cased (also legacy-typed `characterImage`): it
 *  reuses `characterName` like a character, same as before this change. */
type IdentityNamedField =
  | 'characterName'
  | 'backgroundName'
  | 'shotName'
  | 'voiceName'
  | 'mediaLabel'

function resolveIdentityNamedField(
  nodeType?: NodeTokenType,
): IdentityNamedField | null {
  switch (nodeType) {
    case NODE_TYPE_IDS.characterImage:
      return 'characterName'
    case NODE_TYPE_IDS.backgroundImage:
      return 'backgroundName'
    case NODE_TYPE_IDS.shot:
      return 'shotName'
    case NODE_TYPE_IDS.voice:
      return 'voiceName'
    // No dedicated name field for these — they share the generic mediaLabel
    // (same field LooseImageCard/NodeMediaInspector already write+read for
    // any media-bearing card), so the toolbar's rename input aligns with
    // what SeedanceNode/VideoReferenceNode/frameImage's NodeMediaPreview
    // title actually show (see those components' own FB-4 changes).
    case NODE_TYPE_IDS.seedance:
    case NODE_TYPE_IDS.videoMerge:
    case NODE_TYPE_IDS.videoReference:
    case NODE_TYPE_IDS.frameImage:
    // 独立 image 节点（散图/未定角色的空态图片）—— owner 真机: 空态图片工具条
    // 名字改不了。它没经过 role→legacy 解析（保持 type='image'），且有媒体时走
    // 的 CanvasImageSelectionToolbar 本就用 mediaLabel/sourceLabel 命名，这里对齐
    // 同一字段，让空态也能改名。
    case NODE_TYPE_IDS.image:
      return 'mediaLabel'
    default:
      return null
  }
}

/** Identity region — a rename input for every type with a named field
 *  (character/background/shot/voice/generic-mediaLabel types), a read-only
 *  type label otherwise. */
function IdentityRegion({
  nodeId,
  data,
  nodeType,
}: {
  nodeId: string
  data?: NodeWorkflowNodeData
  nodeType?: NodeTokenType
}) {
  const t = useTranslations('StudioNode.nodeToolbar')
  const tSource = useTranslations('StudioNode.imageSourceStarter')
  const tTypes = useTranslations('StudioNode.nodeTypes')
  const { updateNodeData } = useNodeWorkflowActions()

  const namedField = resolveIdentityNamedField(nodeType)

  const [draft, setDraft] = useState(() => {
    switch (namedField) {
      case 'characterName':
        return (
          data?.characterName?.trim() ?? data?.character?.name?.trim() ?? ''
        )
      case 'backgroundName':
        return data?.backgroundName?.trim() ?? ''
      case 'shotName':
        return data?.shotName?.trim() ?? ''
      case 'voiceName':
        return data?.voiceName?.trim() ?? ''
      case 'mediaLabel':
        return data?.mediaLabel?.trim() ?? ''
      default:
        return ''
    }
  })

  if (namedField) {
    const commit = (value: string) => {
      const next = value.trim()
      if (namedField === 'mediaLabel') {
        // Mirrors CanvasImageSelectionToolbar's own commitName + every other
        // mediaLabel writer in this domain (NodeMediaInspector, LooseImageCard's
        // detail body, use-node-workflow.ts) — sourceLabel is the same field's
        // long-standing companion (StudioNodeAssistantDock reads it as a name
        // fallback), so a mediaLabel-only write would silently diverge from it.
        updateNodeData(nodeId, {
          mediaLabel: next || undefined,
          sourceLabel: next || undefined,
        })
        return
      }
      updateNodeData(nodeId, { [namedField]: next || undefined })
    }
    return (
      <label className="flex h-9 min-w-0 items-center gap-1 rounded-lg bg-node-panel-soft px-2">
        <PencilLine className="size-3.5 shrink-0 text-node-muted" />
        <IMEAwareInput
          value={draft}
          onValueChange={setDraft}
          onBlur={() => commit(draft)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur()
            }
          }}
          aria-label={t('rename')}
          placeholder={tSource('namePlaceholder')}
          className="nodrag nopan nowheel h-7 w-24 min-w-0 border-0 bg-transparent px-0 text-xs font-medium text-node-foreground shadow-none outline-none placeholder:text-node-subtle focus-visible:ring-0 sm:w-28"
        />
      </label>
    )
  }

  return (
    <span className="flex h-9 min-w-0 items-center rounded-lg px-2 text-xs font-medium text-node-muted">
      <span className="truncate">
        {tTypes(nodeType ?? NODE_TYPE_IDS.image)}
      </span>
    </span>
  )
}

/** 出演 — highlights (fits the camera to) the nodes this collector card
 *  feeds. "最小诚实版" per the task: a read-only camera move, no selection
 *  side effects. Hidden entirely when there's nothing downstream yet. */
function PerformancesButton({ nodeId }: { nodeId: string }) {
  const tDossier = useTranslations('StudioNode.dossier')
  const tToolbar = useTranslations('StudioNode.nodeToolbar')
  const edges = useEdges<NodeWorkflowEdge>()
  const { fitView } = useReactFlow()

  const performanceIds = useMemo(
    () =>
      edges.filter((edge) => edge.source === nodeId).map((edge) => edge.target),
    [edges, nodeId],
  )

  if (performanceIds.length === 0) return null

  return (
    <ToolbarLabelButton
      icon={Users}
      label={`${tDossier('performanceSection')} · ${performanceIds.length}`}
      ariaLabel={tToolbar('performancesAria', {
        count: performanceIds.length,
      })}
      onClick={() =>
        void fitView({
          nodes: performanceIds.map((id) => ({ id })),
          duration: NODE_STUDIO_DOCK.focusDurationMs,
          maxZoom: NODE_STUDIO_DOCK.focusZoom,
          padding: 0.2,
        })
      }
    />
  )
}

/** 档案卡（角色/场景）capability region — 添加素材 (reuses
 *  `CharacterImageReferenceControls`'s popover-mode trigger wholesale, the
 *  exact upload/asset/paste entry the dossier panel's gallery already uses)
 *  + 出演. */
function CollectorCapability({
  nodeId,
  data,
}: {
  nodeId: string
  data: NodeWorkflowNodeData
}) {
  const t = useTranslations('StudioNode.nodeToolbar')
  const { updateNodeData } = useNodeWorkflowActions()
  const referenceAssets = data.referenceAssets ?? []
  // Mirrors NodeMediaInspector's identical fallback — a collector node has
  // no generation `model` of its own in practice, so this resolves to the
  // shared default cap.
  const maxReferenceImages = data.model
    ? getMaxReferenceImages(data.model.adapterType, data.model.modelId)
    : NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.maxItems

  return (
    <>
      <CharacterImageReferenceControls
        value={referenceAssets}
        maxItems={maxReferenceImages}
        onChange={(next) => updateNodeData(nodeId, { referenceAssets: next })}
        triggerLabel={t('addAsset')}
      />
      <PerformancesButton nodeId={nodeId} />
    </>
  )
}

/** 镜头图（role=shot）capability addition — 生成/重生成, reusing the exact
 *  `generateMediaNode` context channel `NodeMediaInspector`/`VideoComposer`
 *  already call. Rendered both as the image-family toolbar's `extra` slot
 *  (media already exists — exported so `LooseImageCard` can pass it in
 *  directly, since it calls `CanvasImageSelectionToolbar` itself rather than
 *  going through `NodeSelectionToolbarChrome`) and as the sole capability of
 *  the generic no-media branch. */
export function ShotGenerateButton({
  nodeId,
  data,
}: {
  nodeId: string
  data: NodeWorkflowNodeData
}) {
  const t = useTranslations('StudioNode.mediaNodes')
  const { generateMediaNode } = useNodeWorkflowActions()
  const hasMedia = Boolean(getNodeMediaUrl(data))
  const isRunning = data.status === NODE_STATUS_IDS.running

  return (
    <ToolbarLabelButton
      icon={Film}
      label={
        isRunning ? t('generating') : hasMedia ? t('regenerate') : t('generate')
      }
      onClick={() => void generateMediaNode?.(nodeId)}
      disabled={isRunning || !generateMediaNode}
    />
  )
}

/** 视频卡（seedance）capability region — 生成/重生成 (same `generateMediaNode`
 *  channel as the card's own composer) + 预览 (opens ⤢ detail, where the
 *  监视器 lives — only shown once there's something to preview). */
function SeedanceCapability({
  nodeId,
  data,
}: {
  nodeId: string
  data: NodeWorkflowNodeData
}) {
  const t = useTranslations('StudioNode.videoGeneration')
  const tToolbar = useTranslations('StudioNode.nodeToolbar')
  const { generateMediaNode, setExpandedNodeId } = useNodeWorkflowActions()
  const hasMedia = Boolean(
    typeof data.mediaUrl === 'string' && data.mediaUrl.trim(),
  )
  const isRunning = data.status === NODE_STATUS_IDS.running

  return (
    <>
      <ToolbarLabelButton
        icon={Film}
        label={
          isRunning
            ? t('generating')
            : hasMedia
              ? t('regenerate')
              : t('generate')
        }
        onClick={() => void generateMediaNode?.(nodeId)}
        disabled={isRunning || !generateMediaNode}
      />
      {hasMedia ? (
        <ToolbarLabelButton
          icon={Play}
          label={tToolbar('preview')}
          onClick={() => setExpandedNodeId(nodeId)}
        />
      ) : null}
    </>
  )
}

/** 片盒（videoMerge）capability region — 合成 (via `useVideoMergeAction`, the
 *  exact hook `VideoMergeInspector` now shares — R3-3 extraction) + 排序
 *  (opens ⤢ detail, where the clip reorder/trim list lives). */
function VideoMergeCapability({
  nodeId,
  data,
}: {
  nodeId: string
  data: NodeWorkflowNodeData
}) {
  const t = useTranslations('StudioNode.videoMerge')
  const tToolbar = useTranslations('StudioNode.nodeToolbar')
  const { setExpandedNodeId } = useNodeWorkflowActions()
  const syntheticNode = useMemo<NodeWorkflowNode>(
    () => ({
      id: nodeId,
      type: NODE_TYPE_IDS.videoMerge,
      position: { x: 0, y: 0 },
      data,
    }),
    [nodeId, data],
  )
  const { canMerge, isMerging, handleMerge } =
    useVideoMergeAction(syntheticNode)
  const hasMedia = Boolean(
    typeof data.mediaUrl === 'string' && data.mediaUrl.trim(),
  )

  return (
    <>
      <ToolbarLabelButton
        icon={Sparkles}
        label={
          isMerging
            ? t('merging')
            : hasMedia
              ? t('merge.regenerate')
              : t('merge.run')
        }
        onClick={() => void handleMerge()}
        disabled={!canMerge}
      />
      <ToolbarLabelButton
        icon={ListOrdered}
        label={tToolbar('reorder')}
        onClick={() => setExpandedNodeId(nodeId)}
      />
    </>
  )
}

/** 音色（voice）capability region — 声音库 (`FishVoiceLibraryDialog`, unchanged) +
 *  FB-5 ②「从素材」: pick an already-generated audio clip from the asset
 *  library as reference audio. Reuses the EXACT channel `VoiceDetailBody`'s
 *  own "从素材选择" entry already established — `AssetSelectorDialog`
 *  `mediaType="audio"` + the same field set its `handleSelectReferenceAsset`
 *  writes (voiceReferenceAudioUrl/Name/MimeType + voiceReferenceCoverImage +
 *  voiceSource=referenceAudio) — no new audio channel introduced. */
function VoiceCapability({
  nodeId,
  data,
}: {
  nodeId: string
  data: NodeWorkflowNodeData
}) {
  const t = useTranslations('StudioNode.voiceProfile')
  const { updateNodeData } = useNodeWorkflowActions()
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [assetDialogOpen, setAssetDialogOpen] = useState(false)

  return (
    <>
      <ToolbarLabelButton
        icon={IdCard}
        label={t('chooseVoice')}
        onClick={() => setLibraryOpen(true)}
      />
      <ToolbarLabelButton
        icon={Library}
        label={t('referenceFromAssets')}
        onClick={() => setAssetDialogOpen(true)}
      />
      <FishVoiceLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        selectedVoiceId={typeof data.voiceId === 'string' ? data.voiceId : null}
        onSelectVoiceId={(voice) => {
          updateNodeData(nodeId, {
            voiceId: voice.voiceId,
            voiceName: voice.name,
            voiceCoverImage: voice.coverImage ?? undefined,
            voiceProvider:
              data.voiceProvider || NODE_STUDIO_VOICE_PROFILE.providerDefault,
            voiceSource: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.fishAudio,
            // A picked voiceId always satisfies VoiceInspector's own
            // hasVoiceProfileData check, so this mirrors its ready branch.
            status: NODE_STATUS_IDS.ready,
          })
          setLibraryOpen(false)
        }}
        onVoiceSelectComplete={() => setLibraryOpen(false)}
      />
      <AssetSelectorDialog
        open={assetDialogOpen}
        onOpenChange={setAssetDialogOpen}
        title={t('referenceDialogTitle')}
        description={t('referenceDialogDescription')}
        mediaType="audio"
        onSelect={(generation: GenerationRecord) => {
          updateNodeData(nodeId, {
            voiceReferenceAudioUrl: generation.url,
            voiceReferenceAudioName: t('referenceAudioFallback'),
            voiceReferenceAudioMimeType: NODE_STUDIO_AUDIO_INPUT.assetMimeType,
            voiceReferenceCoverImage:
              generation.previewUrl ?? generation.thumbnailUrl ?? undefined,
            voiceSource: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.referenceAudio,
            status: NODE_STATUS_IDS.ready,
          })
          setAssetDialogOpen(false)
        }}
      />
    </>
  )
}

/** Capability-region registry (§3.2 table). Returns null for types with no
 *  reachable capability today (videoReference, shotText, composer/agent,
 *  frame/closeup without media) — an empty middle region, not a dead
 *  button. */
function ToolbarCapabilityRegion({
  nodeId,
  data,
  nodeType,
  isCollector,
}: {
  nodeId: string
  data: NodeWorkflowNodeData
  nodeType?: NodeTokenType
  isCollector?: boolean
}): ReactNode {
  if (isCollector) {
    return <CollectorCapability nodeId={nodeId} data={data} />
  }
  switch (nodeType) {
    case NODE_TYPE_IDS.seedance:
      return <SeedanceCapability nodeId={nodeId} data={data} />
    case NODE_TYPE_IDS.videoMerge:
      return <VideoMergeCapability nodeId={nodeId} data={data} />
    case NODE_TYPE_IDS.voice:
      return <VoiceCapability nodeId={nodeId} data={data} />
    case NODE_TYPE_IDS.shot:
      return <ShotGenerateButton nodeId={nodeId} data={data} />
    default:
      return null
  }
}

/** The registry-driven chrome for every family OTHER than "image with media"
 *  (which keeps `CanvasImageSelectionToolbar` untouched). Same shell/height
 *  as that toolbar so selecting any card reads as one consistent object. */
function GenericSelectionToolbar({
  nodeId,
  data,
  nodeType,
  isCollector,
  className,
}: {
  nodeId: string
  data?: NodeWorkflowNodeData
  nodeType?: NodeTokenType
  isCollector?: boolean
  className?: string
}) {
  const t = useTranslations('StudioNode.nodeToolbar')
  const capability = data ? (
    <ToolbarCapabilityRegion
      nodeId={nodeId}
      data={data}
      nodeType={nodeType}
      isCollector={isCollector}
    />
  ) : null

  return (
    <div
      role="toolbar"
      aria-label={t('toolbar')}
      className={cn(
        'flex h-11 items-center gap-1 rounded-xl border border-node-panel-inner bg-node-panel/95 p-1 text-node-foreground shadow-node-panel backdrop-blur',
        className,
      )}
    >
      <IdentityRegion nodeId={nodeId} data={data} nodeType={nodeType} />
      <span className="mx-0.5 h-5 w-px bg-node-panel-inner" aria-hidden />
      {capability}
      {capability ? (
        <span className="mx-0.5 h-5 w-px bg-node-panel-inner" aria-hidden />
      ) : null}
      <UniversalToolbarActions nodeId={nodeId} data={data} />
    </div>
  )
}

interface ImageToolbarChromeProps {
  nodeId: string
  data?: NodeWorkflowNodeData
  selected?: boolean
  className?: string
  /**
   * Semantic node type — drives the R3-3 capability-area registry. Optional
   * only for defensive/legacy callers; every real node component now passes
   * it (`NodeShellRoot`'s existing `type` prop, or `LooseImageCard`'s new
   * `nodeType` prop for the components that don't go through `NodeShell`).
   */
  nodeType?: NodeTokenType
  /**
   * True only for the character/background archive-card face
   * (`IdentityCollectorCard`). Disambiguates from a `closeup` image node,
   * which also carries legacy type `characterImage` for presentation reuse
   * (node-types.ts `NODE_IMAGE_ROLE_TO_LEGACY_TYPE`) but is a plain
   * image-family card, not a collector — it must NOT get the collector's
   * 添加素材/出演 capability region.
   */
  isCollector?: boolean
}

export function NodeSelectionToolbarChrome({
  nodeId,
  data,
  selected,
  className,
  nodeType,
  isCollector,
}: ImageToolbarChromeProps) {
  if (!selected) return null

  if (isCollector && data) {
    return (
      <GenericSelectionToolbar
        nodeId={nodeId}
        data={data}
        nodeType={nodeType}
        isCollector
        className={className}
      />
    )
  }

  const hasImageEdit = Boolean(
    data &&
    nodeType &&
    IMAGE_FAMILY_NODE_TYPES.has(nodeType) &&
    canOfferCanvasImageEdit(data),
  )

  if (hasImageEdit && data) {
    return (
      <CanvasImageSelectionToolbar
        nodeId={nodeId}
        data={data}
        extra={
          nodeType === NODE_TYPE_IDS.shot ? (
            <ShotGenerateButton nodeId={nodeId} data={data} />
          ) : null
        }
      />
    )
  }

  return (
    <GenericSelectionToolbar
      nodeId={nodeId}
      data={data}
      nodeType={nodeType}
      className={className}
    />
  )
}
