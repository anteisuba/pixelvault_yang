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
import { useCallback, useMemo } from 'react'

import { SCRIPT_BREAKDOWN_LIMITS } from '@/constants/script-breakdown'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { NodeWorkflowNode, ScriptBreakdownResult } from '@/types'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { WorkflowModelPicker } from '../WorkflowModelPicker'
import { NODE_ACCENTS, NODE_HANDLE_CLASS, NODE_ICONS } from './shared'

const SCRIPT_ACCENT = NODE_ACCENTS.script

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
        'group relative w-[28rem] overflow-hidden rounded-xl border bg-card/95 shadow-[0_18px_38px_-22px_rgba(20,20,19,0.32)] backdrop-blur transition-colors',
        selected
          ? SCRIPT_ACCENT.selectedRing
          : 'border-border/70 hover:border-foreground/30',
      )}
    >
      <span
        aria-hidden
        className={cn('absolute inset-y-0 left-0 w-[3px]', SCRIPT_ACCENT.spine)}
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
          <ScriptBreakdownSummary
            breakdown={breakdown}
            plannerLabel={data.plannerLabel}
            plannerModelId={data.plannerModelId}
            copyRiskLabel={t(`copyRisk.${breakdown.referenceIntent.copyRisk}`)}
            countersLabel={t('breakdownCountersLabel')}
            timelineLabel={t('breakdownTimelineLabel')}
            beatDurationLabel={(seconds) => t('duration', { seconds })}
          />
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
              <span className="text-xs text-muted-foreground">
                {t('modelRouteCount', { count: modelOptions.length })}
              </span>
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

interface ScriptBreakdownSummaryProps {
  breakdown: ScriptBreakdownResult
  plannerLabel?: string
  plannerModelId?: string
  copyRiskLabel: string
  countersLabel: string
  timelineLabel: string
  beatDurationLabel: (seconds: number) => string
}

function ScriptBreakdownSummary({
  breakdown,
  plannerLabel,
  plannerModelId,
  copyRiskLabel,
  countersLabel,
  timelineLabel,
  beatDurationLabel,
}: ScriptBreakdownSummaryProps) {
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

  const totalDuration = useMemo(
    () =>
      breakdown.beats.reduce(
        (total, beat) => total + Math.max(0, beat.durationSec),
        0,
      ),
    [breakdown.beats],
  )

  return (
    <>
      <p className="font-serif text-sm leading-6 text-foreground/80">
        {breakdown.logline}
      </p>

      <section aria-label={countersLabel} className="grid grid-cols-5 gap-2">
        {counters.map(({ icon: CounterIcon, value, key }) => (
          <div
            key={key}
            className="rounded-md border border-border/60 bg-background/60 p-2"
          >
            <div className="flex items-center justify-center text-muted-foreground">
              <CounterIcon className="size-3" />
            </div>
            <p className="mt-1 text-center font-display text-sm font-semibold tabular-nums text-foreground">
              {value}
            </p>
          </div>
        ))}
      </section>

      {breakdown.beats.length > 0 && totalDuration > 0 && (
        <section className="grid gap-2">
          <div className="flex items-center justify-between text-3xs font-medium uppercase tracking-nav text-muted-foreground">
            <span className="font-display">{timelineLabel}</span>
            <span className="tabular-nums">
              {beatDurationLabel(totalDuration)}
            </span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-muted/60">
            {breakdown.beats.map((beat, index) => {
              const ratio =
                Math.max(0, beat.durationSec) / Math.max(1, totalDuration)
              return (
                <div
                  key={beat.id}
                  title={`${beat.title} · ${beatDurationLabel(beat.durationSec)}`}
                  className={cn(
                    'h-full',
                    index % 2 === 0 ? 'bg-orange-400/85' : 'bg-orange-300/85',
                    index > 0 && 'border-l border-card/95',
                  )}
                  style={{ flex: `${ratio} 1 0%` }}
                />
              )
            })}
          </div>
        </section>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
        <div className="min-w-0 text-xs text-muted-foreground">
          {plannerLabel && (
            <p className="font-display font-medium text-foreground">
              {plannerLabel}
            </p>
          )}
          {plannerModelId && (
            <p className="truncate font-mono text-3xs">{plannerModelId}</p>
          )}
        </div>
        <Badge variant="outline" className="rounded-full">
          {copyRiskLabel}
        </Badge>
      </div>
    </>
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
    <header className="flex items-start gap-3 border-b border-border/60 px-4 py-3">
      <div
        className={cn(
          'flex size-9 items-center justify-center rounded-md',
          SCRIPT_ACCENT.iconPlate,
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-3xs font-medium uppercase tracking-nav text-muted-foreground">
          {typeLabel}
        </p>
        <h2 className="truncate font-display text-sm font-semibold text-foreground">
          {title}
        </h2>
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
    </header>
  )
}
