'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  NODE_ASSISTANT_OP_V4_IDS,
  NODE_ASSISTANT_OP_V4_SPECS,
  NODE_ASSISTANT_OP_V4_TIER_IDS,
} from '@/constants/node-assistant-ops'
import {
  NODE_STUDIO_ASSISTANT_LIMITS,
  NODE_STUDIO_ASSISTANT_ROUTE_MODELS,
  NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS,
} from '@/constants/node-studio'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
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
import {
  subscribeCanvasRerunDownstream,
  takeCanvasRerunDownstream,
} from '@/lib/canvas-rerun-request'
import { resolveV4NodeReadableName } from '@/lib/node-assistant-context'
import {
  planNodeAssistantOpsV4,
  type PlannedNodeAssistantOpV4,
} from '@/lib/node-assistant-op-plan'
import { buildRerunDownstreamPlan } from '@/lib/node-rerun-downstream'
import type { AppLocale } from '@/i18n/routing'
import type { NodeAssistantMediaReference } from '@/types/node-assistant'
import type { NodeAssistantOpV4Batch } from '@/types/node-assistant-ops'
import type { NodeV4, NodeWorkflowEdgeV4 } from '@/types/node-workflow'
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
   * 画布 v4 整图 —— 助手的上下文（模型能看见什么）、`@` 候选、提案卡的规划都读它。
   *
   * ⚠ ③e 把 `edges` 接了回来，但**入参与 ③d-4 删掉的那个不是一回事**：v4 判的是
   * 「这条边进哪个具名槽」，所以带的是 `NodeWorkflowEdgeV4`（`slot` 必填），
   * ⛔ 不是 v3 那份无槽边。
   */
  nodes: readonly NodeV4[]
  edges: readonly NodeWorkflowEdgeV4[]
  scriptDoc: ScriptDoc | undefined
  locale: AppLocale
  onOpenChange(open: boolean): void
  onExpandedChange(expanded: boolean): void
  onFocusNode(nodeId: string): void
  historyPortalTarget?: HTMLElement | null
}

/**
 * 媒体没有记录固有尺寸时，能力调用（放大 / 去背）要报一个方框。
 *
 * ⚠ 这不是「默认尺寸」而是**兜底**：真实尺寸从上传/生成回填（`mediaWidth` /
 * `mediaHeight`），存量素材才落到这里。
 */
const CANVAS_CAPABILITY_FALLBACK_SIZE = 1024

function isHttpMediaUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function getAssistantMediaReferences(
  nodes: readonly NodeV4[],
): NodeAssistantMediaReference[] {
  const references: NodeAssistantMediaReference[] = []

  for (const node of nodes) {
    if (node.data.kind === NODE_MEDIA_KIND_IDS.text) continue
    const url = node.data.url?.trim() ?? ''
    // Schema requires absolute http(s) URLs — skip data/blob/relative paths.
    if (!url || !isHttpMediaUrl(url)) continue

    // ⚠ 只有图和视频进得了附件：音频这条路模型收不下（`assistantAdapterAccepts…`
    // 的两个 kind 就是全部），⛔ 不在这里给它编一个 kind。
    const kind =
      node.data.kind === NODE_MEDIA_KIND_IDS.video
        ? 'video'
        : node.data.kind === NODE_MEDIA_KIND_IDS.image
          ? 'image'
          : null
    if (!kind) continue

    const videoThumb = node.data.videoThumbnailUrl?.trim()
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
      // v4 的稳定名就是显示名（`data.name` / 镜头的 `label`）——⛔ 不再走 v3 那条
      // 七字段优先链，也不再拿类型标签兜底：v4 节点建出来就有名字。
      label: resolveV4NodeReadableName(node.data),
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
  historyPortalTarget,
}: StudioNodeAssistantDockProps) {
  const t = useTranslations('StudioNode.dock')
  const tAssistant = useTranslations('StudioNode.assistant')
  const tHistory = useTranslations('StudioNode.history')
  const tConversation = useTranslations('StudioNode.conversation')
  const tCanvasOps = useTranslations('StudioNode.canvasOps')
  const tRerun = useTranslations('StudioNode.rerunDownstream')
  const selection = useNodeSelection()
  const { placeDerivedImages, focusNode, runAssistantOps, undo } =
    useNodeCanvasActions()
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

  const selectedNodeIds = useMemo(
    () =>
      selection.nodes
        .map((node) => node.id)
        .slice(0, NODE_STUDIO_ASSISTANT_LIMITS.maxSelectedNodes),
    [selection.nodes],
  )

  /**
   * 用户「现在在哪一镜」—— 快照据此把这一镜与相邻两镜升成完整档。
   *
   * ⚠ 判据是**选中**，不是视口：视口里可能同时躺着五镜，取哪一镜要一条新规则，
   * 而选中是用户刚刚点过的那个，没有歧义。什么都没选就不给 —— ⛔ 不猜一个镜号，
   * 猜错等于把三镜的完整结构花在了用户根本没在看的地方。
   */
  const currentShotNo = useMemo(() => {
    for (const selected of selection.nodes) {
      const node = nodes.find((candidate) => candidate.id === selected.id)
      if (node?.data.shotNo !== undefined) return node.data.shotNo
    }
    return undefined
  }, [nodes, selection.nodes])

  const referenceOptions = useMemo(
    () => getAssistantMediaReferences(nodes),
    [nodes],
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
      nodes,
      edges,
      ...(currentShotNo === undefined ? {} : { currentShotNo }),
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
      currentShotNo,
      edges,
      locale,
      nodes,
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

  /**
   * 画布右键菜单投来的「重跑下游」（第三期）。
   *
   * ⭐ 它走的是**和用户自己打字一模一样的那条路**（`handleSend`）：一条带
   * `[[node:…]]` 标记的普通消息。⛔ 不为它开一条专用请求 —— 专用路径意味着这一
   * 条消息不进对话历史、不进上下文快照，而助手下一轮就会「不记得刚才在说哪个
   * 节点」。
   * ⚠ **只开面板不自动批准**：助手接下来出的是一份只读名单，真要重跑还得过
   *   `generate` 那道硬确认。
   * ⚠ 取走即消费（见 `takeCanvasRerunDownstream` 头注）：dock 会随折叠 / 展开
   *   重挂，留着那张便条会让同一句话被发第二遍。
   */
  useEffect(
    () =>
      subscribeCanvasRerunDownstream(() => {
        const nodeId = takeCanvasRerunDownstream()
        if (!nodeId) return
        const node = nodes.find((candidate) => candidate.id === nodeId)
        if (!node) return
        onOpenChange(true)
        void handleSend(
          `${tRerun('ask', {
            name: resolveV4NodeReadableName(node.data),
          })} [[node:${nodeId}]]`,
        )
      }),
    [handleSend, nodes, onOpenChange, tRerun],
  )

  const handleRetry = useCallback(async () => {
    await conversation.retry(buildConversationContext())
  }, [buildConversationContext, conversation])

  const handleRunCapability = useCallback(
    async ({ capability, nodeId }: AssistantCapabilityReference) => {
      const node = nodes.find((candidate) => candidate.id === nodeId)
      // v4 的媒体只有**一个**产物字段（`data.url`）——v3 的 `mediaUrl` /
      // `imageUrl` 两条在迁移里合流到它，⛔ 这里不再问第二个字段。
      const sourceUrl =
        node && node.data.kind !== NODE_MEDIA_KIND_IDS.text
          ? (node.data.url?.trim() ?? '')
          : ''
      if (!node || !sourceUrl) {
        toast.error(tConversation('capabilityUnavailable'))
        return
      }

      const meta =
        node.data.kind === NODE_MEDIA_KIND_IDS.text ? undefined : node.data
      const sourceWidth =
        meta?.mediaWidth && meta.mediaWidth > 0
          ? meta.mediaWidth
          : CANVAS_CAPABILITY_FALLBACK_SIZE
      const sourceHeight =
        meta?.mediaHeight && meta.mediaHeight > 0
          ? meta.mediaHeight
          : CANVAS_CAPABILITY_FALLBACK_SIZE
      const descriptor = canvasCapabilityRuntime.open(capability)
      const response = await canvasCapabilityRuntime.run(
        capability === 'upscale'
          ? {
              capability,
              target: {
                sourceUrl,
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
   * 一份提案 → 「哪些能做、哪些不能以及为什么」（③e 接回）。
   *
   * ⚠ 规划必须发生在 dock：只有它看得到 nodes/edges。合法性问的是 v4 的
   * `evaluateV4Ingest`（与拖拽落槽、端口点亮同一个函数）—— 助手和人手因此永远
   * 拿到同一个答案。
   */
  const planAssistantOps = useCallback(
    (batch: NodeAssistantOpV4Batch) =>
      planNodeAssistantOpsV4(batch.ops, nodes, edges),
    [edges, nodes],
  )

  /**
   * 「只重跑下游」那份**只读名单**（第三期）。
   *
   * ⚠ 同样只能发生在 dock：下游是**图算出来的**（`collectDownstream`），而只有
   * 这里看得到 nodes/edges。⛔ 不让模型自己列名单 —— 漏一个分支用户拿到的是一份
   * 前后不一致的成片，多列一个是白花的钱。
   * ⚠ 一批里只认**第一条** `plan_rerun_downstream`：一次问「改了哪一个」只该有
   *   一个答案，两张名单并排摆着没有人读得懂哪张是这一次的。
   */
  const planRerunDownstream = useCallback(
    (batch: NodeAssistantOpV4Batch) => {
      const op = batch.ops.find(
        (entry) => entry.op === NODE_ASSISTANT_OP_V4_IDS.planRerunDownstream,
      )
      if (!op || op.op !== NODE_ASSISTANT_OP_V4_IDS.planRerunDownstream) {
        return null
      }
      return buildRerunDownstreamPlan({
        targetId: op.target,
        ...(op.includeSelf === undefined
          ? {}
          : { includeSelf: op.includeSelf }),
        nodes,
        edges,
      })
    },
    [edges, nodes],
  )

  const handleApplyAssistantOps = useCallback(
    async (ops: readonly PlannedNodeAssistantOpV4[]) => {
      const result = await runAssistantOps(ops)
      if (result.applied > 0) {
        toast.success(tCanvasOps('appliedToast', { count: result.applied }))
      }
      return result
    },
    [runAssistantOps, tCanvasOps],
  )

  /**
   * 结构 op 的**自动落**（brief §5 第一档：免费动作直做，留一个撤销步）。
   *
   * ⚠ 「恰好一次」的账记在这里，⛔ 不在按消息渲染的卡里：流式期间同一条消息会
   * 重渲染几十次，浮卡还能被开开关关 —— 判据放在卡上就会重复落图。`seenRef` 只
   * 进不出，一条消息落过就永远不再落。
   */
  const autoAppliedRef = useRef<Set<string>>(new Set())
  const [autoAppliedByMessageId, setAutoAppliedByMessageId] = useState<
    Record<string, number>
  >({})
  const [autoFailedConnectsByMessageId, setAutoFailedConnectsByMessageId] =
    useState<Record<string, number>>({})

  useEffect(() => {
    if (conversation.isLoading) return
    for (const message of conversation.messages) {
      if (!message.ops || autoAppliedRef.current.has(message.id)) continue
      autoAppliedRef.current.add(message.id)
      const plan = planNodeAssistantOpsV4(message.ops.ops, nodes, edges)
      // 自动落只收**免费且不覆盖手写内容**的那一档：`delete` / `generate` 与
      // 三选那批留给卡上的按钮。判据与卡完全同源（都问 `planNodeAssistantOpsV4`）。
      const auto = plan.ops.filter(
        (entry) =>
          entry.status === 'ready' &&
          NODE_ASSISTANT_OP_V4_SPECS[entry.op.op].tier ===
            NODE_ASSISTANT_OP_V4_TIER_IDS.free &&
          entry.requiresChoice !== true,
      )
      if (auto.length === 0) continue
      void runAssistantOps(auto).then((result) => {
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
    edges,
    nodes,
    runAssistantOps,
  ])

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
      const node = nodes.find((candidate) => candidate.id === nodeId)
      return node ? resolveV4NodeReadableName(node.data) : undefined
    },
    [nodes],
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
                planAssistantOps={planAssistantOps}
                planRerunDownstream={planRerunDownstream}
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
              canUseReference={canUseReference}
              onRunCapability={handleRunCapability}
              planAssistantOps={planAssistantOps}
              planRerunDownstream={planRerunDownstream}
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
