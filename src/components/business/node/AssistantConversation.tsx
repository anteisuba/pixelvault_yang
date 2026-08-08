'use client'

import { useCallback, useMemo, useRef, useState, type FormEvent } from 'react'
import type { Components } from 'react-markdown'
import {
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  RefreshCcw,
  SendHorizontal,
  Video,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { CodeBlock, CodeBlockCode } from '@/components/ui/code-block'
import { Markdown } from '@/components/ui/markdown'
import { Spinner } from '@/components/ui/spinner'
import type { AssistantConversationMessage } from '@/hooks/use-assistant-conversation'
import type { AssistantCapabilityReference } from '@/hooks/use-assistant-conversation'
import { NODE_STUDIO_ASSISTANT_MESSAGE_PREVIEW } from '@/constants/node-studio'
import { MentionInput, type MentionToken } from './composer/MentionInput'
import { cn } from '@/lib/utils'
import type {
  NodeAssistantOpPlan,
  PlannedNodeAssistantOp,
} from '@/lib/node-assistant-op-plan'
import type { NodeAssistantMediaReference } from '@/types/node-assistant'
import type { NodeAssistantOpBatch } from '@/types/node-assistant-ops'

import { CanvasAssistantReferencePicker } from './CanvasAssistantReferencePicker'
import { CanvasOpProposalCard } from './CanvasOpProposalCard'
import type { NodeAssistantOpRunResult } from './NodeWorkflowActionsContext'

interface AssistantConversationProps {
  messages: AssistantConversationMessage[]
  isLoading: boolean
  error: string | null
  onSend(
    content: string,
    references?: NodeAssistantMediaReference[],
  ): Promise<void>
  onRetry(): Promise<void>
  onFocusNode(nodeId: string): void
  /** undefined = the node no longer exists (e.g. deleted) — rendered as a
   *  muted, non-clickable chip instead of a clickable one. */
  getNodeLabel(nodeId: string): string | undefined
  /** Optional override for the empty-state opener line (E1 lean front door). */
  emptyHint?: string
  /** Optional starter chips shown in the empty state; clicking prefills the
   *  draft so the user can review before sending (E1 「1 句起手 + 3 短 chips」). */
  starters?: { id: string; label: string; prompt: string }[]
  /** Image/video nodes available as references for the next assistant turn. */
  referenceOptions?: NodeAssistantMediaReference[]
  canUseReference?(reference: NodeAssistantMediaReference): boolean
  onRunCapability?(reference: AssistantCapabilityReference): Promise<void>
  /**
   * 包 5：把一份提案排成「哪些能做、哪些不能以及为什么」。由 dock 提供 —— 只有
   * 它看得到 nodes/edges，对话组件自己不认识图。两个回调缺任何一个就不出提案卡
   * （测试里的 mock 因此不必跟着补）。
   */
  planAssistantOps?(batch: NodeAssistantOpBatch): NodeAssistantOpPlan
  onApplyAssistantOps?(
    ops: readonly PlannedNodeAssistantOp[],
  ): Promise<NodeAssistantOpRunResult>
  /**
   * B3：哪些消息的结构 op 已经自动落了画布，各落了几条。**由 dock 记账**——
   * 「恰好一次」的判定要跨流式重渲染与浮卡开关，不能放在按消息渲染的卡里。
   */
  autoAppliedByMessageId?: Record<string, number>
  /** B3：自动落之后那一步「撤销」。B2.5 之后整批只占一个撤销步。 */
  onUndoAutoApply?(): void
}

/**
 * 台账 G3：Markdown 原语默认的 `code` 组件给内联代码挂死类
 * `bg-primary-foreground` —— 那是脊柱令牌，在助手气泡（#f1f1f1）上无论翻成
 * 黑还是白都不成立。改用画布域自己的控件填充色。
 *
 * ⚠ `components` 是**整体替换**不是合并（markdown.tsx 的默认参数），所以
 * `pre` 也要一并给出，否则围栏代码块会套上浏览器默认的 <pre> 样式。
 */
const CANVAS_MARKDOWN_COMPONENTS: Partial<Components> = {
  code: function CanvasCode({ className, children, ...props }) {
    const isInline =
      !props.node?.position?.start.line ||
      props.node?.position?.start.line === props.node?.position?.end.line

    if (isInline) {
      return (
        <span
          className={cn(
            'canvas-md-inline-code rounded-sm px-1 font-mono',
            className,
          )}
          {...props}
        >
          {children}
        </span>
      )
    }

    const language = className?.match(/language-(\w+)/)?.[1] ?? 'plaintext'
    return (
      <CodeBlock className={className}>
        <CodeBlockCode code={children as string} language={language} />
      </CodeBlock>
    )
  },
  pre: function CanvasPre({ children }) {
    return <>{children}</>
  },
}

function getAssistantMessagePreview(content: string): string {
  const firstParagraph = content.trim().split(/\r?\n\s*\r?\n/, 1)[0] ?? ''
  const normalized = firstParagraph.replace(/\s+/g, ' ').trim()
  if (
    normalized.length <= NODE_STUDIO_ASSISTANT_MESSAGE_PREVIEW.maxPreviewChars
  ) {
    return normalized
  }
  return `${normalized
    .slice(0, NODE_STUDIO_ASSISTANT_MESSAGE_PREVIEW.maxPreviewChars)
    .trimEnd()}…`
}

export function AssistantConversation({
  messages,
  isLoading,
  error,
  onSend,
  onRetry,
  onFocusNode,
  getNodeLabel,
  emptyHint,
  starters,
  referenceOptions = [],
  canUseReference = () => true,
  onRunCapability,
  planAssistantOps,
  onApplyAssistantOps,
  autoAppliedByMessageId,
  onUndoAutoApply,
}: AssistantConversationProps) {
  const t = useTranslations('StudioNode.conversation')
  const tAssistant = useTranslations('PromptAssistant')
  const [draft, setDraft] = useState('')
  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [selectedReferences, setSelectedReferences] = useState<
    NodeAssistantMediaReference[]
  >([])
  const unsupportedReference = selectedReferences.find(
    (reference) => !canUseReference(reference),
  )

  // A4：`@` 的三件套 —— 胶囊渲染用的 tokens、把选中素材写进句子、以及 `@`
  // 这个补充入口。⚠ 选择器仍然是入口本体，`@` 只是「不想翻列表」时的快捷方式
  // （对标产品那边也是这样：独立的选择按钮一直在）。
  const [pickerOpen, setPickerOpen] = useState(false)
  /**
   * 这次开选择器是不是 `@` 触发的。
   *
   * ⚠ **只有 `@` 那条路才把胶囊写进句子。** 第一版是「选中任何素材都插胶囊」，
   * 结果草稿永远非空，直接砸掉了一条已确认契约：`assistant-shell.md` §4「用户
   * 可只附附件发送，客户端用本地化的『请分析这些参考素材』作为该轮指令」。
   * 附件按钮＝挂附件，`@`＝把引用写进句子里，两种意图不该混成一种。
   */
  const mentionPendingRef = useRef(false)

  /**
   * ⚠ **画布节点 + 已选引用，两份都要。** 只喂画布节点的话，从素材库/上传挑来的
   * 那条 `@名字` 会以纯文本躺在句子里不变成胶囊 —— 真机上就是这么露的：
   * 「参考 @素材库图片」写进去了，胶囊却没渲染，因为 MentionInput 只认它被告知
   * 过的名字。按 label 去重，画布节点优先（它有真缩略图）。
   */
  const mentionTokens = useMemo<MentionToken[]>(() => {
    const byName = new Map<string, MentionToken>()
    for (const reference of [...referenceOptions, ...selectedReferences]) {
      if (!reference.label || byName.has(reference.label)) continue
      byName.set(reference.label, {
        name: reference.label,
        // kind 只用来给没有缩略图的胶囊挑一个端口色；素材只有 image/video 两态，
        // 映射到最接近的两个视觉档。
        kind: reference.kind === 'video' ? 'video' : 'shot',
        thumbnailUrl: reference.thumbnailUrl,
      })
    }
    return [...byName.values()]
  }, [referenceOptions, selectedReferences])

  const addReference = useCallback((reference: NodeAssistantMediaReference) => {
    setSelectedReferences((current) =>
      current.some((item) => item.id === reference.id)
        ? current
        : [...current, reference].slice(0, 8),
    )
    if (!mentionPendingRef.current) return
    mentionPendingRef.current = false
    // 用户敲的那个 `@` 是触发符，替换成完整的 `@名字 ` —— 直接算出新字符串，
    // 不去 DOM 里插节点：MentionInput 是半受控的，外部 value 变了它自己会重渲
    // 成胶囊，省掉一次插入与重渲的先后之争。
    setDraft((current) => `${current.replace(/@$/, '')}@${reference.label} `)
  }, [])

  /**
   * 敲出一个新的 `@` 就把选择器打开。判据是**新增了一个 @**，不是「以 @ 结尾」——
   * 后者会让「删掉一个字又删回来」反复弹窗，也会在粘贴含 @ 的整段文字时误触发。
   */
  const handleDraftChange = useCallback(
    (next: string) => {
      const added =
        (next.match(/@/g)?.length ?? 0) - (draft.match(/@/g)?.length ?? 0)
      setDraft(next)
      if (added === 1 && next.endsWith('@') && !isLoading) {
        mentionPendingRef.current = true
        setPickerOpen(true)
      }
    },
    [draft, isLoading],
  )

  const removeReference = useCallback((referenceId: string) => {
    setSelectedReferences((current) =>
      current.filter((reference) => reference.id !== referenceId),
    )
  }, [])

  const toggleMessageExpanded = useCallback((messageId: string) => {
    setExpandedMessageIds((current) => {
      const next = new Set(current)
      if (next.has(messageId)) {
        next.delete(messageId)
      } else {
        next.add(messageId)
      }
      return next
    })
  }, [])

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const nextDraft =
        draft.trim() ||
        (selectedReferences.length > 0 ? t('referenceOnlyPrompt') : '')
      if (!nextDraft || isLoading || unsupportedReference) {
        return
      }

      setDraft('')
      if (selectedReferences.length > 0) {
        await onSend(nextDraft, selectedReferences)
      } else {
        await onSend(nextDraft)
      }
      setSelectedReferences([])
    },
    [draft, isLoading, onSend, selectedReferences, t, unsupportedReference],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-node-panel">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-2 md:px-4 md:py-3">
        {messages.length === 0 ? (
          <div className="flex min-h-14 flex-col gap-3 py-1">
            <p className="text-sm leading-6 text-node-muted">
              {emptyHint ?? t('empty')}
            </p>
            {starters && starters.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {starters.map((starter) => (
                  <button
                    key={starter.id}
                    type="button"
                    onClick={() => setDraft(starter.prompt)}
                    className="rounded-full border border-node-panel-inner bg-node-panel-soft px-3 py-1 text-2xs font-medium text-node-muted transition-colors hover:border-node-edge hover:text-node-foreground"
                  >
                    {starter.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          messages.map((message, index) => {
            const isStreamingMessage =
              isLoading &&
              index === messages.length - 1 &&
              message.role === 'assistant'
            const isCollapsible =
              message.role === 'assistant' &&
              !isStreamingMessage &&
              message.content.length >=
                NODE_STUDIO_ASSISTANT_MESSAGE_PREVIEW.collapseThresholdChars
            const isExpanded = expandedMessageIds.has(message.id)

            return (
              <div
                key={message.id}
                className={cn(
                  'flex',
                  message.role === 'user' ? 'justify-end' : 'justify-start',
                )}
              >
                <div
                  className={cn(
                    'max-w-sm rounded-2xl px-3 py-2 text-sm leading-6',
                    message.role === 'user'
                      ? 'bg-node-foreground text-node-canvas'
                      : 'border border-node-panel-inner bg-node-panel-soft text-node-foreground',
                  )}
                >
                  {message.role === 'user' &&
                  message.mediaReferences?.length ? (
                    <div className="mb-2 flex justify-end gap-1.5 overflow-x-auto">
                      {message.mediaReferences.map((reference) => {
                        const Icon =
                          reference.kind === 'video' ? Video : ImageIcon
                        return (
                          <span
                            key={reference.id}
                            className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-node-panel-inner bg-node-canvas/60"
                            title={reference.label}
                          >
                            {reference.thumbnailUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element -- persisted remote user media
                              <img
                                src={reference.thumbnailUrl}
                                alt={reference.label}
                                className="size-full object-cover"
                              />
                            ) : (
                              <span className="flex size-full items-center justify-center">
                                <Icon className="size-4" />
                              </span>
                            )}
                            <span className="absolute bottom-0.5 left-0.5 rounded bg-node-panel/85 p-0.5">
                              <Icon className="size-2.5" />
                            </span>
                          </span>
                        )
                      })}
                    </div>
                  ) : null}
                  {message.content ? (
                    // 台账 G3（2026-08-02）：助手回复此前是纯文本 <p>，`###`
                    // `**` 原样打在屏幕上。展开态走 Markdown 原语 + 画布域
                    // 自己的 .canvas-md 配方（域皮肤纪律：**不复用**全站的
                    // .message-md，见 globals.css 该段注释）。折叠预览是压平
                    // 后的一行摘要，不适合再走块级渲染；用户输入不是
                    // Markdown 契约，同样保持纯文本。
                    message.role === 'assistant' &&
                    !(isCollapsible && !isExpanded) ? (
                      <Markdown
                        className="canvas-md"
                        components={CANVAS_MARKDOWN_COMPONENTS}
                      >
                        {message.content}
                      </Markdown>
                    ) : (
                      <p className="whitespace-pre-wrap">
                        {isCollapsible && !isExpanded
                          ? getAssistantMessagePreview(message.content)
                          : message.content}
                      </p>
                    )
                  ) : (
                    <div className="flex items-center gap-2 text-node-muted">
                      <Spinner size="sm" />
                      {t('thinking')}
                    </div>
                  )}
                  {isCollapsible ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-expanded={isExpanded}
                      onClick={() => toggleMessageExpanded(message.id)}
                      className="mt-1 h-8 rounded-lg px-2 text-2xs text-node-muted hover:bg-node-panel-inner hover:text-node-foreground"
                    >
                      {isExpanded ? (
                        <ChevronUp className="size-3.5" />
                      ) : (
                        <ChevronDown className="size-3.5" />
                      )}
                      {isExpanded ? t('collapseMessage') : t('expandMessage')}
                    </Button>
                  ) : null}
                  {message.references?.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {message.references.map((reference) => {
                        const label = getNodeLabel(reference.nodeId)
                        // Node no longer exists (e.g. deleted after the
                        // assistant referenced it) — render a muted, inert
                        // chip instead of a clickable one that would focus
                        // nothing, and never leak the raw node id into the UI.
                        if (label === undefined) {
                          return (
                            <span
                              key={reference.nodeId}
                              className="rounded-full border border-node-panel-inner bg-node-canvas/50 px-2 py-1 text-2xs font-semibold text-node-subtle"
                            >
                              {t('unknownNodeReference')}
                            </span>
                          )
                        }
                        return (
                          <button
                            key={reference.nodeId}
                            type="button"
                            onClick={() => onFocusNode(reference.nodeId)}
                            className="rounded-full border border-node-panel-inner bg-node-canvas/50 px-2 py-1 text-2xs font-semibold text-node-muted transition-colors hover:border-node-focus-ring/40 hover:text-node-foreground"
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  ) : null}
                  {message.ops && planAssistantOps && onApplyAssistantOps ? (
                    <CanvasOpProposalCard
                      plan={planAssistantOps(message.ops)}
                      getNodeLabel={getNodeLabel}
                      onApply={onApplyAssistantOps}
                      autoAppliedCount={autoAppliedByMessageId?.[message.id]}
                      onUndoAutoApply={onUndoAutoApply}
                    />
                  ) : null}
                  {message.opsMalformed ? (
                    <p className="mt-2 text-2xs text-node-subtle">
                      {t('opsMalformed')}
                    </p>
                  ) : null}
                  {message.capabilities?.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {message.capabilities.map((reference) => (
                        <button
                          key={`${reference.capability}:${reference.nodeId}`}
                          type="button"
                          disabled={!onRunCapability}
                          onClick={() =>
                            onRunCapability && void onRunCapability(reference)
                          }
                          className="rounded-full border border-node-edge/50 bg-node-edge/10 px-2 py-1 text-2xs font-semibold text-node-foreground transition-colors hover:bg-node-edge/20 disabled:cursor-default disabled:opacity-60"
                        >
                          {reference.capability}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })
        )}

        {error ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
            <p>{error}</p>
            <Button
              type="button"
              size="sm"
              onClick={() => void onRetry()}
              className="mt-2 h-8 rounded-2xl border border-red-300/30 bg-transparent px-3 text-xs text-red-100 hover:bg-red-400/10"
            >
              <RefreshCcw className="mr-1.5 size-3.5" />
              {t('retry')}
            </Button>
          </div>
        ) : null}
      </div>

      <form
        onSubmit={handleSubmit}
        className="px-3 pb-3 pt-2 md:px-4 md:pb-4 md:pt-3"
      >
        <div className="rounded-2xl border border-node-panel-inner bg-node-panel-soft p-2 shadow-sm focus-within:border-node-edge">
          {selectedReferences.length > 0 ? (
            <div className="mb-1.5 flex flex-wrap gap-1.5 px-1">
              {selectedReferences.map((reference) => {
                const Icon = reference.kind === 'video' ? Video : ImageIcon
                return (
                  <span
                    key={reference.id}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-node-panel-inner bg-node-canvas/60 px-2 py-1 text-2xs font-medium text-node-muted"
                    title={reference.url}
                  >
                    <Icon className="size-3 shrink-0" />
                    <span className="max-w-32 truncate">{reference.label}</span>
                    <button
                      type="button"
                      onClick={() => removeReference(reference.id)}
                      aria-label={t('removeReference')}
                      className="rounded-full p-0.5 hover:bg-node-panel-inner hover:text-node-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                )
              })}
            </div>
          ) : null}
          {unsupportedReference ? (
            <p className="px-2 pb-1 text-xs text-destructive" role="alert">
              {unsupportedReference.kind === 'video'
                ? tAssistant('videoUnsupported')
                : tAssistant('imageUnsupported')}
            </p>
          ) : null}
          {/* A4：`@名字` 在句子中间渲染成带缩略图的胶囊 —— 复用节点提示词那台
              `MentionInput`（cast-redesign §6），不另造一个富文本输入。
              value 仍是纯文本（`@名字` 内联），所以发送链路一个字节没变。 */}
          <MentionInput
            value={draft}
            onValueChange={handleDraftChange}
            tokens={mentionTokens}
            placeholder={t('placeholder')}
            aria-label={t('placeholder')}
            className="min-h-20 px-2 py-1.5 text-sm leading-6 text-node-foreground md:min-h-24"
          />
          <div className="mt-1 flex items-center justify-between gap-2 px-1">
            <div className="flex min-w-0 items-center gap-0.5">
              <CanvasAssistantReferencePicker
                disabled={isLoading}
                references={referenceOptions}
                selectedReferences={selectedReferences}
                onAddReference={addReference}
                open={pickerOpen}
                onOpenChange={setPickerOpen}
              />
              <span className="min-w-0 truncate text-2xs font-medium text-node-subtle">
                {t('modeHint')}
              </span>
            </div>
            <Button
              type="submit"
              size="icon"
              disabled={
                (!draft.trim() && selectedReferences.length === 0) ||
                isLoading ||
                Boolean(unsupportedReference)
              }
              aria-label={t('send')}
              className="size-10 shrink-0 rounded-full bg-node-foreground text-node-canvas hover:bg-node-foreground/90 disabled:bg-node-panel-inner disabled:text-node-muted"
            >
              {isLoading ? (
                <Spinner size="md" />
              ) : (
                <SendHorizontal className="size-4" />
              )}
              <span className="sr-only">{t('send')}</span>
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
