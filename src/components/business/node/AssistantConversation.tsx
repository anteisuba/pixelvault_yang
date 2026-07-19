'use client'

import { useCallback, useState, type FormEvent } from 'react'
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
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import type { AssistantConversationMessage } from '@/hooks/use-assistant-conversation'
import type { AssistantCapabilityReference } from '@/hooks/use-assistant-conversation'
import { NODE_STUDIO_ASSISTANT_MESSAGE_PREVIEW } from '@/constants/node-studio'
import { cn } from '@/lib/utils'
import type { NodeAssistantMediaReference } from '@/types/node-assistant'

import { CanvasAssistantReferencePicker } from './CanvasAssistantReferencePicker'

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
  getNodeLabel(nodeId: string): string
  /** Optional override for the empty-state opener line (E1 lean front door). */
  emptyHint?: string
  /** Optional starter chips shown in the empty state; clicking prefills the
   *  draft so the user can review before sending (E1 「1 句起手 + 3 短 chips」). */
  starters?: { id: string; label: string; prompt: string }[]
  /** Image/video nodes available as references for the next assistant turn. */
  referenceOptions?: NodeAssistantMediaReference[]
  onRunCapability?(reference: AssistantCapabilityReference): Promise<void>
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
  onRunCapability,
}: AssistantConversationProps) {
  const t = useTranslations('StudioNode.conversation')
  const [draft, setDraft] = useState('')
  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [selectedReferences, setSelectedReferences] = useState<
    NodeAssistantMediaReference[]
  >([])

  const addReference = useCallback((reference: NodeAssistantMediaReference) => {
    setSelectedReferences((current) =>
      current.some((item) => item.id === reference.id)
        ? current
        : [...current, reference].slice(0, 8),
    )
  }, [])

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
      if (!nextDraft || isLoading) {
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
    [draft, isLoading, onSend, selectedReferences, t],
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
                  {message.content ? (
                    <p className="whitespace-pre-wrap">
                      {isCollapsible && !isExpanded
                        ? getAssistantMessagePreview(message.content)
                        : message.content}
                    </p>
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
                      {message.references.map((reference) => (
                        <button
                          key={reference.nodeId}
                          type="button"
                          onClick={() => onFocusNode(reference.nodeId)}
                          className="rounded-full border border-node-panel-inner bg-node-canvas/50 px-2 py-1 text-2xs font-semibold text-node-muted transition-colors hover:border-node-focus-ring/40 hover:text-node-foreground"
                        >
                          {getNodeLabel(reference.nodeId)}
                        </button>
                      ))}
                    </div>
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
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t('placeholder')}
            className="min-h-20 resize-none border-0 bg-transparent px-2 py-1.5 text-sm leading-6 text-node-foreground shadow-none placeholder:text-node-subtle focus-visible:ring-0 md:min-h-24"
          />
          <div className="mt-1 flex items-center justify-between gap-2 px-1">
            <div className="flex min-w-0 items-center gap-0.5">
              <CanvasAssistantReferencePicker
                disabled={isLoading}
                references={referenceOptions}
                selectedReferences={selectedReferences}
                onAddReference={addReference}
              />
              <span className="min-w-0 truncate text-2xs font-medium text-node-subtle">
                {t('modeHint')}
              </span>
            </div>
            <Button
              type="submit"
              size="icon"
              disabled={
                (!draft.trim() && selectedReferences.length === 0) || isLoading
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
