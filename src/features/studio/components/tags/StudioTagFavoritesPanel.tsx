'use client'

import { useMemo, useState, type Ref } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import { ThirdPartyImage } from '@/components/business/ThirdPartyImage'
import { Check, Search } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { useStudioForm, useStudioGen } from '@/contexts/studio-context'
import { useDanbooruFavorites } from '@/hooks/use-danbooru-favorites'
import {
  addLookupTags,
  displayDanbooruTag,
  hasTag,
  isStyleMediumTag,
  localDanbooruName,
  stylePromptTag,
  toggleStyleTag,
} from '@/lib/tag-lookup'
import { cn } from '@/lib/utils'
import {
  DanbooruCatalogKindSchema,
  type DanbooruCatalogKind,
  type DanbooruFavorite,
} from '@/types/danbooru-catalog'
import { LookupSay, LookupSkeletonRows } from './lookup/LookupList'
import { styleSections } from './lookup/lookup-kinds'

const ALL_FILTER = 'all'

/** 一条收藏进提示词时写成什么：画风页（画师 / 画法）走 `stylePromptTag`，别的按空格写。 */
function promptTagOf(kind: DanbooruCatalogKind, name: string): string {
  return kind === 'artist' ? stylePromptTag(name) : displayDanbooruTag(name)
}

/** 缺样图时用首字母做暖灰 Monogram 占位，保证封面卡片墙高度和对齐一致。 */
function monogramOf(text: string): string {
  const clean = text.trim()
  if (!clean) return '#'
  const match = clean.match(/[a-zA-Z0-9\u4e00-\u9fff\u3040-\u30ff]/)
  return (match?.[0] ?? clean[0] ?? '#').toUpperCase()
}

/**
 * 标签台「收藏」（图三方案 B：画册封面卡片墙）：
 * - 顶部：分类筛选胶囊（全部 + 各非空类数量）+ 中日英实时搜索框 + 收起；
 * - 正文：按类上下分段、类内横向自适应封面网格（彻底消灭 5 竖列死空白）；
 * - 画师卡支持最多 3 张样图无缝三联拼图，一眼辨认画风；缺图项自动走暖灰首字母 Monogram 对齐；
 * - 点一下加进整体正向标签、再点拿掉，已加入亮起墨黑描边与右上角「已加入 ✓」徽标。
 */
export function StudioTagFavoritesPanel({
  onClose,
  onOpenLookup,
  headingRef,
  variant = 'stage',
}: {
  onClose: () => void
  /** 空态的下一步：去查资料里收藏。 */
  onOpenLookup?: () => void
  headingRef?: Ref<HTMLHeadingElement>
  /** `sheet` = 手机底部抽屉里（标题由抽屉给读屏，这里只画可见那一行）。 */
  variant?: 'stage' | 'sheet'
}) {
  const t = useTranslations('StudioTags.favoritesPanel')
  const tLookup = useTranslations('StudioTags.lookup')
  const locale = useLocale()
  const favorites = useDanbooruFavorites()
  const { state, dispatch } = useStudioForm()
  const { isGenerating } = useStudioGen()
  const chips = state.tagChips
  const sheet = variant === 'sheet'

  const [activeFilter, setActiveFilter] = useState<string>(ALL_FILTER)
  const [searchQuery, setSearchQuery] = useState('')

  const isIn = (item: DanbooruFavorite) =>
    hasTag(chips, promptTagOf(item.kind, item.name))
  const toggle = (item: DanbooruFavorite) => {
    const tag = promptTagOf(item.kind, item.name)
    const next =
      item.kind === 'artist'
        ? toggleStyleTag(chips, item.name)
        : hasTag(chips, tag)
          ? chips.filter(
              (chip) => chip.text.toLowerCase() !== tag.toLowerCase(),
            )
          : addLookupTags(chips, [tag])
    dispatch({
      type: 'SET_TAG_CHIPS',
      payload: { polarity: 'positive', chips: next },
    })
  }

  const allSections = DanbooruCatalogKindSchema.options.flatMap((kind) =>
    styleSections(kind, favorites.of(kind)).map((section) => ({
      key: `${kind}:${section.key}`,
      label: tLookup(section.label),
      items: section.items,
    })),
  )
  const total = allSections.reduce(
    (sum, section) => sum + section.items.length,
    0,
  )

  const resolvedFilter =
    activeFilter === ALL_FILTER ||
    allSections.some((section) => section.key === activeFilter)
      ? activeFilter
      : ALL_FILTER

  const normalizedQuery = searchQuery.trim().toLowerCase()
  const visibleSections = useMemo(() => {
    const scoped =
      resolvedFilter === ALL_FILTER
        ? allSections
        : allSections.filter((section) => section.key === resolvedFilter)
    if (!normalizedQuery) return scoped
    return scoped
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          const display = displayDanbooruTag(item.name).toLowerCase()
          const prompt = promptTagOf(item.kind, item.name).toLowerCase()
          const local = (localDanbooruName(item, locale) ?? '').toLowerCase()
          const work = item.work
            ? displayDanbooruTag(item.work).toLowerCase()
            : ''
          return (
            display.includes(normalizedQuery) ||
            prompt.includes(normalizedQuery) ||
            local.includes(normalizedQuery) ||
            work.includes(normalizedQuery)
          )
        }),
      }))
      .filter((section) => section.items.length > 0)
  }, [allSections, locale, normalizedQuery, resolvedFilter])

  const body = !favorites.loaded ? (
    <LookupSkeletonRows label={tLookup('loading')} />
  ) : favorites.failed ? (
    <LookupSay
      title={t('errorTitle')}
      text={t('errorText')}
      action={{ label: t('retry'), onClick: favorites.retry }}
    />
  ) : total === 0 ? (
    <div
      role="status"
      className="flex flex-col items-start gap-1.5 px-0.5 pt-2.5"
    >
      <b className="text-md font-semibold text-foreground">{t('emptyTitle')}</b>
      <span className="text-2xs leading-5 text-muted-foreground">
        {t('emptyText')}
      </span>
      {onOpenLookup ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-1 min-h-11 lg:min-h-0"
          onClick={onOpenLookup}
        >
          <Search aria-hidden />
          {t('goLookup')}
        </Button>
      ) : null}
    </div>
  ) : visibleSections.length === 0 ? (
    <div
      role="status"
      className="flex flex-1 items-center justify-center py-12 text-2sm text-muted-foreground"
    >
      {t('searchEmpty')}
    </div>
  ) : (
    <div className="@container studio-subtle-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-1">
      <div className="flex flex-col gap-5 pb-2">
        {visibleSections.map((section) => (
          <section
            key={section.key}
            aria-label={section.label}
            className="flex min-w-0 flex-col gap-2.5"
          >
            <h3 className="flex items-center gap-2 text-2xs font-semibold text-foreground/85">
              <span>{section.label}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] font-normal tabular-nums text-muted-foreground">
                {section.items.length}
              </span>
              <span className="h-px flex-1 bg-border/70" aria-hidden />
            </h3>

            <ul
              className={cn(
                'grid gap-2.5',
                sheet
                  ? 'grid-cols-2'
                  : 'grid-cols-2 @md:grid-cols-3 @2xl:grid-cols-4 @4xl:grid-cols-5 @6xl:grid-cols-6',
              )}
            >
              {section.items.map((item) => {
                const added = isIn(item)
                const local = localDanbooruName(item, locale)
                const promptTag = promptTagOf(item.kind, item.name)
                const isArtistTag =
                  item.kind === 'artist' && !isStyleMediumTag(item.name)
                const cardTitle = isArtistTag
                  ? displayDanbooruTag(item.name)
                  : promptTag
                const cardSubtitle =
                  local ??
                  (item.work
                    ? displayDanbooruTag(item.work)
                    : isArtistTag
                      ? promptTag
                      : null)
                const previews = item.previews.slice(0, 3)
                const showTriptych = isArtistTag && previews.length >= 2

                return (
                  <li key={item.id} className="min-w-0">
                    <button
                      type="button"
                      aria-pressed={added}
                      aria-label={
                        added
                          ? t('removeLabel', { tag: promptTag })
                          : t('addLabel', { tag: promptTag })
                      }
                      disabled={isGenerating}
                      onClick={() => toggle(item)}
                      className={cn(
                        'touch-target-y group relative flex w-full flex-col overflow-hidden rounded-12 bg-card text-left transition-[transform,box-shadow,border-color] duration-fast ease-standard hover:-translate-y-0.5 focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-45 motion-reduce:transform-none',
                        added
                          ? 'ring-2 ring-foreground shadow-soft'
                          : 'ring-1 ring-inset ring-border hover:ring-foreground/25 hover:shadow-soft',
                      )}
                    >
                      {/* 顶部 4:3 画册封面：画师多图自动三联拼图，单图铺满，缺图统一暖灰 Monogram */}
                      <span className="relative block aspect-4/3 w-full overflow-hidden bg-surface-companion">
                        {showTriptych ? (
                          <span
                            className={cn(
                              'grid size-full gap-0.5 bg-card',
                              previews.length >= 3
                                ? 'grid-cols-3'
                                : 'grid-cols-2',
                            )}
                          >
                            {previews.map((url, idx) => (
                              <span
                                key={`${item.id}-${idx}`}
                                className="relative block size-full overflow-hidden bg-muted"
                              >
                                <ThirdPartyImage
                                  src={url}
                                  alt=""
                                  fill
                                  sizes="96px"
                                  className="object-cover object-top"
                                />
                              </span>
                            ))}
                          </span>
                        ) : previews[0] ? (
                          <ThirdPartyImage
                            src={previews[0]}
                            alt=""
                            fill
                            sizes="220px"
                            className="object-cover object-top transition-transform duration-base ease-standard group-hover:scale-[1.03] motion-reduce:transform-none"
                          />
                        ) : (
                          <span
                            aria-hidden
                            className="flex size-full items-center justify-center bg-surface-companion font-mono text-xl font-semibold text-muted-foreground/70"
                          >
                            {monogramOf(cardTitle)}
                          </span>
                        )}

                        {added ? (
                          <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background shadow-media-action">
                            <Check className="size-2.5" aria-hidden />
                            <span>{t('added')}</span>
                          </span>
                        ) : null}
                      </span>

                      {/* 底部固定双行信息区，所有卡片底部齐平 */}
                      <span className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
                        <span className="truncate text-2xs font-semibold text-foreground">
                          {cardTitle}
                        </span>
                        <span className="truncate text-[11px] text-muted-foreground">
                          {cardSubtitle ?? '\u00a0'}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )

  return (
    <section
      aria-labelledby="studio-tag-favorites-title"
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-3',
        sheet ? 'px-4 pt-2 pb-4' : 'lg:gap-3.5',
      )}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        onClose()
      }}
    >
      <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-2">
        <h2
          ref={headingRef}
          id="studio-tag-favorites-title"
          tabIndex={-1}
          className="text-md font-semibold outline-none"
        >
          {t('title')}
        </h2>

        {total > 0 ? (
          <>
            <div
              role="tablist"
              aria-label={t('filterLabel')}
              className="scrollbar-none flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-muted p-0.5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={resolvedFilter === ALL_FILTER}
                onClick={() => setActiveFilter(ALL_FILTER)}
                className={cn(
                  'touch-target-y inline-flex h-6.5 shrink-0 items-center gap-1 rounded-full px-2.5 text-2xs transition-colors focus-visible:outline-none focus-visible:shadow-focus',
                  resolvedFilter === ALL_FILTER
                    ? 'bg-card font-semibold text-foreground shadow-seg'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span>{t('allFilter')}</span>
                <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
                  {total}
                </span>
              </button>
              {allSections.map((section) => {
                const active = resolvedFilter === section.key
                return (
                  <button
                    key={section.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveFilter(section.key)}
                    className={cn(
                      'touch-target-y inline-flex h-6.5 shrink-0 items-center gap-1 rounded-full px-2.5 text-2xs transition-colors focus-visible:outline-none focus-visible:shadow-focus',
                      active
                        ? 'bg-card font-semibold text-foreground shadow-seg'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <span>{section.label}</span>
                    <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
                      {section.items.length}
                    </span>
                  </button>
                )
              })}
            </div>

            <label className="ml-auto flex h-8 w-44 min-w-0 items-center gap-1.5 rounded-full bg-muted px-3 text-muted-foreground">
              <Search className="size-3.5 shrink-0" aria-hidden />
              <input
                type="search"
                aria-label={t('searchPlaceholder')}
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/70 md:text-2xs"
              />
            </label>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-2xs text-muted-foreground">
            {t('hint')}
          </span>
        )}

        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-11 shrink-0 lg:min-h-0"
          onClick={onClose}
        >
          {t('close')}
        </Button>
      </div>
      {body}
    </section>
  )
}
