'use client'

import { useCallback, type ChangeEvent } from 'react'
import { AlertCircle, Bot, Film, ImagePlus, Loader2, Wand2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  NODE_STUDIO_AGENT_MODE_IDS,
  NODE_STUDIO_AGENT_MODES,
  NODE_STUDIO_PLACEHOLDER_TOAST,
} from '@/constants/node-studio'
import { NODE_STATUS_IDS } from '@/constants/node-types'
import {
  SCRIPT_BREAKDOWN_SUMMARY_FIELDS,
  SCRIPT_PLANNER_PROVIDER_IDS,
} from '@/constants/script-breakdown'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

import { IMEAwareTextarea } from './IMEAwareField'
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

type AgentMode = (typeof NODE_STUDIO_AGENT_MODES)[number]

function getAgentMode(node: NodeWorkflowNode): AgentMode {
  return node.data.agentMode === NODE_STUDIO_AGENT_MODE_IDS.seedancePrompt
    ? NODE_STUDIO_AGENT_MODE_IDS.seedancePrompt
    : NODE_STUDIO_AGENT_MODE_IDS.storyBreakdown
}

export function AgentInspector({ node }: AgentInspectorProps) {
  const t = useTranslations('StudioNode.agent')
  const tToasts = useTranslations('StudioNode.toasts')
  const tInspector = useTranslations('StudioNode.inspector')
  const {
    applySeedancePromptPlanToSeedance,
    spawnCharactersFromBreakdown,
    updateNodeData,
  } = useNodeWorkflowActions()
  const breakdown = node.data.breakdown
  const seedancePromptPlan = node.data.seedancePromptPlan
  const agentMode = getAgentMode(node)
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

  const handleModeChange = useCallback(
    (mode: AgentMode) => {
      const hasOutput =
        mode === NODE_STUDIO_AGENT_MODE_IDS.seedancePrompt
          ? Boolean(seedancePromptPlan)
          : Boolean(breakdown)

      updateNodeData(node.id, {
        agentMode: mode,
        generationError: undefined,
        status: hasOutput ? NODE_STATUS_IDS.done : NODE_STATUS_IDS.idle,
      })
    },
    [breakdown, node.id, seedancePromptPlan, updateNodeData],
  )

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

  const handleApplySeedancePlan = useCallback(() => {
    const result = applySeedancePromptPlanToSeedance(node.id)
    if (result.appliedNodeId) {
      toast.success(tToasts('seedancePromptApplied'), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
      return
    }

    const reason = result.reason ?? 'missingSeedanceTarget'
    toast.info(tToasts(`seedancePromptApply.${reason}`), {
      duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
      position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
    })
  }, [applySeedancePromptPlanToSeedance, node.id, tToasts])

  const handleLoglineChange = useCallback(
    (next: string) => {
      if (!breakdown) {
        return
      }

      updateNodeData(node.id, {
        breakdown: {
          ...breakdown,
          logline: next,
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
      <InspectorField label={t('modeLabel')}>
        <div className="grid grid-cols-2 gap-2">
          {NODE_STUDIO_AGENT_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => handleModeChange(mode)}
              className={
                mode === agentMode
                  ? 'rounded-xl border border-node-amber/50 bg-node-amber/15 px-3 py-2 text-left text-xs font-semibold text-node-foreground'
                  : 'rounded-xl border border-node-panel-inner bg-node-panel-soft px-3 py-2 text-left text-xs font-semibold text-node-muted transition-colors hover:border-node-amber/30 hover:text-node-foreground'
              }
            >
              <span className="block">{t(`modes.${mode}.label`)}</span>
              <span className="mt-1 block text-2xs font-normal leading-4 text-node-muted">
                {t(`modes.${mode}.description`)}
              </span>
            </button>
          ))}
        </div>
      </InspectorField>

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
              {agentMode === NODE_STUDIO_AGENT_MODE_IDS.seedancePrompt
                ? t('seedance.generatingTitle')
                : t('generatingTitle')}
            </p>
            <p className="mt-1 text-xs leading-5 text-node-muted">
              {agentMode === NODE_STUDIO_AGENT_MODE_IDS.seedancePrompt
                ? t('seedance.generatingDescription')
                : t('generatingDescription')}
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

      {agentMode === NODE_STUDIO_AGENT_MODE_IDS.storyBreakdown && !breakdown ? (
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
      ) : null}

      {agentMode === NODE_STUDIO_AGENT_MODE_IDS.storyBreakdown && breakdown ? (
        <>
          <InspectorField label={t('logline')} statusDotClassName="bg-lime-300">
            <IMEAwareTextarea
              value={breakdown.logline}
              onValueChange={handleLoglineChange}
              className="min-h-24 w-full resize-none rounded-2xl border border-node-panel-inner bg-node-panel-soft px-3 py-2 text-sm leading-6 text-node-foreground shadow-none outline-none focus-visible:border-node-amber focus-visible:ring-2 focus-visible:ring-node-amber/30"
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
      ) : null}

      {agentMode === NODE_STUDIO_AGENT_MODE_IDS.seedancePrompt &&
      !seedancePromptPlan ? (
        <div className="flex min-h-28 flex-col items-center justify-center gap-3 rounded-2xl border border-node-panel-inner bg-node-panel-soft px-4 text-center">
          <Film className="size-6 text-node-amber" />
          <div>
            <p className="text-sm font-semibold text-node-foreground">
              {t('seedance.emptyTitle')}
            </p>
            <p className="mt-1 text-xs leading-5 text-node-muted">
              {t('seedance.emptyDescription')}
            </p>
          </div>
        </div>
      ) : null}

      {agentMode === NODE_STUDIO_AGENT_MODE_IDS.seedancePrompt &&
      seedancePromptPlan ? (
        <>
          <div className="rounded-2xl border border-node-panel-inner bg-node-panel-soft p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-node-foreground">
                  {seedancePromptPlan.title}
                </p>
                <p className="mt-1 text-xs leading-5 text-node-muted">
                  {seedancePromptPlan.visualDescription}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-node-panel-inner bg-node-panel px-2 py-1 text-2xs font-semibold text-node-muted">
                {t('copyRisk', {
                  risk: t(`copyRiskLevels.${seedancePromptPlan.copyRisk}`),
                })}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-node-panel-inner bg-node-panel-soft px-3 py-2">
              <p className="text-2xs text-node-muted">
                {t('seedance.duration')}
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-node-foreground">
                {seedancePromptPlan.duration}
              </p>
            </div>
            <div className="rounded-2xl border border-node-panel-inner bg-node-panel-soft px-3 py-2">
              <p className="text-2xs text-node-muted">
                {t('seedance.timeline')}
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-node-foreground">
                {t('seedance.timelineCount', {
                  count: seedancePromptPlan.timeline.length,
                })}
              </p>
            </div>
          </div>

          <InspectorField
            label={t('seedance.finalPrompt')}
            statusDotClassName="bg-node-amber"
          >
            <Textarea
              readOnly
              value={seedancePromptPlan.finalPrompt}
              className="min-h-32 resize-none rounded-2xl border-node-panel-inner bg-node-panel-soft text-sm leading-6 text-node-foreground shadow-none focus-visible:border-node-amber focus-visible:ring-node-amber/30"
            />
          </InspectorField>

          <div className="space-y-2">
            {seedancePromptPlan.timeline.map((item) => (
              <div
                key={`${item.startSecond}-${item.endSecond}-${item.action}`}
                className="rounded-2xl border border-node-panel-inner bg-node-panel-soft p-3"
              >
                <p className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
                  {t('seedance.timelineRange', {
                    start: item.startSecond,
                    end: item.endSecond,
                  })}
                </p>
                <p className="mt-1 text-xs leading-5 text-node-foreground">
                  {item.action}
                </p>
                <p className="mt-1 text-2xs leading-4 text-node-muted">
                  {item.camera}
                </p>
              </div>
            ))}
          </div>

          <Button
            type="button"
            onClick={handleApplySeedancePlan}
            className="h-10 w-full rounded-2xl border border-node-amber/40 bg-node-amber text-node-canvas hover:bg-node-amber/90"
          >
            <Wand2 className="mr-2 size-4" />
            {t('seedance.applyToVideo')}
          </Button>
        </>
      ) : null}
    </div>
  )
}
