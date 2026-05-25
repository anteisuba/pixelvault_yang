'use client'

import { useCallback, type ChangeEvent } from 'react'
import { AlertCircle, Bot, ImagePlus, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { NODE_STUDIO_PLACEHOLDER_TOAST } from '@/constants/node-studio'
import { NODE_STATUS_IDS } from '@/constants/node-types'
import {
  SCRIPT_BREAKDOWN_SUMMARY_FIELDS,
  SCRIPT_PLANNER_PROVIDER_IDS,
} from '@/constants/script-breakdown'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import {
  CanvasPlannerRouteSelector,
  getPlannerKeyOptionId,
  type NodePlannerRouteSelection,
} from '../CanvasPlannerRouteSelector'
import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { InspectorField } from './InspectorField'

interface AgentInspectorProps {
  node: NodeWorkflowNode
}

export function AgentInspector({ node }: AgentInspectorProps) {
  const t = useTranslations('StudioNode.agent')
  const tToasts = useTranslations('StudioNode.toasts')
  const tInspector = useTranslations('StudioNode.inspector')
  const { spawnCharactersFromBreakdown, updateNodeData } =
    useNodeWorkflowActions()
  const breakdown = node.data.breakdown
  const isRunning = node.data.status === NODE_STATUS_IDS.running
  const isFailed =
    node.data.status === NODE_STATUS_IDS.failed &&
    Boolean(node.data.generationError)
  const plannerRoute: NodePlannerRouteSelection | null =
    node.data.plannerApiKeyId &&
    (node.data.plannerProvider === SCRIPT_PLANNER_PROVIDER_IDS.gemini ||
      node.data.plannerProvider === SCRIPT_PLANNER_PROVIDER_IDS.deepseek ||
      node.data.plannerProvider === SCRIPT_PLANNER_PROVIDER_IDS.openai)
      ? {
          optionId:
            node.data.plannerRouteOptionId ??
            getPlannerKeyOptionId(node.data.plannerApiKeyId),
          plannerProvider: node.data.plannerProvider,
          apiKeyId: node.data.plannerApiKeyId,
        }
      : null

  const handlePlannerRouteChange = useCallback(
    (selection: NodePlannerRouteSelection) => {
      updateNodeData(node.id, {
        plannerProvider: selection.plannerProvider,
        plannerApiKeyId: selection.apiKeyId,
        plannerRouteOptionId: selection.optionId,
      })
    },
    [node.id, updateNodeData],
  )

  const handleLoglineChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      if (!breakdown) {
        return
      }

      updateNodeData(node.id, {
        breakdown: {
          ...breakdown,
          logline: event.target.value,
        },
      })
    },
    [breakdown, node.id, updateNodeData],
  )

  const handleSpawnCharacters = useCallback(() => {
    if (!breakdown || breakdown.characters.length === 0) {
      toast.info(tToasts('charactersSpawnNoBreakdown'), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
      return
    }

    const result = spawnCharactersFromBreakdown(node.id)
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
  }, [breakdown, node.id, spawnCharactersFromBreakdown, tToasts])

  return (
    <div className="space-y-4">
      <InspectorField label={tInspector('plannerRoute')}>
        <CanvasPlannerRouteSelector
          value={plannerRoute}
          onChange={handlePlannerRouteChange}
          className="w-full"
        />
      </InspectorField>

      {isRunning ? (
        <div className="flex min-h-24 items-center gap-3 rounded-2xl border border-node-panel-inner bg-node-panel-soft p-4">
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
      ) : null}

      {isFailed ? (
        <div className="flex gap-2 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">{t('failedTitle')}</p>
            <p className="mt-1 text-xs leading-5 text-red-100/80">
              {node.data.generationError}
            </p>
          </div>
        </div>
      ) : null}

      {!breakdown ? (
        <div className="flex min-h-28 flex-col items-center justify-center gap-3 rounded-2xl border border-node-panel-inner bg-node-panel-soft px-4 text-center">
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
      ) : (
        <>
          <InspectorField label={t('logline')} statusDotClassName="bg-lime-300">
            <Textarea
              value={breakdown.logline}
              onChange={handleLoglineChange}
              className="min-h-24 resize-none rounded-2xl border-node-panel-inner bg-node-panel-soft text-sm leading-6 text-node-foreground shadow-none focus-visible:border-node-amber focus-visible:ring-node-amber/30"
            />
          </InspectorField>

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

          <Button
            type="button"
            onClick={handleSpawnCharacters}
            disabled={breakdown.characters.length === 0}
            className="h-10 w-full rounded-2xl border border-node-panel-inner bg-node-panel-soft text-sm font-semibold text-node-foreground hover:border-node-amber/40 hover:bg-node-panel-inner disabled:text-node-subtle"
          >
            <ImagePlus className="mr-2 size-4 text-rose-200" />
            {t('spawnCharacters', {
              count: breakdown.characters.length,
            })}
          </Button>
        </>
      )}
    </div>
  )
}
