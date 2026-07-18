'use client'
/* eslint-disable @next/next/no-img-element -- assistant reference previews can be data URLs */

import {
  useCallback,
  useRef,
  useEffect,
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
  Globe,
  ImagePlus,
  Languages,
  Plus,
  RefreshCw,
  Sparkles,
  Tag,
  TriangleAlert,
  WandSparkles,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import { LORA_ASSISTANT_ERROR_CODES } from '@/constants/lora-assistant'
import { AssistantReferencePicker } from '@/components/business/assistant/AssistantReferencePicker'
import { PromptAssistantLoraResultCard } from '@/components/business/prompts/PromptAssistantLoraResultCard'
import { Button } from '@/components/ui/button'
import { Message, MessageContent } from '@/components/ui/message'
import { Spinner } from '@/components/ui/spinner'
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
  type PromptAssistantDisplayMessage,
} from '@/hooks/kernel/use-prompt-assistant'
import { readImageFileAsBase64 } from '@/lib/image-input'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { cn } from '@/lib/utils'
import type {
  GenerationRecord,
  LoraAssistantMount,
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

/** F2 LoRA 人格空态示例（点击填入输入框，不自动发送——与通用人格的
 *  STARTER_KEYS 自动发送行为不同，见 §1.2 空态段落）。 */
const LORA_STARTER_KEYS = ['assistantStarterA', 'assistantStarterB'] as const

/** F2「继续调」快捷 chips——同样是填入不自动发送。 */
const LORA_REFINE_KEYS = [
  'assistantRefineComposition',
  'assistantRefineLighting',
  'assistantRefineStyle',
] as const

interface AssistantReferenceImage {
  data: string
  previewUrl: string
}

// ─── Component ──────────────────────────────────────────────────

/**
 * F2 LoRA 人格（docs/plans/lora-assistant-nl2tag-2026-07.md §1.2）：LoRA
 * 生成页把这个对象传进来即默认激活——每次发送都会强制 `mode:'lora'` 并带上
 * 一份用调用时刻的实时值现组的 `loraContext`（mounts/baseFamily/trayTags 由
 * 调用方每次渲染重算，currentPrompt 复用 panel 自己的 `currentPrompt` prop，
 * 天然保证"每次发送取实时值"，不需要额外的失效/刷新机制）。
 */
export interface PromptAssistantLoraPersona {
  mounts: LoraAssistantMount[]
  baseFamily?: string
  trayTags: string[]
  /** 结果卡「填入正文」「追加到正文」的负向对应动作（拍板③：负向落负向框，
   *  不进 tray）。 */
  onUseNegativePrompt: (text: string) => void
  onAppendNegativePrompt: (text: string) => void
  /** §6「输出验证失败」逃生口——切到自己搭配 tab。 */
  onEscapeToSelfBuild: () => void
}

export interface PromptAssistantPanelProps {
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
  /** F2: supplying this activates the LoRA persona (see
   *  `PromptAssistantLoraPersona`). Omitted everywhere else — zero
   *  regression for the generic Studio dock. */
  loraPersona?: PromptAssistantLoraPersona
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
  loraPersona,
}: PromptAssistantPanelProps) {
  const t = useTranslations('PromptAssistant')
  const tModels = useTranslations('Models')
  const locale = useLocale()
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

  // F2: the LoRA persona forces every turn onto the v2 structured engine and
  // assembles `loraContext` fresh from the caller's live props/state on each
  // call (never memoized past this closure) — "每次发送时取实时值" (§1.2).
  const sendOpts = useCallback(
    () => ({
      modelId,
      referenceImageData: effectiveReferenceImageData,
      currentPrompt,
      apiKeyId: selectedApiKeyId,
      responseLanguage,
      research: researchEnabled,
      mode: loraPersona ? ('lora' as const) : undefined,
      loraContext: loraPersona
        ? {
            mounts: loraPersona.mounts,
            baseFamily: loraPersona.baseFamily,
            trayTags: loraPersona.trayTags,
            currentPrompt,
          }
        : undefined,
    }),
    [
      modelId,
      effectiveReferenceImageData,
      currentPrompt,
      selectedApiKeyId,
      responseLanguage,
      researchEnabled,
      loraPersona,
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

  const handleRetry = useCallback(() => {
    if (isLoading) return
    void retry(sendOpts())
  }, [isLoading, retry, sendOpts])

  const handleRefineFill = useCallback((text: string) => {
    setInputValue(text)
  }, [])

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
          {/* F2: LoRA 人格下整个面板已经是 LoRA 转换器，"presetLora" 一次性
              预设按钮跟常驻的人格重复，隐藏它避免双重入口。 */}
          {(loraPersona
            ? ACTION_PRESETS.filter((preset) => preset.key !== 'lora')
            : ACTION_PRESETS
          ).map(({ key, icon: Icon, labelKey }) => {
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
                {loraPersona ? t('assistantEmptyHint') : t('emptyHint')}
              </p>
              {/* 空态起手势：LoRA 人格点示例只填入输入框（不自动发送，用户
                  可先改再发）；通用人格保留原有"点即发送"行为（决议 5②）。 */}
              <div className="mx-auto flex w-full max-w-md flex-col gap-2">
                {loraPersona
                  ? LORA_STARTER_KEYS.map((key) => (
                      <button
                        key={key}
                        type="button"
                        disabled={isLoading}
                        onClick={() => handleRefineFill(t(key))}
                        className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-left text-sm leading-relaxed text-foreground/85 transition-colors hover:border-primary/30 hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-50"
                      >
                        {t(key)}
                      </button>
                    ))
                  : STARTER_KEYS.map((key) => (
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

          {messages.map((msg: PromptAssistantDisplayMessage, i: number) =>
            loraPersona && msg.role === 'assistant' && msg.lora ? (
              <PromptAssistantLoraResultCard
                key={i}
                positive={msg.lora.positive}
                negative={msg.lora.negative}
                note={msg.lora.note}
                hasMounts={loraPersona.mounts.length > 0}
                onFillPrompt={onUsePrompt}
                onAppendPrompt={onAppendPrompt ?? (() => {})}
                onFillNegativePrompt={loraPersona.onUseNegativePrompt}
                onAppendNegativePrompt={loraPersona.onAppendNegativePrompt}
              />
            ) : (
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
            ),
          )}

          {isLoading && (
            <Message className="justify-start">
              <div className="flex items-center gap-2 rounded-lg bg-secondary p-2 text-sm text-muted-foreground">
                <Spinner size="sm" />
                {t('loading')}
              </div>
            </Message>
          )}
        </div>
      </div>

      {/* ── Error ── */}
      {/* §6 状态规范：LoRA 人格下引擎失败/输出验证失败一律琥珀（守 v1"琥珀
          仅警示"约定），带重试文字链；输出验证失败（结构化 JSON 校验重试
          后仍非法）额外给"切到自己搭配"逃生口。通用人格保留原有 destructive
          红色文字，零回归。 */}
      {error && loraPersona ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-amber-700 dark:text-amber-400">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
          <button
            type="button"
            onClick={handleRetry}
            disabled={isLoading}
            className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:no-underline disabled:pointer-events-none disabled:opacity-50"
          >
            <RefreshCw className="size-3" aria-hidden />
            {t('assistantRetry')}
          </button>
          {errorCode === LORA_ASSISTANT_ERROR_CODES.invalidStructuredOutput ? (
            <button
              type="button"
              onClick={loraPersona.onEscapeToSelfBuild}
              className="font-medium underline underline-offset-2 hover:no-underline"
            >
              {t('assistantEscapeToSelfBuild')}
            </button>
          ) : null}
        </div>
      ) : error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : null}
      {referenceError && (
        <p className="text-xs text-destructive">{referenceError}</p>
      )}

      {/* ── F2「继续调」快捷 chips（§1.2）：挂在输入框上方，点击只填入不
          自动发送——用户可先看一眼再决定发不发。 */}
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
              onClick={() => handleRefineFill(t(key))}
              className="rounded-full border border-border/60 px-2.5 py-1 text-2xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              {t(key)}
            </button>
          ))}
        </div>
      ) : null}

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

            <AssistantReferencePicker
              disabled={disabled}
              hasSelection={hasReferenceImage}
              labels={{
                trigger: imageButtonLabel,
                triggerTitle: attachLabel,
                title: imageButtonLabel,
                imageDropHint,
                recentImages: recentAssetsLabel,
                recentImagesEmpty: recentAssetsEmptyLabel,
                openLibrary: openLibraryLabel,
                libraryTitle: assetDialogTitle,
                libraryDescription: assetDialogDescription,
              }}
              onPickImageFile={onReferenceFile}
              onPickImageAsset={onReferenceAsset}
              triggerClassName="size-8 rounded-lg p-0 hover:bg-background/70"
            />

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
