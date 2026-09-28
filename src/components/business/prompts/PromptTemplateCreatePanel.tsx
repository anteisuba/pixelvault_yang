'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import type { z } from 'zod'

import { Plus, Save, X } from '@/components/icons'
import { AI_MODELS, MODEL_OPTIONS } from '@/constants/models'
import { DURATION, EASE_STANDARD } from '@/constants/motion'
import {
  PROMPT_OUTPUT_TYPE_LABEL_KEYS,
  PROMPT_TEMPLATE_CREATE_KINDS,
  TAG_TEMPLATE_PLACEHOLDER_MODEL_ID,
  toPromptTemplateOutputType,
  type PromptTemplateCreateKind,
} from '@/constants/prompt-library'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import { ROUTES } from '@/constants/routes'
import { useRouter } from '@/i18n/navigation'
import { createRecipeAPI } from '@/lib/api-client/recipes'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { serializeTagChips } from '@/lib/tag-composer'
import type { CreateRecipeRequest, OutputType } from '@/types'
import type { TagChip, TagTemplateParamsSchema } from '@/types/tag-composer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from '@/components/ui/responsive-dialog'
import { StudioTagChipField } from '@/components/business/studio/tags/StudioTagChipField'
import { isTagSuggestionsTarget } from '@/components/business/studio/tags/StudioTagSuggestions'

export interface PromptTemplateCreateInitialValues {
  name?: string
  compiledPrompt?: string
  negativePrompt?: string
  modelId?: string
  provider?: string
  outputType?: OutputType
  parentGenerationId?: string
}

interface PromptTemplateCreatePanelProps {
  initialOpen?: boolean
  initialValues?: PromptTemplateCreateInitialValues
}

const DEFAULT_MODEL_ID = AI_MODELS.OPENAI_GPT_IMAGE_2
const DEFAULT_PROVIDER = getDefaultProviderConfig(AI_ADAPTER_TYPES.OPENAI).label
/** 标签模板那一格服务商跟着占格的 NAI 型号走（⛔ 界面不显示）。 */
const TAG_TEMPLATE_PROVIDER = getDefaultProviderConfig(
  AI_ADAPTER_TYPES.NOVELAI,
).label
const TAG_TEMPLATE_PARAMS = {
  promptDialect: 'tags',
  origin: 'prompts',
} satisfies z.infer<typeof TagTemplateParamsSchema>
const FIELD_LABEL = 'text-xs font-semibold text-muted-foreground'

function getModelOption(modelId: string) {
  return MODEL_OPTIONS.find((option) => option.id === modelId)
}

function getProviderForModel(modelId: string): string {
  const option = getModelOption(modelId)
  return option ? getDefaultProviderConfig(option.adapterType).label : ''
}

/** 切到图片 / 视频时，手上的模型不是这一类就换成这一类的第一个。 */
function defaultModelFor(kind: 'IMAGE' | 'VIDEO'): string | null {
  if (kind === 'IMAGE') return DEFAULT_MODEL_ID
  return (
    MODEL_OPTIONS.find(
      (option) => option.available && option.outputType === 'VIDEO',
    )?.id ?? null
  )
}

function normalizeInitialValues(
  initialValues?: PromptTemplateCreateInitialValues,
) {
  const modelId = initialValues?.modelId || DEFAULT_MODEL_ID
  const option = getModelOption(modelId)
  // Templates cover image/video only — legacy 3D / audio prefills fall back
  // to image (`toPromptTemplateOutputType`).
  const kind: PromptTemplateCreateKind = toPromptTemplateOutputType(
    initialValues?.outputType ?? option?.outputType,
  )
  return {
    name: initialValues?.name ?? '',
    compiledPrompt: initialValues?.compiledPrompt ?? '',
    negativePrompt: initialValues?.negativePrompt ?? '',
    modelId,
    provider:
      initialValues?.provider ||
      getProviderForModel(modelId) ||
      DEFAULT_PROVIDER,
    kind,
    parentGenerationId: initialValues?.parentGenerationId,
  }
}

/**
 * 提示词页的「新建模板」（pages/prompts.md「新建」，画板 `TgA_New`）：类型是三格分段。
 * 图片 / 视频 = 名字 · 提示词 · 推荐模型 · 服务商 · 负面；标签 = 名字 + 两块格子
 * （标签 · 负面标签），⛔ 没有模型那一行 —— 用在哪一台，点「使用」时再选。
 */
export function PromptTemplateCreatePanel({
  initialOpen = false,
  initialValues,
}: PromptTemplateCreatePanelProps) {
  const t = useTranslations('PromptLibrary')
  const tModels = useTranslations('Models')
  const router = useRouter()
  const reducedMotion = useReducedMotion()
  const normalizedInitialValues = useMemo(
    () => normalizeInitialValues(initialValues),
    [initialValues],
  )

  const [isOpen, setIsOpen] = useState(
    initialOpen || normalizedInitialValues.compiledPrompt.length > 0,
  )
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [kind, setKind] = useState<PromptTemplateCreateKind>(
    normalizedInitialValues.kind,
  )
  const [name, setName] = useState(normalizedInitialValues.name)
  const [compiledPrompt, setCompiledPrompt] = useState(
    normalizedInitialValues.compiledPrompt,
  )
  const [negativePrompt, setNegativePrompt] = useState(
    normalizedInitialValues.negativePrompt,
  )
  const [tags, setTags] = useState<TagChip[]>([])
  const [negativeTags, setNegativeTags] = useState<TagChip[]>([])
  const [modelId, setModelId] = useState(normalizedInitialValues.modelId)
  const [provider, setProvider] = useState(normalizedInitialValues.provider)
  const [parentGenerationId, setParentGenerationId] = useState(
    normalizedInitialValues.parentGenerationId,
  )

  /**
   * 切类型时弹窗高度跟着内容走（`TgMotion`）：量里面那一块的高度、外面这一层按它
   * 过渡，⛔ 先塌再撑。
   */
  const [bodyHeight, setBodyHeight] = useState<number | null>(null)
  const bodyObserver = useRef<ResizeObserver | null>(null)
  const measureBody = useCallback((node: HTMLDivElement | null) => {
    bodyObserver.current?.disconnect()
    bodyObserver.current = null
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setBodyHeight(node.offsetHeight))
    observer.observe(node)
    bodyObserver.current = observer
  }, [])

  const modelChoices = MODEL_OPTIONS.filter(
    (option) => option.available && option.outputType === kind,
  )

  const selectKind = (next: PromptTemplateCreateKind) => {
    setFormError(null)
    setKind(next)
    if (next === 'TAGS' || getModelOption(modelId)?.outputType === next) return
    const fallback = defaultModelFor(next)
    if (!fallback) return
    setModelId(fallback)
    setProvider(getProviderForModel(fallback) || DEFAULT_PROVIDER)
  }

  const selectModel = (nextModelId: string) => {
    setModelId(nextModelId)
    const option = getModelOption(nextModelId)
    if (!option) return
    setProvider(getDefaultProviderConfig(option.adapterType).label)
  }

  const resetForm = () => {
    const next = normalizeInitialValues()
    setName(next.name)
    setCompiledPrompt(next.compiledPrompt)
    setNegativePrompt(next.negativePrompt)
    setTags([])
    setNegativeTags([])
    setModelId(next.modelId)
    setProvider(next.provider)
    setKind(next.kind)
    setParentGenerationId(undefined)
  }

  const buildPayload = (): CreateRecipeRequest | string => {
    if (!name.trim()) return t('createNameRequired')
    if (kind === 'TAGS') {
      const tagText = serializeTagChips(tags)
      if (!tagText) return t('createTagsRequired')
      return {
        name: name.trim(),
        outputType: 'IMAGE',
        compiledPrompt: tagText,
        negativePrompt: serializeTagChips(negativeTags) || undefined,
        modelId: TAG_TEMPLATE_PLACEHOLDER_MODEL_ID,
        provider: TAG_TEMPLATE_PROVIDER,
        params: TAG_TEMPLATE_PARAMS,
      }
    }
    const prompt = compiledPrompt.trim()
    if (!prompt) return t('createPromptRequired')
    return {
      name: name.trim(),
      outputType: kind,
      compiledPrompt: prompt,
      negativePrompt: negativePrompt.trim() || undefined,
      modelId,
      provider,
      parentGenerationId,
    }
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)
    const payload = buildPayload()
    if (typeof payload === 'string') {
      setFormError(payload)
      return
    }

    setIsSaving(true)
    try {
      const response = await createRecipeAPI(payload)
      if (response.success && response.data) {
        toast.success(t('saveTemplateSuccess'))
        setIsOpen(false)
        resetForm()
        router.push(ROUTES.PROMPTS)
        router.refresh()
        return
      }
      setFormError(response.error ?? t('saveTemplateFailed'))
    } catch {
      setFormError(t('saveTemplateFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  const tagsKind = kind === 'TAGS'
  const swap = reducedMotion
    ? { duration: DURATION.fast, ease: 'linear' as const }
    : { duration: DURATION.base, ease: 'linear' as const }

  return (
    <div className="flex justify-end">
      <Button
        type="button"
        className="rounded-full"
        onClick={() => {
          setFormError(null)
          setIsOpen(true)
        }}
      >
        <Plus className="size-4" />
        {t('createAction')}
      </Button>
      <ResponsiveDialog
        open={isOpen}
        onOpenChange={(next) => {
          if (!isSaving) setIsOpen(next)
        }}
      >
        <ResponsiveDialogContent
          className="overflow-y-auto sm:max-w-2xl"
          style={{ maxHeight: '85svh' }}
          // 标签格的联想挂在弹窗外面：点它不算「点外面」，联想开着时 Esc 先收联想。
          onPointerDownOutside={(event) => {
            if (isTagSuggestionsTarget(event.target)) event.preventDefault()
          }}
          onEscapeKeyDown={(event) => {
            const target = event.target
            if (
              target instanceof HTMLElement &&
              target.getAttribute('aria-expanded') === 'true'
            )
              event.preventDefault()
          }}
        >
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t('createTitle')}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription className="sr-only">
              {t('createDescription')}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <form onSubmit={(event) => void submit(event)} className="space-y-5">
            <div className="grid gap-4">
              <LiquidSegmented
                size="md"
                semantics="radio"
                ariaLabel={t('createOutputTypeLabel')}
                value={kind}
                onChange={selectKind}
                items={PROMPT_TEMPLATE_CREATE_KINDS.map((value) => ({
                  value,
                  label:
                    value === 'TAGS'
                      ? t('typeTags')
                      : t(PROMPT_OUTPUT_TYPE_LABEL_KEYS[value]),
                }))}
                className="justify-self-start"
              />

              <div className="space-y-2">
                <label className={FIELD_LABEL} htmlFor="recipe-name">
                  {t('createNameLabel')}
                </label>
                <Input
                  id="recipe-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t('createNamePlaceholder')}
                  maxLength={200}
                  required
                />
              </div>

              <motion.div
                initial={false}
                animate={
                  bodyHeight === null ? undefined : { height: bodyHeight }
                }
                transition={{
                  duration: reducedMotion ? 0 : DURATION.base,
                  ease: EASE_STANDARD,
                }}
                // 让出焦点环那一圈：高度过渡要裁掉溢出，⛔ 连焦点环一起裁。
                className="-m-1 overflow-hidden p-1"
              >
                <div ref={measureBody} className="relative">
                  <AnimatePresence initial={false} mode="popLayout">
                    <motion.div
                      key={tagsKind ? 'tags' : 'prompt'}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1, transition: swap }}
                      exit={{ opacity: 0, transition: swap }}
                      className="grid gap-4"
                    >
                      {tagsKind ? (
                        <>
                          <StudioTagChipField
                            variant="form"
                            label={t('tagsLabel')}
                            note={t('tagsNote')}
                            polarity="positive"
                            chips={tags}
                            onChange={setTags}
                          />
                          <StudioTagChipField
                            variant="form"
                            label={t('negativeTagsLabel')}
                            polarity="negative"
                            chips={negativeTags}
                            onChange={setNegativeTags}
                          />
                          <p className="text-xs leading-4.5 text-muted-foreground">
                            {t('createTagsNote')}
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="space-y-2">
                            <label
                              className={FIELD_LABEL}
                              htmlFor="recipe-prompt"
                            >
                              {t('createPromptLabel')}
                            </label>
                            <Textarea
                              id="recipe-prompt"
                              value={compiledPrompt}
                              onChange={(event) =>
                                setCompiledPrompt(event.target.value)
                              }
                              placeholder={t('createPromptPlaceholder')}
                              className="min-h-40 resize-y rounded-xl text-sm leading-6"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <label
                                className={FIELD_LABEL}
                                htmlFor="recipe-model"
                              >
                                {t('createModelLabel')}
                              </label>
                              <Select
                                value={modelId}
                                onValueChange={selectModel}
                              >
                                <SelectTrigger
                                  id="recipe-model"
                                  className="w-full"
                                  aria-label={t('createModelLabel')}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {!getModelOption(modelId) && (
                                    <SelectItem value={modelId}>
                                      {modelId}
                                    </SelectItem>
                                  )}
                                  {modelChoices.map((option) => (
                                    <SelectItem
                                      key={option.id}
                                      value={option.id}
                                    >
                                      {getTranslatedModelLabel(
                                        tModels,
                                        option.id,
                                      )}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <label
                                className={FIELD_LABEL}
                                htmlFor="recipe-provider"
                              >
                                {t('provider')}
                              </label>
                              <Input
                                id="recipe-provider"
                                value={provider}
                                onChange={(event) =>
                                  setProvider(event.target.value)
                                }
                                maxLength={100}
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label
                              className={FIELD_LABEL}
                              htmlFor="recipe-negative"
                            >
                              {t('createNegativePromptLabel')}
                            </label>
                            <Textarea
                              id="recipe-negative"
                              value={negativePrompt}
                              onChange={(event) =>
                                setNegativePrompt(event.target.value)
                              }
                              placeholder={t('createNegativePromptPlaceholder')}
                              className="min-h-24 resize-y text-sm leading-6"
                            />
                          </div>
                        </>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </motion.div>
            </div>

            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsOpen(false)}
                disabled={isSaving}
              >
                <X className="size-4" />
                {t('editCancel')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full px-5"
                onClick={resetForm}
                disabled={isSaving}
              >
                {t('createReset')}
              </Button>
              <Button
                type="submit"
                className="rounded-full px-5"
                disabled={isSaving}
              >
                {isSaving ? <Spinner size="md" /> : <Save className="size-4" />}
                {isSaving ? t('createSaving') : t('createSubmit')}
              </Button>
            </div>
          </form>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  )
}
