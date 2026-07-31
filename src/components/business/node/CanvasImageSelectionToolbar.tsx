'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useEdges, useReactFlow } from '@xyflow/react'
import {
  Check,
  Download,
  Eraser,
  Expand,
  Film,
  IdCard,
  Layers3,
  Library,
  Maximize2,
  MoreHorizontal,
  Palette,
  Paintbrush,
  Replace,
  Scissors,
  Sparkles,
  Tags,
  Trash2,
  Undo2,
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
import {
  NODE_REVIEW_STATE_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import {
  approveMedia,
  rejectMedia,
  resolveMediaReviewState,
} from '@/lib/node-media-review'
import type { NodeTokenType } from '@/constants/node-tokens'
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
  'object-replace': Replace,
  'style-transfer': Palette,
} as const satisfies Record<ReadyCanvasImageEditCapabilityId, typeof Sparkles>

const MORE_EDIT_TASKS = [
  'upscale',
  'remove-background',
  'inpaint',
  'outpaint',
  'decompose',
  'extract-element',
  'object-replace',
  'style-transfer',
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
 * primary = category · expand · download · quick-edit
 * everything else (AI edit suite, delete) lives in "more".
 * Rename is NOT here — the on-card label (卡外上方) is the single place to
 * rename a node per canvas-image-card.md §1; this toolbar used to duplicate
 * it with its own input, which meant two editable places for one name.
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
        className="canvas-selection-toolbar flex h-11 max-w-[min(28rem,calc(100vw-2rem))] items-center gap-0.5 p-1"
      >
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

        <span
          className="canvas-selection-toolbar-divider mx-0.5 h-5 w-px"
          aria-hidden
        />

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
          className="relative flex size-9 items-center justify-center rounded-lg text-node-status-failed-fg transition-colors hover:bg-node-status-failed/40 coarse:before:absolute coarse:before:-inset-y-1 coarse:before:inset-x-0 coarse:before:content-['']"
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
// shotText / image-family-without-media) share one shell — capability region
// (type-specific, ≤2 buttons today) | universal region (⤢详情 · 下载 ·
// 删除). Every action below calls an EXISTING channel (NodeWorkflowActionsContext,
// a shared hook, or a shared component) — no new generation/upload endpoint
// is introduced by this registry.
// S5（2026-07-27）: the identity/rename region that used to lead this shell
// is gone — names are edited on-card now (NodeShell.tsx `EditableNodeLabel`,
// canvas-image-card.md §1/§三/§五). A card with neither a capability nor a
// downloadable media gets no toolbar at all (see `GenericSelectionToolbar`).
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
        "relative flex size-9 items-center justify-center rounded-lg transition-colors coarse:before:absolute coarse:before:-inset-y-1 coarse:before:inset-x-0 coarse:before:content-[''] disabled:pointer-events-none disabled:opacity-50",
        // 删除是工具条里唯一的彩色项（canvas-image-card.md §6）：danger 常态即
        // text-node-status-failed-fg（= --canvas-danger），不必等 hover 才
        // 变色；其余图标常态 text-node-muted（= --canvas-ink-regular）。
        danger
          ? 'text-node-status-failed-fg hover:bg-node-status-failed/40'
          : 'text-node-muted hover:bg-node-panel-inner hover:text-node-foreground',
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

/**
 * 包 4 审核动作。动作放**既有**的近场工具条，不在卡面上新造一条状态带 ——
 * 本档「视觉极小」，改卡面要过 ui-page 门。状态本身走卡边（canvas.css 的
 * `.canvas-card[data-status]` 通用规则）。
 *
 * 只在这张图**需要人做决定**时出现：已通过的图不该常年挂着两个按钮，那是噪音。
 * 已打回的图仍给「通过」，因为改主意是常态；不给「再打回一次」。
 */
export function MediaReviewButtons({
  nodeId,
  data,
}: {
  nodeId: string
  data: NodeWorkflowNodeData
}) {
  const t = useTranslations('StudioNode.review')
  const { updateNodeData } = useNodeWorkflowActions()
  const url = getNodeMediaUrl(data)
  const state = resolveMediaReviewState(data, url)

  if (!url || state === NODE_REVIEW_STATE_IDS.approved) return null

  return (
    <>
      <ToolbarLabelButton
        icon={Check}
        label={t('approve')}
        onClick={() =>
          updateNodeData(
            nodeId,
            approveMedia(data, url, { reviewedAt: new Date().toISOString() }),
          )
        }
      />
      {state === NODE_REVIEW_STATE_IDS.awaitingReview ? (
        <ToolbarLabelButton
          icon={Undo2}
          label={t('reject')}
          onClick={() =>
            updateNodeData(
              nodeId,
              // ⚠ 只改状态，**不删媒体** —— §5-W3「保留上一版媒体 URL 作对比
              // （不立刻删 R2）」。理由是可选的，留给后续的打回面板填。
              rejectMedia(data, url, { reviewedAt: new Date().toISOString() }),
            )
          }
        />
      ) : null}
    </>
  )
}

/** Video capability region: generation only. Preview lives in the native
 * video card, and detail is reserved for the universal expand button. */
function SeedanceCapability({
  nodeId,
  data,
}: {
  nodeId: string
  data: NodeWorkflowNodeData
}) {
  const t = useTranslations('StudioNode.videoGeneration')
  const { generateMediaNode } = useNodeWorkflowActions()
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
    </>
  )
}

/** Video merge capability region: merge only. Reordering remains a detail
 * concern reached through the universal expand button. */
function VideoMergeCapability({
  nodeId,
  data,
}: {
  nodeId: string
  data: NodeWorkflowNodeData
}) {
  const t = useTranslations('StudioNode.videoMerge')
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
 *  as that toolbar so selecting any card reads as one consistent object.
 *
 *  owner 2026-07-27: 近场工具条的存在取决于"有没有内容可操作"——名字已经
 *  收口到卡外（见 NodeShell.tsx `EditableNodeLabel` / canvas-image-card.md
 *  §1），这里不再有 identity/rename 区；一张卡如果既没有能力区（生成/合成/
 *  选择声音/添加素材……）也没有可下载的媒体，就真的没有东西可操作，整条
 *  toolbar 不渲染——不是渲染一条只剩 expand+delete 的空壳（⤢ 对着空卡没有
 *  可看的东西，delete 走键盘 Backspace/Delete 一样能删，不必靠这条浮层）。 */
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
  // 直接调用（不经 JSX）——`<ToolbarCapabilityRegion .../>` 这个写法本身永远
  // 是个 truthy 的元素描述对象，即便 ToolbarCapabilityRegion 内部的 switch
  // 最终会 return null，`data ? <.../> : null` 这层判断也测不出来（第一版
  // 的 bug：真机三个"空态不渲染"用例全挂在这，元素造出来了但没内容）。
  // ToolbarCapabilityRegion 自己不调用任何 hook（只是个 switch），直接当
  // 普通函数调用是安全的，能立刻拿到它真实会渲染的 ReactNode | null。
  const capability = data
    ? ToolbarCapabilityRegion({ nodeId, data, nodeType, isCollector })
    : null
  const mediaUrl = data ? getNodeMediaUrl(data) : ''

  if (!capability && !mediaUrl) return null

  return (
    <div
      role="toolbar"
      aria-label={t('toolbar')}
      className={cn(
        'canvas-selection-toolbar flex h-11 items-center gap-1 p-1',
        className,
      )}
    >
      {capability}
      {capability ? (
        <span
          className="canvas-selection-toolbar-divider mx-0.5 h-5 w-px"
          aria-hidden
        />
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
