'use client'

import { useCallback, useMemo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { AlertCircle, Bot, ImagePlus, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { NODE_STUDIO_PLACEHOLDER_TOAST } from '@/constants/node-studio'
import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import {
  SCRIPT_BREAKDOWN_SUMMARY_FIELDS,
  SCRIPT_PLANNER_PROVIDER_IDS,
} from '@/constants/script-breakdown'
import { Button } from '@/components/ui/button'
import type { NodeWorkflowNode } from '@/types/node-workflow'
import type { ScriptBreakdownResult } from '@/types/script-breakdown'
import { cn } from '@/lib/utils'

import {
  CanvasPlannerRouteSelector,
  getPlannerKeyOptionId,
  type NodePlannerRouteSelection,
} from '../CanvasPlannerRouteSelector'
import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { NodeShell } from './NodeShell'

function getCopyRiskClass(copyRisk: ScriptBreakdownResult['copyRisk']): string {
  if (copyRisk === 'high') {
    return 'border-red-400/40 bg-red-500/10 text-red-200'
  }

  if (copyRisk === 'medium') {
    return 'border-amber-400/40 bg-amber-500/10 text-amber-200'
  }

  return 'border-lime-400/40 bg-lime-500/10 text-lime-200'
}

export function AgentNode({ id, data, selected }: NodeProps<NodeWorkflowNode>) {
  const t = useTranslations('StudioNode.agent')
  const tToasts = useTranslations('StudioNode.toasts')
  const { spawnCharactersFromBreakdown, updateNodeData } =
    useNodeWorkflowActions()
  const breakdown = data.breakdown
  const isRunning = data.status === NODE_STATUS_IDS.running
  const isFailed =
    data.status === NODE_STATUS_IDS.failed && Boolean(data.generationError)
  const plannerLabel = data.plannerLabel ?? data.planner?.label
  const plannerRoute = useMemo<NodePlannerRouteSelection | null>(() => {
    if (
      !data.plannerApiKeyId ||
      (data.plannerProvider !== SCRIPT_PLANNER_PROVIDER_IDS.gemini &&
        data.plannerProvider !== SCRIPT_PLANNER_PROVIDER_IDS.deepseek &&
        data.plannerProvider !== SCRIPT_PLANNER_PROVIDER_IDS.openai)
    ) {
      return null
    }

    return {
      optionId:
        data.plannerRouteOptionId ??
        getPlannerKeyOptionId(data.plannerApiKeyId),
      plannerProvider: data.plannerProvider,
      apiKeyId: data.plannerApiKeyId,
    }
  }, [data.plannerApiKeyId, data.plannerProvider, data.plannerRouteOptionId])

  const handlePlannerRouteChange = useCallback(
    (selection: NodePlannerRouteSelection) => {
      updateNodeData(id, {
        plannerProvider: selection.plannerProvider,
        plannerApiKeyId: selection.apiKeyId,
        plannerRouteOptionId: selection.optionId,
      })
    },
    [id, updateNodeData],
  )

  const handleSpawnCharacters = useCallback(() => {
    if (!breakdown || breakdown.characters.length === 0) {
      toast.info(tToasts('charactersSpawnNoBreakdown'), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
      return
    }

    const result = spawnCharactersFromBreakdown(id)
    if (result.createdNodeIds.length === 0) {
      toast.info(tToasts('charactersAlreadySpawned'), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
      return
    }

    toast.success(
      tToasts('charactersSpawned', {
        count: result.createdNodeIds.length,
      }),
      {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      },
    )
  }, [breakdown, id, spawnCharactersFromBreakdown, tToasts])

  return (
    <NodeShell type={NODE_TYPE_IDS.agent} selected={selected}>
      <NodeShell.Header type={NODE_TYPE_IDS.agent} status={data.status} />
      <NodeShell.Body className="space-y-3">
        <CanvasPlannerRouteSelector
          value={plannerRoute}
          onChange={handlePlannerRouteChange}
          className="nodrag nopan nowheel w-full max-w-full"
        />

        {isRunning && (
          <div className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-2xl border border-node-panel-inner bg-node-panel-soft px-4 text-center">
            <Loader2 className="size-5 animate-spin text-lime-200" />
            <div>
              <p className="text-sm font-semibold text-node-foreground">
                {t('generatingTitle')}
              </p>
              <p className="mt-1 text-xs leading-5 text-node-muted">
                {t('generatingDescription')}
              </p>
            </div>
          </div>
        )}

        {!isRunning && isFailed && (
          <div className="flex gap-2 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold">{t('failedTitle')}</p>
              <p className="mt-1 line-clamp-3 text-xs leading-5 text-red-100/80">
                {data.generationError}
              </p>
            </div>
          </div>
        )}

        {!isRunning && !isFailed && !breakdown && (
          <div className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-2xl border border-node-panel-inner bg-node-panel-soft px-4 text-center">
            <Bot className="size-6 text-lime-200" />
            <div>
              <p className="text-sm font-semibold text-node-foreground">
                {t('emptyTitle')}
              </p>
              <p className="mt-1 text-xs leading-5 text-node-muted">
                {t('emptyDescription')}
              </p>
            </div>
          </div>
        )}

        {!isRunning && breakdown && (
          <>
            <div className="rounded-2xl border border-node-panel-inner bg-node-panel-soft p-3">
              <p className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
                {t('logline')}
              </p>
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-node-foreground">
                {breakdown.logline}
              </p>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {SCRIPT_BREAKDOWN_SUMMARY_FIELDS.map((field) => (
                <div
                  key={field}
                  className="rounded-2xl border border-node-panel-inner bg-node-panel-soft px-2 py-2 text-center"
                >
                  <p className="text-base font-semibold text-node-foreground">
                    {breakdown[field].length}
                  </p>
                  <p className="mt-0.5 truncate text-2xs text-node-muted">
                    {t(`counts.${field}`)}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {plannerLabel && (
                <span className="max-w-full truncate rounded-full border border-node-panel-inner bg-node-panel-soft px-2.5 py-1 text-2xs font-semibold text-node-muted">
                  {plannerLabel}
                </span>
              )}
              <span
                className={cn(
                  'rounded-full border px-2.5 py-1 text-2xs font-semibold',
                  getCopyRiskClass(breakdown.copyRisk),
                )}
              >
                {t('copyRisk', {
                  risk: t(`copyRiskLevels.${breakdown.copyRisk}`),
                })}
              </span>
            </div>

            <Button
              type="button"
              onClick={handleSpawnCharacters}
              disabled={breakdown.characters.length === 0}
              title={t('spawnCharactersTooltip')}
              className="nodrag nopan nowheel h-9 w-full rounded-2xl border border-node-panel-inner bg-node-panel-soft px-3 text-xs font-semibold text-node-foreground opacity-0 transition-opacity hover:border-node-amber/40 hover:bg-node-panel-inner group-hover:opacity-100 disabled:text-node-subtle disabled:opacity-60"
            >
              <ImagePlus className="mr-2 size-4 text-rose-200" />
              {t('spawnCharacters', {
                count: breakdown.characters.length,
              })}
            </Button>
          </>
        )}
      </NodeShell.Body>
    </NodeShell>
  )
}
