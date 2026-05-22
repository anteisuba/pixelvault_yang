'use client'

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { FileText, KeyRound, Save, Sparkles } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { toast } from 'sonner'

import {
  SCRIPT_BREAKDOWN_LIMITS,
  SCRIPT_PLANNER_MODELS,
  SCRIPT_PLANNER_PROVIDERS,
} from '@/constants/script-breakdown'
import {
  getAvailableAudioModels,
  getAvailableImageModels,
  getAvailableVideoModels,
  type ModelOption,
} from '@/constants/models'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import { DEFAULT_LOCALE, isAppLocale } from '@/i18n/routing'
import type {
  NodeWorkflowNode,
  NodeWorkflowNodeType,
  ScriptBreakdownResult,
} from '@/types'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useNodeWorkflow } from '@/hooks/use-node-workflow'
import { useScriptBreakdown } from '@/hooks/use-script-breakdown'
import { ApiKeyDrawerTrigger } from '@/components/business/ApiKeyDrawerTrigger'
import { ApiKeyManager } from '@/components/business/ApiKeyManager'
import type { StudioModelOption } from '@/components/business/ModelSelector'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  buildSavedModelOptions,
  mergeModelOptionsWithPreferredSavedRoutes,
} from '@/lib/model-options'

import { CanvasAddMenu } from './CanvasAddMenu'
import {
  NodeWorkflowActionsProvider,
  type NodeWorkflowActions,
} from './NodeWorkflowActionsContext'
import { PlaceholderNode } from './nodes/PlaceholderNode'
import { ScriptNode } from './nodes/ScriptNode'

interface AddMenuState {
  open: boolean
  screenX: number
  screenY: number
  flowX: number
  flowY: number
}

const NODE_TYPES: NodeTypes = {
  script: ScriptNode,
  text: PlaceholderNode,
  image: PlaceholderNode,
  video: PlaceholderNode,
  audio: PlaceholderNode,
}

const DEFAULT_ADD_MENU: AddMenuState = {
  open: false,
  screenX: 360,
  screenY: 260,
  flowX: 360,
  flowY: 260,
}

function createWorkspaceModelOptions(
  models: ModelOption[],
): StudioModelOption[] {
  return models.map((model) => ({
    optionId: `workspace:${model.id}`,
    modelId: model.id,
    adapterType: model.adapterType,
    providerConfig: model.providerConfig,
    requestCount: model.cost,
    isBuiltIn: true,
    freeTier: model.freeTier,
    sourceType: 'workspace',
  }))
}

function createPlannerModelOptions(): StudioModelOption[] {
  return [
    {
      optionId: `workspace:${SCRIPT_PLANNER_MODELS[AI_ADAPTER_TYPES.GEMINI]}`,
      modelId: SCRIPT_PLANNER_MODELS[AI_ADAPTER_TYPES.GEMINI],
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.GEMINI),
      requestCount: 1,
      isBuiltIn: false,
      sourceType: 'workspace',
    },
    {
      optionId: `workspace:${SCRIPT_PLANNER_MODELS[AI_ADAPTER_TYPES.OPENAI]}`,
      modelId: SCRIPT_PLANNER_MODELS[AI_ADAPTER_TYPES.OPENAI],
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.OPENAI),
      requestCount: 1,
      isBuiltIn: false,
      sourceType: 'workspace',
    },
  ]
}

function useWorkflowModelOptions(): Record<
  NodeWorkflowNodeType,
  StudioModelOption[]
> {
  const { keys, healthMap } = useApiKeysContext()
  const activeKeys = useMemo(() => keys.filter((key) => key.isActive), [keys])

  const plannerOptions = useMemo(() => {
    const workspaceOptions = createPlannerModelOptions()
    const savedOptions: StudioModelOption[] = activeKeys
      .filter(
        (key) =>
          key.adapterType === AI_ADAPTER_TYPES.GEMINI ||
          key.adapterType === AI_ADAPTER_TYPES.OPENAI,
      )
      .map((key) => ({
        optionId: `key:${key.id}`,
        modelId:
          key.adapterType === AI_ADAPTER_TYPES.GEMINI
            ? SCRIPT_PLANNER_MODELS[AI_ADAPTER_TYPES.GEMINI]
            : SCRIPT_PLANNER_MODELS[AI_ADAPTER_TYPES.OPENAI],
        adapterType: key.adapterType,
        providerConfig: key.providerConfig,
        requestCount: 1,
        isBuiltIn: false,
        sourceType: 'saved',
        keyId: key.id,
        keyLabel: key.label,
        maskedKey: key.maskedKey,
      }))

    return mergeModelOptionsWithPreferredSavedRoutes(
      savedOptions,
      workspaceOptions,
      healthMap,
    )
  }, [activeKeys, healthMap])

  const imageOptions = useMemo(() => {
    const models = getAvailableImageModels()
    const workspaceOptions = createWorkspaceModelOptions(models)
    const savedOptions = buildSavedModelOptions(activeKeys, (key) =>
      models.some(
        (model) =>
          model.id === key.modelId && model.adapterType === key.adapterType,
      ),
    )
    return mergeModelOptionsWithPreferredSavedRoutes(
      savedOptions,
      workspaceOptions,
      healthMap,
    )
  }, [activeKeys, healthMap])

  const videoOptions = useMemo(() => {
    const models = getAvailableVideoModels()
    const workspaceOptions = createWorkspaceModelOptions(models)
    const savedOptions = buildSavedModelOptions(activeKeys, (key) =>
      models.some((model) => model.id === key.modelId),
    )
    return mergeModelOptionsWithPreferredSavedRoutes(
      savedOptions,
      workspaceOptions,
      healthMap,
    )
  }, [activeKeys, healthMap])

  const audioOptions = useMemo(() => {
    const models = getAvailableAudioModels()
    const workspaceOptions = createWorkspaceModelOptions(models)
    const savedOptions = buildSavedModelOptions(activeKeys, (key) =>
      models.some((model) => model.id === key.modelId),
    )
    return mergeModelOptionsWithPreferredSavedRoutes(
      savedOptions,
      workspaceOptions,
      healthMap,
    )
  }, [activeKeys, healthMap])

  return useMemo(
    () => ({
      script: plannerOptions,
      text: plannerOptions,
      image: imageOptions,
      video: videoOptions,
      audio: audioOptions,
    }),
    [plannerOptions, imageOptions, videoOptions, audioOptions],
  )
}

export function StudioNodeWorkbench() {
  return (
    <ReactFlowProvider>
      <StudioNodeWorkbenchInner />
    </ReactFlowProvider>
  )
}

function StudioNodeWorkbenchInner() {
  const t = useTranslations('StudioNode')
  const localeCandidate = useLocale()
  const locale = isAppLocale(localeCandidate) ? localeCandidate : DEFAULT_LOCALE
  const { isLoading, error, generate } = useScriptBreakdown()
  const {
    nodes,
    edges,
    editorNodeId,
    addNode,
    openNodeEditor,
    closeNodeEditor,
    updateNodeData,
    updateNodeModel,
    updateScriptBreakdown,
    onNodesChange,
    onEdgesChange,
    onConnect,
  } = useNodeWorkflow()
  const modelOptionsByType = useWorkflowModelOptions()
  const { screenToFlowPosition } = useReactFlow()
  const mainRef = useRef<HTMLDivElement>(null)
  const [addMenu, setAddMenu] = useState<AddMenuState>(DEFAULT_ADD_MENU)

  const editorNode = nodes.find((node) => node.id === editorNodeId)
  const editorBreakdown = editorNode?.data.breakdown

  const generateScript = useCallback(
    async (node: NodeWorkflowNode) => {
      const idea = node.data.prompt.trim()
      if (!idea || isLoading) return
      const plannerProvider =
        node.data.model?.adapterType === AI_ADAPTER_TYPES.GEMINI ||
        node.data.model?.adapterType === AI_ADAPTER_TYPES.OPENAI
          ? node.data.model.adapterType
          : SCRIPT_PLANNER_PROVIDERS.AUTO

      const nextResult = await generate({
        idea,
        plannerProvider,
        locale,
        ...(node.data.model?.apiKeyId
          ? { apiKeyId: node.data.model.apiKeyId }
          : {}),
      })

      if (!nextResult) {
        toast.error(error ?? t('errorFallback'))
        return
      }

      updateScriptBreakdown(node.id, nextResult.breakdown, {
        label: nextResult.planner.label,
        modelId: nextResult.planner.modelId,
      })
      openNodeEditor(node.id)
      toast.success(t('toasts.generated'))
    },
    [
      isLoading,
      generate,
      locale,
      error,
      t,
      updateScriptBreakdown,
      openNodeEditor,
    ],
  )

  const actions = useMemo<NodeWorkflowActions>(
    () => ({
      modelOptionsByType,
      isLoading,
      updateNodeData,
      updateNodeModel,
      openNodeEditor,
      generateScript,
    }),
    [
      modelOptionsByType,
      isLoading,
      updateNodeData,
      updateNodeModel,
      openNodeEditor,
      generateScript,
    ],
  )

  const openAddMenuAtEvent = useCallback(
    (event: ReactMouseEvent | MouseEvent) => {
      event.preventDefault()
      const rect = mainRef.current?.getBoundingClientRect()
      const screenX = rect ? event.clientX - rect.left : event.clientX
      const screenY = rect ? event.clientY - rect.top : event.clientY
      const flowPos = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      setAddMenu({
        open: true,
        screenX,
        screenY,
        flowX: flowPos.x,
        flowY: flowPos.y,
      })
    },
    [screenToFlowPosition],
  )

  const closeAddMenu = useCallback(() => {
    setAddMenu((current) => ({ ...current, open: false }))
  }, [])

  const openToolbarAddMenu = useCallback(() => {
    const rect = mainRef.current?.getBoundingClientRect()
    const centerScreenX = rect ? rect.width / 2 : 360
    const centerScreenY = rect ? rect.height / 2 : 300
    const flowPos = screenToFlowPosition({
      x: (rect?.left ?? 0) + centerScreenX,
      y: (rect?.top ?? 0) + centerScreenY,
    })
    setAddMenu({
      open: true,
      screenX: centerScreenX,
      screenY: centerScreenY,
      flowX: flowPos.x,
      flowY: flowPos.y,
    })
  }, [screenToFlowPosition])

  const handleAddNode = useCallback(
    (type: NodeWorkflowNodeType) => {
      addNode(type, { x: addMenu.flowX, y: addMenu.flowY })
      closeAddMenu()
    },
    [addNode, addMenu.flowX, addMenu.flowY, closeAddMenu],
  )

  const handleBlankCanvasAdd = useCallback(() => {
    const rect = mainRef.current?.getBoundingClientRect()
    const screenX = rect ? rect.width / 2 : 360
    const screenY = rect ? rect.height / 2 : 300
    setAddMenu({
      open: true,
      screenX,
      screenY,
      flowX: 240,
      flowY: 160,
    })
  }, [])

  const updateEditorBreakdown = useCallback(
    (breakdown: ScriptBreakdownResult) => {
      if (!editorNodeId) return
      updateNodeData(editorNodeId, { breakdown })
    },
    [editorNodeId, updateNodeData],
  )

  return (
    <NodeWorkflowActionsProvider value={actions}>
      <main
        ref={mainRef}
        className="relative h-[calc(100vh-3rem)] overflow-hidden bg-background"
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onPaneContextMenu={openAddMenuAtEvent}
          onPaneClick={closeAddMenu}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          className="!bg-background"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={28}
            size={1.4}
            color="hsl(var(--border))"
          />
          <Controls position="bottom-right" showInteractive={false} />
          <MiniMap
            position="bottom-left"
            pannable
            zoomable
            className="!bg-card/80 !border !border-border/70"
          />
        </ReactFlow>

        {nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="pointer-events-auto text-center">
              <h1 className="text-2xl font-semibold text-muted-foreground">
                {t('blankCanvasTitle')}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {t('blankCanvasBody')}
              </p>
              <Button
                type="button"
                className="mt-5 rounded-full"
                onClick={handleBlankCanvasAdd}
              >
                <KeyRound className="size-4" />
                {t('addNode')}
              </Button>
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute left-5 top-5 z-20 flex items-center gap-2 rounded-full border border-border/70 bg-card/90 px-3 py-2 shadow-sm backdrop-blur">
          <span className="pointer-events-auto text-sm font-semibold text-foreground">
            {t('projectUntitled')}
          </span>
        </div>

        <div className="absolute right-5 top-5 z-20 flex items-center gap-2">
          <Badge variant="secondary" className="h-9 gap-2 px-3">
            <Sparkles className="size-3.5" />
            {t('canvasCredits')}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-full"
            onClick={openToolbarAddMenu}
          >
            <KeyRound className="size-4" />
            {t('toolbar.add')}
          </Button>
          <ApiKeyDrawerTrigger className="h-9 rounded-full">
            <ApiKeyManager />
          </ApiKeyDrawerTrigger>
        </div>

        {addMenu.open && (
          <CanvasAddMenu
            x={addMenu.screenX}
            y={addMenu.screenY}
            onAdd={handleAddNode}
            onClose={closeAddMenu}
          />
        )}

        {editorBreakdown && (
          <ScriptBreakdownEditorDialog
            breakdown={editorBreakdown}
            open={Boolean(editorNodeId)}
            onOpenChange={(open) => {
              if (!open) closeNodeEditor()
            }}
            onBreakdownChange={updateEditorBreakdown}
          />
        )}
      </main>
    </NodeWorkflowActionsProvider>
  )
}

type CharacterDraft = ScriptBreakdownResult['characters'][number]
type SceneDraft = ScriptBreakdownResult['scenes'][number]
type ActionDraft = ScriptBreakdownResult['actions'][number]
type BeatDraft = ScriptBreakdownResult['beats'][number]
type ShotDraft = ScriptBreakdownResult['shots'][number]

interface ScriptBreakdownEditorDialogProps {
  breakdown: ScriptBreakdownResult
  open: boolean
  onOpenChange: (open: boolean) => void
  onBreakdownChange: (breakdown: ScriptBreakdownResult) => void
}

function ScriptBreakdownEditorDialog({
  breakdown,
  open,
  onOpenChange,
  onBreakdownChange,
}: ScriptBreakdownEditorDialogProps) {
  const t = useTranslations('StudioNode')

  const updateRootField = (field: 'title' | 'logline', value: string): void => {
    onBreakdownChange({ ...breakdown, [field]: value })
  }

  const updateReferenceField = (
    field: 'summary' | 'rewriteGuidance',
    value: string,
  ): void => {
    onBreakdownChange({
      ...breakdown,
      referenceIntent: {
        ...breakdown.referenceIntent,
        [field]: value,
      },
    })
  }

  const updateCharacterField = (
    index: number,
    field: keyof CharacterDraft,
    value: string,
  ): void => {
    onBreakdownChange({
      ...breakdown,
      characters: breakdown.characters.map((character, currentIndex) =>
        currentIndex === index ? { ...character, [field]: value } : character,
      ),
    })
  }

  const updateSceneField = (
    index: number,
    field: keyof SceneDraft,
    value: string,
  ): void => {
    onBreakdownChange({
      ...breakdown,
      scenes: breakdown.scenes.map((scene, currentIndex) =>
        currentIndex === index ? { ...scene, [field]: value } : scene,
      ),
    })
  }

  const updateActionField = (
    index: number,
    field: keyof ActionDraft,
    value: string,
  ): void => {
    onBreakdownChange({
      ...breakdown,
      actions: breakdown.actions.map((action, currentIndex) =>
        currentIndex === index ? { ...action, [field]: value } : action,
      ),
    })
  }

  const updateBeatTextField = (
    index: number,
    field: Exclude<keyof BeatDraft, 'durationSec' | 'orderIndex'>,
    value: string,
  ): void => {
    onBreakdownChange({
      ...breakdown,
      beats: breakdown.beats.map((beat, currentIndex) =>
        currentIndex === index ? { ...beat, [field]: value } : beat,
      ),
    })
  }

  const updateBeatDuration = (index: number, value: string): void => {
    const nextDuration = Number.parseInt(value, 10)
    if (Number.isNaN(nextDuration)) return

    onBreakdownChange({
      ...breakdown,
      beats: breakdown.beats.map((beat, currentIndex) =>
        currentIndex === index
          ? {
              ...beat,
              durationSec: Math.min(
                SCRIPT_BREAKDOWN_LIMITS.MAX_BEAT_DURATION_SEC,
                Math.max(
                  SCRIPT_BREAKDOWN_LIMITS.MIN_BEAT_DURATION_SEC,
                  nextDuration,
                ),
              ),
            }
          : beat,
      ),
    })
  }

  const updateShotField = (
    index: number,
    field: keyof ShotDraft,
    value: string,
  ): void => {
    onBreakdownChange({
      ...breakdown,
      shots: breakdown.shots.map((shot, currentIndex) =>
        currentIndex === index ? { ...shot, [field]: value } : shot,
      ),
    })
  }

  const handleSave = (): void => {
    onOpenChange(false)
    toast.success(t('toasts.saved'))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t('closeEditor')}
        className="max-h-[calc(100vh-4rem)] overflow-hidden p-0 sm:max-w-5xl"
      >
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-primary" />
            {t('editorTitle')}
          </DialogTitle>
          <DialogDescription>{t('editorDescription')}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="overview" className="min-h-0 px-5 pb-5">
          <TabsList className="h-auto w-full flex-wrap justify-start">
            <TabsTrigger value="overview">{t('tabs.overview')}</TabsTrigger>
            <TabsTrigger value="characters">{t('tabs.characters')}</TabsTrigger>
            <TabsTrigger value="scenes">{t('tabs.scenes')}</TabsTrigger>
            <TabsTrigger value="actions">{t('tabs.actions')}</TabsTrigger>
            <TabsTrigger value="beats">{t('tabs.beats')}</TabsTrigger>
            <TabsTrigger value="shots">{t('tabs.shots')}</TabsTrigger>
          </TabsList>

          <div className="mt-4 max-h-[calc(100vh-15rem)] overflow-y-auto pr-1">
            <TabsContent value="overview" className="grid gap-4">
              <EditableField
                label={t('fields.title')}
                value={breakdown.title}
                onChange={(value) => updateRootField('title', value)}
              />
              <EditableField
                label={t('fields.logline')}
                value={breakdown.logline}
                multiline
                onChange={(value) => updateRootField('logline', value)}
              />
              <EditableField
                label={t('fields.referenceSummary')}
                value={breakdown.referenceIntent.summary}
                multiline
                onChange={(value) => updateReferenceField('summary', value)}
              />
              <EditableField
                label={t('fields.rewriteGuidance')}
                value={breakdown.referenceIntent.rewriteGuidance}
                multiline
                onChange={(value) =>
                  updateReferenceField('rewriteGuidance', value)
                }
              />
            </TabsContent>

            <TabsContent value="characters" className="grid gap-3">
              {breakdown.characters.map((character, index) => (
                <EditorItem key={character.id} title={character.label}>
                  <EditableField
                    label={t('fields.name')}
                    value={character.nameSuggestion}
                    onChange={(value) =>
                      updateCharacterField(index, 'nameSuggestion', value)
                    }
                  />
                  <EditableField
                    label={t('fields.role')}
                    value={character.role}
                    onChange={(value) =>
                      updateCharacterField(index, 'role', value)
                    }
                  />
                  <EditableField
                    label={t('fields.visualSeed')}
                    value={character.visualSeed}
                    multiline
                    onChange={(value) =>
                      updateCharacterField(index, 'visualSeed', value)
                    }
                  />
                  <EditableField
                    label={t('fields.functionInStory')}
                    value={character.functionInStory}
                    multiline
                    onChange={(value) =>
                      updateCharacterField(index, 'functionInStory', value)
                    }
                  />
                  <EditableField
                    label={t('fields.personality')}
                    value={character.personality}
                    multiline
                    onChange={(value) =>
                      updateCharacterField(index, 'personality', value)
                    }
                  />
                  <EditableField
                    label={t('fields.goal')}
                    value={character.goal}
                    multiline
                    onChange={(value) =>
                      updateCharacterField(index, 'goal', value)
                    }
                  />
                </EditorItem>
              ))}
            </TabsContent>

            <TabsContent value="scenes" className="grid gap-3">
              {breakdown.scenes.map((scene, index) => (
                <EditorItem key={scene.id} title={scene.label}>
                  <EditableField
                    label={t('fields.label')}
                    value={scene.label}
                    onChange={(value) =>
                      updateSceneField(index, 'label', value)
                    }
                  />
                  <EditableField
                    label={t('fields.locationType')}
                    value={scene.locationType}
                    onChange={(value) =>
                      updateSceneField(index, 'locationType', value)
                    }
                  />
                  <EditableField
                    label={t('fields.timeOfDay')}
                    value={scene.timeOfDay}
                    onChange={(value) =>
                      updateSceneField(index, 'timeOfDay', value)
                    }
                  />
                  <EditableField
                    label={t('fields.mood')}
                    value={scene.mood}
                    onChange={(value) => updateSceneField(index, 'mood', value)}
                  />
                  <EditableField
                    label={t('fields.lighting')}
                    value={scene.lighting}
                    onChange={(value) =>
                      updateSceneField(index, 'lighting', value)
                    }
                  />
                  <EditableField
                    label={t('fields.visualSeed')}
                    value={scene.visualSeed}
                    multiline
                    onChange={(value) =>
                      updateSceneField(index, 'visualSeed', value)
                    }
                  />
                </EditorItem>
              ))}
            </TabsContent>

            <TabsContent value="actions" className="grid gap-3">
              {breakdown.actions.map((action, index) => (
                <EditorItem key={action.id} title={action.id}>
                  <EditableField
                    label={t('fields.verb')}
                    value={action.verb}
                    onChange={(value) =>
                      updateActionField(index, 'verb', value)
                    }
                  />
                  <EditableField
                    label={t('fields.object')}
                    value={action.object}
                    onChange={(value) =>
                      updateActionField(index, 'object', value)
                    }
                  />
                  <EditableField
                    label={t('fields.consequence')}
                    value={action.consequence}
                    multiline
                    onChange={(value) =>
                      updateActionField(index, 'consequence', value)
                    }
                  />
                </EditorItem>
              ))}
            </TabsContent>

            <TabsContent value="beats" className="grid gap-3">
              {breakdown.beats.map((beat, index) => (
                <EditorItem
                  key={beat.id}
                  title={t('beatIndex', { index: beat.orderIndex + 1 })}
                >
                  <EditableField
                    label={t('fields.title')}
                    value={beat.title}
                    onChange={(value) =>
                      updateBeatTextField(index, 'title', value)
                    }
                  />
                  <EditableField
                    label={t('fields.duration')}
                    value={String(beat.durationSec)}
                    inputMode="numeric"
                    onChange={(value) => updateBeatDuration(index, value)}
                  />
                  <EditableField
                    label={t('fields.visibleAction')}
                    value={beat.visibleAction}
                    multiline
                    onChange={(value) =>
                      updateBeatTextField(index, 'visibleAction', value)
                    }
                  />
                  <EditableField
                    label={t('fields.emotionalTurn')}
                    value={beat.emotionalTurn}
                    multiline
                    onChange={(value) =>
                      updateBeatTextField(index, 'emotionalTurn', value)
                    }
                  />
                  <EditableField
                    label={t('fields.consequence')}
                    value={beat.consequence}
                    multiline
                    onChange={(value) =>
                      updateBeatTextField(index, 'consequence', value)
                    }
                  />
                </EditorItem>
              ))}
            </TabsContent>

            <TabsContent value="shots" className="grid gap-3">
              {breakdown.shots.map((shot, index) => (
                <EditorItem
                  key={shot.id}
                  title={`${t(`shotTypes.${shot.shotType}`)} · ${shot.cameraMotion}`}
                >
                  <EditableField
                    label={t('fields.cameraMotion')}
                    value={shot.cameraMotion}
                    onChange={(value) =>
                      updateShotField(index, 'cameraMotion', value)
                    }
                  />
                  <EditableField
                    label={t('fields.startState')}
                    value={shot.startState}
                    multiline
                    onChange={(value) =>
                      updateShotField(index, 'startState', value)
                    }
                  />
                  <EditableField
                    label={t('fields.endState')}
                    value={shot.endState}
                    multiline
                    onChange={(value) =>
                      updateShotField(index, 'endState', value)
                    }
                  />
                </EditorItem>
              ))}
            </TabsContent>
          </div>

          <DialogFooter className="border-t border-border/60 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('closeEditor')}
            </Button>
            <Button type="button" onClick={handleSave}>
              <Save className="size-4" />
              {t('saveNode')}
            </Button>
          </DialogFooter>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

interface EditorItemProps {
  title: string
  children: ReactNode
}

function EditorItem({ title, children }: EditorItemProps) {
  return (
    <section className="grid gap-3 rounded-lg border border-border/60 bg-card/60 p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  )
}

interface EditableFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  multiline?: boolean
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode']
}

function EditableField({
  label,
  value,
  onChange,
  multiline = false,
  inputMode,
}: EditableFieldProps) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </span>
      {multiline ? (
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-24 resize-y rounded-lg border-border/70 bg-background/80 text-sm leading-6 shadow-none"
        />
      ) : (
        <Input
          value={value}
          inputMode={inputMode}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 rounded-lg border-border/70 bg-background/80 shadow-none"
        />
      )}
    </label>
  )
}
