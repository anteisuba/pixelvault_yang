'use client'

import { useCallback, useState, type ChangeEvent } from 'react'
import {
  AlertCircle,
  Bot,
  ChevronDown,
  ChevronUp,
  Film,
  ImagePlus,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
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
  ShotDraft,
} from '@/types/script-breakdown'
import type { SeedancePromptTimelineItem } from '@/types/seedance-prompt-plan'
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

/**
 * Per-shot editor card. Reused by both storyBreakdown shots and
 * seedancePrompt timeline. Holds action/camera text, optional start/end
 * seconds, character multi-select chips, background single-select chips,
 * and a maxReferences number. The header carries up/down reorder + delete.
 *
 * Both modes feed the same shape (`ShotEditorShot`) and convert back via
 * the per-mode mutator handlers, so the binding UX feels identical.
 */
interface ShotEditorShot {
  action: string
  camera: string
  startSecond?: number
  endSecond?: number
  characterIds?: string[]
  backgroundIds?: string[]
  maxReferences?: number
}

function ShotEditorCard({
  index,
  total,
  shot,
  characters,
  scenes,
  onChange,
  onDelete,
  onMove,
}: {
  index: number
  total: number
  shot: ShotEditorShot
  characters: ReadonlyArray<{ id: string; label: string }>
  scenes: ReadonlyArray<{ id: string; label: string }>
  onChange: (next: ShotEditorShot) => void
  onDelete: () => void
  onMove: (direction: 'up' | 'down') => void
}) {
  const t = useTranslations('StudioNode.agent.shotEditor')
  const characterIds = shot.characterIds ?? []
  const backgroundIds = shot.backgroundIds ?? []

  const toggleCharacter = (id: string) => {
    const next = characterIds.includes(id)
      ? characterIds.filter((existing) => existing !== id)
      : [...characterIds, id]
    onChange({ ...shot, characterIds: next.length > 0 ? next : undefined })
  }
  const setBackground = (id: string | undefined) => {
    onChange({ ...shot, backgroundIds: id ? [id] : undefined })
  }
  const setNumberField = (
    field: 'startSecond' | 'endSecond' | 'maxReferences',
    rawValue: string,
  ) => {
    if (rawValue.trim() === '') {
      onChange({ ...shot, [field]: undefined })
      return
    }
    const parsed = Number(rawValue)
    if (!Number.isFinite(parsed)) return
    const clamped =
      field === 'maxReferences'
        ? Math.min(9, Math.max(0, Math.round(parsed)))
        : Math.min(600, Math.max(0, parsed))
    onChange({ ...shot, [field]: clamped })
  }

  const startInvalid =
    typeof shot.startSecond === 'number' &&
    typeof shot.endSecond === 'number' &&
    shot.endSecond < shot.startSecond

  return (
    <div className="space-y-2 rounded-2xl border border-node-panel-inner bg-node-panel-soft p-3">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
          {t('header', { n: index + 1 })}
        </p>
        <button
          type="button"
          onClick={() => onMove('up')}
          disabled={index === 0}
          aria-label={t('moveUp')}
          title={t('moveUp')}
          className="flex size-6 items-center justify-center rounded-full border border-node-panel-inner text-node-muted transition-colors hover:border-node-amber/40 hover:text-node-foreground disabled:opacity-30"
        >
          <ChevronUp className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onMove('down')}
          disabled={index === total - 1}
          aria-label={t('moveDown')}
          title={t('moveDown')}
          className="flex size-6 items-center justify-center rounded-full border border-node-panel-inner text-node-muted transition-colors hover:border-node-amber/40 hover:text-node-foreground disabled:opacity-30"
        >
          <ChevronDown className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={t('delete')}
          title={t('delete')}
          className="flex size-6 items-center justify-center rounded-full border border-node-danger/40 text-node-danger transition-colors hover:bg-node-danger/15"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      <IMEAwareTextarea
        value={shot.action}
        onValueChange={(next) => onChange({ ...shot, action: next })}
        aria-label={t('action')}
        placeholder={t('actionPlaceholder')}
        className="min-h-16 w-full resize-none rounded-xl border border-node-panel-inner bg-node-panel px-3 py-2 text-xs leading-5 text-node-foreground outline-none placeholder:text-node-subtle focus-visible:border-node-amber focus-visible:ring-2 focus-visible:ring-node-amber/30"
      />
      <IMEAwareInput
        value={shot.camera}
        onValueChange={(next) => onChange({ ...shot, camera: next })}
        aria-label={t('camera')}
        placeholder={t('cameraPlaceholder')}
        className="h-9 w-full rounded-xl border border-node-panel-inner bg-node-panel px-3 text-2xs leading-4 text-node-muted outline-none placeholder:text-node-subtle focus-visible:border-node-amber focus-visible:ring-2 focus-visible:ring-node-amber/20"
      />

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
          {t('startSec')}
          <input
            type="number"
            min={0}
            max={600}
            step={0.1}
            value={typeof shot.startSecond === 'number' ? shot.startSecond : ''}
            placeholder={t('startSecPlaceholder')}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setNumberField('startSecond', event.target.value)
            }
            className={cn(
              'h-9 w-full rounded-xl border bg-node-panel px-3 text-sm leading-5 text-node-foreground outline-none focus-visible:border-node-amber focus-visible:ring-2 focus-visible:ring-node-amber/20',
              startInvalid
                ? 'border-node-danger/60'
                : 'border-node-panel-inner',
            )}
          />
        </label>
        <label className="flex flex-col gap-1 text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
          {t('endSec')}
          <input
            type="number"
            min={0}
            max={600}
            step={0.1}
            value={typeof shot.endSecond === 'number' ? shot.endSecond : ''}
            placeholder={t('endSecPlaceholder')}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setNumberField('endSecond', event.target.value)
            }
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
          {t('rangeWarning')}
        </p>
      ) : null}

      {characters.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
            {t('characters')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {characters.map((character) => {
              const isSelected = characterIds.includes(character.id)
              return (
                <button
                  key={character.id}
                  type="button"
                  onClick={() => toggleCharacter(character.id)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-2xs font-semibold transition-colors',
                    isSelected
                      ? 'border-node-amber bg-node-amber text-node-canvas'
                      : 'border-node-panel-inner bg-node-panel text-node-muted hover:border-node-amber/40 hover:text-node-foreground',
                  )}
                >
                  {character.label}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {scenes.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
            {t('background')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[null, ...scenes].map((scene) => {
              const sceneId = scene?.id ?? null
              const isSelected = sceneId
                ? backgroundIds[0] === sceneId
                : backgroundIds.length === 0
              return (
                <button
                  key={sceneId ?? '__none__'}
                  type="button"
                  onClick={() => setBackground(sceneId ?? undefined)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-2xs font-semibold transition-colors',
                    isSelected
                      ? 'border-node-amber bg-node-amber text-node-canvas'
                      : 'border-node-panel-inner bg-node-panel text-node-muted hover:border-node-amber/40 hover:text-node-foreground',
                  )}
                >
                  {scene ? scene.label : t('backgroundNone')}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      <label className="flex flex-col gap-1 text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
        {t('maxRefs')}
        <input
          type="number"
          min={0}
          max={9}
          step={1}
          value={
            typeof shot.maxReferences === 'number' ? shot.maxReferences : ''
          }
          placeholder={t('maxRefsPlaceholder')}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setNumberField('maxReferences', event.target.value)
          }
          className="h-9 w-full rounded-xl border border-node-panel-inner bg-node-panel px-3 text-sm leading-5 text-node-foreground outline-none focus-visible:border-node-amber focus-visible:ring-2 focus-visible:ring-node-amber/20"
        />
      </label>
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
    spawnFullWorkflowFromAgent,
    updateNodeData,
  } = useNodeWorkflowActions()
  const breakdown = node.data.breakdown
  const seedancePromptPlan = node.data.seedancePromptPlan
  const agentMode = getAgentMode(node)

  // Character / scene choice lists for the per-shot binding chips.
  // Only populated when storyBreakdown has been run — in pure
  // seedancePrompt mode both are empty and ShotEditorCard hides the
  // corresponding sections, which is the right default.
  const shotCharacterChoices = (breakdown?.characters ?? []).map(
    (character) => ({
      id: character.id,
      label: character.nameSuggestion || character.label,
    }),
  )
  const shotSceneChoices = (breakdown?.scenes ?? []).map((scene) => ({
    id: scene.id,
    label: scene.label,
  }))
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

  // Replace the entire timeline array and dispatch the new plan back.
  // ShotEditorCard returns a fully-formed shot; the helpers below build
  // on this for add / delete / move.
  const replaceTimeline = useCallback(
    (nextTimeline: SeedancePromptTimelineItem[]) => {
      if (!seedancePromptPlan) return
      updateNodeData(node.id, {
        seedancePromptPlan: {
          ...seedancePromptPlan,
          timeline: nextTimeline,
        },
      })
    },
    [node.id, seedancePromptPlan, updateNodeData],
  )

  const handleTimelineShotChange = useCallback(
    (index: number, next: ShotEditorShot) => {
      if (!seedancePromptPlan) return
      const previous = seedancePromptPlan.timeline[index]
      if (!previous) return
      const merged: SeedancePromptTimelineItem = {
        ...previous,
        action: next.action,
        camera: next.camera,
        // Plan schema requires startSecond/endSecond; the editor allows
        // blanking them, so we fall back to the previous values rather
        // than push undefined into a required field.
        startSecond: next.startSecond ?? previous.startSecond,
        endSecond: next.endSecond ?? previous.endSecond,
        characterIds: next.characterIds,
        backgroundIds: next.backgroundIds,
        maxReferences: next.maxReferences,
      }
      replaceTimeline(
        seedancePromptPlan.timeline.map((item, i) =>
          i === index ? merged : item,
        ),
      )
    },
    [replaceTimeline, seedancePromptPlan],
  )

  const handleAddTimelineItem = useCallback(() => {
    if (!seedancePromptPlan) return
    const last = seedancePromptPlan.timeline.at(-1)
    const nextStart = last ? last.endSecond : 0
    replaceTimeline([
      ...seedancePromptPlan.timeline,
      {
        startSecond: nextStart,
        endSecond: nextStart + 4,
        // Schema min(1) requires non-empty; placeholders give the user
        // something to immediately overwrite.
        action: ' ',
        camera: ' ',
        characterIds: last?.characterIds,
        backgroundIds: last?.backgroundIds,
        maxReferences: last?.maxReferences,
      },
    ])
  }, [replaceTimeline, seedancePromptPlan])

  const handleDeleteTimelineItem = useCallback(
    (index: number) => {
      if (!seedancePromptPlan) return
      if (seedancePromptPlan.timeline.length <= 1) {
        toast.info(tToasts('timelineCannotDeleteLast'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }
      replaceTimeline(seedancePromptPlan.timeline.filter((_, i) => i !== index))
    },
    [replaceTimeline, seedancePromptPlan, tToasts],
  )

  const handleMoveTimelineItem = useCallback(
    (index: number, direction: 'up' | 'down') => {
      if (!seedancePromptPlan) return
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= seedancePromptPlan.timeline.length)
        return
      const next = [...seedancePromptPlan.timeline]
      const [moved] = next.splice(index, 1)
      next.splice(targetIndex, 0, moved)
      replaceTimeline(next)
    },
    [replaceTimeline, seedancePromptPlan],
  )

  // Story breakdown shots — same mutators against breakdown.shots
  const replaceShots = useCallback(
    (nextShots: ShotDraft[]) => {
      if (!breakdown) return
      updateNodeData(node.id, {
        breakdown: {
          ...breakdown,
          shots: nextShots,
        },
      })
    },
    [breakdown, node.id, updateNodeData],
  )

  const handleShotChange = useCallback(
    (index: number, next: ShotEditorShot) => {
      if (!breakdown) return
      const previous = breakdown.shots[index]
      if (!previous) return
      const merged: ShotDraft = {
        ...previous,
        promptSeed: next.action,
        camera: next.camera,
        startSecond: next.startSecond,
        endSecond: next.endSecond,
        characterIds: next.characterIds,
        backgroundIds: next.backgroundIds,
        maxReferences: next.maxReferences,
      }
      replaceShots(
        breakdown.shots.map((shot, i) => (i === index ? merged : shot)),
      )
    },
    [breakdown, replaceShots],
  )

  const handleAddShot = useCallback(() => {
    if (!breakdown) return
    const last = breakdown.shots.at(-1)
    const baseSceneId =
      last?.sceneId ?? breakdown.scenes[0]?.id ?? 'scene-default'
    const newId = `shot-${Date.now().toString(36)}`
    replaceShots([
      ...breakdown.shots,
      {
        id: newId,
        sceneId: baseSceneId,
        label: ' ',
        camera: ' ',
        composition: ' ',
        promptSeed: ' ',
        characterIds: last?.characterIds,
        backgroundIds: last?.backgroundIds,
        maxReferences: last?.maxReferences,
        startSecond: last?.endSecond,
        endSecond:
          typeof last?.endSecond === 'number' ? last.endSecond + 4 : undefined,
      },
    ])
  }, [breakdown, replaceShots])

  const handleDeleteShot = useCallback(
    (index: number) => {
      if (!breakdown) return
      replaceShots(breakdown.shots.filter((_, i) => i !== index))
    },
    [breakdown, replaceShots],
  )

  const handleMoveShot = useCallback(
    (index: number, direction: 'up' | 'down') => {
      if (!breakdown) return
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= breakdown.shots.length) return
      const next = [...breakdown.shots]
      const [moved] = next.splice(index, 1)
      next.splice(targetIndex, 0, moved)
      replaceShots(next)
    },
    [breakdown, replaceShots],
  )

  // 一键派生完整工作流 — spawn shotText + Seedance per shot, then a
  // videoMerge to stitch them. Characters/backgrounds get auto-connected
  // when matching nodes already exist on the canvas.
  const handleSpawnFullWorkflow = useCallback(() => {
    const result = spawnFullWorkflowFromAgent(node.id)
    if (result.refusal) {
      toast.info(tToasts(`spawnFullWorkflow.${result.refusal}`), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
      return
    }
    toast.success(
      tToasts('spawnFullWorkflowSuccess', { count: result.shotCount }),
      {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      },
    )
  }, [node.id, spawnFullWorkflowFromAgent, tToasts])

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

          {/* Shot list — feeds spawnFullWorkflow. The LLM doesn't emit
              characterIds/backgroundIds today, so the chips start blank
              and the user picks bindings here before spawning. */}
          <InspectorField
            label={t('breakdownShotsLabel')}
            statusDotClassName="bg-node-amber"
          >
            <div className="space-y-2">
              {breakdown.shots.map((shot, index) => (
                <ShotEditorCard
                  key={shot.id}
                  index={index}
                  total={breakdown.shots.length}
                  shot={{
                    action: shot.promptSeed,
                    camera: shot.camera,
                    startSecond: shot.startSecond,
                    endSecond: shot.endSecond,
                    characterIds: shot.characterIds,
                    backgroundIds: shot.backgroundIds,
                    maxReferences: shot.maxReferences,
                  }}
                  characters={shotCharacterChoices}
                  scenes={shotSceneChoices}
                  onChange={(next) => handleShotChange(index, next)}
                  onDelete={() => handleDeleteShot(index)}
                  onMove={(direction) => handleMoveShot(index, direction)}
                />
              ))}
              <Button
                type="button"
                onClick={handleAddShot}
                className="h-10 w-full rounded-2xl border border-dashed border-node-panel-inner bg-node-panel-soft text-xs font-semibold text-node-muted hover:border-node-amber/40 hover:bg-node-panel-inner hover:text-node-foreground"
              >
                <Plus className="mr-2 size-4" />
                {t('breakdownShotsAdd')}
              </Button>
            </div>
          </InspectorField>

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

          <Button
            type="button"
            onClick={handleSpawnFullWorkflow}
            disabled={breakdown.shots.length === 0}
            className="h-10 w-full rounded-2xl border border-node-amber/40 bg-node-amber text-node-canvas hover:bg-node-amber/90 disabled:bg-node-panel-inner disabled:text-node-subtle"
          >
            <Sparkles className="mr-2 size-4" />
            {t('spawnFullWorkflow', { count: breakdown.shots.length })}
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
            {seedancePromptPlan.timeline.map((item, index) => (
              <ShotEditorCard
                key={`timeline-${index}`}
                index={index}
                total={seedancePromptPlan.timeline.length}
                shot={{
                  action: item.action,
                  camera: item.camera,
                  startSecond: item.startSecond,
                  endSecond: item.endSecond,
                  characterIds: item.characterIds,
                  backgroundIds: item.backgroundIds,
                  maxReferences: item.maxReferences,
                }}
                characters={shotCharacterChoices}
                scenes={shotSceneChoices}
                onChange={(next) => handleTimelineShotChange(index, next)}
                onDelete={() => handleDeleteTimelineItem(index)}
                onMove={(direction) => handleMoveTimelineItem(index, direction)}
              />
            ))}
            <Button
              type="button"
              onClick={handleAddTimelineItem}
              className="h-10 w-full rounded-2xl border border-dashed border-node-panel-inner bg-node-panel-soft text-xs font-semibold text-node-muted hover:border-node-amber/40 hover:bg-node-panel-inner hover:text-node-foreground"
            >
              <Plus className="mr-2 size-4" />
              {t('seedance.timelineAdd')}
            </Button>
          </div>

          <Button
            type="button"
            onClick={handleSpawnFullWorkflow}
            className="h-10 w-full rounded-2xl border border-node-amber/40 bg-node-amber text-node-canvas hover:bg-node-amber/90"
          >
            <Sparkles className="mr-2 size-4" />
            {t('spawnFullWorkflow', {
              count: seedancePromptPlan.timeline.length,
            })}
          </Button>

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
