'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  ArrowUpRight,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from '@/components/icons'
import { DURATION_MS, EASE_STANDARD } from '@/constants/motion'
import type { PromptDialect } from '@/constants/prompt-dialects'
import { ROUTES } from '@/constants/routes'
import { STUDIO_TEMPLATES_PANEL_ID } from '@/constants/studio'
import { useStudioGen } from '@/contexts/studio-context'
import { useRecipes } from '@/hooks/prompts/use-recipes'
import { useRouter } from '@/i18n/navigation'
import {
  createRecipeAPI,
  deleteRecipeAPI,
  updateRecipeAPI,
} from '@/lib/api-client/recipes'
import {
  getRecipeTemplateKind,
  matchesRecipeTemplateScope,
} from '@/lib/recipe-template-kind'
import { getDefaultTemplateName } from '@/lib/recipe-template-name'
import { cn } from '@/lib/utils'
import type { CreateRecipeRequest, OutputType, RecipeRecord } from '@/types'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { getChipZoomMotion } from '@/components/business/studio-shared/primitives/tool-surface'

/** 首次加载那一屏的占位卡数（≈ 两行）。 */
const SKELETON_COUNT = 9
/** 打开时卡片错开升起：每张晚 30ms，最多错到第 9 张。 */
const STAGGER_STEP_MS = 30
const STAGGER_MAX = 9

/** 打开那一刻手上已有列表：卡片错开升起。 */
const CARD_STAGGER_CLASS =
  'animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-(--duration-slow) ease-standard motion-reduce:animate-none'
/** 列表是打开之后才到的：一起淡入，⛔ 不逐张升起。 */
const CARD_ARRIVE_CLASS =
  'animate-in fade-in-0 duration-(--duration-fast) ease-linear motion-reduce:animate-none'

/** 「存下当前」要用的那一份：这一台此刻的提示词、模型与参数。 */
export interface StudioTemplateSaveContext {
  outputType: OutputType
  /** 自然语言台 = 提示词；标签台 = 整体标签（不含画风与画师串）。 */
  prompt: string
  params: Record<string, unknown>
  modelId: string | undefined
  provider: string | undefined
}

interface StudioTemplatesPanelProps {
  dialect: PromptDialect
  save: StudioTemplateSaveContext
  onApply: (recipe: RecipeRecord) => void
  onClose: () => void
}

function coverOf(
  generation: {
    thumbnailUrl?: string | null
    previewUrl?: string | null
    url?: string | null
  } | null,
): string | null {
  return (
    generation?.thumbnailUrl ??
    generation?.previewUrl ??
    generation?.url ??
    null
  )
}

const applySelector = (id: string) => `[data-template-apply="${id}"]`

/**
 * 模板 = **在舞台上打开的一块面板**（owner 2026-09-26 从三个方向里选 C，画板
 * 「模板 C · 全部状态」+「模板 C · 动效表」）：封面卡片一屏看全，点一张即套用并
 * 回到结果（可撤销，撤销住在宿主那里）；左上一张「当前提示词」一键存下，「新建
 * 模板」自己填；悬停卡片出 ⋯ —— 改名 / 删除（原位两段确认）。
 *
 * ⚠ 每台只列自己能用的那一种（`matchesRecipeTemplateScope`），⛔ 不给一排类型筛选。
 * ⚠ 列表是会话内共享的缓存（`useRecipes`）：打开时直接画，后台再拉一遍。
 */
export function StudioTemplatesPanel({
  dialect,
  save,
  onApply,
  onClose,
}: StudioTemplatesPanelProps) {
  const t = useTranslations('StudioTemplates')
  const router = useRouter()
  const reducedMotion = useReducedMotion()
  const { lastGeneration } = useStudioGen()
  const {
    recipes,
    isLoading,
    error,
    refresh,
    addRecipe,
    replaceRecipe,
    removeRecipe,
    restoreRecipe,
  } = useRecipes(true)
  const tags = dialect === 'tags'

  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  /** 表单收起那一拍（淡出完才摘）。 */
  const [formLeaving, setFormLeaving] = useState(false)
  const [formName, setFormName] = useState('')
  const [formPrompt, setFormPrompt] = useState('')
  const [formSaving, setFormSaving] = useState(false)
  /** 「存下」存的是哪一段提示词 —— 提示词再改过，那张卡回到可存。 */
  const [savedFor, setSavedFor] = useState<{
    prompt: string
    name: string
  } | null>(null)
  const [savingNow, setSavingNow] = useState(false)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  /** Esc 之后紧跟的那一拍 blur ⛔ 不当成保存（与历史会话行同一手）。 */
  const renameCancelled = useRef(false)
  /**
   * 下一次渲染后焦点落到哪（选择器）：改名用回车 / Esc 收尾 → 那张卡；表单收起 →
   * 「新建模板」；新建存好 → 新的那张。删掉一张之后落到标题（`deletedFromMenu`）。
   * ⛔ 让焦点掉到 body 上 —— 键盘用户就找不到自己在哪了。
   */
  const focusAfter = useRef<string | null>(null)
  const deletedFromMenu = useRef<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const section = useRef<HTMLElement>(null)
  useEffect(() => {
    const selector = focusAfter.current
    if (!selector) return
    focusAfter.current = null
    section.current
      ?.querySelector<HTMLElement>(selector)
      ?.focus({ preventScroll: true })
  })
  // 打开时焦点落到标题（给读屏一个落点）；收起时还给打开它的那颗按钮。
  useEffect(() => {
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    heading.current?.focus({ preventScroll: true })
    return () => trigger?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (!formLeaving) return
    const timer = window.setTimeout(
      () => setFormLeaving(false),
      DURATION_MS.fast,
    )
    return () => window.clearTimeout(timer)
  }, [formLeaving])

  const scoped = useMemo(
    () =>
      recipes
        .filter((recipe) =>
          matchesRecipeTemplateScope(recipe, dialect, save.outputType),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [dialect, recipes, save.outputType],
  )
  const needle = query.trim().toLowerCase()
  const shown = needle
    ? scoped.filter(
        (recipe) =>
          recipe.name.toLowerCase().includes(needle) ||
          recipe.compiledPrompt.toLowerCase().includes(needle),
      )
    : scoped

  /**
   * 第一批卡片怎么进场：打开时手上已有列表 → 错开升起；列表后来才到 → 一起淡入。
   * 第一批之后再出现的（存下 / 新建）由 motion 从 .96 长出来。
   */
  const [arrival] = useState<'stagger' | 'arrive'>(() =>
    isLoading ? 'arrive' : 'stagger',
  )
  const [firstBatch, setFirstBatch] = useState<ReadonlySet<string> | null>(null)
  if (firstBatch === null && !isLoading)
    setFirstBatch(new Set(scoped.map((recipe) => recipe.id)))

  const currentPrompt = save.prompt.trim()
  const lastCover = coverOf(lastGeneration)
  const saved = savedFor !== null && savedFor.prompt === currentPrompt
  const canSave = Boolean(currentPrompt && save.modelId && save.provider)

  const buildPayload = (
    name: string,
    compiledPrompt: string,
    parentGenerationId?: string,
  ): CreateRecipeRequest => ({
    name,
    outputType: save.outputType,
    compiledPrompt,
    modelId: save.modelId ?? '',
    provider: save.provider ?? '',
    params: save.params,
    ...(parentGenerationId ? { parentGenerationId } : {}),
  })

  const saveNow = async () => {
    if (!canSave) return
    const name = getDefaultTemplateName(currentPrompt)
    setSavingNow(true)
    try {
      const result = await createRecipeAPI(
        buildPayload(name, currentPrompt, lastGeneration?.id),
      )
      if (result.success && result.data) {
        addRecipe({
          ...result.data,
          coverThumbnailUrl: result.data.coverThumbnailUrl ?? lastCover,
        })
        setSavedFor({ prompt: currentPrompt, name })
        return
      }
      toast.error(result.error ?? t('saveFailed'))
    } finally {
      setSavingNow(false)
    }
  }

  const openForm = () => {
    setFormName('')
    setFormPrompt('')
    setCreating(true)
  }

  /** 表单原路收回；`focus` = 收完焦点落到哪。 */
  const leaveForm = (focus: string) => {
    focusAfter.current = focus
    setCreating(false)
    if (!reducedMotion) setFormLeaving(true)
  }

  const submitForm = async (event: FormEvent) => {
    event.preventDefault()
    const prompt = formPrompt.trim()
    if (!prompt || !save.modelId || !save.provider) return
    setFormSaving(true)
    try {
      const result = await createRecipeAPI(
        buildPayload(formName.trim() || getDefaultTemplateName(prompt), prompt),
      )
      if (result.success && result.data) {
        addRecipe(result.data)
        leaveForm(applySelector(result.data.id))
        return
      }
      toast.error(result.error ?? t('saveFailed'))
    } finally {
      setFormSaving(false)
    }
  }

  const commitRename = (recipe: RecipeRecord) => {
    const cancelled = renameCancelled.current
    renameCancelled.current = false
    const name = draft.trim()
    setRenaming(null)
    if (cancelled || !name || name === recipe.name) return
    replaceRecipe({ ...recipe, name })
    void updateRecipeAPI(recipe.id, {
      name,
      outputType: recipe.outputType,
      compiledPrompt: recipe.compiledPrompt,
      ...(recipe.negativePrompt
        ? { negativePrompt: recipe.negativePrompt }
        : {}),
      modelId: recipe.modelId,
      provider: recipe.provider,
      ...(recipe.params && typeof recipe.params === 'object'
        ? { params: recipe.params as Record<string, unknown> }
        : {}),
      ...(recipe.parentGenerationId
        ? { parentGenerationId: recipe.parentGenerationId }
        : {}),
    }).then((result) => {
      if (result.success && result.data) {
        replaceRecipe({
          ...result.data,
          coverThumbnailUrl: recipe.coverThumbnailUrl ?? null,
        })
        return
      }
      replaceRecipe(recipe)
      toast.error(t('renameFailed'))
    })
  }

  const deleteRecipe = (recipe: RecipeRecord) => {
    deletedFromMenu.current = recipe.id
    setMenuFor(null)
    setConfirmDelete(null)
    removeRecipe(recipe.id)
    void deleteRecipeAPI(recipe.id).then((result) => {
      if (result.success) return
      restoreRecipe(recipe)
      toast.error(t('deleteFailed'))
    })
  }

  // 补位 320ms；删掉的那张缩到 .96 淡出，200ms（退场用更短的一档，曲线不换）。
  const layoutTransition = reducedMotion
    ? { duration: 0 }
    : { duration: DURATION_MS.slow / 1000, ease: EASE_STANDARD }
  const exitTransition = reducedMotion
    ? { duration: 0 }
    : { duration: DURATION_MS.base / 1000, ease: EASE_STANDARD }
  const menuMotion = getChipZoomMotion({
    side: 'bottom',
    align: 'end',
    sideOffset: 6,
  })

  const title = creating
    ? t('titleNew')
    : t(tags ? 'titleTags' : 'titleImage', {
        // 首次加载还没数出来：写「…」，⛔ 不写「0」。
        count: isLoading ? '…' : scoped.length,
      })
  const formShown = creating || formLeaving

  return (
    <section
      ref={section}
      id={STUDIO_TEMPLATES_PANEL_ID}
      aria-labelledby={`${STUDIO_TEMPLATES_PANEL_ID}-title`}
      className="@container/templates flex min-h-0 flex-1 flex-col gap-4"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        // ⚠ ⋯ 菜单住在 portal 里，它的 Esc 照样沿 React 树冒上来 —— 那一下只该收
        // 菜单，⛔ 把整块面板也收了。
        if (!event.currentTarget.contains(event.target as Node)) return
        event.stopPropagation()
        if (creating) leaveForm('[data-template-create]')
        else onClose()
      }}
    >
      <div className="flex h-9 shrink-0 items-center gap-2.5">
        {/* ⚠ `outline-none`：打开时焦点被程序挪到这里（给读屏一个落点）。 */}
        <h2
          ref={heading}
          id={`${STUDIO_TEMPLATES_PANEL_ID}-title`}
          tabIndex={-1}
          className="mr-auto truncate text-md font-semibold outline-none"
        >
          {title}
        </h2>
        {creating ? null : (
          <>
            <label className="flex h-9 w-64 min-w-0 items-center gap-2 rounded-lg bg-surface-fill px-3 text-muted-foreground">
              <Search className="size-3.5 shrink-0" aria-hidden />
              <input
                type="search"
                aria-label={t('search')}
                placeholder={t('search')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                // ⚠ <768 必须 ≥16px，否则 iOS 聚焦即放大整页。
                className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/70 md:text-2sm"
              />
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-template-create=""
              onClick={openForm}
            >
              <Plus className="size-3.5" aria-hidden />
              {t('create')}
            </Button>
          </>
        )}
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {t('back')}
        </Button>
      </div>

      {/* 列表与表单叠在同一格：列表只淡出、⛔ 不藏不卸 —— 原路换回时卡片不再演
          一遍入场，焦点也能当场落回列表里。 */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          inert={creating}
          className={cn(
            'flex min-h-0 flex-1 flex-col gap-4 transition-opacity motion-reduce:transition-none',
            creating
              ? 'opacity-0 duration-(--duration-fast) ease-linear'
              : 'opacity-100 delay-(--duration-fast) duration-(--duration-base) ease-standard',
          )}
        >
          <div className="-mx-1.5 grid min-h-0 flex-1 auto-rows-min grid-cols-2 content-start gap-2.5 overflow-y-auto px-px pb-1.5 @2xl/templates:grid-cols-3 @4xl/templates:grid-cols-4 @6xl/templates:grid-cols-5">
            {/* 左上那张「当前提示词」：生成满意了，一键存下。 */}
            <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-(--duration-slow) ease-standard motion-reduce:animate-none">
              <div
                className={cn(
                  'flex h-full flex-col gap-2 rounded-xl border p-1.5 pb-2.5 transition-colors duration-(--duration-base) ease-linear',
                  saved
                    ? 'border-transparent bg-surface-fill'
                    : 'border-dashed border-border',
                )}
              >
                <TemplateCover url={lastCover} />
                <span
                  key={saved ? 'saved' : 'now'}
                  className="flex min-w-0 animate-in flex-col gap-0.5 px-0.5 fade-in-0 duration-(--duration-fast) ease-linear motion-reduce:animate-none"
                >
                  <span className="truncate text-2sm font-semibold">
                    {saved
                      ? t('savedTitle', { name: savedFor?.name ?? '' })
                      : t(tags ? 'nowTags' : 'nowImage')}
                  </span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {saved
                      ? t(lastCover ? 'savedWithCover' : 'savedNoCover')
                      : currentPrompt ||
                        t(tags ? 'nowEmptyTags' : 'nowEmptyImage')}
                  </span>
                </span>
                {saved ? null : (
                  <button
                    type="button"
                    disabled={!canSave || savingNow}
                    onClick={() => void saveNow()}
                    className="ml-0.5 h-7.5 self-start rounded-lg bg-foreground px-3 text-2sm font-medium text-background transition-opacity duration-(--duration-fast) ease-linear hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40"
                  >
                    {savingNow ? t('saving') : t('save')}
                  </button>
                )}
              </div>
            </div>

            {isLoading
              ? Array.from({ length: SKELETON_COUNT }, (_, index) => (
                  <div
                    key={index}
                    aria-hidden
                    className="flex flex-col gap-2 p-1.5"
                  >
                    <Skeleton className="aspect-4/3 w-full animate-skeleton-breathe rounded-lg bg-surface-fill" />
                    <Skeleton className="h-2.5 w-7/10 animate-skeleton-breathe rounded-sm bg-surface-fill" />
                    <Skeleton className="h-2 w-9/10 animate-skeleton-breathe rounded-sm bg-surface-fill" />
                  </div>
                ))
              : null}

            {!isLoading && error ? (
              <div
                role="alert"
                className="col-span-full flex flex-col items-center gap-2.5 py-12 text-2sm text-muted-foreground"
              >
                {t('loadFailed')}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void refresh()}
                >
                  {t('retry')}
                </Button>
              </div>
            ) : null}

            {!isLoading && !error && scoped.length === 0 ? (
              <div className="col-span-full flex flex-col items-center gap-2.5 py-12 text-center">
                <b className="text-sm font-semibold">
                  {t(tags ? 'emptyTags' : 'emptyImage')}
                </b>
                <span className="text-2sm text-muted-foreground">
                  {t(tags ? 'emptyHintTags' : 'emptyHintImage')}
                </span>
              </div>
            ) : null}

            {scoped.length > 0 && shown.length === 0 ? (
              <div className="col-span-full flex flex-col items-center gap-2.5 py-12 text-2sm text-muted-foreground">
                {t('noResult', { query: query.trim() })}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setQuery('')}
                >
                  {t('clearSearch')}
                </Button>
              </div>
            ) : null}

            <AnimatePresence initial={false}>
              {shown.map((recipe, index) => {
                const menuOpen = menuFor === recipe.id
                const confirming = confirmDelete === recipe.id
                const lora = tags && getRecipeTemplateKind(recipe) === 'LORA'
                const name = recipe.name || recipe.modelId
                const first = firstBatch?.has(recipe.id) ?? false
                return (
                  <motion.div
                    key={recipe.id}
                    layout
                    initial={first ? false : { opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{
                      opacity: 0,
                      scale: 0.96,
                      transition: exitTransition,
                    }}
                    transition={layoutTransition}
                  >
                    {/* 入场一层、悬停一层：两者的时长与曲线不一样，⛔ 挤在同一个元素上。 */}
                    <div
                      style={
                        first && arrival === 'stagger'
                          ? {
                              animationDelay: `${Math.min(index + 1, STAGGER_MAX) * STAGGER_STEP_MS}ms`,
                            }
                          : undefined
                      }
                      className={cn(
                        first &&
                          (arrival === 'stagger'
                            ? CARD_STAGGER_CLASS
                            : CARD_ARRIVE_CLASS),
                      )}
                    >
                      <div
                        className={cn(
                          'group/card relative rounded-xl p-1.5 transition-colors duration-(--duration-fast) ease-linear',
                          menuOpen
                            ? 'bg-surface-fill'
                            : 'hover:bg-surface-fill',
                        )}
                      >
                        {renaming === recipe.id ? (
                          <div className="flex flex-col gap-2">
                            <TemplateCover
                              url={recipe.coverThumbnailUrl ?? null}
                            />
                            <span className="flex min-w-0 flex-col gap-0.5 px-0.5 pb-0.5">
                              <input
                                type="text"
                                aria-label={t('renameLabel')}
                                value={draft}
                                maxLength={200}
                                autoFocus
                                onFocus={(event) =>
                                  event.currentTarget.select()
                                }
                                onChange={(event) =>
                                  setDraft(event.target.value)
                                }
                                onKeyDown={(event) => {
                                  // 回车 / Esc 都交给 blur 收尾：只在一处保存。
                                  if (
                                    event.key !== 'Enter' &&
                                    event.key !== 'Escape'
                                  )
                                    return
                                  if (event.key === 'Escape') {
                                    event.stopPropagation()
                                    renameCancelled.current = true
                                  }
                                  // ⚠ 焦点这一拍就回到卡上：不吞掉回车，紧跟的
                                  // keypress 会「点」那张卡 —— 顺手套用、面板收起。
                                  event.preventDefault()
                                  focusAfter.current = applySelector(recipe.id)
                                  event.currentTarget.blur()
                                }}
                                onBlur={() => commitRename(recipe)}
                                className="h-7 w-full rounded-md border border-foreground bg-background px-2 text-base font-semibold outline-none md:text-2sm"
                              />
                              <span className="text-xs text-muted-foreground">
                                {t('renameHint')}
                              </span>
                            </span>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              data-template-apply={recipe.id}
                              aria-label={t('apply', { name })}
                              onClick={() => onApply(recipe)}
                              className="flex w-full flex-col gap-2 rounded-lg text-left transition-transform duration-(--duration-fast) ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-98 motion-reduce:transition-none"
                            >
                              <TemplateCover
                                url={recipe.coverThumbnailUrl ?? null}
                              />
                              <span className="flex min-w-0 flex-col gap-0.5 px-0.5 pb-0.5">
                                <span className="truncate text-2sm font-semibold">
                                  {name}
                                </span>
                                <span className="truncate text-xs text-muted-foreground">
                                  {recipe.compiledPrompt}
                                </span>
                              </span>
                            </button>
                            {lora ? (
                              <span className="pointer-events-none absolute left-3 top-3 rounded-md bg-foreground/75 px-1.5 font-mono text-3xs font-semibold leading-5 text-background">
                                {t('lora')}
                              </span>
                            ) : null}
                            {/* ⚠ 保持模态：菜单开着时点别的卡只收菜单，⛔ 不顺手套用那一张。 */}
                            <DropdownMenu
                              open={menuOpen}
                              onOpenChange={(open) => {
                                setMenuFor(open ? recipe.id : null)
                                if (!open) setConfirmDelete(null)
                              }}
                            >
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  aria-label={t('more', { name })}
                                  className={cn(
                                    'absolute right-3 top-3 grid size-7 place-items-center rounded-lg bg-card/95 text-foreground/75 shadow-sm transition-opacity duration-(--duration-fast) ease-linear hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:opacity-100',
                                    menuOpen
                                      ? 'opacity-100'
                                      : 'opacity-0 group-hover/card:opacity-100',
                                  )}
                                >
                                  <MoreHorizontal
                                    className="size-4"
                                    aria-hidden
                                  />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                sideOffset={6}
                                className={cn('w-37', menuMotion.className)}
                                style={menuMotion.style}
                                onCloseAutoFocus={(event) => {
                                  // 删掉的那张正在退场：焦点还给它的 ⋯ 会跟着掉到 body 上。
                                  if (deletedFromMenu.current !== recipe.id)
                                    return
                                  deletedFromMenu.current = null
                                  event.preventDefault()
                                  heading.current?.focus({
                                    preventScroll: true,
                                  })
                                }}
                              >
                                <DropdownMenuItem
                                  onSelect={() => {
                                    setDraft(name)
                                    setRenaming(recipe.id)
                                  }}
                                  className="h-8 rounded-lg px-2.5 text-2sm"
                                >
                                  <Pencil
                                    className="size-3.5 text-current"
                                    aria-hidden
                                  />
                                  {t('rename')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={(event) => {
                                    if (!confirming) {
                                      // 第一下只把这一项变红，⛔ 不关菜单。
                                      event.preventDefault()
                                      setConfirmDelete(recipe.id)
                                      return
                                    }
                                    deleteRecipe(recipe)
                                  }}
                                  className={cn(
                                    'h-8 rounded-lg px-2.5 text-2sm transition-colors duration-(--duration-fast) ease-linear',
                                    confirming
                                      ? 'bg-status-risk text-white focus:bg-status-risk focus:text-white'
                                      : 'text-status-risk focus:text-status-risk',
                                  )}
                                >
                                  <Trash2
                                    className="size-3.5 text-current"
                                    aria-hidden
                                  />
                                  {confirming
                                    ? t('confirmDelete')
                                    : t('delete')}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="truncate">
              {t(tags ? 'footTags' : 'footImage')}
            </span>
            <button
              type="button"
              onClick={() => router.push(ROUTES.PROMPTS)}
              className="inline-flex shrink-0 items-center gap-1 rounded-sm text-foreground/75 transition-colors duration-(--duration-fast) ease-linear hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('manage')}
              <ArrowUpRight className="size-3" aria-hidden />
            </button>
          </div>
        </div>

        {formShown ? (
          <div
            className={cn(
              'absolute inset-0 overflow-y-auto',
              formLeaving
                ? 'pointer-events-none animate-out fade-out-0 slide-out-to-bottom-1.5 fill-mode-forwards duration-(--duration-fast) ease-linear'
                : 'animate-in fade-in-0 slide-in-from-bottom-1.5 fill-mode-both delay-(--duration-fast) duration-(--duration-base) ease-standard motion-reduce:animate-none',
            )}
          >
            <form
              onSubmit={(event) => void submitForm(event)}
              className="mx-auto mt-6 flex w-full max-w-140 flex-col gap-3.5"
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-foreground/75">
                  {t('nameLabel')}
                </span>
                <input
                  type="text"
                  value={formName}
                  maxLength={200}
                  autoFocus
                  onChange={(event) => setFormName(event.target.value)}
                  placeholder={t(
                    tags ? 'namePlaceholderTags' : 'namePlaceholderImage',
                  )}
                  className="h-9 rounded-lg border border-border bg-background px-3 text-base outline-none focus-visible:border-foreground focus-visible:ring-3 focus-visible:ring-muted md:text-2sm"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-foreground/75">
                  {t(tags ? 'tagsLabel' : 'promptLabel')}
                </span>
                <textarea
                  value={formPrompt}
                  rows={8}
                  maxLength={5000}
                  onChange={(event) => setFormPrompt(event.target.value)}
                  placeholder={t(
                    tags ? 'tagsPlaceholder' : 'promptPlaceholder',
                  )}
                  className="resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-base leading-5 outline-none focus-visible:border-foreground focus-visible:ring-3 focus-visible:ring-muted md:text-2sm"
                />
              </label>
              <div className="flex items-center gap-2">
                <span className="mr-auto text-xs text-muted-foreground">
                  {save.modelId ? t('formNote') : t('modelMissing')}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => leaveForm('[data-template-create]')}
                >
                  {t('cancel')}
                </Button>
                <Button
                  type="submit"
                  disabled={
                    !formPrompt.trim() ||
                    formSaving ||
                    !save.modelId ||
                    !save.provider
                  }
                >
                  {t('saveForm')}
                </Button>
              </div>
            </form>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function TemplateCover({ url }: { url: string | null }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- stored generation thumbnails are already optimized derivatives
    <img
      src={url}
      alt=""
      loading="lazy"
      className="aspect-4/3 w-full rounded-lg object-cover"
    />
  ) : (
    <span className="grid aspect-4/3 w-full place-items-center rounded-lg bg-surface-fill text-muted-foreground">
      <FileText className="size-5" aria-hidden />
    </span>
  )
}
