'use client'

import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Plus, Save, Sparkles, Wand2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { toast } from 'sonner'

import {
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
import type { NodeWorkflowNodeType, ScriptBreakdownResult } from '@/types'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useNodeWorkflow } from '@/hooks/use-node-workflow'
import { useScriptBreakdown } from '@/hooks/use-script-breakdown'
import type { StudioModelOption } from '@/components/business/ModelSelector'
import { cn } from '@/lib/utils'
import {
  buildSavedModelOptions,
  mergeModelOptionsWithPreferredSavedRoutes,
} from '@/lib/model-options'

import { CanvasAddMenu } from './CanvasAddMenu'
import {
  NodeWorkflowActionsProvider,
  type NodeWorkflowActions,
} from './NodeWorkflowActionsContext'
import { ScriptBreakdownEditorDialog } from './ScriptBreakdownEditorDialog'
import { StudioNodeAssistantDock } from './StudioNodeAssistantDock'
import {
  StudioNodeBottomDock,
  type StudioNodeToolMode,
} from './StudioNodeBottomDock'
import { AgentNode } from './nodes/AgentNode'
import { ComposerNode } from './nodes/ComposerNode'
import { PlaceholderNode } from './nodes/PlaceholderNode'

interface AddMenuState {
  open: boolean
  screenX: number
  screenY: number
  flowX: number
  flowY: number
}

const NODE_TYPES: NodeTypes = {
  composer: ComposerNode,
  agent: AgentNode,
  shot: PlaceholderNode,
  shotText: PlaceholderNode,
  characterImage: PlaceholderNode,
  backgroundImage: PlaceholderNode,
  frameImage: PlaceholderNode,
  voice: PlaceholderNode,
  seedance: PlaceholderNode,
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
      composer: plannerOptions,
      agent: plannerOptions,
      shot: plannerOptions,
      shotText: plannerOptions,
      characterImage: imageOptions,
      backgroundImage: imageOptions,
      frameImage: imageOptions,
      voice: audioOptions,
      seedance: videoOptions,
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
    getOutgoingTargetByType,
    onNodesChange,
    onEdgesChange,
    onConnect,
  } = useNodeWorkflow()
  const modelOptionsByType = useWorkflowModelOptions()
  const { screenToFlowPosition, fitView } = useReactFlow()
  const mainRef = useRef<HTMLDivElement>(null)
  const [addMenu, setAddMenu] = useState<AddMenuState>(DEFAULT_ADD_MENU)
  const [toolMode, setToolMode] = useState<StudioNodeToolMode>('pointer')

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.15, duration: 320, maxZoom: 1 })
  }, [fitView])

  const handleSaveStub = useCallback(() => {
    toast.success(t('toasts.savedDraft'))
  }, [t])

  const editorNode = nodes.find((node) => node.id === editorNodeId)
  const editorBreakdown = editorNode?.data.breakdown

  const sendFromComposer = useCallback(
    async (composerNodeId: string) => {
      const composer = nodes.find((node) => node.id === composerNodeId)
      if (!composer || composer.type !== 'composer') return

      const idea = composer.data.prompt.trim()
      if (!idea || isLoading) return

      const target = getOutgoingTargetByType(composerNodeId, 'agent')
      if (!target) {
        toast.error(t('composer.noTargetTip'))
        return
      }

      const plannerProvider =
        composer.data.model?.adapterType === AI_ADAPTER_TYPES.GEMINI ||
        composer.data.model?.adapterType === AI_ADAPTER_TYPES.OPENAI
          ? composer.data.model.adapterType
          : SCRIPT_PLANNER_PROVIDERS.AUTO

      const nextResult = await generate({
        idea,
        plannerProvider,
        locale,
        ...(composer.data.model?.apiKeyId
          ? { apiKeyId: composer.data.model.apiKeyId }
          : {}),
      })

      if (!nextResult) {
        toast.error(error ?? t('errorFallback'))
        return
      }

      updateScriptBreakdown(target.id, nextResult.breakdown, {
        label: nextResult.planner.label,
        modelId: nextResult.planner.modelId,
      })
      toast.success(t('toasts.generated'))
    },
    [
      nodes,
      isLoading,
      generate,
      locale,
      error,
      getOutgoingTargetByType,
      updateScriptBreakdown,
      t,
    ],
  )

  const hasOutgoingAgent = useCallback(
    (composerNodeId: string) =>
      Boolean(getOutgoingTargetByType(composerNodeId, 'agent')),
    [getOutgoingTargetByType],
  )

  const actions = useMemo<NodeWorkflowActions>(
    () => ({
      modelOptionsByType,
      isLoading,
      updateNodeData,
      updateNodeModel,
      openNodeEditor,
      sendFromComposer,
      hasOutgoingAgent,
    }),
    [
      modelOptionsByType,
      isLoading,
      updateNodeData,
      updateNodeModel,
      openNodeEditor,
      sendFromComposer,
      hasOutgoingAgent,
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

  const updateEditorBreakdown = useCallback(
    (breakdown: ScriptBreakdownResult) => {
      if (!editorNodeId) return
      updateNodeData(editorNodeId, { breakdown })
    },
    [editorNodeId, updateNodeData],
  )

  const panOnDrag = toolMode === 'hand' ? true : [1, 2]

  return (
    <NodeWorkflowActionsProvider value={actions}>
      <main
        ref={mainRef}
        className="dark relative h-[calc(100vh-3rem)] overflow-hidden bg-[#0b0b0a] text-[#f4f1ea]"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute right-0 top-0 h-96 w-1/2 bg-[radial-gradient(ellipse_55%_50%_at_85%_-10%,rgba(245,158,11,0.08),transparent_70%)]"
        />

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onPaneContextMenu={openAddMenuAtEvent}
          onPaneClick={closeAddMenu}
          defaultViewport={{ x: 16, y: 58, zoom: 0.58 }}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          panOnDrag={panOnDrag}
          className="!bg-transparent"
          defaultEdgeOptions={{
            type: 'smoothstep',
            animated: true,
            style: { stroke: 'rgba(244,241,234,0.25)', strokeWidth: 1.5 },
          }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={28}
            size={1}
            color="rgba(244,241,234,0.12)"
          />
          <MiniMapPanel />
        </ReactFlow>

        <CanvasTopBar
          projectLabel={t('projectUntitled')}
          modeLabel={t('eyebrow')}
          nodeCountLabel={t('toolbar.nodeCount', { count: nodes.length })}
          addLabel={t('toolbar.add')}
          arrangeLabel={t('topbar.arrange')}
          saveLabel={t('toolbar.save')}
          creditsLabel={t('canvasCredits')}
          routeLabel={t('topbar.routeLabel', { count: 13 })}
          onAdd={openToolbarAddMenu}
          onArrange={handleFitView}
          onSave={handleSaveStub}
        />

        <StudioNodeAssistantDock />

        <StudioNodeBottomDock
          toolMode={toolMode}
          onToolModeChange={setToolMode}
        />

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

interface CanvasTopBarProps {
  projectLabel: string
  modeLabel: string
  nodeCountLabel: string
  addLabel: string
  arrangeLabel: string
  saveLabel: string
  creditsLabel: string
  routeLabel: string
  onAdd: () => void
  onArrange: () => void
  onSave: () => void
}

function CanvasTopBar({
  projectLabel,
  modeLabel,
  nodeCountLabel,
  addLabel,
  arrangeLabel,
  saveLabel,
  creditsLabel,
  routeLabel,
  onAdd,
  onArrange,
  onSave,
}: CanvasTopBarProps) {
  return (
    <div className="pointer-events-none absolute left-5 right-[356px] top-5 z-30 flex flex-wrap items-center justify-between gap-3">
      <div className="pointer-events-auto flex h-[56px] items-center gap-3 rounded-[22px] border border-white/[0.08] bg-[#181716] px-3.5 py-2.5">
        <div className="grid size-[34px] place-items-center rounded-[10px] bg-[#22211f] font-display text-[14px] font-bold text-amber-400">
          N
        </div>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="font-display text-[10px] font-semibold uppercase tracking-nav text-[#6f6a63]">
            {modeLabel}
          </span>
          <span className="truncate font-display text-[14px] font-semibold text-foreground">
            {projectLabel}
          </span>
        </div>
        <span
          aria-hidden
          className="hidden h-6 w-px bg-white/[0.06] sm:block"
        />
        <span className="hidden font-display text-[11px] font-medium text-[#a6a098] sm:inline">
          {nodeCountLabel}
        </span>
      </div>

      <div className="pointer-events-auto flex flex-wrap items-center gap-3">
        <div className="flex h-[46px] items-center gap-1 rounded-[23px] border border-white/[0.08] bg-[#181716] p-1.5">
          <TopBarPrimaryButton onClick={onAdd}>
            <Plus className="size-3.5" />
            {addLabel}
          </TopBarPrimaryButton>
          <TopBarGhostButton onClick={onArrange}>
            <Wand2 className="size-3.5" />
            {arrangeLabel}
          </TopBarGhostButton>
          <TopBarGhostButton onClick={onSave}>
            <Save className="size-3.5" />
            {saveLabel}
          </TopBarGhostButton>
        </div>

        <CreditsPill label={creditsLabel} />
        <RoutePill label={routeLabel} />
      </div>
    </div>
  )
}

function TopBarPrimaryButton({
  children,
  onClick,
}: {
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-[34px] items-center gap-1.5 rounded-full bg-[#f4f1ea] px-3 font-display text-[12px] font-semibold text-[#0d0c0b] transition-colors hover:bg-white"
    >
      {children}
    </button>
  )
}

function TopBarGhostButton({
  children,
  onClick,
}: {
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-[34px] items-center gap-1.5 rounded-full bg-[#22211f] px-3 font-display text-[12px] font-semibold text-[#a6a098] transition-colors hover:bg-[#2d2b28] hover:text-foreground"
    >
      {children}
    </button>
  )
}

function CreditsPill({ label }: { label: string }) {
  return (
    <div className="flex h-[46px] items-center gap-2 rounded-[23px] border border-white/[0.08] bg-[#181716] px-4 font-display text-[12px] font-semibold tabular-nums text-[#a6a098]">
      <Sparkles className="size-3.5 text-amber-400" />
      {label}
    </div>
  )
}

function RoutePill({ label }: { label: string }) {
  return (
    <div className="flex h-[46px] items-center gap-2 rounded-[23px] border border-white/[0.08] bg-[#181716] px-4 font-display text-[12px] font-semibold text-foreground">
      <span aria-hidden className="size-2 rounded-full bg-emerald-400" />
      {label}
    </div>
  )
}

function MiniMapPanel() {
  const t = useTranslations('StudioNode')
  return (
    <div className="pointer-events-none absolute bottom-5 left-5 z-20">
      <div
        className={cn(
          'pointer-events-auto flex w-[184px] flex-col gap-2 rounded-[22px] border border-white/[0.08] bg-[#181716] p-3 shadow-[0_20px_60px_rgba(0,0,0,0.5)]',
        )}
      >
        <span className="font-display text-[11px] font-semibold text-[#a6a098]">
          {t('minimapTitle')}
        </span>
        <MiniMap
          position="bottom-left"
          pannable
          zoomable
          className="!relative !inset-0 !m-0 !h-[78px] !w-full !rounded-lg !border !border-white/[0.06] !bg-[#22211f]"
          maskColor="rgba(11,11,10,0.55)"
          maskStrokeColor="rgba(244,241,234,0.25)"
          nodeColor="#6f6a63"
          nodeStrokeColor="rgba(244,241,234,0.35)"
          nodeBorderRadius={4}
        />
      </div>
    </div>
  )
}
