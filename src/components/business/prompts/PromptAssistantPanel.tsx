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
import { AssistantAskedLog } from '@/components/business/prompts/AssistantAskedLog'
import { AssistantTurnOptions } from '@/components/business/prompts/AssistantTurnOptions'
import { PromptAssistantLoraResultCard } from '@/components/business/prompts/PromptAssistantLoraResultCard'
import { ResearchReceiptCard } from '@/components/business/prompts/ResearchReceiptCard'
import { buildResearchCitationComponents } from '@/components/business/prompts/ResearchRunEvidence'
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
  assistantAdapterAcceptsReferenceKind,
  ASSISTANT_MEDIA_LIMITS,
} from '@/constants/assistant'
import {
  VIDEO_ANALYSIS_TASKS,
  VIDEO_ANALYSIS_TASK_TIERS,
} from '@/constants/video-analysis'
import { isAspectRatio } from '@/constants/config'
import { LORA_ASSISTANT_ERROR_CODES } from '@/constants/lora-assistant'
import { RESEARCH_MODES, type ResearchMode } from '@/constants/research'
import { isImageBatchCount } from '@/constants/studio'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  STYLE_SHORTCUTS,
  usePromptAssistant,
  type PromptAssistantDisplayMessage,
} from '@/hooks/kernel/use-prompt-assistant'
import { ASSISTANT_SURFACE_BY_DOMAIN } from '@/types/assistant-conversation'
import type { AssistantAskedPair } from '@/types/assistant-protocol'
import { buildReferenceHandles } from '@/lib/assistant-reference-handles'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { cn } from '@/lib/utils'
import type {
  AssistantWorkbenchState,
  LoraAssistantMount,
  PromptAssistantDomain,
  PromptAssistantResponseLanguage,
} from '@/types'
import type { AssistantMediaReference } from '@/types/assistant-media'
import type { AssistantWriteback } from '@/types/assistant-writeback'

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
  /**
   * LoRA 结果卡的「追加」——追加的是 **tag 数组**，累加 tag 是正常用法。
   *
   * ⚠ 与 `writeback.appendPrompt` 不是一回事：那个追加的是一整段成品提示词
   * （owner 2026-08-20 拍板第 4 条请回来的那个，语义是「不想被覆盖时的另一条
   * 路」）。两者都叫「追加」但追加的东西不同，别合并。
   */
  onAppendPrompt: (text: string) => void
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
  /**
   * 写回适配器。**一个对象而不是六个松散回调** —— 见
   * `types/assistant-writeback.ts`：缺席是按宿主写死的结构性缺席
   * （视频 6 项 / 图片 5 项 / 音频 5 项 / LoRA ≤3 项），六个可选 prop 表达不了
   * 「这一档没有」和「宿主漏传了」的区别，而后者恰好在 `workbenchState` 上
   * 真实发生过一整轮没人发现。
   */
  writeback: AssistantWriteback
  onClose?: () => void
  onSessionIdChange?: (sessionId: string | null) => void
  injectedReference?: { url: string; token: number }
  loraPersona?: PromptAssistantLoraPersona
  assistantRoute?: NodeAssistantRouteSelection
  /**
   * 联网检索三态。**替代了旧的 `researchEnabled: boolean`** —— 那个布尔在服务端
   * 落到 `auto`/`forced` 两态，`off` 表达不出来，用户因此没有关闭手段。
   * 缺省 `auto`：规划器按意图决定要不要打源。
   */
  researchMode?: ResearchMode
  /**
   * §3.0b：当前工作台状态。**由宿主构造后传进来，本组件不读任何 studio context**
   * —— 同一个面板还被 `/studio/lora` 和 `/prompts` 复用，那两处在 StudioProvider
   * 外面，直接 useStudioForm() 会抛。
   */
  workbenchState?: AssistantWorkbenchState
}

function createReferenceId(prefix: string): string {
  return `${prefix}:${globalThis.crypto?.randomUUID?.() ?? Date.now()}`
}

export function PromptAssistantPanel({
  currentPrompt,
  modelId,
  referenceImageData,
  assistantDomain,
  writeback,
  onSessionIdChange,
  injectedReference,
  loraPersona,
  assistantRoute,
  researchMode = RESEARCH_MODES.auto,
  workbenchState,
}: PromptAssistantPanelProps) {
  const t = useTranslations('PromptAssistant')
  const tModels = useTranslations('Models')
  const locale = useLocale()
  const effectiveDomain = assistantDomain ?? (loraPersona ? 'lora' : 'image')
  // A1：域决定这段对话存进哪个槽。头部（新对话 / 历史 / 分享）也读同一个槽，
  // 所以宿主必须把同一个 domain 同时喂给两处 —— 喂错的表现是「历史列表是别的
  // 域的」。
  const surface = ASSISTANT_SURFACE_BY_DOMAIN[effectiveDomain]
  const {
    messages,
    sessionId,
    isLoading,
    isThinking,
    researchPending,
    error,
    errorCode,
    send,
    retry,
    applyPreset,
    clear,
  } = usePromptAssistant(surface)

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
      researchMode,
      loraContext,
      workbenchState,
    }),
    [
      currentPrompt,
      effectiveDomain,
      loraContext,
      modelId,
      references,
      researchMode,
      responseLanguage,
      selectedApiKeyId,
      workbenchState,
    ],
  )

  // ⚠ 视频要的是 **native 档**（切片 2 §4.3）：这里是自由对话，用户随时会问运镜/
  //   节奏/动作，而 `frames` 档看不见那些。抽帧走视觉线的显式任务入口。
  //   档位读服务端同一张表 —— 前端自己判一套、服务端判另一套的下场是「界面让挂、
  //   发出去 400」。
  const unsupportedReference = references.find(
    (reference) =>
      !assistantAdapterAcceptsReferenceKind(
        selectedAdapterType,
        reference.kind,
        VIDEO_ANALYSIS_TASK_TIERS[VIDEO_ANALYSIS_TASKS.conversational],
      ),
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

  // A2：反问的答复 / 收敛的「满意」都走同一条 send —— 它们是普通的用户消息，
  // 只是文本由控件替用户组装好。故意不开第二条指令通道。
  const handleTurnOptionSend = useCallback(
    (message: string, askedPairs?: AssistantAskedPair[]) => {
      if (isLoading) return
      void send(message, { ...sendOptions(), askedPairs })
    },
    [isLoading, send, sendOptions],
  )

  // A2c：折叠块的内容是从会话里**聚合**出来的，模型侧零成本。
  const askedPairs = useMemo(
    () => messages.flatMap((message) => message.askedPairs ?? []),
    [messages],
  )

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

  // 序号从位置推导，不存进 reference —— 删掉中间一张后编号必须自动重排。
  const referenceHandles = buildReferenceHandles(references)

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

      {askedPairs.length > 0 ? (
        <div className="pb-2 pr-1">
          <AssistantAskedLog pairs={askedPairs} />
        </div>
      ) : null}

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

          {messages.map((message, index) => {
            // A2：协议控件只挂**最后一轮**。往回滚看到三轮前的按钮还亮着、点下去
            // 发出一句过期答复，比没有按钮更糟。
            const isLastTurn = index === messages.length - 1
            const turnOptions =
              isLastTurn && message.role === 'assistant' ? (
                <AssistantTurnOptions
                  ask={message.ask}
                  next={message.next}
                  malformed={message.protocolMalformed}
                  disabled={isLoading}
                  onSend={handleTurnOptionSend}
                />
              ) : null

            return (
              <div key={index}>
                {loraPersona && message.role === 'assistant' && message.lora ? (
                  <PromptAssistantLoraResultCard
                    positive={message.lora.positive}
                    negative={message.lora.negative}
                    note={message.lora.note}
                    hasMounts={loraPersona.mounts.length > 0}
                    onFillPrompt={writeback.prompt.apply}
                    onAppendPrompt={loraPersona.onAppendPrompt}
                    onFillNegativePrompt={loraPersona.onUseNegativePrompt}
                    onAppendNegativePrompt={loraPersona.onAppendNegativePrompt}
                    onStageForReview={loraPersona.onStageForReview}
                  />
                ) : (
                  <MessageBubble
                    message={message}
                    writeback={writeback}
                    isLastTurn={isLastTurn}
                    copyLabel={t('copyPrompt')}
                    copiedLabel={t('copied')}
                  />
                )}
                {turnOptions}
              </div>
            )
          })}

          {/* 「检索中」过渡态。⚠ 只有 `forced` 档会亮 —— `auto` 档要不要打源
              由服务端当轮决定，客户端在响应头到达之前无从得知，给每一轮都亮
              等于让不检索的那些轮先撒一次谎再默默收回。 */}
          {researchPending ? (
            <Message className="justify-start">
              <ResearchReceiptCard pending />
            </Message>
          ) : null}

          {/* 只在**第一个字出现之前**转圈。文字开始长出来之后还挂着「思考中…」，
              读起来像卡住了 —— 那时候正在发生的事是「在写」，不是「在想」。 */}
          {isThinking ? (
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
              {references.map((reference, index) => {
                const Icon = reference.kind === 'video' ? Video : ImageIcon
                // 用户看得到 #n 才说得出 #n —— 提示词里的清单用的是同一个字符串。
                const handle = referenceHandles[index] ?? ''
                return (
                  <div
                    key={reference.id}
                    className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted"
                    title={`${handle} · ${reference.label}`}
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
                    <span className="absolute bottom-1 left-1 flex items-center gap-0.5 rounded bg-background/85 px-1 py-0.5 text-[10px] leading-none text-muted-foreground">
                      <Icon className="size-3" />
                      {handle}
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
  writeback,
  isLastTurn,
  copyLabel,
  copiedLabel,
}: {
  message: PromptAssistantDisplayMessage
  writeback: AssistantWriteback
  /**
   * 是不是最后一轮。**用来决定动作条默认展开还是收起** —— 面板挂载会自动水合
   * 上一段会话，老用户的首帧不是空态而是一屏历史消息；若每条都把配置盒摊开，
   * 首屏就是一列盒子墙（切片 S4 的密度决定）。
   */
  isLastTurn: boolean
  copyLabel: string
  copiedLabel: string
}) {
  const [copied, setCopied] = useState(false)
  // 正文里的 `[n]` 变可点。⚠ 每条消息一份（闭包住自己的 runId）—— 一条回答的
  // 引用只能指向**它那次检索**的证据包，跨消息共用一份组件表会让 `[1]` 指到
  // 别的 run 上去。`useMemo` 在这里不只是省渲染：`components` 每帧换新对象会
  // 让整棵 markdown 树重挂，打字机效果直接抖掉。
  const citationComponents = useMemo(
    () => buildResearchCitationComponents(message.researchRunId),
    [message.researchRunId],
  )

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
        {/* 检索回执长在回答**上方**：先说「这些话是从哪儿来的」，再说话。
            ⚠ 回执整体缺席（两个字段都没有）= 这轮没检索 → 卡片自己返回 null，
            不要在这里用 `grounded` 之类的字段去猜。 */}
        <ResearchReceiptCard
          receipt={message.research}
          runId={message.researchRunId}
        />
        <div className="flex items-start gap-2">
          <Bot className="mt-1 size-4 shrink-0 text-primary" />
          {/* `min-w-0`：`ui/code-block` 的 `overflow-x-auto` 只有在能被压窄时才
              会真的裁剪。作为 flex 子项它默认 `min-width:auto`，于是长提示词把
              整条浮卡撑到 3370px 宽、整个面板横向滚动（实测 scrollWidth 3412 /
              clientWidth 318）。修在这里而不是那个共享原语上 —— 它全站在用。 */}
          <MessageContent
            markdown
            components={citationComponents}
            className="min-w-0 bg-secondary/60 text-sm leading-6"
          >
            {message.content}
          </MessageContent>
        </div>
        <MessageActionBar
          message={message}
          writeback={writeback}
          defaultExpanded={isLastTurn}
        />
        {/* 第三档：次要样式，**不是 hover 才出现**（切片 S5）——移动端宿主是纯
            触屏的，hover-only 在那一档等于把复制从可达变成不可达。桌面 hover /
            键盘 focus 时升到实色，触屏恒定可见的淡描边。 */}
        <div className="group/actions flex flex-wrap gap-1.5 pl-6">
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

// ─── 动作条（方向 A · owner 2026-08-20 拍板）────────────────────────
//
// 三档层级取代原来那排等权重 chip：
//   ① 主动作  —— 实心。`[[prompt]]` 的 positive（＋「追加」）。
//   ② 配置盒  —— 「当前 → 建议」逐行，右侧一个「应用」。
//   ③ 第三档  —— 复制 / 引用（在 MessageBubble 里，次要样式）。
//
// ⚠ 三条来自切片、别在实现时想当然改掉的判据：
//   · 「已应用」**是算出来的不是存下来的**（`isApplied` 当场比值）。用户手改
//     表单后它自动失效、撤销随之收起——绝不拿旧快照抹掉用户后写的内容。
//   · 主动作**可以缺席**（`[[setup]]` 在档 2 就成立），那时配置盒里第一条可用
//     项升为实心；层级靠「有且只有一个实心」建立，不靠固定位置。
//   · 缺席原因只说第 ① 类（宿主没这个能力）。②目录查不到 / ③收窄失败 /
//     ④模型这轮没给 一律静默——区分 ② 要改数据契约，挡在这一轮之外。

interface ActionRow {
  key: string
  labelKey: string
  current?: string
  proposed: string
  apply?: () => void
  isApplied: boolean
  undo?: () => void
  noteKey?: string
  unavailableKey?: string
}

function MessageActionBar({
  message,
  writeback,
  defaultExpanded,
}: {
  message: PromptAssistantDisplayMessage
  writeback: AssistantWriteback
  defaultExpanded: boolean
}) {
  const t = useTranslations('PromptAssistant')
  const tModels = useTranslations('Models')
  const [expanded, setExpanded] = useState(defaultExpanded)

  const draft = message.promptDraft
  const setup = message.setup
  const rows: ActionRow[] = []

  const negative = draft?.negative
  if (negative && writeback.negative) {
    const field = writeback.negative
    rows.push({
      key: 'negative',
      labelKey: 'rowNegative',
      current: field.current,
      proposed: negative,
      isApplied: field.isApplied(negative),
      ...(field.unavailableReason
        ? { unavailableKey: field.unavailableReason }
        : { apply: () => field.apply(negative), undo: field.undo }),
    })
  }

  // ⚠ 模型可以吐 `21:9` / `widescreen`，收窄不过就不出这一行。
  const ratio = draft?.aspectRatio
  if (ratio && isAspectRatio(ratio) && writeback.aspectRatio) {
    const field = writeback.aspectRatio
    rows.push({
      key: 'ratio',
      labelKey: 'rowRatio',
      current: field.current,
      proposed: ratio,
      apply: () => field.apply(ratio),
      isApplied: field.isApplied(ratio),
      undo: field.undo,
    })
  }

  // ⚠ 目录里查不到就不渲染（`resolveModelLabel` 返回 null）。
  const modelId = setup?.model
  if (modelId && writeback.model && writeback.resolveModelLabel?.(modelId)) {
    const field = writeback.model
    const note = field.noteFor?.(modelId)
    rows.push({
      key: 'model',
      labelKey: 'rowModel',
      current: field.current,
      proposed: getTranslatedModelLabel(tModels, modelId),
      apply: () => field.apply(modelId),
      isApplied: field.isApplied(modelId),
      undo: field.undo,
      ...(note ? { noteKey: note } : {}),
    })
  }

  // ⚠ 合法档位只有 1/2/4，`3` 不出这一行。
  const batchCount = setup?.batchCount
  if (
    typeof batchCount === 'number' &&
    isImageBatchCount(batchCount) &&
    writeback.batchCount
  ) {
    const field = writeback.batchCount
    rows.push({
      key: 'batch',
      labelKey: 'rowBatch',
      current: field.current,
      proposed: String(batchCount),
      apply: () => field.apply(batchCount),
      isApplied: field.isApplied(batchCount),
      undo: field.undo,
    })
  }

  const positive = draft?.positive
  const promptApplied = positive ? writeback.prompt.isApplied(positive) : false
  if (!positive && rows.length === 0) return null

  // 主动作缺席时，配置盒里第一条可用项升为实心。
  const promotedKey = positive ? undefined : rows.find((r) => r.apply)?.key
  const actionable = rows.filter((r) => !r.unavailableKey).length
  const anyApplied = promptApplied || rows.some((r) => r.isApplied)

  return (
    <div className="flex flex-col gap-2 pl-6">
      {/* ⚠ 「就地变已应用」对读屏用户等于什么都没发生（切片 S6）。 */}
      <span aria-live="polite" className="sr-only">
        {anyApplied ? t('applied') : ''}
      </span>

      {positive ? (
        promptApplied ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-status-applied-surface px-3 text-xs font-medium text-status-applied">
              <Check className="size-3.5" />
              {t('applied')}
            </span>
            {writeback.prompt.undo ? (
              <button
                type="button"
                onClick={writeback.prompt.undo}
                aria-label={t('undoApplyAria', { action: t('usePrompt') })}
                className="text-xs text-muted-foreground underline underline-offset-[3px] hover:text-foreground"
              >
                {t('undoApply')}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              onClick={() => writeback.prompt.apply(positive)}
              className="h-8 gap-1.5 rounded-full px-3.5 text-xs"
            >
              <Check className="size-3.5" />
              {t('usePrompt')}
            </Button>
            {/* owner 2026-08-20 第 4 条翻案：「追加」回来了。语义是「不想被覆盖
                时的另一条路」——撤销的前提是值没被人动过，手改之后就只剩它。 */}
            {writeback.appendPrompt ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => writeback.appendPrompt?.(positive)}
                className="h-8 gap-1.5 rounded-full px-3 text-xs"
              >
                <Plus className="size-3.5" />
                {t('appendPrompt')}
              </Button>
            ) : null}
          </div>
        )
      ) : null}

      {/* ② 配置盒。owner 拍板第 1 条：**0 项也画外框**。 */}
      {rows.length > 0 ? (
        <div className="rounded-xl border border-border bg-card/40">
          <div className="flex items-center gap-2 px-2.5 pb-1 pt-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {t('actionsHeading')}
            </span>
            {/* ⚠ 历史消息默认收起：面板挂载会水合上一段会话，老用户首帧是一屏
                历史；每条都摊开配置盒，首屏就是一列盒子墙（切片 S4）。 */}
            {!expanded && actionable > 0 ? (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="ml-auto text-[11px] text-muted-foreground underline underline-offset-[3px] hover:text-foreground"
              >
                {t('moreSuggestions', { count: actionable })}
              </button>
            ) : null}
          </div>
          {expanded ? (
            <ul className="flex flex-col">
              {rows.map((row) => (
                <li
                  key={row.key}
                  className="flex min-h-8 items-center gap-2 border-t border-border/60 px-2.5 py-1 first:border-t-0"
                >
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {t(row.labelKey)}
                  </span>
                  {row.unavailableKey ? (
                    /* 缺席原因第 ① 类。⚠ 不能靠把灰调更浅表达「不可用」——
                       那个灰只有 2.81:1（切片 S6），改由删除线承担。 */
                    <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground line-through">
                      {t(row.unavailableKey)}
                    </span>
                  ) : (
                    <>
                      {/* ⚠ 配置行永不折行：挤不下就砍信息。第一个被砍的是
                          「当前 →」，最窄档整段消失（切片 S4）。 */}
                      {row.current ? (
                        <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline">
                          {row.current} →
                        </span>
                      ) : null}
                      <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
                        {row.proposed}
                      </span>
                      {row.isApplied ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-status-applied">
                          <Check className="size-3" />
                          {t('applied')}
                          {row.undo ? (
                            <button
                              type="button"
                              onClick={row.undo}
                              aria-label={t('undoApplyAria', {
                                action: t(row.labelKey),
                              })}
                              className="ml-1 text-muted-foreground underline underline-offset-[3px] hover:text-foreground"
                            >
                              {t('undoApply')}
                            </button>
                          ) : null}
                        </span>
                      ) : (
                        <Button
                          type="button"
                          variant={
                            promotedKey === row.key ? 'default' : 'outline'
                          }
                          size="xs"
                          onClick={row.apply}
                          className="shrink-0 rounded-full"
                        >
                          {t('apply')}
                        </Button>
                      )}
                    </>
                  )}
                </li>
              ))}
              {/* owner 拍板第 3 条：换模型撞上多模型对比名单要提示——目标模型
                  已在名单里时，运行名单去重会让这一轮静默少跑一条。 */}
              {rows.map((row) =>
                row.noteKey && !row.isApplied ? (
                  <li
                    key={`${row.key}-note`}
                    className="border-t border-border/60 px-2.5 py-1.5 text-[11px] leading-4 text-status-risk"
                  >
                    {t(row.noteKey)}
                  </li>
                ) : null,
              )}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
