'use client'

import { useCallback, useState, type ChangeEvent } from 'react'
import {
  AlertCircle,
  Bot,
  ChevronDown,
  Film,
  ImagePlus,
  Loader2,
  Wand2,
} from 'lucide-react'
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

import { IMEAwareInput, IMEAwareTextarea } from './IMEAwareField'
import { cn } from '@/lib/utils'
import type {
  CharacterDraft,
  SceneDraft,
  ScriptBreakdownResult,
} from '@/types/script-breakdown'
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

/**
 * Node-themed collapsible row used to fold the per-character / per-scene
 * editors. Keeps the inspector scroll-height reasonable when a breakdown
 * spawns 5+ entries while still letting users edit any field in place.
 */
function NodeCollapsible({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string
  summary?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  return (
    <div className="rounded-2xl border border-node-panel-inner bg-node-panel-soft">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-node-foreground">
            {title}
          </p>
          {summary ? (
            <p className="mt-0.5 truncate text-2xs leading-4 text-node-muted">
              {summary}
            </p>
          ) : null}
        </div>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-node-muted transition-transform duration-200',
            isOpen && 'rotate-180',
          )}
        />
      </button>
      {isOpen ? (
        <div className="space-y-3 border-t border-node-panel-inner px-3 py-3">
          {children}
        </div>
      ) : null}
    </div>
  )
}

const CHARACTER_EDITABLE_FIELDS = [
  'nameSuggestion',
  'role',
  'functionInStory',
  'personality',
  'visualSeed',
  'goal',
] as const satisfies readonly Exclude<keyof CharacterDraft, 'id' | 'label'>[]

const SCENE_EDITABLE_FIELDS = [
  'label',
  'summary',
  'location',
  'timeOfDay',
  'mood',
] as const satisfies readonly Exclude<keyof SceneDraft, 'id'>[]

type BreakdownTopField = 'title' | 'logline' | 'referenceIntent'
const BREAKDOWN_TOP_FIELDS = [
  'title',
  'logline',
  'referenceIntent',
] as const satisfies readonly BreakdownTopField[]

function isMultilineBreakdownField(field: BreakdownTopField): boolean {
  return field !== 'title'
}

function getBreakdownFieldValue(
  breakdown: ScriptBreakdownResult,
  field: BreakdownTopField,
): string {
  return breakdown[field]
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

  // Top-level breakdown text fields (title / logline / referenceIntent).
  // The BREAKDOWN_TOP_FIELDS loop dispatches every field through this single
  // handler.
  const handleBreakdownFieldChange = useCallback(
    (field: BreakdownTopField, next: string) => {
      if (!breakdown) return
      updateNodeData(node.id, {
        breakdown: {
          ...breakdown,
          [field]: next,
        },
      })
    },
    [breakdown, node.id, updateNodeData],
  )

  // characters[i] / scenes[i] field edit — keeps id stable, replaces the
  // chosen draft, dispatches the whole breakdown back to node.data so
  // spawnCharactersFromBreakdown picks up the user's edits.
  const handleCharacterFieldChange = useCallback(
    (index: number, field: keyof CharacterDraft, next: string) => {
      if (!breakdown) return
      const nextCharacters = breakdown.characters.map((character, i) =>
        i === index ? { ...character, [field]: next } : character,
      )
      updateNodeData(node.id, {
        breakdown: {
          ...breakdown,
          characters: nextCharacters,
        },
      })
    },
    [breakdown, node.id, updateNodeData],
  )

  const handleSceneFieldChange = useCallback(
    (index: number, field: keyof SceneDraft, next: string) => {
      if (!breakdown) return
      const nextScenes = breakdown.scenes.map((scene, i) =>
        i === index ? { ...scene, [field]: next } : scene,
      )
      updateNodeData(node.id, {
        breakdown: {
          ...breakdown,
          scenes: nextScenes,
        },
      })
    },
    [breakdown, node.id, updateNodeData],
  )

  // Seedance plan editing: title / visualDescription / finalPrompt / timeline.
  // We dispatch the whole plan back to the node on every change so the
  // downstream `applySeedancePromptPlanToSeedance` action sees the user's
  // edits, not the original LLM output. Empty strings are kept verbatim —
  // Zod min(1) will reject them at the apply step, surfacing a clear toast.
  const handleSeedancePlanFieldChange = useCallback(
    (field: 'title' | 'visualDescription' | 'finalPrompt', next: string) => {
      if (!seedancePromptPlan) return
      updateNodeData(node.id, {
        seedancePromptPlan: {
          ...seedancePromptPlan,
          [field]: next,
        },
      })
    },
    [node.id, seedancePromptPlan, updateNodeData],
  )

  const handleTimelineFieldChange = useCallback(
    (index: number, field: 'action' | 'camera', next: string) => {
      if (!seedancePromptPlan) return
      const nextTimeline = seedancePromptPlan.timeline.map((item, i) =>
        i === index ? { ...item, [field]: next } : item,
      )
      updateNodeData(node.id, {
        seedancePromptPlan: {
          ...seedancePromptPlan,
          timeline: nextTimeline,
        },
      })
    },
    [node.id, seedancePromptPlan, updateNodeData],
  )

  // Timeline timestamp edit — clamp to schema bounds (0..600). We let the
  // raw input through during typing; the clamp happens on dispatch so users
  // can backspace through values without snapping back.
  const handleTimelineSecondsChange = useCallback(
    (index: number, field: 'startSecond' | 'endSecond', rawValue: string) => {
      if (!seedancePromptPlan) return
      const parsed = Number(rawValue)
      const clamped = Number.isFinite(parsed)
        ? Math.min(600, Math.max(0, parsed))
        : 0
      const nextTimeline = seedancePromptPlan.timeline.map((item, i) =>
        i === index ? { ...item, [field]: clamped } : item,
      )
      updateNodeData(node.id, {
        seedancePromptPlan: {
          ...seedancePromptPlan,
          timeline: nextTimeline,
        },
      })
    },
    [node.id, seedancePromptPlan, updateNodeData],
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
          {BREAKDOWN_TOP_FIELDS.map((field) => (
            <InspectorField
              key={field}
              label={t(`breakdownFields.${field}.label`)}
              statusDotClassName="bg-lime-300"
            >
              {isMultilineBreakdownField(field) ? (
                <IMEAwareTextarea
                  value={getBreakdownFieldValue(breakdown, field)}
                  onValueChange={(next) =>
                    handleBreakdownFieldChange(field, next)
                  }
                  aria-label={t(`breakdownFields.${field}.label`)}
                  placeholder={t(`breakdownFields.${field}.placeholder`)}
                  className="min-h-20 w-full resize-none rounded-2xl border border-node-panel-inner bg-node-panel-soft px-3 py-2 text-sm leading-6 text-node-foreground shadow-none outline-none placeholder:text-node-subtle focus-visible:border-node-amber focus-visible:ring-2 focus-visible:ring-node-amber/30"
                />
              ) : (
                <IMEAwareInput
                  value={getBreakdownFieldValue(breakdown, field)}
                  onValueChange={(next) =>
                    handleBreakdownFieldChange(field, next)
                  }
                  aria-label={t(`breakdownFields.${field}.label`)}
                  placeholder={t(`breakdownFields.${field}.placeholder`)}
                  className="h-10 w-full rounded-xl border border-node-panel-inner bg-node-panel-soft px-3 text-sm leading-6 text-node-foreground outline-none placeholder:text-node-subtle focus-visible:border-node-amber focus-visible:ring-2 focus-visible:ring-node-amber/20"
                />
              )}
            </InspectorField>
          ))}

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

          {breakdown.characters.length > 0 ? (
            <InspectorField
              label={t('breakdownCharactersLabel')}
              statusDotClassName="bg-rose-300"
            >
              <div className="space-y-2">
                {breakdown.characters.map((character, index) => (
                  <NodeCollapsible
                    key={character.id}
                    title={character.nameSuggestion || character.label}
                    summary={character.role}
                  >
                    {CHARACTER_EDITABLE_FIELDS.map((field) => (
                      <InspectorField
                        key={field}
                        label={t(`characterFields.${field}.label`)}
                      >
                        <IMEAwareTextarea
                          value={character[field]}
                          onValueChange={(next) =>
                            handleCharacterFieldChange(index, field, next)
                          }
                          aria-label={t(`characterFields.${field}.label`)}
                          placeholder={t(
                            `characterFields.${field}.placeholder`,
                          )}
                          className="min-h-16 w-full resize-none rounded-xl border border-node-panel-inner bg-node-panel px-3 py-2 text-xs leading-5 text-node-foreground outline-none placeholder:text-node-subtle focus-visible:border-node-amber focus-visible:ring-2 focus-visible:ring-node-amber/30"
                        />
                      </InspectorField>
                    ))}
                  </NodeCollapsible>
                ))}
              </div>
            </InspectorField>
          ) : null}

          {breakdown.scenes.length > 0 ? (
            <InspectorField
              label={t('breakdownScenesLabel')}
              statusDotClassName="bg-sky-300"
            >
              <div className="space-y-2">
                {breakdown.scenes.map((scene, index) => (
                  <NodeCollapsible
                    key={scene.id}
                    title={scene.label}
                    summary={scene.summary}
                  >
                    {SCENE_EDITABLE_FIELDS.map((field) => (
                      <InspectorField
                        key={field}
                        label={t(`sceneFields.${field}.label`)}
                      >
                        <IMEAwareTextarea
                          value={scene[field]}
                          onValueChange={(next) =>
                            handleSceneFieldChange(index, field, next)
                          }
                          aria-label={t(`sceneFields.${field}.label`)}
                          placeholder={t(`sceneFields.${field}.placeholder`)}
                          className="min-h-16 w-full resize-none rounded-xl border border-node-panel-inner bg-node-panel px-3 py-2 text-xs leading-5 text-node-foreground outline-none placeholder:text-node-subtle focus-visible:border-node-amber focus-visible:ring-2 focus-visible:ring-node-amber/30"
                        />
                      </InspectorField>
                    ))}
                  </NodeCollapsible>
                ))}
              </div>
            </InspectorField>
          ) : null}

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
          <div className="space-y-3 rounded-2xl border border-node-panel-inner bg-node-panel-soft p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
                {t('seedance.headerLabel')}
              </p>
              <span className="shrink-0 rounded-full border border-node-panel-inner bg-node-panel px-2 py-1 text-2xs font-semibold text-node-muted">
                {t('copyRisk', {
                  risk: t(`copyRiskLevels.${seedancePromptPlan.copyRisk}`),
                })}
              </span>
            </div>
            <InspectorField
              label={t('seedance.titleLabel')}
              statusDotClassName="bg-node-amber"
            >
              <IMEAwareInput
                value={seedancePromptPlan.title}
                onValueChange={(next) =>
                  handleSeedancePlanFieldChange('title', next)
                }
                aria-label={t('seedance.titleLabel')}
                placeholder={t('seedance.titlePlaceholder')}
                className="h-10 w-full rounded-xl border border-node-panel-inner bg-node-panel px-3 text-sm leading-6 text-node-foreground outline-none placeholder:text-node-subtle focus-visible:border-node-amber focus-visible:ring-2 focus-visible:ring-node-amber/20"
              />
            </InspectorField>
            <InspectorField
              label={t('seedance.visualDescriptionLabel')}
              statusDotClassName="bg-node-amber"
            >
              <IMEAwareTextarea
                value={seedancePromptPlan.visualDescription}
                onValueChange={(next) =>
                  handleSeedancePlanFieldChange('visualDescription', next)
                }
                aria-label={t('seedance.visualDescriptionLabel')}
                placeholder={t('seedance.visualDescriptionPlaceholder')}
                className="min-h-20 w-full resize-none rounded-xl border border-node-panel-inner bg-node-panel px-3 py-2 text-sm leading-6 text-node-foreground outline-none placeholder:text-node-subtle focus-visible:border-node-amber focus-visible:ring-2 focus-visible:ring-node-amber/30"
              />
            </InspectorField>
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
            <IMEAwareTextarea
              value={seedancePromptPlan.finalPrompt}
              onValueChange={(next) =>
                handleSeedancePlanFieldChange('finalPrompt', next)
              }
              aria-label={t('seedance.finalPrompt')}
              placeholder={t('seedance.finalPromptPlaceholder')}
              className="min-h-32 w-full resize-none rounded-2xl border border-node-panel-inner bg-node-panel-soft px-3 py-2 text-sm leading-6 text-node-foreground outline-none placeholder:text-node-subtle focus-visible:border-node-amber focus-visible:ring-2 focus-visible:ring-node-amber/30"
            />
          </InspectorField>

          <div className="space-y-2">
            {seedancePromptPlan.timeline.map((item, index) => {
              const startInvalid =
                Number.isFinite(item.startSecond) &&
                Number.isFinite(item.endSecond) &&
                item.endSecond < item.startSecond
              return (
                <div
                  key={`timeline-${index}`}
                  className="space-y-2 rounded-2xl border border-node-panel-inner bg-node-panel-soft p-3"
                >
                  <p className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
                    {t('seedance.timelineLabel', { n: index + 1 })}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1 text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
                      {t('seedance.timelineStartLabel')}
                      <input
                        type="number"
                        min={0}
                        max={600}
                        step={1}
                        value={item.startSecond}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          handleTimelineSecondsChange(
                            index,
                            'startSecond',
                            event.target.value,
                          )
                        }
                        aria-label={t('seedance.timelineStartLabelA11y', {
                          n: index + 1,
                        })}
                        className={cn(
                          'h-9 w-full rounded-xl border bg-node-panel px-3 text-sm leading-5 text-node-foreground outline-none focus-visible:border-node-amber focus-visible:ring-2 focus-visible:ring-node-amber/20',
                          startInvalid
                            ? 'border-node-danger/60'
                            : 'border-node-panel-inner',
                        )}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
                      {t('seedance.timelineEndLabel')}
                      <input
                        type="number"
                        min={0}
                        max={600}
                        step={1}
                        value={item.endSecond}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          handleTimelineSecondsChange(
                            index,
                            'endSecond',
                            event.target.value,
                          )
                        }
                        aria-label={t('seedance.timelineEndLabelA11y', {
                          n: index + 1,
                        })}
                        className={cn(
                          'h-9 w-full rounded-xl border bg-node-panel px-3 text-sm leading-5 text-node-foreground outline-none focus-visible:border-node-amber focus-visible:ring-2 focus-visible:ring-node-amber/20',
                          startInvalid
                            ? 'border-node-danger/60'
                            : 'border-node-panel-inner',
                        )}
                      />
                    </label>
                  </div>
                  {startInvalid ? (
                    <p className="text-2xs leading-4 text-node-danger">
                      {t('seedance.timelineRangeWarning')}
                    </p>
                  ) : null}
                  <IMEAwareTextarea
                    value={item.action}
                    onValueChange={(next) =>
                      handleTimelineFieldChange(index, 'action', next)
                    }
                    aria-label={t('seedance.timelineActionLabel', {
                      n: index + 1,
                    })}
                    placeholder={t('seedance.timelineActionPlaceholder')}
                    className="min-h-16 w-full resize-none rounded-xl border border-node-panel-inner bg-node-panel px-3 py-2 text-xs leading-5 text-node-foreground outline-none placeholder:text-node-subtle focus-visible:border-node-amber focus-visible:ring-2 focus-visible:ring-node-amber/30"
                  />
                  <IMEAwareInput
                    value={item.camera}
                    onValueChange={(next) =>
                      handleTimelineFieldChange(index, 'camera', next)
                    }
                    aria-label={t('seedance.timelineCameraLabel', {
                      n: index + 1,
                    })}
                    placeholder={t('seedance.timelineCameraPlaceholder')}
                    className="h-9 w-full rounded-xl border border-node-panel-inner bg-node-panel px-3 text-2xs leading-4 text-node-muted outline-none placeholder:text-node-subtle focus-visible:border-node-amber focus-visible:ring-2 focus-visible:ring-node-amber/20"
                  />
                </div>
              )
            })}
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
