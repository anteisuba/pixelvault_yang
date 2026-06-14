'use client'

import { useMemo, useState } from 'react'
import { FileText, Loader2, Plus, Save, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { AI_MODELS, MODEL_OPTIONS } from '@/constants/models'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import { ROUTES } from '@/constants/routes'
import { useRouter } from '@/i18n/navigation'
import { createRecipeAPI } from '@/lib/api-client/recipes'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { CreateRecipeRequest, OutputType } from '@/types'

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
const DEFAULT_OUTPUT_TYPE: OutputType = 'IMAGE'
const OUTPUT_TYPES: OutputType[] = ['IMAGE', 'VIDEO', 'AUDIO', 'MODEL_3D']
const OUTPUT_TYPE_LABEL_KEYS: Record<OutputType, string> = {
  IMAGE: 'outputTypeImage',
  VIDEO: 'outputTypeVideo',
  AUDIO: 'outputTypeAudio',
  MODEL_3D: 'outputType3d',
}
const MODEL_CHOICES = MODEL_OPTIONS.filter((option) => option.available)

function getModelOption(modelId: string) {
  return MODEL_OPTIONS.find((option) => option.id === modelId)
}

function getProviderForModel(modelId: string): string {
  const option = getModelOption(modelId)
  return option ? getDefaultProviderConfig(option.adapterType).label : ''
}

function normalizeInitialValues(
  initialValues?: PromptTemplateCreateInitialValues,
): Required<Omit<PromptTemplateCreateInitialValues, 'parentGenerationId'>> & {
  parentGenerationId?: string
} {
  const modelId = initialValues?.modelId || DEFAULT_MODEL_ID
  const option = getModelOption(modelId)
  return {
    name: initialValues?.name ?? '',
    compiledPrompt: initialValues?.compiledPrompt ?? '',
    negativePrompt: initialValues?.negativePrompt ?? '',
    modelId,
    provider:
      initialValues?.provider ||
      getProviderForModel(modelId) ||
      DEFAULT_PROVIDER,
    outputType:
      initialValues?.outputType ?? option?.outputType ?? DEFAULT_OUTPUT_TYPE,
    parentGenerationId: initialValues?.parentGenerationId,
  }
}

export function PromptTemplateCreatePanel({
  initialOpen = false,
  initialValues,
}: PromptTemplateCreatePanelProps) {
  const t = useTranslations('PromptLibrary')
  const tModels = useTranslations('Models')
  const router = useRouter()
  const normalizedInitialValues = useMemo(
    () => normalizeInitialValues(initialValues),
    [initialValues],
  )

  const [isOpen, setIsOpen] = useState(
    initialOpen || normalizedInitialValues.compiledPrompt.length > 0,
  )
  const [isSaving, setIsSaving] = useState(false)
  const [name, setName] = useState(normalizedInitialValues.name)
  const [compiledPrompt, setCompiledPrompt] = useState(
    normalizedInitialValues.compiledPrompt,
  )
  const [negativePrompt, setNegativePrompt] = useState(
    normalizedInitialValues.negativePrompt,
  )
  const [modelId, setModelId] = useState(normalizedInitialValues.modelId)
  const [provider, setProvider] = useState(normalizedInitialValues.provider)
  const [outputType, setOutputType] = useState(
    normalizedInitialValues.outputType,
  )
  const [parentGenerationId, setParentGenerationId] = useState(
    normalizedInitialValues.parentGenerationId,
  )

  const selectModel = (nextModelId: string) => {
    setModelId(nextModelId)
    const option = getModelOption(nextModelId)
    if (!option) return
    setOutputType(option.outputType)
    setProvider(getDefaultProviderConfig(option.adapterType).label)
  }

  const resetForm = () => {
    const next = normalizeInitialValues()
    setName(next.name)
    setCompiledPrompt(next.compiledPrompt)
    setNegativePrompt(next.negativePrompt)
    setModelId(next.modelId)
    setProvider(next.provider)
    setOutputType(next.outputType)
    setParentGenerationId(undefined)
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const prompt = compiledPrompt.trim()
    if (!prompt) {
      toast.error(t('createPromptRequired'))
      return
    }

    const payload: CreateRecipeRequest = {
      name: name.trim(),
      outputType,
      compiledPrompt: prompt,
      negativePrompt: negativePrompt.trim() || undefined,
      modelId,
      provider,
      parentGenerationId,
    }

    setIsSaving(true)
    try {
      const response = await createRecipeAPI(payload)
      if (response.success && response.data) {
        toast.success(t('saveTemplateSuccess'))
        router.push(ROUTES.PROMPTS)
        router.refresh()
        return
      }
      toast.error(response.error ?? t('saveTemplateFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) {
    return (
      <section className="rounded-2xl border border-dashed border-border/70 bg-card/55 px-5 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <FileText className="size-4" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-medium">
                {t('createTitle')}
              </h2>
              <p className="mt-1 font-serif text-sm leading-6 text-muted-foreground">
                {t('createDescription')}
              </p>
            </div>
          </div>
          <Button
            type="button"
            className="w-fit rounded-full px-5"
            onClick={() => setIsOpen(true)}
          >
            <Plus className="size-4" />
            {t('createAction')}
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-border/70 bg-card/75 p-5">
      <form onSubmit={(event) => void submit(event)} className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <p className="editorial-eyebrow">{t('createEyebrow')}</p>
            <h2 className="font-display text-2xl font-medium">
              {t('createTitle')}
            </h2>
            <p className="font-serif text-sm leading-7 text-muted-foreground">
              {t('createDescription')}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-fit rounded-full"
            onClick={() => {
              setIsOpen(false)
              if (!normalizedInitialValues.compiledPrompt) resetForm()
            }}
          >
            <X className="size-4" />
            {t('createCollapse')}
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="recipe-prompt">
              {t('createPromptLabel')}
            </label>
            <Textarea
              id="recipe-prompt"
              value={compiledPrompt}
              onChange={(event) => setCompiledPrompt(event.target.value)}
              placeholder={t('createPromptPlaceholder')}
              className="min-h-56 resize-y rounded-xl text-sm leading-6"
              maxLength={5000}
              required
            />
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="recipe-name">
                {t('createNameLabel')}
              </label>
              <Input
                id="recipe-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('createNamePlaceholder')}
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="recipe-model">
                {t('createModelLabel')}
              </label>
              <select
                id="recipe-model"
                value={modelId}
                onChange={(event) => selectModel(event.target.value)}
                className={cn(
                  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none transition-[color,box-shadow]',
                  'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                )}
              >
                {!getModelOption(modelId) && (
                  <option value={modelId}>{modelId}</option>
                )}
                {MODEL_CHOICES.map((option) => (
                  <option key={option.id} value={option.id}>
                    {getTranslatedModelLabel(tModels, option.id)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="recipe-type">
                  {t('createOutputTypeLabel')}
                </label>
                <select
                  id="recipe-type"
                  value={outputType}
                  onChange={(event) =>
                    setOutputType(event.target.value as OutputType)
                  }
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {OUTPUT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(OUTPUT_TYPE_LABEL_KEYS[type])}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label
                  className="text-sm font-medium"
                  htmlFor="recipe-provider"
                >
                  {t('provider')}
                </label>
                <Input
                  id="recipe-provider"
                  value={provider}
                  onChange={(event) => setProvider(event.target.value)}
                  maxLength={100}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="recipe-negative">
                {t('createNegativePromptLabel')}
              </label>
              <Textarea
                id="recipe-negative"
                value={negativePrompt}
                onChange={(event) => setNegativePrompt(event.target.value)}
                placeholder={t('createNegativePromptPlaceholder')}
                className="min-h-24 resize-y text-sm leading-6"
                maxLength={1000}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:justify-end">
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
            {isSaving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {isSaving ? t('createSaving') : t('createSubmit')}
          </Button>
        </div>
      </form>
    </section>
  )
}
