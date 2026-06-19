'use client'

import { useCallback, useState, type FormEvent } from 'react'
import { Loader2, RefreshCcw, SendHorizontal } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { AssistantConversationMessage } from '@/hooks/use-assistant-conversation'
import { cn } from '@/lib/utils'

interface AssistantConversationProps {
  messages: AssistantConversationMessage[]
  isLoading: boolean
  error: string | null
  onSend(content: string): Promise<void>
  onRetry(): Promise<void>
  onFocusNode(nodeId: string): void
  getNodeLabel(nodeId: string): string
  /** Optional override for the empty-state opener line (E1 lean front door). */
  emptyHint?: string
  /** Optional starter chips shown in the empty state; clicking prefills the
   *  draft so the user can review before sending (E1 「1 句起手 + 3 短 chips」). */
  starters?: { id: string; label: string; prompt: string }[]
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
}: AssistantConversationProps) {
  const t = useTranslations('StudioNode.conversation')
  const [draft, setDraft] = useState('')

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const nextDraft = draft.trim()
      if (!nextDraft || isLoading) {
        return
      }

      setDraft('')
      await onSend(nextDraft)
    },
    [draft, isLoading, onSend],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-node-panel/70">
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
          messages.map((message) => (
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
                  <p className="whitespace-pre-wrap">{message.content}</p>
                ) : (
                  <div className="flex items-center gap-2 text-node-muted">
                    <Loader2 className="size-3.5 animate-spin" />
                    {t('thinking')}
                  </div>
                )}
                {message.references.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {message.references.map((reference) => (
                      <button
                        key={reference.nodeId}
                        type="button"
                        onClick={() => onFocusNode(reference.nodeId)}
                        className="rounded-full border border-node-panel-inner bg-node-canvas/50 px-2 py-1 text-2xs font-semibold text-node-muted transition-colors hover:border-node-amber/40 hover:text-node-foreground"
                      >
                        {getNodeLabel(reference.nodeId)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))
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
        className="border-t border-node-panel-inner px-3 pb-3 pt-2 md:px-4 md:pb-4 md:pt-3"
      >
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('placeholder')}
          className="min-h-20 resize-none rounded-3xl border-node-panel-inner bg-node-panel-soft px-3 py-2.5 text-sm leading-6 text-node-foreground shadow-none placeholder:text-node-subtle focus-visible:border-node-amber focus-visible:ring-node-amber/30 md:min-h-28 md:px-4 md:py-3"
        />
        <div className="mt-2 flex items-center justify-between gap-2 md:mt-3 md:gap-3">
          <span className="hidden h-8 min-w-0 items-center truncate rounded-full border border-node-panel-inner bg-node-panel-soft px-3 text-2xs font-medium text-node-subtle sm:inline-flex">
            {t('modeHint')}
          </span>
          <Button
            type="submit"
            disabled={!draft.trim() || isLoading}
            className="ml-auto h-9 rounded-2xl bg-node-foreground px-3 text-xs font-semibold text-node-canvas hover:bg-node-foreground/90 disabled:bg-node-panel-inner disabled:text-node-muted md:h-10 md:px-4"
          >
            {isLoading ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <SendHorizontal className="mr-1.5 size-3.5" />
            )}
            {t('send')}
          </Button>
        </div>
      </form>
    </div>
  )
}
