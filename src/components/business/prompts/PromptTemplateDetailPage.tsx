'use client'
/* eslint-disable @next/next/no-img-element -- stored generation thumbnails are already optimized R2 derivatives */

import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion, type Transition } from 'motion/react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  ChevronLeft,
  Globe,
  ImageOff,
  Lock,
  MoreHorizontal,
  Pencil,
  Trash2,
} from '@/components/icons'
import { MODEL_OPTIONS } from '@/constants/models'
import { DURATION, EASE_STANDARD } from '@/constants/motion'
import { RECIPE_VISIBILITY } from '@/constants/prompt-library'
import { getDefaultProviderConfig } from '@/constants/providers'
import { usePromptTemplateModelLabel } from '@/hooks/use-prompt-template-model-label'
import { usePromptTemplateUse } from '@/hooks/use-prompt-template-use'
import { useRouter } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'
import {
  deleteRecipeAPI,
  getRecipeAPI,
  listRecipeGenerationsAPI,
  setRecipeVisibilityAPI,
  updateRecipeAPI,
} from '@/lib/api-client/recipes'
import { getGenerationPreviewUrl } from '@/lib/generation-media'
import { getTranslatedModelLabel } from '@/lib/model-options'
import {
  loraTemplateFallbackName,
  readRecipeAspectRatio,
  readRecipeLoraSetup,
  readRecipeNegativePrompt,
  readRecipeNovelAiCharacters,
  readRecipeRunnerParameters,
  withRecipeNegativePrompt,
} from '@/lib/recipe-lora-setup'
import { parseTagChips, serializeTagChips } from '@/lib/tag-composer'
import { cn } from '@/lib/utils'
import type {
  CreateRecipeRequest,
  GenerationRecord,
  RecipeRecord,
} from '@/types'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { StudioTagChipField } from '@/components/business/studio/tags/StudioTagChipField'
import { CopyPromptButton } from './CopyPromptButton'
import {
  PromptTemplateKindBadge,
  PromptTemplateSourceMark,
} from './PromptTemplateKindBadge'
import type { PromptTemplateListItem } from './PromptTemplateList'
import { PromptTemplateTagChips } from './PromptTemplateTagChips'
import { PromptTemplateUseMenu } from './PromptTemplateUseMenu'

interface PromptTemplateDetailPageProps {
  recipe: PromptTemplateListItem
  locale: AppLocale
  onClose: () => void
  onDeleted: (id: string) => void
  /** 改名 / 改正文 / 发布之后把卡片那一格也换掉（列表不整页重取）。 */
  onChanged: (patch: Partial<PromptTemplateListItem> & { id: string }) => void
  onUsed: () => void
}

interface Draft {
  name: string
  compiledPrompt: string
  negativePrompt: string
  modelId: string
}

const pill =
  'h-8.5 rounded-full px-3.5 text-2sm transition-colors duration-fast ease-linear'
const blockTitle = 'mb-2 text-xs font-semibold text-muted-foreground'
const box =
  'whitespace-pre-wrap break-words rounded-xl bg-muted px-3.5 py-3 font-mono text-2sm leading-5 text-foreground'

/**
 * 提示词页 A 的详情（pages/prompts.md）：一整页从下往上升盖住网格（同 LoRA 库 B 的
 * 详情页），⛔ 弹窗。左边这一套出过的作品，右边一条窄栏；标签模板把标签、负面、各角色
 * 画成一墙一墙的格子（画板 `TgA_Use`），LoRA 台存的先放「搭配」与「参数」。
 */
export function PromptTemplateDetailPage({
  recipe,
  locale,
  onClose,
  onDeleted,
  onChanged,
  onUsed,
}: PromptTemplateDetailPageProps) {
  const t = useTranslations('PromptLibrary')
  const tModels = useTranslations('Models')
  const router = useRouter()
  const reducedMotion = useReducedMotion()
  const modelLabel = usePromptTemplateModelLabel()
  const openTemplate = usePromptTemplateUse()
  const pageRef = useRef<HTMLDivElement>(null)

  const [detail, setDetail] = useState<RecipeRecord | null>(null)
  const [generations, setGenerations] = useState<GenerationRecord[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>(
    'loading',
  )
  const [attempt, setAttempt] = useState(0)
  const [shownIndex, setShownIndex] = useState(0)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      getRecipeAPI(recipe.id),
      listRecipeGenerationsAPI(recipe.id),
    ])
      .then(([detailResult, generationsResult]) => {
        if (cancelled) return
        if (generationsResult.success && generationsResult.data) {
          setGenerations(generationsResult.data)
        }
        if (detailResult.success && detailResult.data) {
          setDetail(detailResult.data)
          setLoadState('ready')
        } else {
          setLoadState('failed')
        }
      })
      .catch(() => {
        if (!cancelled) setLoadState('failed')
      })
    return () => {
      cancelled = true
    }
  }, [recipe.id, attempt])

  // Esc 关上（焦点在这一页里、没有在编辑时）；编辑时 Esc 交给表单自己。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || editing) return
      if (!pageRef.current?.contains(document.activeElement)) return
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [editing, onClose])

  const title = (detail?.name ?? recipe.name) || modelLabel(recipe)
  const compiledPrompt = detail?.compiledPrompt ?? recipe.compiledPrompt
  const negativePrompt = detail ? readRecipeNegativePrompt(detail) : ''
  const source = recipe.tagSource
  const isLora = source === 'lora'
  /** 标签台存的与这里新建的：编辑时用格子；LoRA 台存的原文送回 LoRA 台，仍是原文框。 */
  const editsAsChips = source === 'tags' || source === 'prompts'
  const characters = detail ? readRecipeNovelAiCharacters(detail.params) : []
  const visibility = detail?.visibility ?? recipe.visibility
  const isPublic = visibility === RECIPE_VISIBILITY.PUBLIC
  const date = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(recipe.createdAt))
  const shown = generations[shownIndex] ?? null

  /** LoRA 那一栏：新存的读整套里的名字；旧存的用列表补好的名字，再补不到写文件名。 */
  const loraRead = detail ? readRecipeLoraSetup(detail.params) : null
  const loraMix = loraRead
    ? {
        baseId: loraRead.baseId,
        items: loraRead.items.map((item, index) => ({
          name:
            item.asset?.name ??
            recipe.lora?.items[index]?.name ??
            loraTemplateFallbackName(item.url),
          scale: item.scale,
        })),
      }
    : recipe.lora

  const parameterLine = (() => {
    if (!detail) return null
    const parameters = readRecipeRunnerParameters(detail.params)
    const size =
      parameters.runnerWidth && parameters.runnerHeight
        ? `${parameters.runnerWidth}×${parameters.runnerHeight}`
        : readRecipeAspectRatio(detail.params)
    const parts = [
      parameters.runnerSampler ?? null,
      parameters.runnerScheduler ?? null,
      parameters.steps != null
        ? t('paramSteps', { steps: parameters.steps })
        : null,
      parameters.guidanceScale != null
        ? `CFG ${parameters.guidanceScale}`
        : null,
      size,
    ].filter((part): part is string => Boolean(part))
    return [
      parts.length > 0 ? parts.join(' · ') : t('paramsDefault'),
      t('paramSeedRandom'),
    ].join(' · ')
  })()

  const modelChoices = MODEL_OPTIONS.filter(
    (option) =>
      option.available &&
      option.outputType === (detail?.outputType ?? recipe.outputType),
  )

  const startEditing = () => {
    setDraft({
      name: detail?.name ?? recipe.name,
      compiledPrompt,
      negativePrompt,
      modelId: detail?.modelId ?? recipe.modelId,
    })
    setFormError(null)
    setEditing(true)
  }

  const cancelEditing = () => {
    setEditing(false)
    setDraft(null)
    setFormError(null)
  }

  const saveChanges = async () => {
    if (!draft || !detail) return
    const name = draft.name.trim()
    const prompt = draft.compiledPrompt.trim()
    if (!name) {
      setFormError(t('createNameRequired'))
      return
    }
    if (!prompt) {
      setFormError(t('createPromptRequired'))
      return
    }
    const option = MODEL_OPTIONS.find((entry) => entry.id === draft.modelId)
    const negative = draft.negativePrompt.trim()
    const payload: CreateRecipeRequest = {
      name,
      outputType: detail.outputType,
      compiledPrompt: prompt,
      negativePrompt: negative || undefined,
      modelId: draft.modelId,
      provider:
        draft.modelId !== detail.modelId && option
          ? getDefaultProviderConfig(option.adapterType).label
          : detail.provider,
      parentGenerationId: detail.parentGenerationId ?? undefined,
      // 标签台存的整组套用时读参数里那一份负面：两处一起改。
      ...(source === 'tags'
        ? { params: withRecipeNegativePrompt(detail.params, negative) }
        : {}),
    }
    setSaving(true)
    setFormError(null)
    try {
      const response = await updateRecipeAPI(recipe.id, payload)
      if (response.success && response.data) {
        setDetail(response.data)
        onChanged({
          id: recipe.id,
          name: response.data.name,
          compiledPrompt: response.data.compiledPrompt,
          modelId: response.data.modelId,
          version: response.data.version,
        })
        setEditing(false)
        setDraft(null)
        toast.success(t('updateTemplateSuccess'))
        router.refresh()
        return
      }
      setFormError(response.error ?? t('updateTemplateFailed'))
    } catch {
      setFormError(t('updateTemplateFailed'))
    } finally {
      setSaving(false)
    }
  }

  const togglePublish = async () => {
    const next = isPublic ? RECIPE_VISIBILITY.PRIVATE : RECIPE_VISIBILITY.PUBLIC
    setPublishing(true)
    try {
      const response = await setRecipeVisibilityAPI(recipe.id, next)
      if (response.success) {
        setDetail((prev) => (prev ? { ...prev, visibility: next } : prev))
        onChanged({ id: recipe.id, visibility: next })
        toast.success(isPublic ? t('unpublishSuccess') : t('publishSuccess'))
        return
      }
      toast.error(response.error ?? t('publishFailed'))
    } finally {
      setPublishing(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const result = await deleteRecipeAPI(recipe.id)
      if (result.success) {
        toast.success(t('deleteSuccess'))
        onDeleted(recipe.id)
        return
      }
      toast.error(result.error ?? t('deleteFailed'))
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const startUsing = (destination?: 'tags' | 'lora') => {
    if (
      openTemplate(
        {
          id: recipe.id,
          templateKind: recipe.templateKind,
          compiledPrompt,
        },
        destination,
      )
    ) {
      onUsed()
      return
    }
    setFormError(t('useFailed'))
  }

  const enter: Transition = reducedMotion
    ? { duration: DURATION.fast, ease: 'linear' }
    : { duration: DURATION.slow, ease: EASE_STANDARD }
  const leave: Transition = reducedMotion
    ? { duration: DURATION.fast, ease: 'linear' }
    : { duration: DURATION.base, ease: EASE_STANDARD }

  return (
    <motion.div
      ref={pageRef}
      role="region"
      aria-label={title}
      data-testid="prompt-template-detail"
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0, transition: enter }}
      exit={
        reducedMotion
          ? { opacity: 0, transition: leave }
          : { opacity: 0, y: 32, transition: leave }
      }
      className="absolute inset-0 z-20 flex flex-col bg-card"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-border/70 py-3 pl-3 pr-5">
        <button
          type="button"
          autoFocus
          onClick={onClose}
          aria-label={t('back')}
          className="grid size-8.5 shrink-0 place-items-center rounded-full text-foreground/75 transition-colors duration-fast ease-linear hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft aria-hidden className="size-4" />
        </button>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="truncate text-lg font-semibold leading-5.5 text-foreground">
            {title}
          </h2>
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <PromptTemplateKindBadge kind={recipe.templateKind} />
            {source ? <PromptTemplateSourceMark source={source} /> : null}
            {isPublic ? (
              <span className="inline-flex shrink-0 items-center gap-1">
                <Globe aria-hidden className="size-3" />
                {t('publishedBadge')}
              </span>
            ) : null}
            <span className="truncate font-mono">
              {source === 'prompts'
                ? t('templateMetaVersion', {
                    version: detail?.version ?? recipe.version,
                  })
                : t('templateMeta', {
                    model: modelLabel(recipe),
                    version: detail?.version ?? recipe.version,
                  })}{' '}
              · {date}
            </span>
          </div>
        </div>
        {editing ? null : (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {source ? (
              <PromptTemplateUseMenu
                source={source}
                onUse={startUsing}
                triggerClassName={cn(pill, 'px-4 font-semibold')}
              />
            ) : (
              <Button
                type="button"
                onClick={() => startUsing()}
                className={cn(pill, 'px-4 font-semibold')}
              >
                {t('useAction')}
              </Button>
            )}
            <CopyPromptButton
              quiet
              prompt={compiledPrompt}
              label={source ? t('copyTagsAction') : t('copyPromptAction')}
              className={pill}
            />
            <Button
              type="button"
              variant="outline"
              onClick={startEditing}
              disabled={loadState !== 'ready'}
              className={pill}
            >
              <Pencil aria-hidden className="size-3.5" />
              {t('editShort')}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  aria-label={t('moreActions')}
                  className="size-8.5 rounded-full p-0"
                >
                  <MoreHorizontal aria-hidden className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  disabled={publishing || loadState !== 'ready'}
                  onSelect={() => void togglePublish()}
                >
                  {isPublic ? (
                    <Lock aria-hidden className="size-4" />
                  ) : (
                    <Globe aria-hidden className="size-4" />
                  )}
                  {isPublic ? t('unpublishAction') : t('publishAction')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setConfirmDelete(true)}
                >
                  <Trash2 aria-hidden className="size-4" />
                  {t('deleteAction')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1 gap-6 overflow-hidden p-5 max-lg:flex-col max-lg:overflow-y-auto">
        <section
          aria-label={t('generatedAssets')}
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-3"
        >
          {loadState === 'loading' ? (
            <div className="min-h-64 flex-1 animate-pulse rounded-xl bg-muted" />
          ) : shown ? (
            <>
              <div className="relative grid min-h-64 flex-1 place-items-center overflow-hidden rounded-xl bg-muted">
                <img
                  src={getGenerationPreviewUrl(shown)}
                  alt={shown.prompt || title}
                  className="size-full object-contain"
                />
              </div>
              {generations.length > 1 ? (
                <div className="flex shrink-0 items-center gap-2">
                  <div
                    role="listbox"
                    aria-label={t('generatedAssets')}
                    className="flex min-w-0 gap-2 overflow-x-auto"
                  >
                    {generations.map((generation, index) => (
                      <button
                        key={generation.id}
                        type="button"
                        role="option"
                        aria-selected={index === shownIndex}
                        onClick={() => setShownIndex(index)}
                        className={cn(
                          'size-16 shrink-0 overflow-hidden rounded-lg bg-muted transition-shadow duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          index === shownIndex
                            ? 'ring-2 ring-foreground ring-offset-2 ring-offset-card'
                            : 'hover:ring-2 hover:ring-foreground/20',
                        )}
                      >
                        <img
                          src={getGenerationPreviewUrl(generation)}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t('worksCount', { count: generations.length })}
                  </span>
                </div>
              ) : null}
            </>
          ) : (
            <div className="grid min-h-64 flex-1 place-items-center rounded-xl bg-muted text-2sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <ImageOff aria-hidden className="size-4" />
                {t('noWorks')}
              </span>
            </div>
          )}
        </section>

        <aside
          aria-label={title}
          className="flex w-95 shrink-0 flex-col gap-4.5 overflow-y-auto max-lg:w-full"
        >
          {loadState === 'failed' ? (
            <div role="alert" className="space-y-3 text-2sm">
              <p>{t('detailLoadFailed')}</p>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  setLoadState('loading')
                  setAttempt((value) => value + 1)
                }}
              >
                {t('retryAction')}
              </Button>
            </div>
          ) : editing && draft ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                void saveChanges()
              }}
              onKeyDown={(event) => {
                // 格子输入框先用 Esc 收起联想（它会 preventDefault），那一下不算取消。
                if (event.key === 'Escape' && !event.defaultPrevented)
                  cancelEditing()
              }}
            >
              <label className="flex flex-col gap-2">
                <span className={blockTitle}>{t('createNameLabel')}</span>
                <Input
                  value={draft.name}
                  maxLength={200}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                />
              </label>
              {editsAsChips ? (
                <>
                  <StudioTagChipField
                    variant="form"
                    label={t('tagsLabel')}
                    note={t('tagsNote')}
                    polarity="positive"
                    chips={parseTagChips(draft.compiledPrompt)}
                    onChange={(chips) =>
                      setDraft({
                        ...draft,
                        compiledPrompt: serializeTagChips(chips),
                      })
                    }
                  />
                  <StudioTagChipField
                    variant="form"
                    label={t('negativeTagsLabel')}
                    polarity="negative"
                    chips={parseTagChips(draft.negativePrompt)}
                    onChange={(chips) =>
                      setDraft({
                        ...draft,
                        negativePrompt: serializeTagChips(chips),
                      })
                    }
                  />
                </>
              ) : (
                <>
                  <label className="flex flex-col gap-2">
                    <span className={blockTitle}>{t('detailPrompt')}</span>
                    <Textarea
                      value={draft.compiledPrompt}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          compiledPrompt: event.target.value,
                        })
                      }
                      className="min-h-40 resize-y rounded-xl font-mono text-2sm leading-5"
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className={blockTitle}>{t('detailNegative')}</span>
                    <Textarea
                      value={draft.negativePrompt}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          negativePrompt: event.target.value,
                        })
                      }
                      placeholder={t('createNegativePromptPlaceholder')}
                      className="min-h-24 resize-y rounded-xl font-mono text-2sm leading-5"
                    />
                  </label>
                </>
              )}
              {/* 标签模板没有要换的模型（LoRA 台存的是它的底模，改法在 LoRA 台）；别的模板在这里换。 */}
              {source ? null : (
                <label className="flex flex-col gap-2">
                  <span className={blockTitle}>{t('detailModel')}</span>
                  <Select
                    value={draft.modelId}
                    onValueChange={(modelId) => setDraft({ ...draft, modelId })}
                  >
                    <SelectTrigger aria-label={t('detailModel')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {modelChoices.some(
                        (option) => option.id === draft.modelId,
                      ) ? null : (
                        <SelectItem value={draft.modelId}>
                          {getTranslatedModelLabel(tModels, draft.modelId)}
                        </SelectItem>
                      )}
                      {modelChoices.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {getTranslatedModelLabel(tModels, option.id)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              )}
              {formError ? (
                <p role="alert" className="text-2sm text-destructive">
                  {formError}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-full"
                  disabled={saving}
                  onClick={cancelEditing}
                >
                  {t('editCancel')}
                </Button>
                <Button
                  type="submit"
                  className="rounded-full"
                  disabled={saving}
                >
                  {saving ? <Spinner size="sm" /> : null}
                  {saving ? t('createSaving') : t('editSubmit')}
                </Button>
              </div>
            </form>
          ) : source ? (
            <>
              {isLora && loraMix ? (
                <section>
                  <h3 className={blockTitle}>
                    {t('detailMix', { base: modelLabel(recipe) })}
                  </h3>
                  <ul className="flex flex-col">
                    {loraMix.items.map((item, index) => (
                      <li
                        key={index}
                        className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5 text-2sm last:border-b-0"
                      >
                        <span className="min-w-0 truncate">
                          {item.name ?? t('loraUnnamed')}
                        </span>
                        <b className="shrink-0 font-mono text-xs font-semibold tabular-nums">
                          {item.scale.toFixed(2)}
                        </b>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {isLora ? (
                <section>
                  <h3 className={blockTitle}>{t('detailParams')}</h3>
                  {parameterLine ? (
                    <p className={box}>{parameterLine}</p>
                  ) : (
                    <div className="h-11 animate-pulse rounded-xl bg-muted" />
                  )}
                </section>
              ) : null}
              <section>
                <h3 className={blockTitle}>
                  {t('detailTagsCount', {
                    count: parseTagChips(compiledPrompt).length,
                  })}
                </h3>
                <PromptTemplateTagChips text={compiledPrompt} />
              </section>
              <section>
                <h3 className={blockTitle}>
                  {loadState === 'loading'
                    ? t('detailNegative')
                    : t('detailNegativeCount', {
                        count: parseTagChips(negativePrompt).length,
                      })}
                </h3>
                {loadState === 'loading' ? (
                  <div className="h-11 animate-pulse rounded-xl bg-muted" />
                ) : negativePrompt ? (
                  <PromptTemplateTagChips text={negativePrompt} negative />
                ) : (
                  <p className="text-2sm text-muted-foreground">
                    {t('detailNoNegative')}
                  </p>
                )}
              </section>
              {characters.map((text, index) => (
                <section key={index}>
                  <h3 className={blockTitle}>
                    {t('detailCharacter', { n: index + 1 })}
                  </h3>
                  <PromptTemplateTagChips text={text} />
                </section>
              ))}
              {formError ? (
                <p role="alert" className="text-2sm text-destructive">
                  {formError}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <section>
                <h3 className={blockTitle}>{t('detailModel')}</h3>
                <p className="text-2sm text-foreground">{modelLabel(recipe)}</p>
              </section>
              <section>
                <h3 className={blockTitle}>{t('detailPrompt')}</h3>
                <p className={box}>{compiledPrompt}</p>
              </section>
              <section>
                <h3 className={blockTitle}>{t('detailNegative')}</h3>
                {loadState === 'loading' ? (
                  <div className="h-11 animate-pulse rounded-xl bg-muted" />
                ) : negativePrompt ? (
                  <p className={box}>{negativePrompt}</p>
                ) : (
                  <p className="text-2sm text-muted-foreground">
                    {t('detailNoNegative')}
                  </p>
                )}
              </section>
              {formError ? (
                <p role="alert" className="text-2sm text-destructive">
                  {formError}
                </p>
              ) : null}
            </>
          )}
        </aside>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t('deleteCancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              {t('deleteConfirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
