'use client'

import { useMemo, useState } from 'react'
import { Plus, Save, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { AI_MODELS, MODEL_OPTIONS } from '@/constants/models'
import {
  PROMPT_TEMPLATE_OUTPUT_TYPES,
  PROMPT_OUTPUT_TYPE_LABEL_KEYS,
  toPromptTemplateOutputType,
  type PromptTemplateOutputType,
} from '@/constants/prompt-library'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import { ROUTES } from '@/constants/routes'
import { useRouter } from '@/i18n/navigation'
import { createRecipeAPI } from '@/lib/api-client/recipes'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
): Required<
  Omit<PromptTemplateCreateInitialValues, 'parentGenerationId' | 'outputType'>
> & {
  outputType: PromptTemplateOutputType
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
    // Templates cover image/video/audio only — legacy 3D prefills fall back
    // to image (see PROMPT_TEMPLATE_OUTPUT_TYPES).
    outputType: toPromptTemplateOutputType(
      initialValues?.outputType ?? option?.outputType,
    ),
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
  const [formError, setFormError] = useState<string | null>(null)
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
    setOutputType(toPromptTemplateOutputType(option.outputType))
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
    setFormError(null)
    if (!name.trim()) {
      setFormError(t('createNameRequired'))
      return
    }
    const prompt = compiledPrompt.trim()
    if (!prompt) {
      setFormError(t('createPromptRequired'))
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

  return (
    <div className="flex justify-end">
      <Button
        type="button"
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
        >
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t('createTitle')}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription className="sr-only">
              {t('createDescription')}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <form onSubmit={(event) => void submit(event)} className="space-y-5">
            <div className="grid gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="recipe-prompt">
                  {t('createPromptLabel')}
                </label>
                <Textarea
                  id="recipe-prompt"
                  value={compiledPrompt}
                  onChange={(event) => setCompiledPrompt(event.target.value)}
                  placeholder={t('createPromptPlaceholder')}
                  className="min-h-40 resize-y rounded-xl text-sm leading-6"
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
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="recipe-model">
                    {t('createModelLabel')}
                  </label>
                  <Select value={modelId} onValueChange={selectModel}>
                    <SelectTrigger
                      id="recipe-model"
                      className="w-full"
                      aria-label={t('createModelLabel')}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {!getModelOption(modelId) && (
                        <SelectItem value={modelId}>{modelId}</SelectItem>
                      )}
                      {MODEL_CHOICES.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {getTranslatedModelLabel(tModels, option.id)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label
                      className="text-sm font-medium"
                      htmlFor="recipe-type"
                    >
                      {t('createOutputTypeLabel')}
                    </label>
                    <Select
                      value={outputType}
                      onValueChange={(value) =>
                        setOutputType(value as PromptTemplateOutputType)
                      }
                    >
                      <SelectTrigger
                        id="recipe-type"
                        className="w-full"
                        aria-label={t('createOutputTypeLabel')}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROMPT_TEMPLATE_OUTPUT_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {t(PROMPT_OUTPUT_TYPE_LABEL_KEYS[type])}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                  <label
                    className="text-sm font-medium"
                    htmlFor="recipe-negative"
                  >
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
