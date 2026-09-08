'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
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
  NODE_STUDIO_ASSISTANT_ROUTE_MODELS,
  NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS,
} from '@/constants/node-studio'
import { NODE_MEDIA_KIND_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { assistantAdapterAcceptsReferenceKind } from '@/constants/assistant'
import {
  VIDEO_ANALYSIS_TASKS,
  VIDEO_ANALYSIS_TASK_TIERS,
} from '@/constants/video-analysis'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  useAssistantConversation,
  type AssistantCapabilityReference,
} from '@/hooks/use-assistant-conversation'
import { useIsMobile } from '@/hooks/use-mobile'
import { useCanvasAssistantDrag } from '@/hooks/node/use-canvas-assistant-drag'
import { useNodeSelection } from '@/hooks/node/use-node-selection'
import { useNodeCanvasActions } from './nodes/v4/NodeV4ActionsBridge'
import { canvasCapabilityRuntime } from '@/lib/canvas-capability-runtime'
import { buildNodeAssistantNodeContexts } from '@/lib/node-assistant-context'
import { resolveNodeDisplayName } from '@/lib/node-display-name'
import type { AppLocale } from '@/i18n/routing'
import type {
  NodeAssistantMediaReference,
  NodeAssistantNodeContext,
} from '@/types/node-assistant'
import type {
  NodeWorkflowEdge,
  NodeWorkflowModelOptionsByType,
  NodeWorkflowNode,
} from '@/types/node-workflow'
import type { ScriptDoc } from '@/types/script-doc'

import { AssistantConversation } from './AssistantConversation'
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
  /**
   * 画布上的节点 —— 助手的**上下文投影**（模型能看见什么）与 `@` 候选都读它。
   *
   * ⚠ ③d-4 一并删掉了 `edges` 与 `modelOptionsByType` 两个 prop：它们只服务
   * 已经删掉的 v3 op 规划器（连线重复判定 / `set_model` 取值范围）。③e 用 v4
   * 规划器接回来时，要的入参与它们并不相同（v4 判的是**槽**），⛔ 不留着两个空转
   * 的 prop 假装接口还在。
   */
  nodes: NodeWorkflowNode[]
  scriptDoc: ScriptDoc | undefined
  locale: AppLocale
  onOpenChange(open: boolean): void
  onExpandedChange(expanded: boolean): void
  onFocusNode(nodeId: string): void
  historyPortalTarget?: HTMLElement | null
}

function isHttpMediaUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function getAssistantMediaReferences(
  nodes: NodeWorkflowNode[],
  getNodeTypeLabel: (type: NodeWorkflowNode['type']) => string,
): NodeAssistantMediaReference[] {
  const references: NodeAssistantMediaReference[] = []

  for (const node of nodes) {
    const url =
      typeof node.data.mediaUrl === 'string' && node.data.mediaUrl.trim()
        ? node.data.mediaUrl.trim()
        : typeof node.data.imageUrl === 'string' && node.data.imageUrl.trim()
          ? node.data.imageUrl.trim()
          : ''
    // Schema requires absolute http(s) URLs — skip data/blob/relative paths.
    if (!url || !isHttpMediaUrl(url)) continue

    const kind =
      node.data.mediaKind === NODE_MEDIA_KIND_IDS.video ||
      node.type === NODE_TYPE_IDS.seedance ||
      node.type === NODE_TYPE_IDS.videoReference ||
      node.type === NODE_TYPE_IDS.videoMerge
        ? 'video'
        : node.data.mediaKind === NODE_MEDIA_KIND_IDS.image ||
            node.type === NODE_TYPE_IDS.image ||
            node.type === NODE_TYPE_IDS.characterImage ||
            node.type === NODE_TYPE_IDS.backgroundImage ||
            node.type === NODE_TYPE_IDS.frameImage ||
            node.type === NODE_TYPE_IDS.shot
          ? 'image'
          : null
    if (!kind) continue

    // 画布修法 08-A：直接读 mediaLabel/sourceLabel 绕开了机器值守卫——
    // 「选已有图」写入口把上传备注常量当名字写进这两个字段时，@ 菜单候选名
    // 会照单展示那串机器备注。改走共享解析器，顺带也能认出 characterName 等
    // 专有身份字段（原逻辑不认）。
    const label =
      resolveNodeDisplayName(node.data) || getNodeTypeLabel(node.type)
    const videoThumb =
      typeof node.data.videoThumbnailUrl === 'string'
        ? node.data.videoThumbnailUrl.trim()
        : ''
    references.push({
      id: `node-reference:${node.id}`,
      nodeId: node.id,
      source: 'canvas',
      kind,
      url,
      ...(kind === 'video' && videoThumb && isHttpMediaUrl(videoThumb)
        ? { thumbnailUrl: videoThumb }
        : kind === 'image'
          ? { thumbnailUrl: url }
          : {}),
      label,
    })
  }

  return references.slice(0, NODE_STUDIO_ASSISTANT_LIMITS.maxReferences)
}

export function StudioNodeAssistantDock({
  open,
  expanded,
  projectId,
  projectName,
  nodes,
  scriptDoc,
  locale,
  onOpenChange,
  onExpandedChange,
  onFocusNode,
  historyPortalTarget,
}: StudioNodeAssistantDockProps) {
  const t = useTranslations('StudioNode.dock')
  const tAssistant = useTranslations('StudioNode.assistant')
  const tHistory = useTranslations('StudioNode.history')
  const tNodeTypes = useTranslations('StudioNode.nodeTypes')
  const tConversation = useTranslations('StudioNode.conversation')
  const selection = useNodeSelection()
  const { placeDerivedImages, focusNode } = useNodeCanvasActions()
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

  const selectedNodeIds = useMemo(
    () =>
      selection.nodes
        .map((node) => node.id)
        .slice(0, NODE_STUDIO_ASSISTANT_LIMITS.maxSelectedNodes),
    [selection.nodes],
  )

  const referenceOptions = useMemo(
    () => getAssistantMediaReferences(nodes, tNodeTypes),
    [nodes, tNodeTypes],
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
        assistantRoute.modelId,
      ),
    [assistantRoute.adapterType, assistantRoute.modelId],
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

  const handleSend = useCallback(
    async (content: string, references?: NodeAssistantMediaReference[]) => {
      setLastReferences(references ?? [])
      await conversation.send(content, {
        ...buildConversationContext(),
        references: references ?? [],
      })
    },
    [buildConversationContext, conversation],
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
      const derivedNodeIds = placeDerivedImages(node.id, response.outputs)
      if (derivedNodeIds[0]) focusNode(derivedNodeIds[0])
    },
    [focusNode, nodes, placeDerivedImages, tConversation],
  )

  /**
   * ⚠ **助手写画布这条路在 C3c-③d-4 断开了**（③e 接回）。
   *
   * v3 规划器（`planNodeAssistantOps`）随画布翻转一起删了 —— 它答的是「一节点一
   * 入口能不能连」，而 v4 的目标有多个具名口，那个问题没有对象。同时
   * `runAssistantOps` 今天把每一条都记成 skipped（见 `NodeV4ActionsBridge`）。
   *
   * 所以本 dock **不再向 `AssistantConversation` 传** `planAssistantOps` /
   * `onApplyAssistantOps`：提案卡因此整张不渲染。⛔ 不留一张点了什么都不会发生的
   * 卡 —— 一个「已应用 0 项」的回执比没有卡更让人以为坏了。原来的「结构 op 自动
   * 落」（按消息 id 恰好一次、连线失败单独记账）随之一并下线，③e 用 v4 规划器
   * （`planV4Connect`）重建时连同它的去重纪律一起搬回来。
   */

  const handleNewConversation = useCallback(() => {
    conversation.clear()
  }, [conversation])

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
          className="canvas-assistant-fab pointer-events-auto absolute bottom-24 right-4 inline-flex size-12 items-center justify-center gap-2 whitespace-nowrap rounded-full border shadow-sm transition-colors lg:hidden"
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
                canUseReference={canUseReference}
                onRunCapability={handleRunCapability}
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
              canUseReference={canUseReference}
              onRunCapability={handleRunCapability}
            />
          </div>
        )}
      </AssistantShell>
    </>
  )
}
