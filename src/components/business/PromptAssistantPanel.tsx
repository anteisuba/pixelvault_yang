'use client'

import { useCallback, useRef, useEffect, useState } from 'react'
import {
  Bot,
  Check,
  Loader2,
  Palette,
  Camera,
  Sparkles,
  Tag,
  Paintbrush,
  Send,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Message, MessageContent } from '@/components/ui/message'
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
  PromptInputAction,
} from '@/components/ui/prompt-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  usePromptAssistant,
  STYLE_SHORTCUTS,
} from '@/hooks/use-prompt-assistant'
import { cn } from '@/lib/utils'
import type { PromptAssistantMessage } from '@/types'

// ─── Style presets config ───────────────────────────────────────

const STYLE_PRESETS: {
  key: keyof typeof STYLE_SHORTCUTS
  icon: React.ElementType
  labelKey: string
}[] = [
  { key: 'detailed', icon: Sparkles, labelKey: 'presetDetailed' },
  { key: 'artistic', icon: Paintbrush, labelKey: 'presetArtistic' },
  { key: 'photorealistic', icon: Camera, labelKey: 'presetPhoto' },
  { key: 'anime', icon: Palette, labelKey: 'presetAnime' },
  { key: 'tags', icon: Tag, labelKey: 'presetTags' },
]

// ─── Component ──────────────────────────────────────────────────

interface PromptAssistantPanelProps {
  /** Current prompt in the editor */
  currentPrompt: string
  /** Currently selected model ID */
  modelId?: string
  /** Reference image data URL (if uploaded) */
  referenceImageData?: string
  /** Available LLM-capable API keys for selection */
  llmApiKeys?: { id: string; label: string }[]
  /** Called when user clicks [填入] on an assistant response */
  onUsePrompt: (prompt: string) => void
  /** Called when panel is closed */
  onClose?: () => void
}

export function PromptAssistantPanel({
  currentPrompt,
  modelId,
  referenceImageData,
  llmApiKeys,
  onUsePrompt,
}: PromptAssistantPanelProps) {
  const t = useTranslations('PromptAssistant')
  const { messages, isLoading, error, send, applyPreset, clear } =
    usePromptAssistant()

  const [inputValue, setInputValue] = useState('')
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<string | undefined>(
    llmApiKeys?.[0]?.id,
  )
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const sendOpts = useCallback(
    () => ({
      modelId,
      referenceImageData,
      currentPrompt,
      apiKeyId: selectedApiKeyId,
    }),
    [modelId, referenceImageData, currentPrompt, selectedApiKeyId],
  )

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isLoading) return
    void send(inputValue, sendOpts())
    setInputValue('')
  }, [inputValue, isLoading, send, sendOpts])

  const handlePreset = useCallback(
    (style: keyof typeof STYLE_SHORTCUTS) => {
      if (isLoading) return
      applyPreset(style, sendOpts())
    },
    [isLoading, applyPreset, sendOpts],
  )

  return (
    <div className="flex h-full max-h-[70vh] flex-col gap-3">
      {/* ── Header: style presets + API key selector ── */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {STYLE_PRESETS.map(({ key, icon: Icon, labelKey }) => (
            <button
              key={key}
              type="button"
              disabled={isLoading}
              onClick={() => handlePreset(key)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-xs font-medium transition-colors',
                'text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-foreground',
                'disabled:opacity-50 disabled:pointer-events-none',
              )}
            >
              <Icon className="size-3" />
              {t(labelKey)}
            </button>
          ))}
        </div>

        {/* API Key selector */}
        {llmApiKeys && llmApiKeys.length > 0 && (
          <Select value={selectedApiKeyId} onValueChange={setSelectedApiKeyId}>
            <SelectTrigger className="h-7 rounded-full text-xs">
              <SelectValue placeholder={t('selectApiKey')} />
            </SelectTrigger>
            <SelectContent>
              {llmApiKeys.map((key) => (
                <SelectItem key={key.id} value={key.id}>
                  {key.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* ── Model badge ── */}
      {modelId && (
        <p className="text-2xs text-muted-foreground">
          {t('targetModel')}:{' '}
          <span className="font-medium text-foreground">{modelId}</span>
        </p>
      )}

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto pr-2" ref={scrollRef}>
        <div className="space-y-3 pb-2">
          {messages.length === 0 && !isLoading && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t('emptyHint')}
            </p>
          )}

          {messages.map((msg: PromptAssistantMessage, i: number) => (
            <MessageBubble
              key={i}
              message={msg}
              onUsePrompt={onUsePrompt}
              useLabel={t('usePrompt')}
            />
          ))}

          {isLoading && (
            <Message className="justify-start">
              <div className="flex items-center gap-2 rounded-lg bg-secondary p-2 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                {t('loading')}
              </div>
            </Message>
          )}
        </div>
      </div>

      {/* ── Error ── */}
      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* ── Input ── */}
      <PromptInput
        value={inputValue}
        onValueChange={setInputValue}
        onSubmit={handleSend}
        isLoading={isLoading}
        maxHeight={120}
        className="rounded-2xl border-border/60"
      >
        <PromptInputTextarea
          placeholder={t('placeholder')}
          className="min-h-[36px] text-sm"
        />
        <PromptInputActions className="justify-between px-1 pb-1">
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clear}
                disabled={isLoading}
                className="h-7 rounded-full px-2 text-xs text-muted-foreground"
              >
                {t('clear')}
              </Button>
            )}
          </div>
          <PromptInputAction tooltip={t('send')}>
            <Button
              type="button"
              size="sm"
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
              className="size-7 rounded-full p-0"
            >
              <Send className="size-3.5" />
            </Button>
          </PromptInputAction>
        </PromptInputActions>
      </PromptInput>
    </div>
  )
}

// ─── Message bubble sub-component ───────────────────────────────

function MessageBubble({
  message,
  onUsePrompt,
  useLabel,
}: {
  message: PromptAssistantMessage
  onUsePrompt: (prompt: string) => void
  useLabel: string
}) {
  if (message.role === 'user') {
    return (
      <Message className="justify-end">
        <MessageContent className="max-w-[85%] bg-primary/10 text-foreground text-sm">
          {message.content}
        </MessageContent>
      </Message>
    )
  }

  // Assistant message
  return (
    <Message className="justify-start">
      <div className="max-w-[95%] space-y-2">
        <div className="flex items-start gap-2">
          <Bot className="mt-0.5 size-4 shrink-0 text-primary" />
          <MessageContent className="bg-secondary/60 text-sm font-mono leading-relaxed">
            {message.content}
          </MessageContent>
        </div>
        <div className="pl-6">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onUsePrompt(message.content)}
            className="h-7 gap-1.5 rounded-full px-3 text-xs"
          >
            <Check className="size-3" />
            {useLabel}
          </Button>
        </div>
      </div>
    </Message>
  )
}
