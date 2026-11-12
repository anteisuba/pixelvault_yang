'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import {
  CHUB_LIBRARY,
  CHUB_LIBRARY_SORT_KEYS,
  CHUB_LIBRARY_TAGS,
} from '@/constants/cards/chub-library'
import type { ChubCardSummary } from '@/types/chub-library'
import {
  Check,
  ChevronDown,
  ExternalLink,
  Plus,
  Users,
} from '@/components/icons'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import {
  ResponsiveMenu,
  ResponsiveMenuContent,
  ResponsiveMenuItem,
  ResponsiveMenuTrigger,
} from '@/components/ui/responsive-menu'
import { Skeleton } from '@/components/ui/skeleton'
import {
  LIBRARY_PILL_CLASS,
  LibraryGrid,
  LibraryPillSelect,
  LibrarySearch,
  LibraryToolbar,
} from '@/components/ui/library-kit'
import { Spinner } from '@/components/ui/spinner'
import { useChubCard } from '@/features/cards/hooks/use-chub-card'
import type { UseChubLibraryReturn } from '@/features/cards/hooks/use-chub-library'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { screenItemProps } from '@/lib/assistant-screen-scan'

/**
 * **角色页 · 卡库**（owner 2026-10-14 选「角色页里加 tab」）：站内搜 chub.ai 上别人
 * 做好的酒馆卡，点「做成角色」就建成一张我们的角色卡（与文件导入同一条落格规则，
 * 世界书、卡自带系统提示词只存不注入）。成人内容照出（owner 2026-10-15），NSFL 不出。
 *
 * 桌面在库骨架里（左栏「卡库」）：顶上搜索 · 标签 · 排序（`CharacterLibraryToolbar`），
 * 下面卡片网格，滚到底接下一页；点卡在站内看详情。
 */

/**
 * 卡库那一行（桌面，库骨架右边顶上）：搜 chub · 标签 ……… 热门 / 最新。手机是 `CharacterPhoneBar`。
 */
export function CharacterLibraryToolbar({
  library,
}: {
  library: UseChubLibraryReturn
}) {
  const t = useTranslations('CharacterRoster')
  return (
    <LibraryToolbar
      className="shrink-0"
      search={
        <LibrarySearch
          value={library.query}
          onChange={library.setQuery}
          placeholder={t('librarySearchPlaceholder')}
          label={t('librarySearchPlaceholder')}
          maxLength={CHUB_LIBRARY.QUERY_MAX_LENGTH}
        />
      }
      pills={<LibraryTagMenu library={library} pill />}
      end={
        <LibraryPillSelect
          label={t('librarySort')}
          value={library.sort}
          options={CHUB_LIBRARY_SORT_KEYS.map((key) => ({
            value: key,
            label: t(
              key === 'popular' ? 'librarySortPopular' : 'librarySortRecent',
            ),
          }))}
          onChange={library.setSort}
        />
      }
    />
  )
}

/**
 * 「标签 ▾」（owner 2026-10-17）：只看带某个标签的卡。桌面锚定的下拉、手机从底部升起；
 * 选了标签这颗变近黑实底。
 */
function LibraryTagMenu({
  library,
  className,
  pill = false,
}: {
  library: UseChubLibraryReturn
  className?: string
  /** 库骨架的药丸（桌面）：设了只写值，⛔ 变近黑实底。 */
  pill?: boolean
}) {
  const t = useTranslations('CharacterRoster')
  const pick = (tag: string | null) => library.setTag(tag)
  return (
    <ResponsiveMenu>
      <ResponsiveMenuTrigger asChild>
        <button
          type="button"
          data-testid="library-tag"
          aria-label={t('libraryTagMenu')}
          className={
            pill
              ? LIBRARY_PILL_CLASS
              : cn(
                  'flex shrink-0 items-center gap-1 rounded-full px-3 text-2sm transition-colors duration-fast ease-standard',
                  className,
                  library.tag &&
                    'bg-foreground text-background hover:bg-foreground/90',
                )
          }
        >
          {t('libraryTag')} {library.tag ?? t('libraryTagAll')}
          <ChevronDown className="size-3.5" aria-hidden />
        </button>
      </ResponsiveMenuTrigger>
      <ResponsiveMenuContent
        label={t('libraryTagMenu')}
        align="end"
        className="max-h-80 overflow-y-auto"
      >
        {[null, ...CHUB_LIBRARY_TAGS].map((tag) => (
          <ResponsiveMenuItem
            key={tag ?? 'all'}
            data-testid={`library-tag-${tag ?? 'all'}`}
            onSelect={() => pick(tag)}
          >
            <Check
              aria-hidden
              className={cn(library.tag === tag ? 'opacity-100' : 'opacity-0')}
            />
            {tag ?? t('libraryTagAll')}
          </ResponsiveMenuItem>
        ))}
      </ResponsiveMenuContent>
    </ResponsiveMenu>
  )
}

/** 手机卡库的排序：一排 chip，选中近黑实底（iOS 稿）。 */
function LibrarySortChips({ library }: { library: UseChubLibraryReturn }) {
  const t = useTranslations('CharacterRoster')
  return (
    <div role="group" aria-label={t('librarySort')} className="flex gap-1.5">
      {CHUB_LIBRARY_SORT_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          aria-pressed={library.sort === key}
          data-testid={`library-phone-sort-${key}`}
          onClick={() => library.setSort(key)}
          className={cn(
            'touch-target-y h-8 rounded-full px-3 text-2sm transition-colors duration-fast ease-standard',
            library.sort === key
              ? 'bg-foreground text-background'
              : 'bg-muted text-foreground active:bg-accent',
          )}
        >
          {t(key === 'popular' ? 'librarySortPopular' : 'librarySortRecent')}
        </button>
      ))}
      <LibraryTagMenu
        library={library}
        className="touch-target-y h-8 bg-muted text-foreground active:bg-accent"
      />
    </div>
  )
}

/** 骨架与格子里的图同一个 3:4（格子本身是库骨架的 `LibraryGrid`，ui-spec §9）。 */
function TileSkeletons({ count }: { count: number }) {
  return Array.from({ length: count }, (_, index) => (
    <Skeleton key={index} className="aspect-3/4 w-full rounded-2xl" />
  ))
}

/** chub 的图：坏了退成名字首字（chub 图床偶尔 404）。 */
function ChubImage({
  card,
  className,
  imgClassName,
}: {
  card: ChubCardSummary
  className?: string
  imgClassName?: string
}) {
  const [broken, setBroken] = useState(false)
  return (
    <span className={cn('block overflow-hidden bg-muted', className)}>
      {card.avatarUrl && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.avatarUrl}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className={cn('size-full object-cover', imgClassName)}
        />
      ) : (
        <span className="flex size-full items-center justify-center text-2xl font-semibold text-muted-foreground">
          {card.name.slice(0, 1)}
        </span>
      )}
    </span>
  )
}

function useCompactNumber() {
  const locale = useLocale()
  return useMemo(
    () => new Intl.NumberFormat(locale, { notation: 'compact' }),
    [locale],
  )
}

/** 卡片底下那行小字：★ 收藏数 · 前几个标签。 */
function tileMeta(card: ChubCardSummary, compact: Intl.NumberFormat): string {
  return [
    card.starCount !== null ? `★ ${compact.format(card.starCount)}` : null,
    ...card.tags.slice(0, CHUB_LIBRARY.TILE_TAGS),
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * 卡库里的一张卡（ui-spec §9 库）：3:4 图，名字和一行小字写在图下面 —— 桌面、手机同一种，
 * 和角色 / 提示词 / 音色那几个库的格子一样。点开看详情，「做成角色」与 chub 外链都在详情里。
 */
function LibraryTile({
  card,
  onOpen,
}: {
  card: ChubCardSummary
  onOpen(): void
}) {
  const t = useTranslations('CharacterRoster')
  const compact = useCompactNumber()
  const meta = tileMeta(card, compact)
  return (
    <button
      type="button"
      data-testid="library-tile"
      {...screenItemProps('tavern', card.name, card.avatarUrl)}
      onClick={onOpen}
      aria-label={t('libraryOpenDetail', { name: card.name })}
      className="group block w-full text-left transition-transform duration-fast ease-standard active:scale-96 motion-reduce:transition-none"
    >
      <ChubImage
        card={card}
        className="aspect-3/4 w-full rounded-2xl"
        imgClassName="transition-transform duration-reveal ease-standard group-hover:scale-103 motion-reduce:transition-none"
      />
      <span className="mt-2 block truncate text-sm font-semibold">
        {card.name}
      </span>
      {meta ? (
        <span className="block truncate text-xs text-muted-foreground">
          {meta}
        </span>
      ) : null}
    </button>
  )
}

function DetailField({ label, text }: { label: string; text: string }) {
  const value = text.trim()
  if (!value) return null
  return (
    <section className="flex min-w-0 flex-col gap-1">
      <h3 className="text-xs text-muted-foreground">{label}</h3>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
        {value}
      </p>
    </section>
  )
}

/**
 * 卡库详情（owner 2026-10-15 选 B「正中弹窗」）：电脑是正中弹窗（左图右字），手机是
 * 从底下拉起的整屏抽屉（图在上、字往上滑，「做成角色」贴底）。打开时才去 chub 取这张
 * 卡的完整定义；标题、图、收藏数用列表里已有的，先出来。
 */
function LibraryDetail({
  card,
  busy,
  disabled,
  onClose,
  onImport,
}: {
  card: ChubCardSummary | null
  busy: boolean
  disabled: boolean
  onClose(): void
  onImport(fullPath: string): void
}) {
  const t = useTranslations('CharacterRoster')
  const compact = useCompactNumber()
  const detail = useChubCard(card?.fullPath ?? null)
  // 关上时内容还要陪着淡出：留住最后一张。
  const [shown, setShown] = useState(card)
  if (card && card !== shown) setShown(card)
  const current = card ?? shown
  if (!current) return null

  const definition = detail.node?.definition
  const creator = current.fullPath.split('/')[0]
  const meta = [
    current.starCount !== null
      ? `★ ${compact.format(current.starCount)}`
      : null,
    creator ? t('libraryCreator', { name: creator }) : null,
    current.tokenCount !== null
      ? t('libraryTokens', { count: compact.format(current.tokenCount) })
      : null,
  ].filter(Boolean)
  const alternates = definition?.alternate_greetings.length ?? 0

  return (
    <ResponsiveDialog
      open={card !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <ResponsiveDialogContent
        data-testid="library-detail"
        className="gap-0 overflow-hidden p-0 sm:flex sm:max-h-9/10 sm:max-w-4xl"
        mobileBodyClassName="px-0 pt-0"
      >
        <ChubImage
          card={current}
          className="aspect-4/5 w-full shrink-0 sm:aspect-auto sm:w-2/5"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-4 px-5 pt-5 pb-4 sm:overflow-y-auto sm:px-6 sm:pt-6">
            <ResponsiveDialogHeader className="gap-1 p-0 text-left">
              <ResponsiveDialogTitle className="text-xl font-semibold">
                {current.name}
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription className="text-xs text-muted-foreground">
                {meta.join(' · ')}
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            {current.tags.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {current.tags.map((tag) => (
                  <li
                    key={tag}
                    className="rounded-full bg-muted px-2.5 py-0.5 text-xs"
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            ) : null}
            {current.tagline ? (
              <p className="text-sm text-muted-foreground">{current.tagline}</p>
            ) : null}

            {detail.status === 'error' ? (
              <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
                <p>{detail.error ?? t('libraryDetailFailed')}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="rounded-full"
                  onClick={detail.retry}
                >
                  {t('libraryRetry')}
                </Button>
              </div>
            ) : definition ? (
              <>
                {/* ⚠ chub 的格名和酒馆错开一位（见 docs/references/domains/cards.md
                    「落格」）：chub `personality` = 酒馆 description，`tavern_personality`
                    = 性格，chub `description` = 作者备注。 */}
                <DetailField
                  label={t('libraryFieldDescription')}
                  text={definition.personality}
                />
                <DetailField
                  label={t('libraryFieldPersonality')}
                  text={definition.tavern_personality}
                />
                <DetailField
                  label={t('libraryFieldScenario')}
                  text={definition.scenario}
                />
                <DetailField
                  label={t('libraryFieldFirstMessage')}
                  text={definition.first_message}
                />
                <DetailField
                  label={t('libraryFieldCreatorNotes')}
                  text={definition.description}
                />
                {alternates > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t('libraryAltGreetings', { count: alternates })}
                  </p>
                ) : null}
              </>
            ) : (
              <div className="flex flex-col gap-2" aria-busy>
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            )}
          </div>
          <div className="sticky bottom-0 flex items-center gap-3 border-t bg-background px-5 py-3 sm:px-6">
            <a
              href={`${CHUB_LIBRARY.SITE_URL}/${current.fullPath}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('libraryOpenOnChub', { name: current.name })}
              className="flex items-center gap-1 text-2sm text-muted-foreground underline-offset-4 transition-colors duration-fast hover:text-foreground hover:underline"
            >
              {t('libraryViewOnChub')}
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
            <Button
              type="button"
              className="ml-auto rounded-full"
              disabled={disabled}
              aria-label={t('libraryImportNamed', { name: current.name })}
              onClick={() => onImport(current.fullPath)}
            >
              {busy ? <Spinner size="sm" /> : <Plus className="size-4" />}
              {t('libraryImport')}
            </Button>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}

/** 白卡里的卡库：网格 · 底部接下一页（手机顶上多一排排序 chip、最底下一句来源）。 */
export function CharacterLibrary({
  library,
  importingPath,
  onImport,
  sortChips = true,
}: {
  library: UseChubLibraryReturn
  /** 正在建成角色的那一张（一次一张）。 */
  importingPath: string | null
  onImport(fullPath: string): void
  /** 手机顶上那排排序 chip。酒馆页顶上已有「标签 · 排序」药丸（`CharacterLibraryToolbar`），⛔ 再画一遍。 */
  sortChips?: boolean
}) {
  const t = useTranslations('CharacterRoster')
  const isMobile = useIsMobile()
  const sentinel = useRef<HTMLDivElement>(null)
  const { hasMore, loadMore, moreStatus, status } = library
  /** 详情开着的那一张。 */
  const [openCard, setOpenCard] = useState<ChubCardSummary | null>(null)

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
      {/* 手机：排序是胶囊下面一排 chip，来源说明在最底下一句（iOS 稿）。桌面不写说明（ui-spec §9：库里不写解释句）。 */}
      {isMobile && sortChips ? <LibrarySortChips library={library} /> : null}

      {status === 'loading' ? (
        <div aria-busy>
          <LibraryGrid>
            <TileSkeletons count={12} />
          </LibraryGrid>
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
              variant="secondary"
              className="rounded-full"
              onClick={() => library.setQuery('')}
            >
              {t('libraryClearSearch')}
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <LibraryGrid>
            {library.items.map((card) => (
              <LibraryTile
                key={card.fullPath}
                card={card}
                onOpen={() => setOpenCard(card)}
              />
            ))}
            {moreStatus === 'loading' ? <TileSkeletons count={6} /> : null}
          </LibraryGrid>
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
          {isMobile ? (
            <p className="text-center text-xs text-muted-foreground">
              {t('phone.libraryNote')}
            </p>
          ) : null}
        </>
      )}
      <LibraryDetail
        card={openCard}
        busy={openCard !== null && importingPath === openCard.fullPath}
        disabled={importingPath !== null}
        onClose={() => setOpenCard(null)}
        onImport={onImport}
      />
    </div>
  )
}
