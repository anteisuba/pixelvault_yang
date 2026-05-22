'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  Activity,
  Clapperboard,
  Film,
  Loader2,
  MapPinned,
  PencilLine,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback } from 'react'

import { SCRIPT_BREAKDOWN_LIMITS } from '@/constants/script-breakdown'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { NodeWorkflowNode } from '@/types'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { WorkflowModelPicker } from '../WorkflowModelPicker'
import { NODE_ICONS } from './shared'

const HANDLE_CLASS =
  '!size-3 !border !border-border !bg-card !shadow-sm hover:!border-primary'

export function ScriptNode({
  id,
  data,
  selected,
}: NodeProps<NodeWorkflowNode>) {
  const t = useTranslations('StudioNode')
  const {
    modelOptionsByType,
    isLoading,
    updateNodeData,
    updateNodeModel,
    openNodeEditor,
    generateScript,
  } = useNodeWorkflowActions()
  const modelOptions = modelOptionsByType.script
  const Icon = NODE_ICONS.script
  const breakdown = data.breakdown
  const title = breakdown?.title || t('scriptNodeDraftTitle')
  const canGenerate = data.prompt.trim().length > 0 && !isLoading

  const handlePromptChange = useCallback(
    (value: string) => updateNodeData(id, { prompt: value }),
    [id, updateNodeData],
  )

  const handleEdit = useCallback(() => openNodeEditor(id), [id, openNodeEditor])

  const handleGenerate = useCallback(() => {
    const node: NodeWorkflowNode = {
      id,
      type: 'script',
      position: { x: 0, y: 0 },
      data,
    }
    void generateScript(node)
  }, [id, data, generateScript])

  return (
    <article
      className={cn(
        'w-[28rem] rounded-lg border bg-card/95 shadow-xl backdrop-blur transition-colors',
        selected
          ? 'border-primary/70 ring-2 ring-primary/20'
          : 'border-border/70 hover:border-border',
      )}
    >
      <Handle type="target" position={Position.Left} className={HANDLE_CLASS} />
      <Handle
        type="source"
        position={Position.Right}
        className={HANDLE_CLASS}
      />

      <ScriptNodeHeader
        icon={Icon}
        typeLabel={t('nodeTypes.script')}
        title={title}
        showEdit={Boolean(breakdown)}
        editLabel={t('editNode')}
        onEdit={handleEdit}
      />

      <div className="nodrag grid cursor-default gap-4 p-4">
        {breakdown ? (
          <>
            <p className="text-sm leading-6 text-muted-foreground">
              {breakdown.logline}
            </p>
            <div className="grid grid-cols-5 gap-2">
              <NodeMetric icon={Users} value={breakdown.characters.length} />
              <NodeMetric icon={MapPinned} value={breakdown.scenes.length} />
              <NodeMetric icon={Activity} value={breakdown.actions.length} />
              <NodeMetric icon={Clapperboard} value={breakdown.beats.length} />
              <NodeMetric icon={Film} value={breakdown.shots.length} />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
              <div className="min-w-0 text-xs text-muted-foreground">
                {data.plannerLabel && (
                  <p className="font-medium text-foreground">
                    {data.plannerLabel}
                  </p>
                )}
                {data.plannerModelId && (
                  <p className="truncate">{data.plannerModelId}</p>
                )}
              </div>
              <Badge variant="outline">
                {t(`copyRisk.${breakdown.referenceIntent.copyRisk}`)}
              </Badge>
            </div>
          </>
        ) : (
          <>
            <Textarea
              value={data.prompt}
              onChange={(event) => handlePromptChange(event.target.value)}
              maxLength={SCRIPT_BREAKDOWN_LIMITS.IDEA_MAX_LENGTH}
              placeholder={t('scriptNodePlaceholder')}
              className="min-h-28 resize-none rounded-lg border-border/70 bg-background/80 text-sm leading-6 shadow-none"
            />
            <WorkflowModelPicker
              value={data.model?.optionId ?? ''}
              options={modelOptions}
              onChange={(model) => updateNodeModel(id, model)}
            />
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {t('modelRouteCount', { count: modelOptions.length })}
              </div>
              <Button
                type="button"
                disabled={!canGenerate}
                className="h-9 rounded-full"
                onClick={handleGenerate}
              >
                {isLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {isLoading ? t('generating') : t('generate')}
              </Button>
            </div>
          </>
        )}
      </div>
    </article>
  )
}

interface ScriptNodeHeaderProps {
  icon: LucideIcon
  typeLabel: string
  title: string
  showEdit: boolean
  editLabel: string
  onEdit: () => void
}

function ScriptNodeHeader({
  icon: Icon,
  typeLabel,
  title,
  showEdit,
  editLabel,
  onEdit,
}: ScriptNodeHeaderProps) {
  return (
    <div className="border-b border-border/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{typeLabel}</p>
            <h2 className="truncate text-sm font-semibold text-foreground">
              {title}
            </h2>
          </div>
        </div>
        {showEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="nodrag h-8 rounded-full"
            onClick={onEdit}
          >
            <PencilLine className="size-3.5" />
            {editLabel}
          </Button>
        )}
      </div>
    </div>
  )
}

function NodeMetric({
  icon: Icon,
  value,
}: {
  icon: LucideIcon
  value: number
}) {
  return (
    <div className="rounded-md border border-border/60 bg-background/60 p-2">
      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
        <Icon className="size-3" />
      </div>
      <p className="mt-1 text-center text-sm font-semibold text-foreground">
        {value}
      </p>
    </div>
  )
}
