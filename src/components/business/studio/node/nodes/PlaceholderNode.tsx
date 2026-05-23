'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useTranslations } from 'next-intl'
import { useCallback } from 'react'

import { cn } from '@/lib/utils'
import type {
  NodeWorkflowModelSelection,
  NodeWorkflowNode,
  NodeWorkflowNodeType,
} from '@/types'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { WorkflowModelPicker } from '../WorkflowModelPicker'
import { NODE_ACCENTS, NODE_HANDLE_CLASS, NODE_ICONS } from './shared'

type PlaceholderType = Exclude<NodeWorkflowNodeType, 'composer' | 'agent'>
type BlueprintChipKey = 'primary' | 'secondary' | 'tertiary'

const BLUEPRINT_CHIP_KEYS: BlueprintChipKey[] = [
  'primary',
  'secondary',
  'tertiary',
]

const HUB_NODE_TYPES = new Set<PlaceholderType>(['shot', 'seedance'])

export function PlaceholderNode({
  id,
  type,
  data,
  selected,
}: NodeProps<NodeWorkflowNode>) {
  const t = useTranslations('StudioNode')
  const { modelOptionsByType, updateNodeModel } = useNodeWorkflowActions()
  const placeholderType = type as PlaceholderType
  const Icon = NODE_ICONS[placeholderType]
  const accent = NODE_ACCENTS[placeholderType]
  const title = t(`nodeDraftTitles.${placeholderType}`)
  const typeLabel = t(`nodeTypes.${placeholderType}`)
  const isHubNode = HUB_NODE_TYPES.has(placeholderType)
  const modelOptions = modelOptionsByType[placeholderType]

  const handleModelChange = useCallback(
    (model: NodeWorkflowModelSelection) => updateNodeModel(id, model),
    [id, updateNodeModel],
  )

  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-[22px] border bg-[#181716] shadow-[0_20px_60px_rgba(0,0,0,0.5)] transition-colors',
        isHubNode ? 'h-[300px] w-[420px]' : 'h-[244px] w-[340px]',
        selected
          ? accent.selectedRing
          : 'border-white/[0.08] hover:border-white/20',
      )}
    >
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

      <div className="absolute inset-[9px] flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#2d2b28]">
        <header className="flex items-center justify-between gap-2 p-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-[#22211f] px-2 py-1 font-display text-[10px] font-semibold',
              accent.iconText,
            )}
          >
            <Icon className="size-3" />
            {typeLabel}
          </span>
          <span className="rounded-full border border-white/[0.08] bg-[#181716]/70 px-2 py-1 font-display text-[10px] font-semibold text-[#a6a098]">
            {t(`nodeBlueprints.${placeholderType}.status`)}
          </span>
        </header>

        <div className="nodrag flex min-h-0 flex-1 cursor-default flex-col gap-3 px-3 pb-3">
          <div className="rounded-xl border border-white/[0.06] bg-[#181716]/55 p-3">
            <div className="flex items-start gap-2.5">
              <span
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-xl',
                  accent.iconPlate,
                )}
              >
                <Icon className="size-4" />
              </span>
              <div className="min-w-0">
                <h3 className="truncate font-display text-sm font-semibold text-foreground/90">
                  {title}
                </h3>
                <p className="mt-1 line-clamp-2 font-serif text-[12px] leading-5 text-[#a6a098]">
                  {t(`nodeBlueprints.${placeholderType}.body`)}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-1.5">
            {BLUEPRINT_CHIP_KEYS.map((chipKey) => (
              <div
                key={chipKey}
                className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-[#22211f]/70 px-2.5 py-1.5"
              >
                <span
                  aria-hidden
                  className={cn('size-1.5 shrink-0 rounded-full', accent.dot)}
                />
                <span className="truncate font-display text-[11px] font-medium text-foreground/80">
                  {t(`nodeBlueprints.${placeholderType}.chips.${chipKey}`)}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2">
            <WorkflowModelPicker
              value={data.model?.optionId ?? ''}
              options={modelOptions}
              onChange={handleModelChange}
              variant="chip"
            />
            <span className="truncate text-right font-display text-[10px] font-semibold uppercase tracking-nav text-[#6f6a63]">
              {t(`nodeBlueprints.${placeholderType}.footer`)}
            </span>
          </div>
        </div>
      </div>
    </article>
  )
}
