'use client'

import { useMemo, useState } from 'react'
import {
  Download,
  Eraser,
  Expand,
  Layers3,
  Maximize2,
  MoreHorizontal,
  Paintbrush,
  PencilLine,
  Scissors,
  Sparkles,
  Tags,
  Trash2,
  WandSparkles,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID,
  NODE_STUDIO_REFERENCE_ROLES,
} from '@/constants/node-studio'
import { READY_CANVAS_IMAGE_EDIT_CAPABILITIES } from '@/constants/canvas-image-edit-capabilities'
import { IMEAwareInput } from '@/components/business/node/inspector/IMEAwareField'
import { cn } from '@/lib/utils'
import type { ReadyCanvasImageEditCapabilityId } from '@/types/canvas-image-edit'
import type { NodeWorkflowReferenceRole } from '@/types'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

import { CanvasImageEditWorkspace } from './CanvasImageEditWorkspace'
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

function getImageSourceUrl(data: NodeWorkflowNodeData): string {
  if (typeof data.mediaUrl === 'string' && data.mediaUrl.trim()) {
    return data.mediaUrl
  }
  if (typeof data.imageUrl === 'string' && data.imageUrl.trim()) {
    return data.imageUrl
  }
  return ''
}

export function canOfferCanvasImageEdit(data: NodeWorkflowNodeData): boolean {
  return Boolean(getImageSourceUrl(data))
}

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
}: CanvasImageSelectionToolbarProps) {
  const t = useTranslations('StudioNode.nodeToolbar')
  const tSource = useTranslations('StudioNode.imageSourceStarter')
  const tRoles = useTranslations('StudioNode.characterImage.reference')
  const tTasks = useTranslations('StudioImageEdit.tasks')
  const { setExpandedNodeId, deleteNode, updateNodeData } =
    useNodeWorkflowActions()
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
    const url = getImageSourceUrl(data)
    if (!url) return
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.target = '_blank'
    anchor.rel = 'noopener noreferrer'
    anchor.download = ''
    anchor.click()
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
              className="flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-node-muted transition-colors hover:bg-node-panel-inner hover:text-node-foreground"
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
          className="flex size-9 items-center justify-center rounded-lg text-node-muted transition-colors hover:bg-node-panel-inner hover:text-node-foreground"
        >
          <Maximize2 className="size-3.5" />
        </button>

        <button
          type="button"
          onClick={handleDownload}
          aria-label={t('download')}
          title={t('download')}
          className="flex size-9 items-center justify-center rounded-lg text-node-muted transition-colors hover:bg-node-panel-inner hover:text-node-foreground"
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
            'flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold transition-colors',
            quickEditOpen
              ? 'bg-node-paint text-node-paint-fg'
              : 'text-node-foreground hover:bg-node-panel-inner',
          )}
        >
          <WandSparkles className="size-3.5" />
          <span className="hidden sm:inline">{t('quickEdit')}</span>
        </button>

        <button
          type="button"
          onClick={() => deleteNode(nodeId)}
          aria-label={t('delete')}
          title={t('delete')}
          className="flex size-9 items-center justify-center rounded-lg text-node-muted transition-colors hover:bg-node-status-failed/40 hover:text-node-status-failed-fg"
        >
          <Trash2 className="size-3.5" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t('more')}
              title={t('more')}
              className="flex size-9 items-center justify-center rounded-lg text-node-muted transition-colors hover:bg-node-panel-inner hover:text-node-foreground"
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

interface ImageToolbarChromeProps {
  nodeId: string
  data?: NodeWorkflowNodeData
  selected?: boolean
  className?: string
}

export function NodeSelectionToolbarChrome({
  nodeId,
  data,
  selected,
  className,
}: ImageToolbarChromeProps) {
  const t = useTranslations('StudioNode.nodeToolbar')
  const { setExpandedNodeId, deleteNode } = useNodeWorkflowActions()
  const hasImageEdit = Boolean(data && canOfferCanvasImageEdit(data))

  if (!selected) return null

  if (hasImageEdit && data) {
    return <CanvasImageSelectionToolbar nodeId={nodeId} data={data} />
  }

  return (
    <div
      className={cn(
        'flex h-11 items-center gap-1 rounded-xl border border-node-panel-inner bg-node-panel/95 p-1 shadow-node-panel backdrop-blur',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setExpandedNodeId(nodeId)}
        aria-label={t('expand')}
        title={t('expand')}
        className="flex size-9 items-center justify-center rounded-lg text-node-muted transition-colors hover:bg-node-panel-inner hover:text-node-foreground"
      >
        <Maximize2 className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => deleteNode(nodeId)}
        aria-label={t('delete')}
        title={t('delete')}
        className="flex size-9 items-center justify-center rounded-lg text-node-muted transition-colors hover:bg-node-status-failed/40 hover:text-node-status-failed-fg"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}
