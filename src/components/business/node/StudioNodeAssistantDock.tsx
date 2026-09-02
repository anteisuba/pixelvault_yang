'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react'
import { createPortal } from 'react-dom'
import {
  Bot,
  Globe,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  PanelRightClose,
  Share2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

import {
  NODE_STUDIO_ASSISTANT_LIMITS,
  NODE_STUDIO_ASSISTANT_PICK_REJECT_REASON_IDS,
  NODE_STUDIO_ASSISTANT_ROUTE_MODELS,
  NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS,
  type NodeStudioAssistantPickRejectReason,
} from '@/constants/node-studio'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { assistantAdapterAcceptsReferenceKind } from '@/constants/assistant'
import {
  VIDEO_ANALYSIS_TASKS,
  VIDEO_ANALYSIS_TASK_TIERS,
} from '@/constants/video-analysis'
import { isAutoApplyAssistantOp } from '@/constants/node-assistant-ops'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  useAssistantConversation,
  type AssistantCapabilityReference,
} from '@/hooks/use-assistant-conversation'
import { useIsMobile } from '@/hooks/use-mobile'
import { useCanvasAssistantDrag } from '@/hooks/node/use-canvas-assistant-drag'
import {
  useCanvasAssistantPick,
  type CanvasAssistantPickApi,
} from '@/hooks/node/use-canvas-assistant-pick'
import { useNodeSelection } from '@/hooks/node/use-node-selection'
import { useNodeWorkflowActions } from './NodeWorkflowActionsContext'
import { buildCanvasAssistantMediaReference } from '@/lib/canvas-assistant-pick'
import { canvasCapabilityRuntime } from '@/lib/canvas-capability-runtime'
import { buildNodeAssistantNodeContexts } from '@/lib/node-assistant-context'
import {
  planNodeAssistantOps,
  type PlannedNodeAssistantOp,
} from '@/lib/node-assistant-op-plan'
import type { AppLocale } from '@/i18n/routing'
import type {
  NodeAssistantMediaReference,
  NodeAssistantNodeContext,
} from '@/types/node-assistant'
import type { NodeAssistantOpBatch } from '@/types/node-assistant-ops'
import type {
  NodeWorkflowEdge,
  NodeWorkflowModelOptionsByType,
  NodeWorkflowNode,
} from '@/types/node-workflow'
import type { ScriptDoc } from '@/types/script-doc'

import { AssistantConversation } from './AssistantConversation'
import type { MentionInputHandle } from './composer/MentionInput'
import {
  CanvasAssistantHistory,
  CanvasAssistantHistoryPanel,
} from './CanvasAssistantHistory'
import {
  CanvasAssistantRouteSelector,
  type NodeAssistantRouteSelection,
} from './CanvasAssistantRouteSelector'
import { ScriptDocWorkspace } from './ScriptDocWorkspace'
import {
  AssistantShell,
  AssistantShellHeader,
} from '@/components/business/assistant/AssistantShell'
import { createAssistantConversationShareAPI } from '@/lib/api-client/assistant-conversation'

interface StudioNodeAssistantDockProps {
  open: boolean
  expanded: boolean
  projectId: string
  projectName: string
  nodes: NodeWorkflowNode[]
  /** 包 5：提案的合法性要在真实的图上判（重复边 / 参考位都要读边）。 */
  edges: NodeWorkflowEdge[]
  /**
   * 切片 5 第二批：`set_model` 的取值范围。
   *
   * ⚠ 从 workbench 传进来而不是在这里再调一次 `useWorkflowModelOptions()` ——
   * 那个 hook 订阅 api-keys context 并按 key 重算三张表，第二个实例只是把同一份
   * 计算再做一遍，且两份引用不同会让下面的 `useCallback` 每帧重建。
   */
  modelOptionsByType: NodeWorkflowModelOptionsByType
  scriptDoc: ScriptDoc | undefined
  locale: AppLocale
  onOpenChange(open: boolean): void
  onExpandedChange(expanded: boolean): void
  onFocusNode(nodeId: string): void
  historyPortalTarget?: HTMLElement | null
  /**
   * 手势 A：dock 把拾取 API 写进这个 ref，workbench 的 `onNodeClick` /
   * `onPaneClick` / Esc 栈在事件时读（同 `quickThrowApiRef`）。
   */
  pickApiRef?: MutableRefObject<CanvasAssistantPickApi | null>
}

/**
 * 选择器 / `@` 菜单的候选池。⚠ 末尾按 `maxReferences` 截断 —— 手势 A 的拾取
 * **不查这张表**（第 9 个媒体节点不在里面），而是按节点直接构造，构造器与这里
 * 共用 `buildCanvasAssistantMediaReference`。
 */
function getAssistantMediaReferences(
  nodes: NodeWorkflowNode[],
  getNodeTypeLabel: (type: NodeWorkflowNode['type']) => string,
): NodeAssistantMediaReference[] {
  const references: NodeAssistantMediaReference[] = []
  for (const node of nodes) {
    const reference = buildCanvasAssistantMediaReference(node, getNodeTypeLabel)
    if (reference) references.push(reference)
  }
  return references.slice(0, NODE_STUDIO_ASSISTANT_LIMITS.maxReferences)
}

export function StudioNodeAssistantDock({
  open,
  expanded,
  projectId,
  projectName,
  nodes,
  edges,
  modelOptionsByType,
  scriptDoc,
  locale,
  onOpenChange,
  onExpandedChange,
  onFocusNode,
  historyPortalTarget,
  pickApiRef,
}: StudioNodeAssistantDockProps) {
  const t = useTranslations('StudioNode.dock')
  const tAssistant = useTranslations('StudioNode.assistant')
  const tHistory = useTranslations('StudioNode.history')
  const tNodeTypes = useTranslations('StudioNode.nodeTypes')
  const tConversation = useTranslations('StudioNode.conversation')
  const tCanvasOps = useTranslations('StudioNode.canvasOps')
  const selection = useNodeSelection()
  const { placeDerivedImages, focusNode, runAssistantCanvasOps, undo } =
    useNodeWorkflowActions()
  const conversation = useAssistantConversation({ projectId, persist: true })
  const [assistantRoute, setAssistantRoute] =
    useState<NodeAssistantRouteSelection>({
      optionId: NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS.auto,
      adapterType: AI_ADAPTER_TYPES.OPENAI,
    })
  const [researchEnabled, setResearchEnabled] = useState(false)
  const [lastReferences, setLastReferences] = useState<
    NodeAssistantMediaReference[]
  >([])
  /**
   * 手势 A：下一轮要挂的媒体引用，从 `AssistantConversation` 提上来 —— 画布上的
   * 一次点击要能把引用推进来，而那个点击的 handler 在会话组件外面。
   */
  const [selectedReferences, setSelectedReferences] = useState<
    NodeAssistantMediaReference[]
  >([])
  const composerRef = useRef<MentionInputHandle>(null)
  const isMobile = useIsMobile()
  const dockRef = useRef<HTMLElement>(null)
  const dockDrag = useCanvasAssistantDrag(dockRef, open && !isMobile)

  const dockStyle = isMobile
    ? {
        bottom: 'var(--keyboard-inset, 0px)',
        height:
          'min(65svh, calc(100svh - var(--keyboard-inset, 0px) - 0.75rem))',
        maxHeight: 'calc(100svh - var(--keyboard-inset, 0px) - 0.75rem)',
      }
    : undefined

  // 投影本身住在 `lib/node-assistant-context` —— 它决定模型**能看见什么**，
  // 而看不见就只能编，所以那段逻辑必须能脱离画布单测（空态 / 截断 / 哪些节点
  // 有分类字段）。dock 这里只负责把本地化的类型标签递进去。
  const nodeContexts = useMemo<NodeAssistantNodeContext[]>(
    () =>
      buildNodeAssistantNodeContexts(nodes, {
        getNodeTypeLabel: (type) => tNodeTypes(type),
      }),
    [nodes, tNodeTypes],
  )

  const getNodeTypeLabel = useCallback(
    (type: NodeWorkflowNode['type']) => tNodeTypes(type),
    [tNodeTypes],
  )

  const handleAddPickedReference = useCallback(
    (reference: NodeAssistantMediaReference) => {
      setSelectedReferences((current) =>
        current.some((item) => item.id === reference.id)
          ? current
          : [...current, reference].slice(
              0,
              NODE_STUDIO_ASSISTANT_LIMITS.maxReferences,
            ),
      )
    },
    [],
  )
  const handlePicked = useCallback(() => {
    // 拾完焦点回输入框：用户下一步要么继续拾、要么接着打字。
    composerRef.current?.focus()
  }, [])
  // 上限被拒要**大声说**（brand-dna：失败暴露）；「已经拾过」静默 —— 节点上的
  // ⊘ 已经说了这件事。
  const handlePickRejected = useCallback(
    (reason: NodeStudioAssistantPickRejectReason) => {
      if (reason === NODE_STUDIO_ASSISTANT_PICK_REJECT_REASON_IDS.nodeLimit) {
        toast.error(tConversation('pickedNodeLimit'))
      } else if (
        reason === NODE_STUDIO_ASSISTANT_PICK_REJECT_REASON_IDS.referenceLimit
      ) {
        toast.error(tConversation('pickedReferenceLimit'))
      }
    },
    [tConversation],
  )
  const pick = useCanvasAssistantPick({
    nodes,
    getNodeTypeLabel,
    selectedReferences,
    onAddReference: handleAddPickedReference,
    apiRef: pickApiRef,
    onPicked: handlePicked,
    onRejected: handlePickRejected,
  })

  /**
   * 请求里的 `selectedNodeIds` = 画布选中 + 手势 A 拾进来的非媒体节点（去重）。
   * 拾取的排在后面：截断线 `maxSelectedNodes` 先保画布上的显式选中。
   */
  const selectedNodeIds = useMemo(() => {
    const ids = selection.nodes.map((node) => node.id)
    for (const id of pick.pickedNodeIds) {
      if (!ids.includes(id)) ids.push(id)
    }
    return ids.slice(0, NODE_STUDIO_ASSISTANT_LIMITS.maxSelectedNodes)
  }, [pick.pickedNodeIds, selection.nodes])

  const referenceOptions = useMemo(
    () => getAssistantMediaReferences(nodes, getNodeTypeLabel),
    [nodes, getNodeTypeLabel],
  )

  /**
   * 这条路收不收这种附件。视频要的是 **native 档**（切片 2 §4.3）——
   * 画布 dock 也是自由对话，`frames` 档回答不了运镜/节奏/动作。
   *
   * ⚠ 提成一个回调而不是在两处布局里各写一遍：展开态和收起态是同一个闸，
   * 抄两份就是「改了一处忘了另一处」的经典入口。
   */
  const canUseReference = useCallback(
    (reference: { kind: 'image' | 'video' }) =>
      assistantAdapterAcceptsReferenceKind(
        assistantRoute.adapterType,
        reference.kind,
        VIDEO_ANALYSIS_TASK_TIERS[VIDEO_ANALYSIS_TASKS.conversational],
      ),
    [assistantRoute.adapterType],
  )

  const buildConversationContext = useCallback(
    () => ({
      nodes: nodeContexts,
      selectedNodeIds,
      references: lastReferences,
      locale,
      apiKeyId: assistantRoute.apiKeyId,
      llmModelId: assistantRoute.modelId,
      research: researchEnabled,
    }),
    [
      assistantRoute.apiKeyId,
      assistantRoute.modelId,
      locale,
      nodeContexts,
      lastReferences,
      researchEnabled,
      selectedNodeIds,
    ],
  )

  const { clearPicks, exit: exitPick } = pick
  const handleSend = useCallback(
    async (content: string, references?: NodeAssistantMediaReference[]) => {
      setLastReferences(references ?? [])
      // 发送 = 手势 A 的一条出口：拾进去的节点随这一轮送出，模式收起。
      exitPick()
      const context = buildConversationContext()
      clearPicks()
      await conversation.send(content, {
        ...context,
        references: references ?? [],
      })
    },
    [buildConversationContext, clearPicks, conversation, exitPick],
  )

  const handleRetry = useCallback(async () => {
    await conversation.retry(buildConversationContext())
  }, [buildConversationContext, conversation])

  const handleRunCapability = useCallback(
    async ({ capability, nodeId }: AssistantCapabilityReference) => {
      const node = nodes.find((candidate) => candidate.id === nodeId)
      const sourceUrl =
        typeof node?.data.mediaUrl === 'string' && node.data.mediaUrl.trim()
          ? node.data.mediaUrl.trim()
          : typeof node?.data.imageUrl === 'string' && node.data.imageUrl.trim()
            ? node.data.imageUrl.trim()
            : ''
      if (!node || !sourceUrl) {
        toast.error(tConversation('capabilityUnavailable'))
        return
      }

      const sourceWidth =
        typeof node.data.mediaWidth === 'number' && node.data.mediaWidth > 0
          ? node.data.mediaWidth
          : 1024
      const sourceHeight =
        typeof node.data.mediaHeight === 'number' && node.data.mediaHeight > 0
          ? node.data.mediaHeight
          : 1024
      const descriptor = canvasCapabilityRuntime.open(capability)
      const response = await canvasCapabilityRuntime.run(
        capability === 'upscale'
          ? {
              capability,
              target: {
                sourceUrl,
                sourceGenerationId: node.data.generationId,
                sourceWidth,
                sourceHeight,
              },
              targetScale: '4x',
              modelId: descriptor.defaultModelId ?? '',
            }
          : {
              capability,
              target: {
                sourceUrl,
                sourceGenerationId: node.data.generationId,
                sourceWidth,
                sourceHeight,
              },
              modelId: descriptor.defaultModelId ?? '',
            },
      )
      if (!response.success || response.outputs.length === 0) {
        toast.error(response.error || tConversation('capabilityFailed'))
        return
      }
      const derivedNodeIds =
        placeDerivedImages?.(node.id, response.outputs) ?? []
      if (derivedNodeIds[0]) focusNode?.(derivedNodeIds[0])
    },
    [focusNode, nodes, placeDerivedImages, tConversation],
  )

  // 包 5：提案的合法性在真实的图上算 —— dock 是**唯一**同时握着 nodes/edges 和
  // 对话消息的地方，所以规划落在这里；执行则必须回到 workbench（addNode /
  // onConnect 只在那儿），中间隔着 context 上那一个高层动作。
  const planAssistantOps = useCallback(
    (batch: NodeAssistantOpBatch) =>
      planNodeAssistantOps(batch, nodes, edges, modelOptionsByType),
    [edges, modelOptionsByType, nodes],
  )

  const handleApplyAssistantOps = useCallback(
    async (ops: readonly PlannedNodeAssistantOp[]) => {
      if (!runAssistantCanvasOps) {
        return {
          applied: 0,
          skipped: ops.length,
          failedConnects: 0,
          createdNodeIds: [],
        }
      }
      const result = await runAssistantCanvasOps(ops)
      if (result.applied > 0) {
        toast.success(tCanvasOps('appliedToast', { count: result.applied }))
      }
      return result
    },
    [runAssistantCanvasOps, tCanvasOps],
  )

  // ─── B3 · 结构 op 自动落 ─────────────────────────────────────────────
  //
  // 「节点结构立即落画布（免费）；像素等确认（花钱）」。用户不用先读一段文字提案再
  // 点一下，才看得到 AI 的计划在画布上的空间结构。
  //
  // ⚠ **难点全在「恰好一次」**，不在自动本身：
  //   ① 流式回复每来一个 chunk 就重建一次消息对象，提案卡跟着重渲染 —— 放在卡里做
  //      会重复建节点。所以做在这里，并按**消息 id**（流内稳定）去重。
  //   ② 关掉 dock 再打开，最后一条消息**仍然带着 ops**。挂载时先把已有消息全部记成
  //      「已处理」，只有挂载之后**新到**的才自动落 —— 否则开关一次浮卡就多一批节点。
  //   ③ 提案本身有意不跨刷新存活（`use-assistant-conversation` 只入库剥干净的正文），
  //      所以刷新后不存在「几分钟前的旧提案被自动执行」这条路。
  const autoAppliedRef = useRef<Set<string> | null>(null)
  const [autoAppliedByMessageId, setAutoAppliedByMessageId] = useState<
    Record<string, number>
  >({})
  /**
   * 台账 K-2：自动落里**连线没建成**的条数，按消息 id 记。与 `applied` 分开存是
   * 因为它们答的是两个问题 ——「落了几个」和「结构成没成形」。回执把后者漏掉时，
   * 前者越大越让人放心。
   */
  const [autoFailedConnectsByMessageId, setAutoFailedConnectsByMessageId] =
    useState<Record<string, number>>({})

  useEffect(() => {
    // ② 首次挂载：现有消息一律记成已处理，不回溯执行。
    if (autoAppliedRef.current === null) {
      autoAppliedRef.current = new Set(
        conversation.messages.map((message) => message.id),
      )
      return
    }
    if (conversation.isLoading) return

    const seen = autoAppliedRef.current
    const pending = conversation.messages.filter(
      (message) =>
        message.role === 'assistant' && message.ops && !seen.has(message.id),
    )
    if (pending.length === 0) return

    for (const message of pending) {
      seen.add(message.id)
      if (!message.ops) continue
      const autoOps = planAssistantOps(message.ops).ops.filter(
        (entry) =>
          entry.status === 'ready' && isAutoApplyAssistantOp(entry.op.op),
      )
      if (autoOps.length === 0) continue
      void handleApplyAssistantOps(autoOps).then((result) => {
        setAutoAppliedByMessageId((current) => ({
          ...current,
          [message.id]: result.applied,
        }))
        if (result.failedConnects > 0) {
          setAutoFailedConnectsByMessageId((current) => ({
            ...current,
            [message.id]: result.failedConnects,
          }))
        }
      })
    }
  }, [
    conversation.isLoading,
    conversation.messages,
    handleApplyAssistantOps,
    planAssistantOps,
  ])

  const handleNewConversation = useCallback(() => {
    conversation.clear()
    setSelectedReferences([])
    clearPicks()
    exitPick()
  }, [clearPicks, conversation, exitPick])

  const handleSelectHistory = useCallback(
    (id: string) => {
      void conversation.selectSession(id)
      onOpenChange(true)
    },
    [conversation, onOpenChange],
  )

  const handleShareConversation = useCallback(async () => {
    if (!conversation.sessionId) {
      toast.error(tHistory('shareFailed'))
      return
    }

    const result = await createAssistantConversationShareAPI(
      conversation.sessionId,
    )
    if (!result.success) {
      toast.error(tHistory('shareFailed'))
      return
    }

    const shareUrl = `${window.location.origin}/${locale}/assistant/share/${result.data.token}`
    try {
      await navigator.clipboard.writeText(shareUrl)
      toast.success(tHistory('shareCopied'))
    } catch {
      toast.error(tHistory('shareFailed'))
    }
  }, [conversation.sessionId, locale, tHistory])

  const historySessions = useMemo(
    () =>
      conversation.sessions.map((session) => ({
        id: session.id,
        title: session.title ?? tHistory('new'),
        updatedAt: session.updatedAt,
        messages: [],
      })),
    [conversation.sessions, tHistory],
  )

  // Bug fix 2026-07-27: return undefined (not the bare id) when the node no
  // longer exists (e.g. deleted after the assistant referenced it) — lets
  // AssistantConversation render a muted, non-clickable chip instead of
  // leaking the internal node id into the chat UI.
  const getNodeLabel = useCallback(
    (nodeId: string): string | undefined => {
      const nodeContext = nodeContexts.find((node) => node.id === nodeId)
      return nodeContext?.title
    },
    [nodeContexts],
  )

  const pickedNodes = useMemo(
    () =>
      pick.pickedNodeIds.map((id) => ({
        id,
        label: getNodeLabel(id) ?? tConversation('unknownNodeReference'),
      })),
    [getNodeLabel, pick.pickedNodeIds, tConversation],
  )

  const dockStarters = useMemo(() => {
    return [
      {
        id: 'scriptOutline',
        label: t('starters.scriptOutline.label'),
        prompt: t('starters.scriptOutline.prompt'),
      },
      {
        id: 'videoShot',
        label: t('starters.videoShot.label'),
        prompt: t('starters.videoShot.prompt'),
      },
      {
        id: 'firstPhase',
        label: t('starters.firstPhase.label'),
        prompt: t('starters.firstPhase.prompt'),
      },
    ]
  }, [t])

  // The opener line must reflect canvas state — claiming "still empty" while the
  // user has nodes (or an outline) reads as a bug. Switch to an active opener
  // once there's anything on the canvas.
  const opener =
    nodes.length > 0 || scriptDoc ? t('leanOpenerActive') : t('leanOpener')

  return (
    <>
      {historyPortalTarget
        ? createPortal(
            <CanvasAssistantHistoryPanel
              sessions={historySessions}
              activeSessionId={conversation.sessionId}
              onSelect={handleSelectHistory}
              fill
            />,
            historyPortalTarget,
          )
        : null}
      {!open ? (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          aria-label={tAssistant('toggle')}
          title={tAssistant('toggle')}
          style={
            isMobile
              ? { bottom: 'calc(6rem + var(--keyboard-inset, 0px))' }
              : undefined
          }
          // ⚠ whitespace-nowrap 是必需的，不是修饰（2026-08-02，owner 在日文
          // 版发现「图标跃出」）：本按钮 absolute 定位，而它的包含块 .rail 在
          // 收起态宽度是 **0**（CanvasWorkspaceLayout.module.css 有实测记录），
          // 于是 lg:size-auto 的 width:auto 走 shrink-to-fit 时可用宽度为 0，
          // 内容被压到最窄 —— 逐字换行。中文「助手」两字压成两行看着像是
          // 刻意的竖排（台账 G1 一度就是这么记的），日文「アシスタント」六字
          // 才把它暴露成明显的溢出：内容需要 67px 高，而 lg:h-10 只有 40px。
          className="canvas-assistant-fab pointer-events-auto absolute bottom-24 right-4 inline-flex size-12 items-center justify-center gap-2 whitespace-nowrap rounded-full border shadow-sm transition-colors lg:bottom-auto lg:right-6 lg:top-20 lg:size-auto lg:h-10 lg:rounded-lg lg:px-3 lg:text-xs lg:font-semibold lg:shadow-none"
        >
          <Bot
            className="size-5 lg:size-4"
            style={{ color: 'var(--canvas-ink-muted)' }}
          />
          <span className="hidden lg:inline">{tAssistant('toggle')}</span>
        </button>
      ) : null}

      <AssistantShell
        ref={dockRef}
        style={dockStyle}
        inert={!open}
        aria-hidden={!open}
        data-mode={expanded ? 'script' : 'chat'}
        className={cn(
          // Haivis §3.1「desktop 是贴边通高栏，无圆角/无投影」已被 owner
          // 2026-07-27 推翻（assistant-shell.md §1）：desktop 档现在也是
          // 浮动卡。圆角/投影不在这里写——canvas.css S11 的
          // `.canvas-assistant-surface` 在 lg: 断点接管（比节点卡 8px 大
          // 一档的 --canvas-pop-radius + --canvas-pop-shadow，浮层必须读
          // 出层级，节点卡刻意零投影，两者故意不同材质）。这里的 Tailwind
          // 类只剩两件事：lg:relative + lg:h-full lg:w-full 让这个 <aside>
          // 完全交给 CanvasWorkspaceLayout 的浮层容器（四边留白/宽高都在
          // 那边）；lg:border-b 补回 base 的 border-b-0（mobile 底部抽屉
          // 不要下边线）——桌面档浮动卡四边都要描边，其余三边 base 的
          // `border` 本来就有。
          // v0.2（2026-07-27）：canvas-assistant-surface 覆盖 AssistantShell
          // 默认的 bg-card（未分层类恒压过 Tailwind 分层 utility，见
          // canvas.css S8 头注），LoRA/Studio 两个消费者不挂这个类不受影响。
          'canvas-assistant-surface pointer-events-auto absolute inset-x-0 bottom-0 top-auto flex h-[65vh] animate-in flex-col overflow-hidden rounded-t-2xl border border-b-0 shadow-sm fade-in slide-in-from-bottom-4 duration-300 lg:relative lg:inset-auto lg:h-full lg:w-full lg:animate-none lg:border-b lg:transition-none',
          !open && 'hidden lg:flex lg:pointer-events-none lg:opacity-0',
        )}
      >
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label={t('collapse')}
          className="flex h-5 shrink-0 items-center justify-center lg:hidden"
        >
          <span
            className="canvas-assistant-handle h-1 w-10 rounded-full"
            aria-hidden
          />
        </button>

        <AssistantShellHeader
          title={tHistory('new')}
          subtitle={projectName}
          aria-label={t('drag')}
          tabIndex={0}
          {...dockDrag.handleProps}
          className="canvas-assistant-divider canvas-assistant-header-text cursor-grab touch-none select-none px-3 py-2.5 active:cursor-grabbing lg:px-4 lg:py-3"
          actions={
            <>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={tHistory('new')}
                onClick={handleNewConversation}
                className="canvas-assistant-ghost-btn rounded-xl"
              >
                <MessageSquarePlus className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={tConversation('research')}
                aria-pressed={researchEnabled}
                title={tConversation('researchHint')}
                onClick={() => setResearchEnabled((prev) => !prev)}
                className={cn(
                  'canvas-assistant-ghost-btn rounded-xl',
                  researchEnabled && 'canvas-assistant-action',
                )}
              >
                <Globe className="size-4" />
              </Button>
              <CanvasAssistantRouteSelector
                value={assistantRoute}
                onChange={setAssistantRoute}
                // 画布不选 key 时真的走 gateway（NODE_STUDIO_ASSISTANT.gatewayModelId
                // = openai/gpt-5.6-sol），所以报这个型号是实话。
                emptyRouteLabel={NODE_STUDIO_ASSISTANT_ROUTE_MODELS[0].label}
              />
              {isMobile ? (
                <CanvasAssistantHistory
                  sessions={historySessions}
                  activeSessionId={conversation.sessionId}
                  onSelect={handleSelectHistory}
                />
              ) : null}
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={tHistory('share')}
                title={tHistory('share')}
                onClick={() => void handleShareConversation()}
                className="canvas-assistant-ghost-btn rounded-xl"
              >
                <Share2 className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={expanded ? t('restore') : t('expand')}
                onClick={() => onExpandedChange(!expanded)}
                className="canvas-assistant-ghost-btn hidden rounded-xl lg:inline-flex"
              >
                {expanded ? (
                  <Minimize2 className="size-4" />
                ) : (
                  <Maximize2 className="size-4" />
                )}
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t('collapse')}
                onClick={() => onOpenChange(false)}
                className="canvas-assistant-ghost-btn rounded-xl"
              >
                <PanelRightClose className="size-4" />
              </Button>
            </>
          }
        />

        {expanded && !isMobile ? (
          <div className="flex min-h-0 flex-1">
            <div className="canvas-assistant-divider flex min-h-0 flex-1 flex-col border-r">
              <AssistantConversation
                messages={conversation.messages}
                isLoading={conversation.isLoading}
                error={conversation.error}
                onSend={handleSend}
                onRetry={handleRetry}
                onFocusNode={onFocusNode}
                getNodeLabel={getNodeLabel}
                emptyHint={opener}
                starters={dockStarters}
                referenceOptions={referenceOptions}
                selectedReferences={selectedReferences}
                onSelectedReferencesChange={setSelectedReferences}
                canUseReference={canUseReference}
                pickedNodes={pickedNodes}
                onRemovePickedNode={pick.unpickNode}
                pickArmed={pick.armed}
                onPickToggle={pick.toggle}
                onComposerFocus={pick.arm}
                composerRef={composerRef}
                onRunCapability={handleRunCapability}
                planAssistantOps={planAssistantOps}
                onApplyAssistantOps={handleApplyAssistantOps}
                autoAppliedByMessageId={autoAppliedByMessageId}
                autoFailedConnectsByMessageId={autoFailedConnectsByMessageId}
                onUndoAutoApply={undo}
              />
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <ScriptDocWorkspace
                scriptDoc={scriptDoc}
                messages={conversation.messages}
                locale={locale}
                apiKeyId={assistantRoute.apiKeyId}
              />
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <AssistantConversation
              messages={conversation.messages}
              isLoading={conversation.isLoading}
              error={conversation.error}
              onSend={handleSend}
              onRetry={handleRetry}
              onFocusNode={onFocusNode}
              getNodeLabel={getNodeLabel}
              emptyHint={opener}
              starters={dockStarters}
              referenceOptions={referenceOptions}
              selectedReferences={selectedReferences}
              onSelectedReferencesChange={setSelectedReferences}
              canUseReference={canUseReference}
              pickedNodes={pickedNodes}
              onRemovePickedNode={pick.unpickNode}
              pickArmed={pick.armed}
              onPickToggle={pick.toggle}
              onComposerFocus={pick.arm}
              composerRef={composerRef}
              onRunCapability={handleRunCapability}
              planAssistantOps={planAssistantOps}
              onApplyAssistantOps={handleApplyAssistantOps}
              autoAppliedByMessageId={autoAppliedByMessageId}
              autoFailedConnectsByMessageId={autoFailedConnectsByMessageId}
              onUndoAutoApply={undo}
            />
          </div>
        )}
      </AssistantShell>
    </>
  )
}
