'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import TextareaAutosize from 'react-textarea-autosize'
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  Copy,
  Image as ImageIcon,
  ImagePlus,
  Languages,
  Plus,
  RefreshCw,
  Sparkles,
  Tag,
  TriangleAlert,
  Video,
  WandSparkles,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import { CanvasAssistantReferencePicker } from '@/components/business/node/CanvasAssistantReferencePicker'
import type { NodeAssistantRouteSelection } from '@/components/business/node/CanvasAssistantRouteSelector'
import { PromptAssistantLoraResultCard } from '@/components/business/prompts/PromptAssistantLoraResultCard'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Message, MessageContent } from '@/components/ui/message'
import { Spinner } from '@/components/ui/spinner'
import {
  assistantAdapterSupportsMedia,
  ASSISTANT_MEDIA_LIMITS,
} from '@/constants/assistant'
import { LORA_ASSISTANT_ERROR_CODES } from '@/constants/lora-assistant'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  STYLE_SHORTCUTS,
  usePromptAssistant,
  type PromptAssistantDisplayMessage,
} from '@/hooks/kernel/use-prompt-assistant'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { cn } from '@/lib/utils'
import type {
  LoraAssistantMount,
  PromptAssistantDomain,
  PromptAssistantResponseLanguage,
} from '@/types'
import type { AssistantMediaReference } from '@/types/assistant-media'

const RESPONSE_LANGUAGE_OPTIONS: {
  value: PromptAssistantResponseLanguage
  labelKey: string
}[] = [
  { value: 'chinese', labelKey: 'responseLanguageChinese' },
  { value: 'english', labelKey: 'responseLanguageEnglish' },
  { value: 'japanese', labelKey: 'responseLanguageJapanese' },
]

const ACTION_PRESETS: {
  key: keyof typeof STYLE_SHORTCUTS
  icon: React.ElementType
  labelKey: string
}[] = [
  { key: 'imageStyle', icon: ImagePlus, labelKey: 'presetImageStyle' },
  { key: 'detailed', icon: Sparkles, labelKey: 'presetDetailed' },
  { key: 'lora', icon: WandSparkles, labelKey: 'presetLora' },
  { key: 'tags', icon: Tag, labelKey: 'presetTags' },
]

const STARTER_KEYS = ['starterA', 'starterB', 'starterC'] as const
const LORA_STARTER_KEYS = ['assistantStarterA', 'assistantStarterB'] as const
const LORA_REFINE_KEYS = [
  'assistantRefineComposition',
  'assistantRefineLighting',
  'assistantRefineStyle',
] as const

function getDefaultResponseLanguage(
  locale: string,
): PromptAssistantResponseLanguage {
  if (locale === 'zh') return 'chinese'
  if (locale === 'ja') return 'japanese'
  return 'english'
}

export interface PromptAssistantLoraPersona {
  mounts: LoraAssistantMount[]
  baseFamily?: string
  trayTags: string[]
  onUseNegativePrompt: (text: string) => void
  onAppendNegativePrompt: (text: string) => void
  onEscapeToSelfBuild: () => void
  onStageForReview?: (payload: { positive: string; negative: string }) => void
}

export interface PromptAssistantPanelProps {
  currentPrompt: string
  modelId?: string
  referenceImageData?: string
  assistantDomain?: PromptAssistantDomain
  llmApiKeys?: { id: string; label: string }[]
  onUsePrompt: (prompt: string) => void
  onAppendPrompt?: (prompt: string) => void
  onClose?: () => void
  onSessionIdChange?: (sessionId: string | null) => void
  injectedReference?: { url: string; token: number }
  loraPersona?: PromptAssistantLoraPersona
  assistantRoute?: NodeAssistantRouteSelection
  researchEnabled?: boolean
}

function createReferenceId(prefix: string): string {
  return `${prefix}:${globalThis.crypto?.randomUUID?.() ?? Date.now()}`
}

export function PromptAssistantPanel({
  currentPrompt,
  modelId,
  referenceImageData,
  assistantDomain,
  onUsePrompt,
  onAppendPrompt,
  onSessionIdChange,
  injectedReference,
  loraPersona,
  assistantRoute,
  researchEnabled = false,
}: PromptAssistantPanelProps) {
  const t = useTranslations('PromptAssistant')
  const tModels = useTranslations('Models')
  const locale = useLocale()
  const effectiveDomain = assistantDomain ?? (loraPersona ? 'lora' : 'image')
  const {
    messages,
    sessionId,
    isLoading,
    error,
    errorCode,
    send,
    retry,
    applyPreset,
    clear,
  } = usePromptAssistant()

  const [inputValue, setInputValue] = useState('')
  const [responseLanguage, setResponseLanguage] =
    useState<PromptAssistantResponseLanguage>(() =>
      getDefaultResponseLanguage(locale),
    )
  const [references, setReferences] = useState<AssistantMediaReference[]>(() =>
    referenceImageData?.startsWith('http')
      ? [
          {
            id: createReferenceId('studio-reference'),
            source: 'upload',
            kind: 'image',
            url: referenceImageData,
            thumbnailUrl: referenceImageData,
            label: 'Studio reference',
          },
        ]
      : [],
  )
  const [lastInjectedToken, setLastInjectedToken] = useState<
    number | undefined
  >()
  const [isComposing, setIsComposing] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    onSessionIdChange?.(sessionId)
  }, [onSessionIdChange, sessionId])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isLoading])

  if (injectedReference && injectedReference.token !== lastInjectedToken) {
    setLastInjectedToken(injectedReference.token)
    setReferences((current) => {
      if (
        current.some((reference) => reference.url === injectedReference.url)
      ) {
        return current
      }
      return [
        ...current,
        {
          id: `studio-reference:${injectedReference.token}`,
          source: 'canvas',
          kind: 'image',
          url: injectedReference.url,
          thumbnailUrl: injectedReference.url,
          label: t('referenceImageAlt'),
        } satisfies AssistantMediaReference,
      ].slice(0, ASSISTANT_MEDIA_LIMITS.maxReferences)
    })
  }

  const targetModelLabel = modelId
    ? getTranslatedModelLabel(tModels, modelId)
    : null
  const loraContext = useMemo(
    () =>
      loraPersona
        ? {
            mounts: loraPersona.mounts,
            baseFamily: loraPersona.baseFamily,
            trayTags: loraPersona.trayTags,
            currentPrompt,
          }
        : undefined,
    [currentPrompt, loraPersona],
  )
  const selectedApiKeyId = assistantRoute?.apiKeyId
  const selectedAdapterType =
    assistantRoute?.adapterType ?? AI_ADAPTER_TYPES.OPENAI

  const sendOptions = useCallback(
    () => ({
      modelId,
      currentPrompt,
      references,
      assistantDomain: effectiveDomain,
      apiKeyId: selectedApiKeyId,
      responseLanguage,
      research: researchEnabled,
      loraContext,
    }),
    [
      currentPrompt,
      effectiveDomain,
      loraContext,
      modelId,
      references,
      researchEnabled,
      responseLanguage,
      selectedApiKeyId,
    ],
  )

  const unsupportedReference = references.find(
    (reference) =>
      !assistantAdapterSupportsMedia(selectedAdapterType, reference.kind),
  )
  const canSubmit = Boolean(
    (inputValue.trim() || references.length > 0) &&
    !unsupportedReference &&
    !isLoading,
  )

  const handleSend = useCallback(() => {
    if (!canSubmit) return
    const content = inputValue.trim() || t('referenceOnlyPrompt')
    const options = sendOptions()
    setInputValue('')
    setReferences([])
    void send(content, options)
  }, [canSubmit, inputValue, send, sendOptions, t])

  const handlePreset = useCallback(
    (style: keyof typeof STYLE_SHORTCUTS) => {
      if (isLoading || (style === 'imageStyle' && references.length === 0)) {
        return
      }
      applyPreset(style, {
        ...sendOptions(),
        ...(style === 'lora' && loraPersona ? { mode: 'lora' as const } : {}),
      })
    },
    [applyPreset, isLoading, loraPersona, references.length, sendOptions],
  )

  const addReference = useCallback((reference: AssistantMediaReference) => {
    setReferences((current) =>
      current.some((item) => item.id === reference.id)
        ? current
        : [...current, reference].slice(
            0,
            ASSISTANT_MEDIA_LIMITS.maxReferences,
          ),
    )
  }, [])

  const removeReference = useCallback((referenceId: string) => {
    setReferences((current) =>
      current.filter((reference) => reference.id !== referenceId),
    )
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    if (isComposing || event.nativeEvent.isComposing || !canSubmit) return
    event.preventDefault()
    handleSend()
  }

  const responseLanguageText =
    RESPONSE_LANGUAGE_OPTIONS.find(
      (option) => option.value === responseLanguage,
    )?.labelKey ?? 'responseLanguage'

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="shrink-0 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {ACTION_PRESETS.map(({ key, icon: Icon, labelKey }) => (
            <button
              key={key}
              type="button"
              disabled={
                isLoading || (key === 'imageStyle' && references.length === 0)
              }
              onClick={() => handlePreset(key)}
              className="flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <Icon className="size-3" />
              {t(labelKey)}
            </button>
          ))}
        </div>
        {targetModelLabel ? (
          <p className="text-2xs text-muted-foreground">
            {t('targetModel')}:{' '}
            <span className="font-medium text-foreground">
              {targetModelLabel}
            </span>
          </p>
        ) : null}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="space-y-3 pb-2">
          {messages.length === 0 && !isLoading ? (
            <div className="space-y-3 py-4">
              <p className="text-sm leading-6 text-muted-foreground">
                {loraPersona ? t('assistantEmptyHint') : t('emptyHint')}
              </p>
              <div className="flex flex-col gap-2">
                {(loraPersona ? LORA_STARTER_KEYS : STARTER_KEYS).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setInputValue(t(key))}
                    className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-left text-sm leading-relaxed text-foreground/85 transition-colors hover:border-primary/30 hover:bg-muted/50"
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((message, index) =>
            loraPersona && message.role === 'assistant' && message.lora ? (
              <PromptAssistantLoraResultCard
                key={index}
                positive={message.lora.positive}
                negative={message.lora.negative}
                note={message.lora.note}
                hasMounts={loraPersona.mounts.length > 0}
                onFillPrompt={onUsePrompt}
                onAppendPrompt={onAppendPrompt ?? (() => {})}
                onFillNegativePrompt={loraPersona.onUseNegativePrompt}
                onAppendNegativePrompt={loraPersona.onAppendNegativePrompt}
                onStageForReview={loraPersona.onStageForReview}
              />
            ) : (
              <MessageBubble
                key={index}
                message={message}
                onUsePrompt={onUsePrompt}
                onAppendPrompt={onAppendPrompt}
                useLabel={t('usePrompt')}
                appendLabel={t('appendPrompt')}
                copyLabel={t('copyPrompt')}
                copiedLabel={t('copied')}
              />
            ),
          )}

          {isLoading ? (
            <Message className="justify-start">
              <div className="flex items-center gap-2 rounded-xl bg-secondary p-2 text-sm text-muted-foreground">
                <Spinner size="sm" />
                {t('loading')}
              </div>
            </Message>
          ) : null}
        </div>
      </div>

      {error ? (
        <div
          className={cn(
            'flex flex-wrap items-center gap-2 text-xs',
            loraPersona
              ? 'text-amber-700 dark:text-amber-400'
              : 'text-destructive',
          )}
          role="alert"
        >
          <TriangleAlert className="size-3.5 shrink-0" />
          <span>{error}</span>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => void retry(sendOptions())}
            className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
          >
            <RefreshCw className="size-3" />
            {t('assistantRetry')}
          </button>
          {loraPersona &&
          errorCode === LORA_ASSISTANT_ERROR_CODES.invalidStructuredOutput ? (
            <button
              type="button"
              onClick={loraPersona.onEscapeToSelfBuild}
              className="font-medium underline underline-offset-2"
            >
              {t('assistantEscapeToSelfBuild')}
            </button>
          ) : null}
        </div>
      ) : null}

      {unsupportedReference ? (
        <p className="text-xs text-destructive" role="alert">
          {unsupportedReference.kind === 'video'
            ? t('videoUnsupported')
            : t('imageUnsupported')}
        </p>
      ) : null}

      {loraPersona ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-2xs uppercase tracking-wide text-muted-foreground/70">
            {t('assistantRefineLabel')}
          </span>
          {LORA_REFINE_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              disabled={isLoading}
              onClick={() => setInputValue(t(key))}
              className="rounded-full border border-border/60 px-2.5 py-1 text-2xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
            >
              {t(key)}
            </button>
          ))}
        </div>
      ) : null}

      <div className="shrink-0 rounded-2xl border border-border/60 bg-muted/45 p-1.5">
        <div className="overflow-hidden rounded-xl bg-background/90">
          {references.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto border-b border-border/50 p-2">
              {references.map((reference) => {
                const Icon = reference.kind === 'video' ? Video : ImageIcon
                return (
                  <div
                    key={reference.id}
                    className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted"
                    title={reference.label}
                  >
                    {reference.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- remote user media preview
                      <img
                        src={reference.thumbnailUrl}
                        alt={reference.label}
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="flex size-full items-center justify-center text-muted-foreground">
                        <Icon className="size-5" />
                      </span>
                    )}
                    <span className="absolute bottom-1 left-1 rounded bg-background/85 p-1 text-muted-foreground">
                      <Icon className="size-3" />
                    </span>
                    <button
                      type="button"
                      onClick={() => removeReference(reference.id)}
                      aria-label={t('removeImage')}
                      className="absolute right-1 top-1 rounded-full bg-background/90 p-1 text-foreground shadow-sm"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          ) : null}

          <TextareaAutosize
            value={inputValue}
            minRows={2}
            maxRows={6}
            placeholder={t('placeholder')}
            disabled={isLoading}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            className="min-h-20 w-full resize-none border-0 bg-transparent px-4 py-3 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
          />

          <div className="flex min-h-14 items-center gap-2 border-t border-border/50 bg-muted/45 px-3 py-2">
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('responseLanguage')}
                    title={t(responseLanguageText)}
                  >
                    <Languages className="size-4" />
                    <ChevronDown className="size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {RESPONSE_LANGUAGE_OPTIONS.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onSelect={() => setResponseLanguage(option.value)}
                      className="justify-between gap-3"
                    >
                      {t(option.labelKey)}
                      {responseLanguage === option.value ? (
                        <Check className="size-4 text-primary" />
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <CanvasAssistantReferencePicker
                disabled={
                  isLoading ||
                  references.length >= ASSISTANT_MEDIA_LIMITS.maxReferences
                }
                references={[]}
                selectedReferences={references}
                onAddReference={addReference}
              />

              {messages.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clear}
                  className="h-8 px-2 text-xs text-muted-foreground"
                >
                  {t('clear')}
                </Button>
              ) : null}
            </div>

            <Button
              type="button"
              size="icon-sm"
              aria-label={t('send')}
              onClick={handleSend}
              disabled={!canSubmit}
            >
              {isLoading ? (
                <Spinner size="sm" />
              ) : (
                <ArrowRight className="size-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  onUsePrompt,
  onAppendPrompt,
  useLabel,
  appendLabel,
  copyLabel,
  copiedLabel,
}: {
  message: PromptAssistantDisplayMessage
  onUsePrompt: (prompt: string) => void
  onAppendPrompt?: (prompt: string) => void
  useLabel: string
  appendLabel: string
  copyLabel: string
  copiedLabel: string
}) {
  const [copied, setCopied] = useState(false)

  if (message.role === 'user') {
    return (
      <Message className="justify-end">
        <div className="max-w-[85%] space-y-1.5">
          {message.mediaReferences?.length ? (
            <div className="flex justify-end gap-1.5 overflow-x-auto">
              {message.mediaReferences.map((reference) => {
                const Icon = reference.kind === 'video' ? Video : ImageIcon
                return (
                  <span
                    key={reference.id}
                    className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted"
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
                      <span className="flex size-full items-center justify-center text-muted-foreground">
                        <Icon className="size-4" />
                      </span>
                    )}
                    <span className="absolute bottom-0.5 left-0.5 rounded bg-background/85 p-0.5 text-muted-foreground">
                      <Icon className="size-2.5" />
                    </span>
                  </span>
                )
              })}
            </div>
          ) : null}
          <MessageContent className="bg-primary/10 text-sm text-foreground">
            {message.content}
          </MessageContent>
        </div>
      </Message>
    )
  }

  const handleCopy = () => {
    void navigator.clipboard?.writeText(message.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <Message className="justify-start">
      <div className="max-w-[95%] space-y-2">
        <div className="flex items-start gap-2">
          <Bot className="mt-1 size-4 shrink-0 text-primary" />
          <MessageContent
            markdown
            className="bg-secondary/60 text-sm leading-6"
          >
            {message.content}
          </MessageContent>
        </div>
        <div className="flex flex-wrap gap-1.5 pl-6">
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
          {onAppendPrompt ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onAppendPrompt(message.content)}
              className="h-7 gap-1.5 rounded-full px-3 text-xs"
            >
              <Plus className="size-3" />
              {appendLabel}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="h-7 gap-1.5 rounded-full px-3 text-xs"
          >
            {copied ? (
              <Check className="size-3" />
            ) : (
              <Copy className="size-3" />
            )}
            {copied ? copiedLabel : copyLabel}
          </Button>
        </div>
      </div>
    </Message>
  )
}
