'use client'
/* eslint-disable @next/next/no-img-element -- assistant reference previews can be data URLs */

import {
  useCallback,
  useRef,
  useEffect,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react'
import TextareaAutosize from 'react-textarea-autosize'
import {
  ArrowRight,
  Bot,
  BookOpen,
  Check,
  ChevronDown,
  Loader2,
  Palette,
  Camera,
  ImagePlus,
  Images,
  Languages,
  Paperclip,
  Sparkles,
  Tag,
  Paintbrush,
  WandSparkles,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { Button } from '@/components/ui/button'
import { Message, MessageContent } from '@/components/ui/message'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MainModelPicker } from '@/components/business/studio-shared/pickers'
import {
  usePromptAssistant,
  STYLE_SHORTCUTS,
} from '@/hooks/kernel/use-prompt-assistant'
import { readImageFileAsBase64 } from '@/lib/image-input'
import { cn } from '@/lib/utils'
import type {
  GenerationRecord,
  PromptAssistantMessage,
  PromptAssistantResponseLanguage,
} from '@/types'

const ASSISTANT_REFERENCE_MAX_BYTES = 10 * 1024 * 1024
const IMAGE_STYLE_SHORTCUT = STYLE_SHORTCUTS.imageStyle

const RESPONSE_LANGUAGE_OPTIONS: {
  value: PromptAssistantResponseLanguage
  labelKey: string
}[] = [
  { value: 'chinese', labelKey: 'responseLanguageChinese' },
  { value: 'english', labelKey: 'responseLanguageEnglish' },
  { value: 'japanese', labelKey: 'responseLanguageJapanese' },
]

function getDefaultResponseLanguage(
  locale: string,
): PromptAssistantResponseLanguage {
  if (locale === 'zh') return 'chinese'
  if (locale === 'ja') return 'japanese'
  return 'english'
}

// ─── Style presets config ───────────────────────────────────────

const STYLE_PRESETS: {
  key: keyof typeof STYLE_SHORTCUTS
  icon: React.ElementType
  labelKey: string
}[] = [
  { key: 'imageStyle', icon: ImagePlus, labelKey: 'presetImageStyle' },
  { key: 'detailed', icon: Sparkles, labelKey: 'presetDetailed' },
  { key: 'artistic', icon: Paintbrush, labelKey: 'presetArtistic' },
  { key: 'photorealistic', icon: Camera, labelKey: 'presetPhoto' },
  { key: 'anime', icon: Palette, labelKey: 'presetAnime' },
  { key: 'lora', icon: WandSparkles, labelKey: 'presetLora' },
  { key: 'tags', icon: Tag, labelKey: 'presetTags' },
]

interface AssistantReferenceImage {
  data: string
  previewUrl: string
}

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
  const locale = useLocale()
  const { messages, isLoading, error, send, applyPreset, clear } =
    usePromptAssistant()

  const [inputValue, setInputValue] = useState('')
  const [responseLanguage, setResponseLanguage] =
    useState<PromptAssistantResponseLanguage>(() =>
      getDefaultResponseLanguage(locale),
    )
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<string | undefined>(
    llmApiKeys?.[0]?.id,
  )
  const [useInspirationContext, setUseInspirationContext] = useState(false)
  const [referenceImage, setReferenceImage] =
    useState<AssistantReferenceImage | null>(
      referenceImageData
        ? { data: referenceImageData, previewUrl: referenceImageData }
        : null,
    )
  const [referenceError, setReferenceError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const effectiveReferenceImageData = referenceImage?.data

  const sendOpts = useCallback(
    () => ({
      modelId,
      referenceImageData: effectiveReferenceImageData,
      currentPrompt,
      apiKeyId: selectedApiKeyId,
      responseLanguage,
      useInspirationContext,
    }),
    [
      modelId,
      effectiveReferenceImageData,
      currentPrompt,
      selectedApiKeyId,
      responseLanguage,
      useInspirationContext,
    ],
  )

  const handleSend = useCallback(() => {
    const text = inputValue.trim()
    const promptText =
      text || effectiveReferenceImageData ? text || IMAGE_STYLE_SHORTCUT : ''
    if (!promptText || isLoading) return
    void send(promptText, sendOpts())
    setInputValue('')
  }, [effectiveReferenceImageData, inputValue, isLoading, send, sendOpts])

  const handlePreset = useCallback(
    (style: keyof typeof STYLE_SHORTCUTS) => {
      if (isLoading) return
      if (style === 'imageStyle' && !effectiveReferenceImageData) return
      applyPreset(style, sendOpts())
    },
    [effectiveReferenceImageData, isLoading, applyPreset, sendOpts],
  )

  const handleReferenceFile = useCallback(
    async (file: File) => {
      const result = await readImageFileAsBase64(file, {
        maxFileSize: ASSISTANT_REFERENCE_MAX_BYTES,
      })
      if (!result.ok) {
        setReferenceError(t('imageError'))
        return
      }

      setReferenceImage({ data: result.base64, previewUrl: result.base64 })
      setReferenceError(null)
    },
    [t],
  )

  const handleReferenceAsset = useCallback((generation: GenerationRecord) => {
    if (generation.outputType !== 'IMAGE') return
    setReferenceImage({ data: generation.url, previewUrl: generation.url })
    setReferenceError(null)
  }, [])

  const handleRemoveReferenceImage = useCallback(() => {
    setReferenceImage(null)
    setReferenceError(null)
  }, [])

  const canSubmit = Boolean(inputValue.trim() || effectiveReferenceImageData)

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* ── Header: style presets + API key selector ── */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {STYLE_PRESETS.map(({ key, icon: Icon, labelKey }) => {
            const presetDisabled =
              isLoading ||
              (key === 'imageStyle' && !effectiveReferenceImageData)

            return (
              <button
                key={key}
                type="button"
                disabled={presetDisabled}
                onClick={() => handlePreset(key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-xs font-medium transition-colors',
                  'text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-foreground',
                  'disabled:pointer-events-none disabled:opacity-50',
                )}
              >
                <Icon className="size-3" />
                {t(labelKey)}
              </button>
            )
          })}
        </div>
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
      {referenceError && (
        <p className="text-xs text-destructive">{referenceError}</p>
      )}

      <AssistantAnimatedInput
        value={inputValue}
        onValueChange={setInputValue}
        onSubmit={handleSend}
        disabled={isLoading}
        canSubmit={canSubmit}
        hasReferenceImage={Boolean(referenceImage)}
        placeholder={t('placeholder')}
        sendLabel={t('send')}
        attachLabel={referenceImage ? t('replaceImage') : t('addImage')}
        clearLabel={t('clear')}
        showClear={messages.length > 0}
        referencePreviewUrl={referenceImage?.previewUrl}
        referenceImageAlt={t('referenceImageAlt')}
        removeReferenceLabel={t('removeImage')}
        selectAssetLabel={t('selectAsset')}
        assetDialogTitle={t('selectAsset')}
        assetDialogDescription={t('referenceDescription')}
        responseLanguage={responseLanguage}
        responseLanguageLabel={t('responseLanguage')}
        responseLanguageOptions={RESPONSE_LANGUAGE_OPTIONS.map((option) => ({
          value: option.value,
          label: t(option.labelKey),
        }))}
        onResponseLanguageChange={setResponseLanguage}
        llmApiKeys={llmApiKeys ?? []}
        selectedApiKeyId={selectedApiKeyId}
        selectApiKeyLabel={t('selectApiKey')}
        onSelectApiKey={setSelectedApiKeyId}
        useInspirationContext={useInspirationContext}
        onToggleInspirationContext={() =>
          setUseInspirationContext((prev) => !prev)
        }
        inspirationContextLabel={t('useInspirationContext')}
        inspirationContextOnLabel={t('useInspirationContextOn')}
        onClear={clear}
        onReferenceFile={handleReferenceFile}
        onReferenceAsset={handleReferenceAsset}
        onRemoveReference={handleRemoveReferenceImage}
      />
    </div>
  )
}

interface AssistantAnimatedInputProps {
  attachLabel: string
  canSubmit: boolean
  clearLabel: string
  disabled?: boolean
  hasReferenceImage: boolean
  llmApiKeys: { id: string; label: string }[]
  onClear: () => void
  onReferenceAsset: (generation: GenerationRecord) => void | Promise<void>
  onReferenceFile: (file: File) => void | Promise<void>
  onRemoveReference: () => void
  onResponseLanguageChange: (language: PromptAssistantResponseLanguage) => void
  onSelectApiKey: (id: string | undefined) => void
  onSubmit: () => void
  onValueChange: (value: string) => void
  placeholder: string
  referenceImageAlt: string
  referencePreviewUrl?: string
  responseLanguage: PromptAssistantResponseLanguage
  responseLanguageLabel: string
  responseLanguageOptions: {
    value: PromptAssistantResponseLanguage
    label: string
  }[]
  removeReferenceLabel: string
  selectedApiKeyId?: string
  selectApiKeyLabel: string
  selectAssetLabel: string
  assetDialogDescription: string
  assetDialogTitle: string
  sendLabel: string
  showClear: boolean
  value: string
  useInspirationContext: boolean
  onToggleInspirationContext: () => void
  inspirationContextLabel: string
  inspirationContextOnLabel: string
}

function AssistantAnimatedInput({
  attachLabel,
  canSubmit,
  clearLabel,
  disabled,
  hasReferenceImage,
  llmApiKeys,
  onClear,
  onReferenceAsset,
  onReferenceFile,
  onRemoveReference,
  onResponseLanguageChange,
  onSelectApiKey,
  onSubmit,
  onToggleInspirationContext,
  onValueChange,
  placeholder,
  referenceImageAlt,
  referencePreviewUrl,
  responseLanguage,
  responseLanguageLabel,
  responseLanguageOptions,
  removeReferenceLabel,
  selectedApiKeyId,
  selectApiKeyLabel,
  selectAssetLabel,
  assetDialogDescription,
  assetDialogTitle,
  sendLabel,
  showClear,
  value,
  useInspirationContext,
  inspirationContextLabel,
  inspirationContextOnLabel,
}: AssistantAnimatedInputProps) {
  const tForm = useTranslations('StudioForm')
  const [isComposing, setIsComposing] = useState(false)
  const [assetDialogOpen, setAssetDialogOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const responseLanguageOption = responseLanguageOptions.find(
    (option) => option.value === responseLanguage,
  )
  const responseLanguageText =
    responseLanguageOption?.label ?? responseLanguageLabel

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    if (isComposing || event.nativeEvent.isComposing) return
    if (!canSubmit || disabled) return
    event.preventDefault()
    onSubmit()
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void onReferenceFile(file)
  }

  const handleAssetSelect = (generation: GenerationRecord) => {
    if (generation.outputType !== 'IMAGE') return
    void onReferenceAsset(generation)
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-muted/45 p-1.5">
      <div className="relative flex flex-col overflow-hidden rounded-xl bg-background/90">
        {referencePreviewUrl && (
          <div className="border-b border-border/50 bg-muted/35 px-3 py-2">
            <div className="relative h-24 overflow-hidden rounded-lg border border-border/60 bg-background/70">
              <img
                src={referencePreviewUrl}
                alt={referenceImageAlt}
                className="h-full w-full object-contain"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label={removeReferenceLabel}
                onClick={onRemoveReference}
                disabled={disabled}
                className="absolute right-2 top-2 size-7 rounded-full p-0 shadow-sm"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
        <TextareaAutosize
          value={value}
          minRows={2}
          maxRows={6}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          className="min-h-20 w-full resize-none border-none bg-transparent px-4 py-3 text-sm leading-relaxed text-foreground shadow-none outline-none placeholder:text-muted-foreground focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-60"
        />

        <div className="flex h-14 items-center border-t border-border/50 bg-muted/45 px-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {llmApiKeys.length > 0 && (
              <MainModelPicker
                modality="llm_assist"
                llmCapability="enhance"
                size="compact"
                disabled={disabled}
                value={
                  selectedApiKeyId
                    ? `llm-route:enhance:key:${selectedApiKeyId}`
                    : null
                }
                onChange={(option) => {
                  if (option.keyId) onSelectApiKey(option.keyId)
                }}
                triggerEmptyLabel={selectApiKeyLabel}
                searchPlaceholder={tForm('modelSelector.searchPlaceholder')}
                emptySearchText={tForm('modelSelector.emptySearch')}
              />
            )}

            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={disabled}
                  aria-label={responseLanguageLabel}
                  className="h-8 max-w-24 gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:bg-background/70 hover:text-foreground"
                >
                  <Languages className="size-3.5 shrink-0" />
                  <span className="truncate">{responseLanguageText}</span>
                  <ChevronDown className="size-3 shrink-0 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-32">
                {responseLanguageOptions.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onSelect={() => onResponseLanguageChange(option.value)}
                    className="justify-between gap-3"
                  >
                    <span className="truncate">{option.label}</span>
                    {responseLanguage === option.value && (
                      <Check className="size-4 text-primary" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={inspirationContextLabel}
              aria-pressed={useInspirationContext}
              title={
                useInspirationContext
                  ? inspirationContextOnLabel
                  : inspirationContextLabel
              }
              disabled={disabled}
              onClick={onToggleInspirationContext}
              className={cn(
                'size-8 rounded-lg p-0 text-muted-foreground hover:bg-background/70 hover:text-foreground',
                useInspirationContext && 'bg-primary/10 text-primary',
              )}
            >
              <BookOpen className="size-4" />
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
              disabled={disabled}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={attachLabel}
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'size-8 rounded-lg p-0 text-muted-foreground hover:bg-background/70 hover:text-foreground',
                hasReferenceImage && 'bg-primary/10 text-primary',
              )}
            >
              <Paperclip className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={selectAssetLabel}
              disabled={disabled}
              onClick={() => setAssetDialogOpen(true)}
              className="size-8 rounded-lg p-0 text-muted-foreground hover:bg-background/70 hover:text-foreground"
            >
              <Images className="size-4" />
            </Button>

            {showClear && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClear}
                disabled={disabled}
                className="h-8 rounded-lg px-2 text-xs text-muted-foreground hover:bg-background/70 hover:text-foreground"
              >
                {clearLabel}
              </Button>
            )}
          </div>

          <Button
            type="button"
            size="sm"
            aria-label={sendLabel}
            onClick={onSubmit}
            disabled={!canSubmit || disabled}
            className="size-8 rounded-lg p-0"
          >
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
      <AssetSelectorDialog
        open={assetDialogOpen}
        onOpenChange={setAssetDialogOpen}
        onSelect={handleAssetSelect}
        title={assetDialogTitle}
        description={assetDialogDescription}
        mediaType="image"
      />
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
