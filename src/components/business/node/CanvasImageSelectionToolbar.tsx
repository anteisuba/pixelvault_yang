'use client'

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react'
import { useEdges, useNodes, useReactFlow } from '@xyflow/react'
import {
  Check,
  Download,
  Eraser,
  Expand,
  FileText,
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
  Upload,
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
  NODE_STUDIO_VIDEO_INPUT,
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
import {
  getMediaGenerateBlockReason,
  type MediaGenerateBlockReason,
} from '@/lib/node-workflow-prompt'
import {
  getUpstreamNodes,
  harvestUpstreamShotTextPrompt,
} from '@/lib/node-workflow-graph'
import type { NodeTokenType } from '@/constants/node-tokens'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { useReferenceVideoUpload } from '@/hooks/node/use-reference-video-upload'
import { useVideoMergeAction } from '@/hooks/node/use-video-merge-action'
import { cn } from '@/lib/utils'
import type { ReadyCanvasImageEditCapabilityId } from '@/types/canvas-image-edit'
import type { GenerationRecord, NodeWorkflowReferenceRole } from '@/types'
import type {
  NodeWorkflowEdge,
  NodeWorkflowNode,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { CanvasImageEditWorkspace } from './CanvasImageEditWorkspace'
import { CharacterImageReferenceControls } from './CharacterImageReferenceControls'
import { FishVoiceLibraryDialog } from './FishVoiceLibraryDialog'
import { useNodeWorkflowActions } from './NodeWorkflowActionsContext'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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

/**
 * 溢出菜单的分段（台账 C1：八条平铺，看不出哪条点下去要接着干活）。
 *
 * ⚠ 分组**从能力常量的 `interaction` 推导**，不另写一份清单 —— 那个字段本来
 * 就是「点开之后要你做什么」的事实源（`CanvasImageEditWorkspace` 按它决定渲染
 * 涂抹编辑器 / 拉框编辑器 / 一个 prompt 框）。手抄一份的话，日后加能力只改常量
 * 就会悄悄错位：批 2 的 HTML 原型里我按语感把「提取元素 / 物体替换」归进了
 * 「需要框选」，而它们实际是 `prompt`（打字描述），两条就这么错了。
 */
type CanvasImageEditInteraction =
  (typeof READY_CANVAS_IMAGE_EDIT_CAPABILITIES)[number]['interaction']

const MORE_EDIT_GROUPS: readonly {
  labelKey: string
  interactions: readonly CanvasImageEditInteraction[]
}[] = [
  { labelKey: 'moreEditsInstant', interactions: ['instant', 'layers'] },
  { labelKey: 'moreEditsRegion', interactions: ['mask', 'outpaint'] },
  { labelKey: 'moreEditsDescribe', interactions: ['prompt'] },
]

interface MoreEditGroup {
  labelKey: string
  taskIds: ReadyCanvasImageEditCapabilityId[]
}

function groupMoreEditTasks(): MoreEditGroup[] {
  const interactionById = new Map<string, CanvasImageEditInteraction>(
    READY_CANVAS_IMAGE_EDIT_CAPABILITIES.map(({ id, interaction }) => [
      id,
      interaction,
    ]),
  )
  const remaining = new Set<ReadyCanvasImageEditCapabilityId>(MORE_EDIT_TASKS)
  const groups: MoreEditGroup[] = MORE_EDIT_GROUPS.map(
    ({ labelKey, interactions }) => {
      const taskIds = MORE_EDIT_TASKS.filter((taskId) => {
        const interaction = interactionById.get(taskId)
        const matched =
          interaction !== undefined && interactions.includes(interaction)
        if (matched) remaining.delete(taskId)
        return matched
      })
      return { labelKey, taskIds: [...taskIds] }
    },
  ).filter((group) => group.taskIds.length > 0)

  // 没归上的仍然渲出来（无标题段），只是排在最后：新增一种 interaction 时
  // 宁可分段不好看，也不能让一条能力从菜单里凭空消失。
  if (remaining.size > 0) {
    groups.push({
      labelKey: '',
      taskIds: MORE_EDIT_TASKS.filter((taskId) => remaining.has(taskId)),
    })
  }
  return groups
}

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
  const moreEditGroups = useMemo(() => groupMoreEditTasks(), [])

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
        {/* ① 主动作组 —— 全条唯一常显文字，13px/600（其余 12px/500）。
            `hidden sm:inline` 已去掉：文字才是它「是主角」的载体，窄屏藏掉等
            于这条修缮在窄屏不存在；分类腾出的 ~72px 也够它常显。 */}
        <button
          type="button"
          onClick={() => onQuickEditOpenChange?.(!quickEditOpen)}
          aria-pressed={quickEditOpen}
          aria-label={t('quickEdit')}
          title={t('quickEdit')}
          className={cn(
            "relative flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-colors coarse:before:absolute coarse:before:-inset-y-1 coarse:before:inset-x-0 coarse:before:content-['']",
            quickEditOpen
              ? 'bg-node-paint text-node-paint-fg'
              : 'bg-node-panel-inner text-node-foreground hover:bg-node-panel-inner/70',
          )}
        >
          <WandSparkles className="size-4" />
          <span className="whitespace-nowrap">{t('quickEdit')}</span>
        </button>

        {/* 类型专属主动作（今天只有镜头图的 生成/重生成）与快捷编辑同组 */}
        {extra}

        <span
          className="canvas-selection-toolbar-divider mx-1 h-5 w-px"
          aria-hidden
        />

        {/* ② 读取 / 导出组 —— 看和拿走，都不改这张图 */}
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
          className="canvas-selection-toolbar-divider mx-1 h-5 w-px"
          aria-hidden
        />

        {/* ③ 更多 + 销毁组 —— 删除此前紧贴主动作（快捷编辑右邻），把「最常点」
            和「不可逆」摆成邻居；挪到末组并让 ⋯ 隔在中间。 */}
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
            className="min-w-52 border-node-panel-inner bg-node-panel text-node-foreground"
          >
            {/* 分类从常驻条收进来：它是**属性**不是动作，混在一排动作钮里
                还占着最左最显眼的带文字位，而它一张图只设一次。详情面板
                （LooseImageDetailBody）里本来就有一份更全的（带自定义名输
                入），所以这里收起来不会变成唯一入口。 */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2 focus:bg-node-panel-inner data-[state=open]:bg-node-panel-inner">
                <Tags className="size-3.5" />
                {t('category')}
                <span className="ml-auto max-w-24 truncate pl-2 text-2xs text-node-muted">
                  {data.imageCategory
                    ? data.imageCategory ===
                      NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID
                      ? data.imageCategoryLabel ||
                        tSource('categoryCustomLabel')
                      : tRoles(`roles.${data.imageCategory}`)
                    : tSource('categoryUnset')}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-40 border-node-panel-inner bg-node-panel text-node-foreground">
                <DropdownMenuItem
                  onClick={() =>
                    updateNodeData(nodeId, {
                      imageCategory: undefined,
                      imageCategoryLabel: undefined,
                    })
                  }
                  className="gap-2 focus:bg-node-panel-inner"
                >
                  <Check
                    className={cn(
                      'size-3.5',
                      data.imageCategory ? 'opacity-0' : 'opacity-100',
                    )}
                    aria-hidden
                  />
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
                    className="gap-2 focus:bg-node-panel-inner"
                  >
                    <Check
                      className={cn(
                        'size-3.5',
                        data.imageCategory === role
                          ? 'opacity-100'
                          : 'opacity-0',
                      )}
                      aria-hidden
                    />
                    {tRoles(`roles.${role}`)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            {/* 八条编辑能力分段（台账 C1）：段标题回答的是「点下去还要我干
                什么」，不是能力的语义分类 —— 那才是选之前真正想知道的。 */}
            {moreEditGroups.map((group, index) => (
              <Fragment key={group.labelKey || `group-${index}`}>
                <DropdownMenuSeparator className="bg-node-panel-inner" />
                {group.labelKey ? (
                  <DropdownMenuLabel className="text-2xs text-node-muted">
                    {t(group.labelKey)}
                  </DropdownMenuLabel>
                ) : null}
                {group.taskIds.map((taskId) => {
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
              </Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          onClick={() => deleteNode(nodeId)}
          aria-label={t('delete')}
          title={t('delete')}
          className="relative flex size-9 items-center justify-center rounded-lg text-node-status-failed-fg transition-colors hover:bg-node-status-failed/40 coarse:before:absolute coarse:before:-inset-y-1 coarse:before:inset-x-0 coarse:before:content-['']"
        >
          <Trash2 className="size-3.5" />
        </button>
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
/** 台账 #12：blockReason 存在时给 disabled 生成钮包一层 Radix Tooltip。
 *  `ToolbarLabelButton` 的 `disabled:pointer-events-none` 会吃掉原生 title，
 *  照 `NodeMediaInspector` 的「span 包一层」先例。触屏没有 hover——点击
 *  兜底仍由 `handleGenerateMediaNode` 里保留的同名守卫 toast 承担。 */
function GenerateBlockTooltip({
  reason,
  children,
}: {
  reason: MediaGenerateBlockReason | null
  children: ReactNode
}) {
  const t = useTranslations('StudioNode.mediaNodes')
  if (!reason) {
    return <>{children}</>
  }
  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{children}</span>
        </TooltipTrigger>
        <TooltipContent side="top">{t(reason)}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

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
  // 台账 #12：守卫前移到渲染期——与 handler 同一判据（先 model 后 prompt，
  // 镜头图不读上游文本）。此前守卫全在点击后，缺前提时零反馈只剩一个
  // 1.6s 的右下角 toast，用户无法判断自己到底点没点上。
  const blockReason = isRunning
    ? null
    : getMediaGenerateBlockReason(NODE_TYPE_IDS.shot, data)

  return (
    <GenerateBlockTooltip reason={blockReason}>
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
        disabled={isRunning || !generateMediaNode || Boolean(blockReason)}
      />
    </GenerateBlockTooltip>
  )
}

/**
 * 包 4 审核动作。动作放**既有**的近场工具条，不在卡面上新造一条状态带 ——
 * 本档「视觉极小」，改卡面要过 ui-page 门。状态本身走卡边（canvas.css 的
 * `.canvas-card[data-status]` 通用规则）。
 *
 * 三个态各给「还能往哪走」的那一个动作，**两个方向都可逆**：
 *   待审 → 通过 / 打回（两个都给，这时人还没做决定）
 *   已打回 → 通过（改主意）
 *   已通过 → 打回（改主意）
 *
 * ⚠ 早先这里对 `approved` 直接返回 null，理由是「已通过的图不该常年挂着按钮」。
 * 那个理由是错的：这条工具条**选中才出现**，根本不是常年挂着。而代价很实在 ——
 * 手滑点了「通过」就再也退不回来，因为按钮自己消失了。
 */
export function MediaReviewButtons({
  nodeId,
  data,
  compact = false,
}: {
  nodeId: string
  data: NodeWorkflowNodeData
  /**
   * 紧凑档（台账 D1）：只出图标、无文字，供生成框用。
   *
   * owner 2026-08-02「打回放到生成按钮附近」—— 它和发送同属「对这一版的处置」，
   * 而不是「下一版用什么参数」，所以从选择器那一组里挪出来贴着发送键。带文字
   * 的「打回」在 376px 的参数条里要吃掉 48px，正是那一行折成两行的主因之一。
   */
  compact?: boolean
}) {
  const t = useTranslations('StudioNode.review')
  const { updateNodeData } = useNodeWorkflowActions()
  const url = getNodeMediaUrl(data)
  if (!url) return null
  const state = resolveMediaReviewState(data, url)

  const approve = () =>
    updateNodeData(
      nodeId,
      approveMedia(data, url, { reviewedAt: new Date().toISOString() }),
    )
  const reject = () =>
    updateNodeData(
      nodeId,
      // ⚠ 只改状态，**不删媒体** —— §5-W3「保留上一版媒体 URL 作对比
      // （不立刻删 R2）」。理由是可选的，留给后续的打回面板填。
      rejectMedia(data, url, { reviewedAt: new Date().toISOString() }),
    )

  if (compact) {
    return (
      <>
        {state === NODE_REVIEW_STATE_IDS.approved ? null : (
          <button
            type="button"
            onClick={approve}
            aria-label={t('approve')}
            title={t('approve')}
            className="canvas-composer-review-btn nodrag"
          >
            <Check className="size-4" aria-hidden />
          </button>
        )}
        {state === NODE_REVIEW_STATE_IDS.rejected ? null : (
          <button
            type="button"
            onClick={reject}
            aria-label={t('reject')}
            title={t('reject')}
            className="canvas-composer-review-btn nodrag"
          >
            <Undo2 className="size-4" aria-hidden />
          </button>
        )}
      </>
    )
  }

  return (
    <>
      {state === NODE_REVIEW_STATE_IDS.approved ? null : (
        <ToolbarLabelButton
          icon={Check}
          label={t('approve')}
          onClick={approve}
        />
      )}
      {state === NODE_REVIEW_STATE_IDS.rejected ? null : (
        <ToolbarLabelButton icon={Undo2} label={t('reject')} onClick={reject} />
      )}
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
  const edges = useEdges<NodeWorkflowEdge>()
  const nodes = useNodes<NodeWorkflowNode>()
  const hasMedia = Boolean(
    typeof data.mediaUrl === 'string' && data.mediaUrl.trim(),
  )
  const isRunning = data.status === NODE_STATUS_IDS.running
  // 台账 #12（同 ShotGenerateButton）：守卫前移到渲染期。视频节点的 prompt
  // 可由上游 shotText 供给（handler 的 mergePromptWithUpstreamText 语义），
  // 所以判空前先按 handler 同款收割上游文本——只在自身 prompt 为空时才有
  // 意义，但收割本身够便宜，直接与 handler 保持同构最不容易漂移。
  const upstreamTextPrompt = useMemo(
    () => harvestUpstreamShotTextPrompt(getUpstreamNodes(nodeId, edges, nodes)),
    [edges, nodeId, nodes],
  )
  const blockReason = isRunning
    ? null
    : getMediaGenerateBlockReason(NODE_TYPE_IDS.seedance, data, {
        upstreamTextPrompt,
      })

  return (
    <GenerateBlockTooltip reason={blockReason}>
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
        disabled={isRunning || !generateMediaNode || Boolean(blockReason)}
      />
    </GenerateBlockTooltip>
  )
}

/**
 * 镜头文本 capability region: 打开详情面板改那四个字段。
 *
 * 与下面 `VideoReferenceCapability` 同一根问题（台账 #28）：没有能力区 ⇒ 空卡
 * 整条工具条不渲染 ⇒ 没有 ⤢ ⇒ 面板进不去。shotText 比参考视频更严重 —— 它的
 * 卡面窗内**连自己写了什么都不显示**（`NodeMediaPreview` 对 text 恒走空态），
 * 所以在此之前，一镜的场景/动作/镜头/构图在画布上既看不到也改不了。
 *
 * owner 2026-08-02：「助手这边只是自动生成，不用助手则用户手动输入然后生成
 * —— 是一种东西」。节点上的编辑会由 `updateNodeData` 回写 ScriptDoc
 * （`syncShotTextPatchToScriptDoc`），所以这里打开的面板与剧本笺改的是同一份
 * 数据，不存在「编了会被下次投影覆盖」。
 *
 * 面板内容零新增：`GenericDetailBody` 早就会按 `NODE_WORKFLOW_FIELDS_BY_NODE_TYPE`
 * 渲染这四个 Textarea，只是过去没人能走到它。
 */
function ShotTextCapability({ nodeId }: { nodeId: string }) {
  const t = useTranslations('StudioNode.workflowNodes.shotText')
  const { setExpandedNodeId } = useNodeWorkflowActions()

  return (
    <ToolbarLabelButton
      icon={FileText}
      label={t('editText')}
      onClick={() => setExpandedNodeId(nodeId)}
    />
  )
}

/**
 * 参考视频 capability region: 上传 / 替换。
 *
 * 台账 #28（2026-08-02）：这个能力区存在的第一理由不是「方便」，而是**可达性**
 * —— `GenericSelectionToolbar` 在「无能力区且无媒体」时整条不渲染（owner
 * 2026-07-27 拍板，理由「⤢ 对着空卡没有可看的东西」），而 videoReference 此前
 * 不在能力区 switch 里，于是空卡没有工具条 ⇒ 没有 ⤢ ⇒
 * `VideoReferenceDetailBody`（它恰恰**就是上传面板**）在最该打开的时刻打不开。
 * 给它一个能力区后 capability 恒非空，那条拍板规则本身**不用动**。
 *
 * 上传通道与卡面上传钮字节级同款（`useReferenceVideoUpload` → patch +
 * `status: done`），不新开端点、不新增文案。
 */
function VideoReferenceCapability({
  nodeId,
  data,
}: {
  nodeId: string
  data: NodeWorkflowNodeData
}) {
  const t = useTranslations('StudioNode.videoReference')
  const { updateNodeData } = useNodeWorkflowActions()
  const { uploadFile, isUploading } = useReferenceVideoUpload()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const hasMedia = Boolean(
    typeof data.mediaUrl === 'string' && data.mediaUrl.trim(),
  )

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      // 清 value：同一个文件可以再选一次（LooseImageCard 替换 input 同款）。
      event.target.value = ''
      if (!file) return
      const patch = await uploadFile(file)
      if (!patch) return
      updateNodeData(nodeId, { ...patch, status: NODE_STATUS_IDS.done })
    },
    [nodeId, updateNodeData, uploadFile],
  )

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={NODE_STUDIO_VIDEO_INPUT.accept}
        className="hidden"
        onChange={handleFileChange}
      />
      <ToolbarLabelButton
        icon={Upload}
        label={hasMedia ? t('replace') : t('upload')}
        onClick={() => fileInputRef.current?.click()}
        // 上传中的进度反馈由卡面遮罩负责（VideoReferenceNode 的 frosted
        // veil + 文件名 + 进度条），工具条不重复做一份。
        disabled={isUploading}
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
 *  reachable capability today (composer/agent，两者已退役、用户看不到；
 *  frame/closeup without media) — an empty middle region, not a dead button.
 *  ⚠ videoReference 与 shotText 于 2026-08-02（台账 #28 及其收尾）**迁出**
 *  这个清单：它们无媒体时没有能力区 ⇒ 整条工具条不渲染 ⇒ 详情面板不可达，
 *  而那恰恰是各自最该打开的面板。见两个 Capability 组件的头注。 */
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
    // 台账 #28：加这一 case 是为了让空参考视频卡也有工具条 ⇒ 有 ⤢ ⇒
    // 上传面板（VideoReferenceDetailBody）可达。见组件头注。
    case NODE_TYPE_IDS.videoReference:
      return <VideoReferenceCapability nodeId={nodeId} data={data} />
    // 同上一条的第二个受害者：shotText 恒无媒体，没有能力区就永远打不开
    // 那四个字段的编辑面板（GenericDetailBody）。见 ShotTextCapability 头注。
    case NODE_TYPE_IDS.shotText:
      return <ShotTextCapability nodeId={nodeId} />
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
