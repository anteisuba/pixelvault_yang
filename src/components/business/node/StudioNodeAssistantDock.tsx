'use client'

import { useCallback, useMemo, useState } from 'react'
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
  NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS,
} from '@/constants/node-studio'
import { NODE_MEDIA_KIND_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  useAssistantConversation,
  type AssistantCapabilityReference,
} from '@/hooks/use-assistant-conversation'
import { useIsMobile } from '@/hooks/use-mobile'
import { useNodeSelection } from '@/hooks/node/use-node-selection'
import { useNodeWorkflowActions } from './NodeWorkflowActionsContext'
import { canvasCapabilityRuntime } from '@/lib/canvas-capability-runtime'
import {
  planNodeAssistantOps,
  type PlannedNodeAssistantOp,
} from '@/lib/node-assistant-op-plan'
import { resolveNodeDisplayName } from '@/lib/node-display-name'
import type { AppLocale } from '@/i18n/routing'
import type {
  NodeAssistantMediaReference,
  NodeAssistantNodeContext,
} from '@/types/node-assistant'
import type { NodeAssistantOpBatch } from '@/types/node-assistant-ops'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'
import type { ScriptDoc } from '@/types/script-doc'

import { AssistantConversation } from './AssistantConversation'
import { CanvasAssistantHistory } from './CanvasAssistantHistory'
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
  scriptDoc: ScriptDoc | undefined
  locale: AppLocale
  onOpenChange(open: boolean): void
  onExpandedChange(expanded: boolean): void
  onFocusNode(nodeId: string): void
}

function truncateNodeText(value: string, maxLength: number): string {
  const trimmed = value.trim()
  return trimmed.length > maxLength
    ? `${trimmed.slice(0, Math.max(0, maxLength - 3))}...`
    : trimmed
}

/**
 * 助手 payload 里的 `title` —— **必须是画布上显示的那个名字**。
 *
 * ⚠ 这里曾经是包 4.5 要修的洞：旧实现只认合并前的 `characterImage`（角色早已是
 * `image` + `role=character`，那个分支一次都不会命中），其余类型一律返回
 * `fallbackTitle`，也就是本地化的**类型标签**。于是助手看到的是「图片 / 镜头文本
 * / 视频生成」，用户改的「雨夜开场镜」和角色名「小林」它一个都拿不到，`@` 按名字
 * 引用因此不可能成立。
 *
 * 修法是接上**共享的显示名事实源**，而不是在这里再加一层兜底 —— 再写一套就是
 * 同一个错误的第五份副本。
 */
function getNodeTitle(node: NodeWorkflowNode, fallbackTitle: string): string {
  // agent 的标题来自它自己的计划/分镜产物，不属于通用显示名链，单独保留。
  if (node.type === NODE_TYPE_IDS.agent) {
    return (
      node.data.seedancePromptPlan?.title ??
      node.data.breakdown?.title ??
      fallbackTitle
    )
  }

  return resolveNodeDisplayName(node.data) ?? fallbackTitle
}

function getNodeSummary(node: NodeWorkflowNode): string | undefined {
  if (node.type === NODE_TYPE_IDS.agent) {
    return (
      node.data.seedancePromptPlan?.finalPrompt ??
      node.data.breakdown?.logline ??
      node.data.generationError
    )
  }

  if (node.type === NODE_TYPE_IDS.characterImage) {
    return node.data.prompt || node.data.imageUrl
  }

  return node.data.prompt
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

    const label =
      node.data.mediaLabel?.trim() ||
      node.data.sourceLabel?.trim() ||
      getNodeTypeLabel(node.type)
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
  edges,
  scriptDoc,
  locale,
  onOpenChange,
  onExpandedChange,
  onFocusNode,
}: StudioNodeAssistantDockProps) {
  const t = useTranslations('StudioNode.dock')
  const tAssistant = useTranslations('StudioNode.assistant')
  const tHistory = useTranslations('StudioNode.history')
  const tNodeTypes = useTranslations('StudioNode.nodeTypes')
  const tConversation = useTranslations('StudioNode.conversation')
  const tCanvasOps = useTranslations('StudioNode.canvasOps')
  const selection = useNodeSelection()
  const { placeDerivedImages, focusNode, runAssistantCanvasOps } =
    useNodeWorkflowActions()
  const conversation = useAssistantConversation({ projectId, persist: true })
  const [assistantRoute, setAssistantRoute] =
    useState<NodeAssistantRouteSelection>({
      optionId: NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS.auto,
    })
  const [researchEnabled, setResearchEnabled] = useState(false)
  const [lastReferences, setLastReferences] = useState<
    NodeAssistantMediaReference[]
  >([])
  const isMobile = useIsMobile()

  const dockStyle = isMobile
    ? {
        bottom: 'var(--keyboard-inset, 0px)',
        height:
          'min(65svh, calc(100svh - var(--keyboard-inset, 0px) - 0.75rem))',
        maxHeight: 'calc(100svh - var(--keyboard-inset, 0px) - 0.75rem)',
      }
    : undefined

  const nodeContexts = useMemo<NodeAssistantNodeContext[]>(
    () =>
      nodes.slice(0, NODE_STUDIO_ASSISTANT_LIMITS.maxNodes).map((node) => {
        const fallbackTitle = tNodeTypes(node.type)
        const summary = getNodeSummary(node)

        return {
          id: node.id,
          type: node.type,
          status: node.data.status,
          title: truncateNodeText(
            getNodeTitle(node, fallbackTitle),
            NODE_STUDIO_ASSISTANT_LIMITS.maxNodeLabelLength,
          ),
          summary: summary
            ? truncateNodeText(
                summary,
                NODE_STUDIO_ASSISTANT_LIMITS.maxNodeSummaryLength,
              )
            : undefined,
        }
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

  const buildConversationContext = useCallback(
    () => ({
      nodes: nodeContexts,
      selectedNodeIds,
      references: lastReferences,
      locale,
      apiKeyId: assistantRoute.apiKeyId,
      research: researchEnabled,
    }),
    [
      assistantRoute.apiKeyId,
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
    (batch: NodeAssistantOpBatch) => planNodeAssistantOps(batch, nodes, edges),
    [edges, nodes],
  )

  const handleApplyAssistantOps = useCallback(
    async (ops: readonly PlannedNodeAssistantOp[]) => {
      if (!runAssistantCanvasOps) {
        return { applied: 0, skipped: ops.length, createdNodeIds: [] }
      }
      const result = await runAssistantCanvasOps(ops)
      if (result.applied > 0) {
        toast.success(tCanvasOps('appliedToast', { count: result.applied }))
      }
      return result
    },
    [runAssistantCanvasOps, tCanvasOps],
  )

  const handleNewConversation = useCallback(() => {
    conversation.clear()
  }, [conversation])

  const handleSelectHistory = useCallback(
    (id: string) => {
      void conversation.selectSession(id)
    },
    [conversation],
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
          className="canvas-assistant-fab pointer-events-auto absolute bottom-24 right-4 inline-flex size-12 items-center justify-center gap-2 rounded-full border shadow-sm transition-colors lg:bottom-auto lg:right-6 lg:top-20 lg:size-auto lg:h-10 lg:rounded-lg lg:px-3 lg:text-xs lg:font-semibold lg:shadow-none"
        >
          <Bot
            className="size-5 lg:size-4"
            style={{ color: 'var(--canvas-ink-muted)' }}
          />
          <span className="hidden lg:inline">{tAssistant('toggle')}</span>
        </button>
      ) : null}

      <AssistantShell
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
          'canvas-assistant-surface pointer-events-auto absolute inset-x-0 bottom-0 top-auto flex h-[65vh] animate-in flex-col overflow-hidden rounded-t-2xl border border-b-0 shadow-sm fade-in slide-in-from-bottom-4 duration-300 lg:relative lg:inset-auto lg:h-full lg:w-full lg:animate-none lg:border-b',
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
          className="canvas-assistant-divider canvas-assistant-header-text px-3 py-2.5 lg:px-4 lg:py-3"
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
              />
              <CanvasAssistantHistory
                sessions={historySessions}
                activeSessionId={conversation.sessionId}
                onSelect={handleSelectHistory}
              />
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
                onRunCapability={handleRunCapability}
                planAssistantOps={planAssistantOps}
                onApplyAssistantOps={handleApplyAssistantOps}
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
              onRunCapability={handleRunCapability}
              planAssistantOps={planAssistantOps}
              onApplyAssistantOps={handleApplyAssistantOps}
            />
          </div>
        )}
      </AssistantShell>
    </>
  )
}
