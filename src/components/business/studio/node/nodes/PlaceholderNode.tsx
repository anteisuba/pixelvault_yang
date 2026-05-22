'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { NodeWorkflowNode, NodeWorkflowNodeType } from '@/types'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { WorkflowModelPicker } from '../WorkflowModelPicker'
import { NODE_ICONS } from './shared'

const HANDLE_CLASS =
  '!size-3 !border !border-border !bg-card !shadow-sm hover:!border-primary'

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
  const title = t(`nodeDraftTitles.${placeholderType}`)

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

      <div className="border-b border-border/60 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {t(`nodeTypes.${placeholderType}`)}
            </p>
            <h2 className="truncate text-sm font-semibold text-foreground">
              {title}
            </h2>
          </div>
        </div>
      </div>

      <div className="nodrag grid cursor-default gap-4 p-4">
        <div className="flex h-36 items-center justify-center rounded-lg border border-border/70 bg-muted/40">
          <div className="text-center text-muted-foreground">
            <Icon className="mx-auto size-6" />
            <p className="mt-2 text-xs">
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
          className="min-h-24 resize-none rounded-lg border-border/70 bg-background/80 text-sm shadow-none"
        />
        <WorkflowModelPicker
          value={data.model?.optionId ?? ''}
          options={modelOptions}
          onChange={(model) => updateNodeModel(id, model)}
        />
        <div className="flex items-center justify-between border-t border-border/60 pt-3 text-xs text-muted-foreground">
          <span>{t(`nodeTypes.${placeholderType}`)}</span>
          <Badge variant="outline">{t('placeholderComingSoon')}</Badge>
        </div>
      </div>
    </article>
  )
}
