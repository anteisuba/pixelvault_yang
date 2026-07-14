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
  Check,
  ChevronDown,
  Copy,
  Globe,
  ImagePlus,
  Images,
  Languages,
  Loader2,
  Plus,
  Sparkles,
  Tag,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ImagePickerPopoverBody } from '@/components/business/studio-shared/ImagePickerPopoverBody'
import { MainModelPicker } from '@/components/business/studio-shared/pickers'
import {
  usePromptAssistant,
  STYLE_SHORTCUTS,
} from '@/hooks/kernel/use-prompt-assistant'
import { readImageFileAsBase64 } from '@/lib/image-input'
import { getTranslatedModelLabel } from '@/lib/model-options'
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

// ─── Action presets config ──────────────────────────────────────
// 决议 5②：助手只保留"对文字做什么"的动作类预设；风格类
// （artistic / photorealistic / anime）已并入卡片→画风（内置风格）。

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

/** 空态起手势示例（i18n 键，点击后直接交给 LLM 扩写）。 */
const STARTER_KEYS = ['starterA', 'starterB', 'starterC'] as const

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
  /** Called when user clicks [追加] — append to the current prompt */
  onAppendPrompt?: (prompt: string) => void
  /** Called when panel is closed */
  onClose?: () => void
  /** Exposes the persisted Studio conversation to the shared shell. */
  onSessionIdChange?: (sessionId: string | null) => void
  /**
   * External reference injection (assistant dock drop zone). Each drop bumps
   * `token`, and the panel replaces its single reference slot with `url`
   * (data URL or remote URL). Images only ever land in the composer — they
   * never trigger generation.
   */
  injectedReference?: { url: string; token: number }
}

export function PromptAssistantPanel({
  currentPrompt,
  modelId,
  referenceImageData,
  llmApiKeys,
  onUsePrompt,
  onAppendPrompt,
  onSessionIdChange,
  injectedReference,
}: PromptAssistantPanelProps) {
  const t = useTranslations('PromptAssistant')
  const tModels = useTranslations('Models')
  const locale = useLocale()
  const { messages, sessionId, isLoading, error, send, applyPreset, clear } =
    usePromptAssistant()

  useEffect(() => {
    onSessionIdChange?.(sessionId)
  }, [onSessionIdChange, sessionId])

  const [inputValue, setInputValue] = useState('')
  const [responseLanguage, setResponseLanguage] =
    useState<PromptAssistantResponseLanguage>(() =>
      getDefaultResponseLanguage(locale),
    )
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<string | undefined>(
    llmApiKeys?.[0]?.id,
  )
  const [researchEnabled, setResearchEnabled] = useState(false)
  const [referenceImage, setReferenceImage] =
    useState<AssistantReferenceImage | null>(
      referenceImageData
        ? { data: referenceImageData, previewUrl: referenceImageData }
        : null,
    )
  const [referenceError, setReferenceError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Dock drop zone → single reference slot (replace semantics). Derived
  // state from props via a render-phase update (React's recommended
  // alternative to setState-in-effect).
  const [lastInjectedToken, setLastInjectedToken] = useState<
    number | undefined
  >(undefined)
  if (injectedReference && injectedReference.token !== lastInjectedToken) {
    setLastInjectedToken(injectedReference.token)
    setReferenceImage({
      data: injectedReference.url,
      previewUrl: injectedReference.url,
    })
    setReferenceError(null)
  }

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const effectiveReferenceImageData = referenceImage?.data
  const targetModelLabel = modelId
    ? getTranslatedModelLabel(tModels, modelId)
    : null

  const sendOpts = useCallback(
    () => ({
      modelId,
      referenceImageData: effectiveReferenceImageData,
      currentPrompt,
      apiKeyId: selectedApiKeyId,
      responseLanguage,
      research: researchEnabled,
    }),
    [
      modelId,
      effectiveReferenceImageData,
      currentPrompt,
      selectedApiKeyId,
      responseLanguage,
      researchEnabled,
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
    <div className="flex h-full min-h-0 flex-col gap-2.5 sm:gap-3">
      {/* ── Header: style presets + API key selector ── */}
      <div className="shrink-0 space-y-2 rounded-2xl border border-border/45 bg-muted/20 p-2.5 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0">
        <div className="flex flex-wrap gap-1.5">
          {ACTION_PRESETS.map(({ key, icon: Icon, labelKey }) => {
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

        {/* ── Model badge ── */}
        {targetModelLabel && (
          <p className="text-2xs text-muted-foreground">
            {t('targetModel')}:{' '}
            <span className="font-medium text-foreground">
              {targetModelLabel}
            </span>
          </p>
        )}
      </div>

      {/* ── Messages ── */}
      <div
        className="min-h-0 flex-1 overflow-y-auto pr-1 sm:pr-2"
        ref={scrollRef}
      >
        <div className="space-y-3 pb-2">
          {messages.length === 0 && !isLoading && (
            <div className="space-y-3 py-3 sm:py-6">
              <p className="text-center text-sm text-muted-foreground">
                {t('emptyHint')}
              </p>
              {/* 空态起手势：点一个示例，AI 直接扩成完整提示词（决议 5②） */}
              <div className="mx-auto flex w-full max-w-md flex-col gap-2">
                {STARTER_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    disabled={isLoading}
                    onClick={() => void send(t(key), sendOpts())}
                    className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-left text-sm leading-relaxed text-foreground/85 transition-colors hover:border-primary/30 hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg: PromptAssistantMessage, i: number) => (
            <MessageBubble
              key={i}
              message={msg}
              onUsePrompt={onUsePrompt}
              onAppendPrompt={onAppendPrompt}
              useLabel={t('usePrompt')}
              appendLabel={t('appendPrompt')}
              copyLabel={t('copyPrompt')}
              copiedLabel={t('copied')}
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
        researchEnabled={researchEnabled}
        onToggleResearch={() => setResearchEnabled((prev) => !prev)}
        researchLabel={t('research')}
        researchHint={t('researchHint')}
        imageButtonLabel={t('imageButton')}
        imageDropHint={t('imageDropHint')}
        recentAssetsLabel={t('recentAssets')}
        recentAssetsEmptyLabel={t('recentAssetsEmpty')}
        openLibraryLabel={t('openLibrary')}
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
  assetDialogDescription: string
  assetDialogTitle: string
  sendLabel: string
  showClear: boolean
  value: string
  researchEnabled: boolean
  onToggleResearch: () => void
  researchLabel: string
  researchHint: string
  imageButtonLabel: string
  imageDropHint: string
  recentAssetsLabel: string
  recentAssetsEmptyLabel: string
  openLibraryLabel: string
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
  onToggleResearch,
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
  assetDialogDescription,
  assetDialogTitle,
  sendLabel,
  showClear,
  value,
  researchEnabled,
  researchLabel,
  researchHint,
  imageButtonLabel,
  imageDropHint,
  recentAssetsLabel,
  recentAssetsEmptyLabel,
  openLibraryLabel,
}: AssistantAnimatedInputProps) {
  const tForm = useTranslations('StudioForm')
  const [isComposing, setIsComposing] = useState(false)
  const [assetDialogOpen, setAssetDialogOpen] = useState(false)
  const [imagePopoverOpen, setImagePopoverOpen] = useState(false)
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

  // Pasting an image into the composer fills the reference slot — mirrors
  // the studio prompt textarea's paste behavior.
  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = Array.from(event.clipboardData?.files ?? []).find((entry) =>
      entry.type.startsWith('image/'),
    )
    if (!file) return
    event.preventDefault()
    void onReferenceFile(file)
  }

  return (
    <div className="shrink-0 rounded-2xl border border-border/60 bg-muted/45 p-1.5">
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
          onPaste={handlePaste}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          className="min-h-20 w-full resize-none border-none bg-transparent px-4 py-3 text-sm leading-relaxed text-foreground shadow-none outline-none placeholder:text-muted-foreground focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-60"
        />

        <div className="flex min-h-14 items-center gap-2 border-t border-border/50 bg-muted/45 px-3 py-2 sm:h-14 sm:gap-0 sm:py-0">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:flex-nowrap sm:gap-2">
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

            {/* 联网研究 toggle — icon-only + tooltip（同 node dock 语义） */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={researchLabel}
              aria-pressed={researchEnabled}
              title={researchHint}
              disabled={disabled}
              onClick={onToggleResearch}
              className={cn(
                'size-8 rounded-lg p-0 text-muted-foreground hover:bg-background/70 hover:text-foreground',
                researchEnabled && 'bg-primary/10 text-primary',
              )}
            >
              <Globe className="size-4" />
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
              disabled={disabled}
            />
            {/* 图片入口收敛为一个按钮 → 素材 popover（拖/粘/传 + 最近素材 + 素材库） */}
            <Popover open={imagePopoverOpen} onOpenChange={setImagePopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={imageButtonLabel}
                  title={attachLabel}
                  disabled={disabled}
                  className={cn(
                    'size-8 rounded-lg p-0 text-muted-foreground hover:bg-background/70 hover:text-foreground',
                    hasReferenceImage && 'bg-primary/10 text-primary',
                  )}
                >
                  <Images className="size-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" sideOffset={8} className="w-72 p-3">
                <ImagePickerPopoverBody
                  dropHint={imageDropHint}
                  recentLabel={recentAssetsLabel}
                  recentEmptyLabel={recentAssetsEmptyLabel}
                  openLibraryLabel={openLibraryLabel}
                  onPickFile={() => fileInputRef.current?.click()}
                  onDropFile={(file) => {
                    void onReferenceFile(file)
                    setImagePopoverOpen(false)
                  }}
                  onPickAsset={(generation) => {
                    void onReferenceAsset(generation)
                    setImagePopoverOpen(false)
                  }}
                  onOpenLibrary={() => {
                    setImagePopoverOpen(false)
                    setAssetDialogOpen(true)
                  }}
                />
              </PopoverContent>
            </Popover>

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
  onAppendPrompt,
  useLabel,
  appendLabel,
  copyLabel,
  copiedLabel,
}: {
  message: PromptAssistantMessage
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
        <MessageContent className="max-w-[85%] bg-primary/10 text-foreground text-sm">
          {message.content}
        </MessageContent>
      </Message>
    )
  }

  const handleCopy = () => {
    void navigator.clipboard?.writeText(message.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Assistant message — 产出三动作：填入 / 追加 / 复制（决议 5 契约，
  // 与未来反推/提取风格的产出动作共用同一套语法）。
  return (
    <Message className="justify-start">
      <div className="max-w-[95%] space-y-2">
        <div className="flex items-start gap-2">
          <Bot className="mt-0.5 size-4 shrink-0 text-primary" />
          <MessageContent className="bg-secondary/60 text-sm font-mono leading-relaxed">
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
          {onAppendPrompt && (
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
          )}
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
