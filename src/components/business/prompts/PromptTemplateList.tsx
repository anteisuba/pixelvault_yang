'use client'
/* eslint-disable @next/next/no-img-element -- stored generation thumbnails are already optimized R2 derivatives */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { Globe, Search, X } from '@/components/icons'
import { PROMPT_OUTPUT_TYPE_LABEL_KEYS } from '@/constants/prompt-library'
import { ROUTES } from '@/constants/routes'
import { usePromptTemplateModelLabel } from '@/hooks/use-prompt-template-model-label'
import { usePromptTemplateUse } from '@/hooks/use-prompt-template-use'
import { Link } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'
import type {
  RecipeTemplateKind,
  TagTemplateSource,
} from '@/lib/recipe-template-kind'
import { cn } from '@/lib/utils'
import type { OutputType } from '@/types'
import { Button } from '@/components/ui/button'
import { CopyPromptButton } from './CopyPromptButton'
import { PromptFilterMenu } from './PromptFilterMenu'
import { PromptTemplateDetailPage } from './PromptTemplateDetailPage'
import {
  PromptTemplateKindBadge,
  PromptTemplateSourceMark,
} from './PromptTemplateKindBadge'
import { PromptTemplateTagChips } from './PromptTemplateTagChips'
import { PromptTemplateUseMenu } from './PromptTemplateUseMenu'

/** 卡片上那一行「名字 权重」（旧存的补不到名字就是 `null`）。 */
export interface PromptTemplateLoraMix {
  baseId: string | null
  items: { name: string | null; scale: number }[]
}

export interface PromptTemplateListItem {
  id: string
  outputType: OutputType
  name: string
  compiledPrompt: string
  modelId: string
  version: number
  /** 'PRIVATE' | 'PUBLIC' — PUBLIC shows a "published" badge + is in the shared library. */
  visibility?: string
  createdAt: string
  /** First image generated with this template (cover). Null → text fallback. */
  coverThumbnailUrl?: string | null
  templateKind: RecipeTemplateKind
  /** 标签模板从哪来；别的模板 `null`。 */
  tagSource: TagTemplateSource | null
  lora: PromptTemplateLoraMix | null
  lastUsedAt: string | null
}

/** 卡片上的标签只画前几格，多的写「+N」（画板 `TgA`）。 */
const CARD_TAG_LIMIT = 7

interface PromptTemplateListProps {
  locale: AppLocale
  recipes: PromptTemplateListItem[]
}

/**
 * 四格类型（pages/prompts.md）：⛔ 音频那一格去掉，音频模板只在「全部」里；标签台、
 * LoRA 台存的与这里新建的标签模板合成「标签」一格。
 */
type TypeFilter = 'ALL' | 'IMAGE' | 'VIDEO' | 'TAGS'
type SortMode = 'recent' | 'created'

const TYPE_FILTERS: readonly TypeFilter[] = ['ALL', 'IMAGE', 'VIDEO', 'TAGS']

function byCreated(a: PromptTemplateListItem, b: PromptTemplateListItem) {
  return b.createdAt.localeCompare(a.createdAt)
}

/** 「最近用过」：用过的按使用时间排前面，没用过的按新建时间排在后面。 */
function byRecent(a: PromptTemplateListItem, b: PromptTemplateListItem) {
  if (a.lastUsedAt && b.lastUsedAt)
    return b.lastUsedAt.localeCompare(a.lastUsedAt)
  if (a.lastUsedAt) return -1
  if (b.lastUsedAt) return 1
  return byCreated(a, b)
}

/**
 * 提示词页 A「网格 + 详情一页」（pages/prompts.md，与 LoRA 库 B 同一个样子）：一行
 * 筛选（搜索 · 类型 · 排序）、真实数量、4 列卡片；点一张，详情从下往上升盖住这一块。
 * 筛选与搜索都在本地，结果立刻换。
 */
export function PromptTemplateList({
  locale,
  recipes,
}: PromptTemplateListProps) {
  const t = useTranslations('PromptLibrary')
  const [items, setItems] = useState(recipes)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL')
  const [sort, setSort] = useState<SortMode>('recent')
  const [openId, setOpenId] = useState<string | null>(null)
  const openButtons = useRef(new Map<string, HTMLButtonElement>())

  useEffect(() => {
    setItems(recipes)
  }, [recipes])

  const typeLabel = useCallback(
    (type: TypeFilter) =>
      type === 'ALL'
        ? t('typeFilterAll')
        : type === 'TAGS'
          ? t('typeTags')
          : t(PROMPT_OUTPUT_TYPE_LABEL_KEYS[type]),
    [t],
  )

  const shown = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(locale)
    return items
      .filter(
        (recipe) =>
          (typeFilter === 'ALL' || recipe.templateKind === typeFilter) &&
          (!needle ||
            `${recipe.name} ${recipe.compiledPrompt}`
              .toLocaleLowerCase(locale)
              .includes(needle)),
      )
      .sort(sort === 'recent' ? byRecent : byCreated)
  }, [items, locale, query, sort, typeFilter])

  const openItem = openId
    ? (items.find((recipe) => recipe.id === openId) ?? null)
    : null

  const closeDetail = useCallback(() => {
    const id = openId
    setOpenId(null)
    // 焦点回到点开它的那张卡（详情关上之后网格还在原来滚到的位置）。
    if (id) requestAnimationFrame(() => openButtons.current.get(id)?.focus())
  }, [openId])

  const handleDeleted = useCallback((id: string) => {
    setOpenId(null)
    setItems((prev) => prev.filter((recipe) => recipe.id !== id))
  }, [])

  const handleChanged = useCallback(
    (patch: Partial<PromptTemplateListItem> & { id: string }) => {
      setItems((prev) =>
        prev.map((recipe) =>
          recipe.id === patch.id ? { ...recipe, ...patch } : recipe,
        ),
      )
    },
    [],
  )

  const handleUsed = useCallback((id: string) => {
    const now = new Date().toISOString()
    setItems((prev) =>
      prev.map((recipe) =>
        recipe.id === id ? { ...recipe, lastUsedAt: now } : recipe,
      ),
    )
  }, [])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div inert={openItem !== null} className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 px-5 pt-4">
          <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3 transition-colors duration-fast ease-linear focus-within:border-foreground/40">
            <Search
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              enterKeyHint="search"
              aria-label={t('searchTemplates')}
              placeholder={t('searchTemplates')}
              className="h-full min-w-0 flex-1 bg-transparent text-2sm text-foreground outline-none placeholder:text-muted-foreground/70"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t('clearSearch')}
                className="shrink-0 text-muted-foreground transition-colors duration-fast ease-linear hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            ) : null}
          </label>
          <PromptFilterMenu
            label={t('typeFilterShort')}
            value={typeFilter}
            options={TYPE_FILTERS.map((type) => ({
              value: type,
              label: typeLabel(type),
            }))}
            onChange={setTypeFilter}
            changed={typeFilter !== 'ALL'}
          />
          <PromptFilterMenu
            label={t('sortLabel')}
            value={sort}
            options={[
              { value: 'recent', label: t('sortRecent') },
              { value: 'created', label: t('sortCreated') },
            ]}
            onChange={setSort}
            changed={sort !== 'recent'}
          />
        </div>
        <p className="shrink-0 px-5 pb-2.5 pt-3 text-xs text-muted-foreground">
          {t.rich('countLine', {
            count: shown.length,
            n: (chunks) => (
              <b className="mr-0.5 font-mono text-sm font-semibold tabular-nums text-foreground">
                {chunks}
              </b>
            ),
          })}
        </p>
        <div className="@container min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {shown.length === 0 ? (
            <PromptTemplateListEmpty
              query={query.trim()}
              typeFilter={typeFilter}
              typeLabel={typeLabel(typeFilter)}
              hasAny={items.length > 0}
              hasTags={items.some((recipe) => recipe.templateKind === 'TAGS')}
              onClearQuery={() => setQuery('')}
              onClearType={() => setTypeFilter('ALL')}
            />
          ) : (
            <ul className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-4">
              {shown.map((recipe) => (
                <PromptTemplateCard
                  key={recipe.id}
                  locale={locale}
                  recipe={recipe}
                  onOpen={() => setOpenId(recipe.id)}
                  onUsed={() => handleUsed(recipe.id)}
                  openRef={(node) => {
                    if (node) openButtons.current.set(recipe.id, node)
                    else openButtons.current.delete(recipe.id)
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      <AnimatePresence>
        {openItem ? (
          <PromptTemplateDetailPage
            key={openItem.id}
            recipe={openItem}
            locale={locale}
            onClose={closeDetail}
            onDeleted={handleDeleted}
            onChanged={handleChanged}
            onUsed={() => handleUsed(openItem.id)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  )
}

/** 卡片与详情里那一行「名字 权重」。 */
export function PromptTemplateLoraMixLine({
  mix,
  className,
}: {
  mix: PromptTemplateLoraMix
  className?: string
}) {
  const t = useTranslations('PromptLibrary')
  return (
    <p
      className={cn(
        'flex flex-wrap gap-x-2.5 gap-y-1 text-xs text-muted-foreground',
        className,
      )}
    >
      {mix.items.map((item, index) => (
        <span key={index} className="whitespace-nowrap">
          {item.name ?? t('loraUnnamed')}
          <b className="ml-1 font-mono text-2xs font-semibold tabular-nums text-foreground">
            {item.scale.toFixed(2)}
          </b>
        </span>
      ))}
    </p>
  )
}

interface PromptTemplateCardProps {
  locale: AppLocale
  recipe: PromptTemplateListItem
  onOpen: () => void
  onUsed: () => void
  openRef: (node: HTMLButtonElement | null) => void
}

function PromptTemplateCard({
  locale,
  recipe,
  onOpen,
  onUsed,
  openRef,
}: PromptTemplateCardProps) {
  const t = useTranslations('PromptLibrary')
  const modelLabel = usePromptTemplateModelLabel()
  const openTemplate = usePromptTemplateUse()
  const [coverFailed, setCoverFailed] = useState(false)
  // 「使用」下拉开着时焦点在菜单里：这一行键得留着，菜单才有地方缩回去。
  const [menuOpen, setMenuOpen] = useState(false)
  const label = modelLabel(recipe)
  const title = recipe.name || label
  const tags = Boolean(recipe.tagSource)
  const cover =
    recipe.coverThumbnailUrl && !coverFailed ? recipe.coverThumbnailUrl : null
  const date = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(recipe.createdAt))
  // 在这里新建的标签模板没有模型（库里那一格只为占位），元信息不写它。
  const meta =
    recipe.tagSource === 'prompts'
      ? t('templateMetaVersion', { version: recipe.version })
      : t('templateMeta', { model: label, version: recipe.version })

  return (
    <li className="min-w-0">
      <article className="group relative flex h-full flex-col gap-2 rounded-2xl border border-border bg-card p-3 transition-[border-color,box-shadow] duration-fast ease-linear hover:border-foreground/20 hover:shadow-float">
        {/* 整张卡 = 开详情；「复制 · 使用」在它上面一层。 */}
        <button
          ref={openRef}
          type="button"
          onClick={onOpen}
          aria-label={`${t('viewDetail')}: ${title}`}
          className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        />
        {cover ? (
          <span className="pointer-events-none relative block aspect-4/3 overflow-hidden rounded-xl bg-muted">
            <img
              src={cover}
              alt=""
              loading="lazy"
              onError={() => setCoverFailed(true)}
              className="size-full object-cover"
            />
          </span>
        ) : null}
        <div className="pointer-events-none flex items-center gap-1.5">
          <PromptTemplateKindBadge kind={recipe.templateKind} />
          {recipe.tagSource ? (
            <PromptTemplateSourceMark source={recipe.tagSource} />
          ) : null}
          {recipe.visibility === 'PUBLIC' ? (
            <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground">
              <Globe aria-hidden className="size-3" />
              {t('publishedBadge')}
            </span>
          ) : null}
        </div>
        <h3 className="pointer-events-none line-clamp-2 text-sm font-semibold leading-5 text-foreground">
          {title}
        </h3>
        {recipe.lora ? (
          <PromptTemplateLoraMixLine
            mix={recipe.lora}
            className="pointer-events-none"
          />
        ) : null}
        {tags ? (
          <PromptTemplateTagChips
            text={recipe.compiledPrompt}
            limit={CARD_TAG_LIMIT}
            className="pointer-events-none"
          />
        ) : cover ? null : (
          <p className="pointer-events-none line-clamp-5 whitespace-pre-wrap text-2sm leading-5 text-muted-foreground">
            {recipe.compiledPrompt}
          </p>
        )}
        <p className="pointer-events-none mt-auto truncate font-mono text-2xs text-muted-foreground">
          {meta} · {date}
        </p>
        <div
          className={cn(
            'relative z-10 flex gap-1.5 transition-opacity duration-fast ease-linear group-focus-within:opacity-100 group-hover:opacity-100 coarse:opacity-100 motion-reduce:transition-none',
            menuOpen ? 'opacity-100' : 'opacity-0',
          )}
        >
          <CopyPromptButton
            prompt={recipe.compiledPrompt}
            label={t('copyShort')}
            className="h-7.5 rounded-full px-3 text-2sm"
          />
          {recipe.tagSource ? (
            <PromptTemplateUseMenu
              source={recipe.tagSource}
              align="start"
              onOpenChange={setMenuOpen}
              onUse={(destination) => {
                if (openTemplate(recipe, destination)) onUsed()
              }}
              triggerClassName="h-7.5 rounded-full px-3 text-2sm font-semibold"
            />
          ) : (
            <Button
              type="button"
              className="h-7.5 rounded-full px-3 text-2sm font-semibold"
              onClick={() => {
                if (openTemplate(recipe)) onUsed()
                else toast.error(t('useFailed'))
              }}
            >
              {t('useAction')}
            </Button>
          )}
        </div>
      </article>
    </li>
  )
}

interface PromptTemplateListEmptyProps {
  query: string
  typeFilter: TypeFilter
  typeLabel: string
  hasAny: boolean
  hasTags: boolean
  onClearQuery: () => void
  onClearType: () => void
}

/**
 * 搜不到 = 写明是哪个条件没有 + 放宽的出路；一个标签模板都没有 = 说明它的三个来处
 * （pages/prompts.md「空态」）。
 */
function PromptTemplateListEmpty({
  query,
  typeFilter,
  typeLabel,
  hasAny,
  hasTags,
  onClearQuery,
  onClearType,
}: PromptTemplateListEmptyProps) {
  const t = useTranslations('PromptLibrary')

  if (typeFilter === 'TAGS' && !hasTags && !query) {
    return (
      <div className="grid min-h-80 place-items-center">
        <div className="flex max-w-md flex-col items-center gap-2.5 text-center">
          <h4 className="text-base font-semibold">{t('tagsEmptyTitle')}</h4>
          <p className="text-2sm leading-5 text-muted-foreground">
            {t('tagsEmptyDescription')}
          </p>
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            <Button asChild className="rounded-full">
              <Link href={ROUTES.STUDIO_IMAGE_TAGS}>{t('openTagStudio')}</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <Link href={ROUTES.STUDIO_LORA}>{t('openLoraStudio')}</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!hasAny) {
    return (
      <div className="grid min-h-80 place-items-center">
        <div className="flex max-w-md flex-col items-center gap-2.5 text-center">
          <h4 className="text-base font-semibold">{t('emptyTitle')}</h4>
          <p className="text-2sm leading-5 text-muted-foreground">
            {t('emptyDescription')}
          </p>
        </div>
      </div>
    )
  }

  const typed = typeFilter !== 'ALL'
  return (
    <div className="grid min-h-80 place-items-center">
      <div className="flex max-w-md flex-col items-center gap-2.5 text-center">
        <h4 className="text-base font-semibold">
          {query && typed
            ? t('emptyQueryType', { query, type: typeLabel })
            : query
              ? t('emptyQuery', { query })
              : t('emptyType', { type: typeLabel })}
        </h4>
        <p className="text-2sm leading-5 text-muted-foreground">
          {t('emptyFilteredHint')}
        </p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {typed ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={onClearType}
            >
              {t('removeTypeFilter', { type: typeLabel })}
            </Button>
          ) : null}
          {query ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={onClearQuery}
            >
              {t('clearSearch')}
            </Button>
          ) : null}
          <Button asChild variant="outline" className="rounded-full">
            <Link href={`${ROUTES.PROMPTS}?tab=inspiration`}>
              {t('goInspiration')}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
