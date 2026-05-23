'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  Activity,
  Bot,
  Clapperboard,
  Film,
  Loader2,
  MapPinned,
  Maximize2,
  Plus,
  Users,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useMemo } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { NodeWorkflowNode, ScriptBreakdownResult } from '@/types'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { NODE_ACCENTS, NODE_HANDLE_CLASS } from './shared'

const AGENT_ACCENT = NODE_ACCENTS.agent

export function AgentNode({ id, data, selected }: NodeProps<NodeWorkflowNode>) {
  const t = useTranslations('StudioNode')
  const { isLoading, openNodeEditor } = useNodeWorkflowActions()
  const breakdown = data.breakdown
  const handleEdit = useCallback(() => openNodeEditor(id), [id, openNodeEditor])

  return (
    <article
      className={cn(
        'group relative h-[240px] w-[360px] overflow-hidden rounded-[22px] border bg-[#181716] shadow-[0_20px_60px_rgba(0,0,0,0.5)] transition-colors',
        selected
          ? AGENT_ACCENT.selectedRing
          : 'border-white/[0.08] hover:border-white/20',
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className={NODE_HANDLE_CLASS}
        aria-label="input"
      />
      <Plus
        aria-hidden
        className="pointer-events-none absolute -left-[3px] top-1/2 size-2 -translate-y-1/2 text-[#a6a098]"
      />
      <Handle
        type="source"
        position={Position.Right}
        className={NODE_HANDLE_CLASS}
      />

      <div className="absolute inset-[9px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#2d2b28]">
        <header className="flex items-start justify-between gap-2 p-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-[#22211f] px-2 py-1 font-display text-[10px] font-semibold text-[#a6a098]">
            <Bot className="size-3" />
            {t('nodeTypes.agent')}
          </span>
          {breakdown && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleEdit}
              aria-label={t('agent.openEditor')}
              title={t('agent.openEditor')}
              className="nodrag size-7 rounded-md text-[#a6a098] opacity-0 transition-opacity hover:bg-white/5 hover:text-foreground group-hover:opacity-100"
            >
              <Maximize2 className="size-3.5" />
            </Button>
          )}
        </header>

        <div className="nodrag flex h-[calc(100%-44px)] cursor-default items-center justify-center px-3 pb-3">
          {isLoading && !breakdown ? (
            <AgentLoadingState label={t('agent.running')} />
          ) : breakdown ? (
            <AgentBreakdownSummary
              breakdown={breakdown}
              plannerLabel={data.plannerLabel}
              plannerModelId={data.plannerModelId}
              countersLabel={t('breakdownCountersLabel')}
              copyRiskLabel={t(
                `copyRisk.${breakdown.referenceIntent.copyRisk}`,
              )}
            />
          ) : (
            <AgentEmptyState
              title={t('agent.emptyTitle')}
              body={t('agent.emptyBody')}
            />
          )}
        </div>
      </div>
    </article>
  )
}

function AgentEmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <span aria-hidden className="text-4xl leading-none">
        🤖
      </span>
      <p className="font-display text-xs font-semibold text-foreground/85">
        {title}
      </p>
      <p className="max-w-[260px] font-serif text-[11px] leading-5 text-[#a6a098]">
        {body}
      </p>
    </div>
  )
}

function AgentLoadingState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center text-[#a6a098]">
      <Loader2 className="size-6 animate-spin text-amber-300" />
      <p className="font-display text-xs font-medium">{label}</p>
    </div>
  )
}

interface AgentBreakdownSummaryProps {
  breakdown: ScriptBreakdownResult
  plannerLabel?: string
  plannerModelId?: string
  countersLabel: string
  copyRiskLabel: string
}

function AgentBreakdownSummary({
  breakdown,
  plannerLabel,
  plannerModelId,
  countersLabel,
  copyRiskLabel,
}: AgentBreakdownSummaryProps) {
  const counters = useMemo(
    () => [
      { icon: Users, value: breakdown.characters.length, key: 'characters' },
      { icon: MapPinned, value: breakdown.scenes.length, key: 'scenes' },
      { icon: Activity, value: breakdown.actions.length, key: 'actions' },
      { icon: Clapperboard, value: breakdown.beats.length, key: 'beats' },
      { icon: Film, value: breakdown.shots.length, key: 'shots' },
    ],
    [breakdown],
  )

  return (
    <div className="flex w-full flex-col gap-2.5">
      <p className="line-clamp-2 font-serif text-xs leading-5 text-foreground/85">
        {breakdown.logline}
      </p>

      <div aria-label={countersLabel} className="grid grid-cols-5 gap-1.5">
        {counters.map(({ icon: CounterIcon, value, key }) => (
          <div
            key={key}
            className="rounded-md border border-white/[0.06] bg-[#181716]/60 p-1.5"
          >
            <div className="flex items-center justify-center text-[#6f6a63]">
              <CounterIcon className="size-3" />
            </div>
            <p className="mt-0.5 text-center font-display text-[11px] font-semibold tabular-nums text-foreground/90">
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2">
        <div className="min-w-0 text-[10px] text-[#a6a098]">
          {plannerLabel && (
            <p className="truncate font-display font-medium text-foreground/85">
              {plannerLabel}
            </p>
          )}
          {plannerModelId && (
            <p className="truncate font-mono text-[10px]">{plannerModelId}</p>
          )}
        </div>
        <Badge
          variant="outline"
          className="border-white/15 bg-[#22211f] text-[10px] text-[#a6a098]"
        >
          {copyRiskLabel}
        </Badge>
      </div>
    </div>
  )
}
