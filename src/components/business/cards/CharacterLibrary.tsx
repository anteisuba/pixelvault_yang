'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import {
  CHARACTER_PAGE_TABS,
  CHUB_LIBRARY,
  CHUB_LIBRARY_SORT_KEYS,
  type CharacterPageTab,
} from '@/constants/cards/chub-library'
import type { ChubCardSummary } from '@/types/chub-library'
import { ExternalLink, Plus, Search, Star, Users } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import type { UseChubLibraryReturn } from '@/hooks/cards/use-chub-library'
import { cn } from '@/lib/utils'

/**
 * **角色页 · 卡库**（owner 2026-10-14 选「角色页里加 tab」）：站内搜 chub.ai 上别人
 * 做好的酒馆卡，点「做成角色」就建成一张我们的角色卡（与文件导入同一条落格规则，
 * 世界书、卡自带系统提示词只存不注入）。⛔ 成人内容默认不出。
 *
 * 地台那一行与总览同一套排法（`CharacterOverviewHeader`）：页签 · 搜索 · 排序；
 * 白卡里是卡片网格，滚到底接下一页。
 */

/** 地台最左的两个页签「我的角色 / 卡库」（顶替原来的标题）。 */
export function CharacterPageTabs({
  tab,
  onChange,
}: {
  tab: CharacterPageTab
  onChange(tab: CharacterPageTab): void
}) {
  const t = useTranslations('CharacterRoster')
  const tabs = [
    { id: CHARACTER_PAGE_TABS.roster, label: t('tabRoster') },
    { id: CHARACTER_PAGE_TABS.library, label: t('tabLibrary') },
  ] as const
  return (
    <>
      <h1 className="sr-only">{t('title')}</h1>
      <div
        role="tablist"
        aria-label={t('title')}
        className="flex shrink-0 items-center gap-4"
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => onChange(item.id)}
            className={cn(
              'text-lg font-semibold transition-colors duration-fast outline-none focus-visible:underline',
              tab === item.id
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  )
}

/** 卡库那一行：页签 · 搜 chub · 热门 / 最新。手机上搜索换到第二行（与总览同一条）。 */
export function CharacterLibraryHeader({
  tabs,
  library,
}: {
  tabs: React.ReactNode
  library: UseChubLibraryReturn
}) {
  const t = useTranslations('CharacterRoster')
  return (
    <>
      {tabs}
      <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full bg-background px-3.5 text-2sm text-muted-foreground max-sm:order-last max-sm:basis-full sm:ml-auto sm:w-72 sm:flex-none">
        <Search className="size-4 shrink-0" aria-hidden />
        <input
          type="search"
          value={library.query}
          onChange={(event) => library.setQuery(event.target.value)}
          placeholder={t('librarySearchPlaceholder')}
          aria-label={t('librarySearchPlaceholder')}
          maxLength={CHUB_LIBRARY.QUERY_MAX_LENGTH}
          className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>
      {/* 让位右上角助手头像的那段算术见 `CharacterOverviewHeader`。 */}
      <div
        role="group"
        aria-label={t('librarySort')}
        className="flex h-9 shrink-0 items-center gap-0.5 rounded-full bg-background p-1 max-sm:ml-auto max-sm:mr-13.5"
      >
        {CHUB_LIBRARY_SORT_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={library.sort === key}
            onClick={() => library.setSort(key)}
            className={cn(
              'h-7 rounded-full px-3 text-2sm transition-colors duration-fast',
              library.sort === key
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(key === 'popular' ? 'librarySortPopular' : 'librarySortRecent')}
          </button>
        ))}
      </div>
    </>
  )
}

const GRID_CLASS =
  'grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5'

function TileSkeletons({ count }: { count: number }) {
  return Array.from({ length: count }, (_, index) => (
    <div key={index} className="flex flex-col gap-2">
      <Skeleton className="aspect-3/4 w-full rounded-lg" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-full" />
    </div>
  ))
}

function LibraryTile({
  card,
  busy,
  disabled,
  onImport,
}: {
  card: ChubCardSummary
  busy: boolean
  disabled: boolean
  onImport(): void
}) {
  const t = useTranslations('CharacterRoster')
  const locale = useLocale()
  const [broken, setBroken] = useState(false)
  const compact = useMemo(
    () => new Intl.NumberFormat(locale, { notation: 'compact' }),
    [locale],
  )
  const tags = card.tags.slice(0, CHUB_LIBRARY.TILE_TAGS)
  return (
    <article
      data-testid="library-tile"
      className="flex min-w-0 flex-col gap-2"
    >
      <div className="relative aspect-3/4 w-full overflow-hidden rounded-lg bg-muted">
        {card.avatarUrl && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.avatarUrl}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
            className="size-full object-cover"
          />
        ) : (
          <span className="flex size-full items-center justify-center text-2xl font-semibold text-muted-foreground">
            {card.name.slice(0, 1)}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="truncate text-sm font-medium">{card.name}</h3>
          <a
            href={`${CHUB_LIBRARY.SITE_URL}/${card.fullPath}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('libraryOpenOnChub', { name: card.name })}
            title={t('libraryOpenOnChub', { name: card.name })}
            className="ml-auto grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-fast hover:text-foreground coarse:size-8"
          >
            <ExternalLink className="size-3.5" />
          </a>
        </div>
        {card.tagline ? (
          <p className="line-clamp-2 text-2sm text-muted-foreground">
            {card.tagline}
          </p>
        ) : null}
        {card.starCount !== null || tags.length > 0 ? (
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {card.starCount !== null ? (
              <span className="flex shrink-0 items-center gap-0.5">
                <Star className="size-3" aria-hidden />
                <span className="sr-only">{t('libraryStars')}</span>
                {compact.format(card.starCount)}
              </span>
            ) : null}
            {tags.length > 0 ? (
              <span className="truncate">{tags.join(' · ')}</span>
            ) : null}
          </p>
        ) : null}
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-auto rounded-full"
        disabled={disabled}
        aria-label={t('libraryImportNamed', { name: card.name })}
        onClick={onImport}
      >
        {busy ? <Spinner size="sm" /> : <Plus className="size-4" />}
        {t('libraryImport')}
      </Button>
    </article>
  )
}

/** 白卡里的卡库：说明一行 · 网格 · 底部接下一页。 */
export function CharacterLibrary({
  library,
  importingPath,
  onImport,
}: {
  library: UseChubLibraryReturn
  /** 正在建成角色的那一张（一次一张）。 */
  importingPath: string | null
  onImport(fullPath: string): void
}) {
  const t = useTranslations('CharacterRoster')
  const sentinel = useRef<HTMLDivElement>(null)
  const { hasMore, loadMore, moreStatus, status } = library

  // 滚到底自己接下一页（没有 IntersectionObserver 的环境就停在这一页）。
  useEffect(() => {
    const node = sentinel.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    if (status !== 'ready' || !hasMore || moreStatus !== null) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, loadMore, moreStatus, status])

  return (
    <div className="flex flex-col gap-4">
      <p className="text-2sm text-muted-foreground">{t('libraryNote')}</p>

      {status === 'loading' ? (
        <div className={GRID_CLASS} aria-busy>
          <TileSkeletons count={10} />
        </div>
      ) : status === 'error' ? (
        <EmptyState
          tone="error"
          icon={<Users aria-hidden />}
          title={t('libraryErrorTitle')}
          description={library.error ?? t('libraryErrorHint')}
          action={
            <Button
              type="button"
              size="sm"
              className="rounded-full"
              onClick={library.retry}
            >
              {t('libraryRetry')}
            </Button>
          }
        />
      ) : library.items.length === 0 ? (
        // 搜索无结果不是空态（ui-defaults §7）：一句话 + 清掉搜索。
        <div className="flex flex-col items-center gap-3 py-12 text-center text-2sm text-muted-foreground">
          <p>{t('libraryNoResults')}</p>
          {library.query ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() => library.setQuery('')}
            >
              {t('libraryClearSearch')}
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <div className={GRID_CLASS}>
            {library.items.map((card) => (
              <LibraryTile
                key={card.fullPath}
                card={card}
                busy={importingPath === card.fullPath}
                disabled={importingPath !== null}
                onImport={() => onImport(card.fullPath)}
              />
            ))}
            {moreStatus === 'loading' ? <TileSkeletons count={5} /> : null}
          </div>
          <div
            ref={sentinel}
            className="flex justify-center py-2 text-2sm text-muted-foreground"
          >
            {moreStatus === 'error' ? (
              <button
                type="button"
                onClick={library.retry}
                className="underline-offset-4 hover:text-foreground hover:underline"
              >
                {t('libraryMoreFailed')}
              </button>
            ) : !hasMore ? (
              <span>{t('libraryNoMore')}</span>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
