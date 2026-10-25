'use client'
/* eslint-disable @next/next/no-img-element -- stored generation thumbnails are already optimized R2 derivatives */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { PROMPT_OUTPUT_TYPE_LABEL_KEYS } from '@/constants/prompt-library'
import {
  Bookmark,
  Copy,
  Eye,
  LayoutGrid,
  Layers,
  Tag,
} from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import {
  LibraryGrid,
  LibraryNewTile,
  LibraryPillSelect,
  LibraryRail,
  LibraryRailRow,
  LibrarySearch,
  LibraryToolbar,
} from '@/components/ui/library-kit'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import {
  MEDIA_TILE_CLASS,
  MediaTileActions,
  MediaTileCaption,
  MediaTileMoreTrigger,
  MediaTileShade,
} from '@/components/ui/media-tile'
import { usePromptTemplateModelLabel } from '@/hooks/use-prompt-template-model-label'
import { usePromptTemplateUse } from '@/hooks/use-prompt-template-use'
import type { AppLocale } from '@/i18n/routing'
import { setRecipeFavoriteAPI } from '@/lib/api-client/recipes'
import { parseTagChips } from '@/lib/tag-composer'

import {
  PromptTemplateCreatePanel,
  type PromptTemplateCreateInitialValues,
} from './PromptTemplateCreatePanel'
import { PromptTemplateDetailPage } from './PromptTemplateDetailPage'
import type { PromptTemplateListItem } from './PromptTemplateList'

/**
 * **提示词库 · 桌面**（ui-spec §9「库 `LibraryPage`」，样件 E S21）：库同一副骨架。
 *
 * 左栏「全部 / 收藏」（收藏落 `Recipe.isFavorite`）；右边顶上搜索 + 排序（最近用过 / 最近新建），
 * 下面切换条「全部 · 图片 · 视频 · 音频 · 3D · LoRA · 标签」（LoRA = LoRA 台存的整套，
 * 标签 = 标签台存的 + 这里新建的）；格子 3:4，有封面摆封面、没有摆提示词正文，名字 + 「类型 · 模型」在下；
 * 第一格虚线「+ 新建」。悬停出收藏 / 更多（查看 · 使用 · 复制）；点开照旧走详情页。
 * 提示词还交不了助手（引用里没有提示词这一类），⛔ 画那颗键。手机照旧走 `PromptTemplateList`。
 */

const TYPES = [
  'ALL',
  'IMAGE',
  'VIDEO',
  'AUDIO',
  'MODEL_3D',
  'LORA',
  'TAGS',
] as const
type TypeKey = (typeof TYPES)[number]
type SortMode = 'recent' | 'created'

function matchesType(recipe: PromptTemplateListItem, type: TypeKey) {
  if (type === 'ALL') return true
  if (type === 'LORA') return recipe.tagSource === 'lora'
  if (type === 'TAGS')
    return recipe.templateKind === 'TAGS' && recipe.tagSource !== 'lora'
  return recipe.templateKind === type
}

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

interface PromptLibraryDeskProps {
  locale: AppLocale
  recipes: PromptTemplateListItem[]
  createInitialOpen?: boolean
  createInitialValues?: PromptTemplateCreateInitialValues
}

export function PromptLibraryDesk({
  locale,
  recipes,
  createInitialOpen,
  createInitialValues,
}: PromptLibraryDeskProps) {
  const t = useTranslations('PromptLibrary')
  const [items, setItems] = useState(recipes)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [type, setType] = useState<TypeKey>('ALL')
  const [sort, setSort] = useState<SortMode>('recent')
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    setItems(recipes)
  }, [recipes])

  const typeLabel = (key: TypeKey) =>
    key === 'ALL'
      ? t('typeFilterAll')
      : key === 'LORA'
        ? t('typeLora')
        : key === 'TAGS'
          ? t('typeTags')
          : t(PROMPT_OUTPUT_TYPE_LABEL_KEYS[key])

  const favorites = items.filter((recipe) => recipe.isFavorite).length
  const needle = query.trim().toLocaleLowerCase(locale)
  const shown = useMemo(
    () =>
      items
        .filter((recipe) => !favoritesOnly || recipe.isFavorite)
        .filter((recipe) => matchesType(recipe, type))
        .filter(
          (recipe) =>
            !needle ||
            `${recipe.name} ${recipe.compiledPrompt}`
              .toLocaleLowerCase(locale)
              .includes(needle),
        )
        .sort(sort === 'recent' ? byRecent : byCreated),
    [favoritesOnly, items, locale, needle, sort, type],
  )

  const patch = useCallback(
    (next: Partial<PromptTemplateListItem> & { id: string }) =>
      setItems((prev) =>
        prev.map((recipe) =>
          recipe.id === next.id ? { ...recipe, ...next } : recipe,
        ),
      ),
    [],
  )

  const toggleFavorite = useCallback(
    async (recipe: PromptTemplateListItem) => {
      const isFavorite = !recipe.isFavorite
      patch({ id: recipe.id, isFavorite })
      const response = await setRecipeFavoriteAPI(recipe.id, isFavorite)
      if (!response.success) {
        patch({ id: recipe.id, isFavorite: !isFavorite })
        toast.error(t('favoriteFailed'))
      }
    },
    [patch, t],
  )

  const markUsed = useCallback(
    (id: string) => patch({ id, lastUsedAt: new Date().toISOString() }),
    [patch],
  )

  const openItem = openId
    ? (items.find((recipe) => recipe.id === openId) ?? null)
    : null

  const body =
    shown.length === 0 && favoritesOnly && !needle && type === 'ALL' ? (
      <EmptyState
        icon={<Bookmark aria-hidden />}
        title={t('library.emptyFavorites')}
        description={t('library.emptyFavoritesHint')}
        action={
          <Button
            type="button"
            size="sm"
            className="rounded-full"
            onClick={() => setFavoritesOnly(false)}
          >
            {t('typeFilterAll')}
          </Button>
        }
      />
    ) : (
      <LibraryGrid>
        {favoritesOnly || needle ? null : (
          <PromptTemplateCreatePanel
            initialOpen={createInitialOpen}
            initialValues={createInitialValues}
            renderTrigger={(open) => (
              <LibraryNewTile label={t('library.new')} onClick={open} />
            )}
          />
        )}
        {shown.map((recipe) => (
          <PromptLibraryTile
            key={recipe.id}
            recipe={recipe}
            onOpen={() => setOpenId(recipe.id)}
            onToggleFavorite={() => void toggleFavorite(recipe)}
            onUsed={() => markUsed(recipe.id)}
          />
        ))}
      </LibraryGrid>
    )

  return (
    <div className="flex min-h-0 flex-1 gap-8">
      <LibraryRail label={t('pageTitle')} className="pt-0.5">
        <LibraryRailRow
          icon={<LayoutGrid aria-hidden />}
          label={t('typeFilterAll')}
          trailing={items.length}
          active={!favoritesOnly}
          onSelect={() => setFavoritesOnly(false)}
        />
        <LibraryRailRow
          icon={<Bookmark aria-hidden />}
          label={t('library.favorites')}
          trailing={favorites}
          active={favoritesOnly}
          onSelect={() => setFavoritesOnly(true)}
        />
      </LibraryRail>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <div inert={openItem !== null} className="flex min-h-0 flex-1 flex-col">
          <LibraryToolbar
            className="shrink-0"
            search={
              <LibrarySearch
                value={query}
                onChange={setQuery}
                placeholder={t('library.search')}
                label={t('library.search')}
              />
            }
            end={
              <LibraryPillSelect
                label={t('sortLabel')}
                value={sort}
                options={[
                  { value: 'recent', label: t('sortRecent') },
                  { value: 'created', label: t('sortCreated') },
                ]}
                onChange={setSort}
              />
            }
          />
          <div className="mt-3 flex shrink-0">
            <LiquidSegmented
              ariaLabel={t('typeFilterShort')}
              value={type}
              items={TYPES.map((key) => ({
                value: key,
                label: typeLabel(key),
              }))}
              onChange={setType}
            />
          </div>
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-6">
            {body}
            {shown.length === 0 && (needle || type !== 'ALL') ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {needle
                  ? t('emptyQuery', { query: query.trim() })
                  : t('emptyType', { type: typeLabel(type) })}
              </p>
            ) : null}
          </div>
        </div>

        <AnimatePresence>
          {openItem ? (
            <PromptTemplateDetailPage
              key={openItem.id}
              recipe={openItem}
              locale={locale}
              onClose={() => setOpenId(null)}
              onDeleted={(id) => {
                setOpenId(null)
                setItems((prev) => prev.filter((recipe) => recipe.id !== id))
              }}
              onChanged={patch}
              onUsed={() => markUsed(openItem.id)}
            />
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  )
}

function PromptLibraryTile({
  recipe,
  onOpen,
  onToggleFavorite,
  onUsed,
}: {
  recipe: PromptTemplateListItem
  onOpen(): void
  onToggleFavorite(): void
  onUsed(): void
}) {
  const t = useTranslations('PromptLibrary')
  const modelLabel = usePromptTemplateModelLabel()
  const openTemplate = usePromptTemplateUse()
  const [coverFailed, setCoverFailed] = useState(false)
  const cover =
    recipe.coverThumbnailUrl && !coverFailed ? recipe.coverThumbnailUrl : null
  const title = recipe.name || modelLabel(recipe)

  // 「类型 · 模型」：LoRA 写第一颗 LoRA 的名字，标签写有几个。
  const meta =
    recipe.tagSource === 'lora'
      ? [t('typeLora'), recipe.lora?.items[0]?.name ?? modelLabel(recipe)]
          .filter(Boolean)
          .join(' · ')
      : recipe.templateKind === 'TAGS'
        ? t('library.metaTags', {
            count: parseTagChips(recipe.compiledPrompt).length,
          })
        : `${t(PROMPT_OUTPUT_TYPE_LABEL_KEYS[recipe.outputType])} · ${modelLabel(recipe)}`

  const use = (destination?: 'tags' | 'lora') => {
    if (openTemplate(recipe, destination)) onUsed()
    else toast.error(t('useFailed'))
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(recipe.compiledPrompt)
      toast.success(t('library.copied'))
    } catch {
      toast.error(t('useFailed'))
    }
  }

  return (
    <div className="min-w-0">
      <div className={`${MEDIA_TILE_CLASS} aspect-3/4`}>
        <button
          type="button"
          aria-label={`${t('viewDetail')}: ${title}`}
          onClick={onOpen}
          className="absolute inset-0 z-10 rounded-12 focus-visible:outline-none focus-visible:shadow-focus"
        />
        {cover ? (
          <img
            src={cover}
            alt=""
            loading="lazy"
            draggable={false}
            onError={() => setCoverFailed(true)}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <p
            aria-hidden
            className="absolute inset-0 line-clamp-8 overflow-hidden whitespace-pre-wrap break-words p-3 text-xs leading-5 text-ink-2"
          >
            {recipe.compiledPrompt}
          </p>
        )}
        <MediaTileShade />
        <MediaTileActions
          favorite={{
            saved: recipe.isFavorite,
            label: recipe.isFavorite
              ? t('library.unfavorite')
              : t('library.favorite'),
            onToggle: onToggleFavorite,
          }}
          more={
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <MediaTileMoreTrigger label={t('moreActions')} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-36">
                <DropdownMenuItem onSelect={onOpen}>
                  <Eye aria-hidden />
                  {t('viewDetail')}
                </DropdownMenuItem>
                {recipe.templateKind === 'TAGS' ? (
                  <>
                    <DropdownMenuItem onSelect={() => use('tags')}>
                      <Tag aria-hidden />
                      {t('useOnTagBench')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => use('lora')}>
                      <Layers aria-hidden />
                      {t('useOnLoraBench')}
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem onSelect={() => use()}>
                    <LayoutGrid aria-hidden />
                    {t('useAction')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => void copy()}>
                  <Copy aria-hidden />
                  {t('copyPromptAction')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
      </div>
      <button
        type="button"
        tabIndex={-1}
        onClick={onOpen}
        className="block w-full min-w-0 text-left"
      >
        <MediaTileCaption name={title} meta={meta} />
      </button>
    </div>
  )
}
