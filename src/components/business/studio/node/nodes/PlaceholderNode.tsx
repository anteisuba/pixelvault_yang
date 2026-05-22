'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { NodeWorkflowNode, NodeWorkflowNodeType } from '@/types'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { WorkflowModelPicker } from '../WorkflowModelPicker'
import { NODE_ACCENTS, NODE_HANDLE_CLASS, NODE_ICONS } from './shared'

type PlaceholderType = Exclude<NodeWorkflowNodeType, 'script'>

export function PlaceholderNode({
  id,
  type,
  data,
  selected,
}: NodeProps<NodeWorkflowNode>) {
  const t = useTranslations('StudioNode')
  const { modelOptionsByType, updateNodeData, updateNodeModel } =
    useNodeWorkflowActions()
  const placeholderType = type as PlaceholderType
  const modelOptions = modelOptionsByType[placeholderType]
  const Icon = NODE_ICONS[placeholderType]
  const accent = NODE_ACCENTS[placeholderType]
  const title = t(`nodeDraftTitles.${placeholderType}`)

  return (
    <article
      className={cn(
        'group relative w-[28rem] overflow-hidden rounded-xl border bg-card/95 shadow-[0_18px_38px_-22px_rgba(20,20,19,0.32)] backdrop-blur transition-colors',
        selected
          ? accent.selectedRing
          : 'border-border/70 hover:border-foreground/30',
      )}
    >
      <span
        aria-hidden
        className={cn('absolute inset-y-0 left-0 w-[3px]', accent.spine)}
      />
      <Handle
        type="target"
        position={Position.Left}
        className={NODE_HANDLE_CLASS}
      />
      <Handle
        type="source"
        position={Position.Right}
        className={NODE_HANDLE_CLASS}
      />

      <header className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
        <div
          className={cn(
            'flex size-9 items-center justify-center rounded-md',
            accent.iconPlate,
          )}
        >
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-3xs font-medium uppercase tracking-nav text-muted-foreground">
            {t(`nodeTypes.${placeholderType}`)}
          </p>
          <h2 className="truncate font-display text-sm font-semibold text-foreground">
            {title}
          </h2>
        </div>
        <Badge
          variant="outline"
          className="rounded-full border-dashed text-3xs font-medium uppercase tracking-nav text-muted-foreground"
        >
          {t('placeholderComingSoon')}
        </Badge>
      </header>

      <div className="nodrag grid cursor-default gap-3 p-4">
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/30">
          <div className="flex flex-col items-center gap-2 text-center">
            <Icon className={cn('size-6', accent.iconText)} />
            <p className="text-xs text-muted-foreground">
              {t(`placeholderPreview.${placeholderType}`)}
            </p>
          </div>
        </div>
        <Textarea
          value={data.prompt}
          onChange={(event) =>
            updateNodeData(id, { prompt: event.target.value })
          }
          placeholder={t(`placeholderPrompt.${placeholderType}`)}
          className="min-h-20 resize-none rounded-lg border-border/70 bg-background/80 text-sm leading-6 shadow-none"
        />
        <WorkflowModelPicker
          value={data.model?.optionId ?? ''}
          options={modelOptions}
          onChange={(model) => updateNodeModel(id, model)}
        />
      </div>
    </article>
  )
}
