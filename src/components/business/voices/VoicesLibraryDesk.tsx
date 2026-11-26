'use client'

import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { studioVoicePath } from '@/constants/routes'
import {
  VOICE_LIBRARY_LANGUAGE_FILTERS,
  VOICE_LIBRARY_SORT_OPTIONS,
  VOICE_LIBRARY_SOURCE_LABEL,
} from '@/constants/voice-cards'
import type { VoiceCardRecord } from '@/types'
import type { VoiceAsset } from '@/types/voice-library'
import {
  AudioLines,
  Bookmark,
  LayoutGrid,
  Mic,
  MoreHorizontal,
} from '@/components/icons'
import { Button } from '@/components/ui/button'
import { FavoriteBookmark } from '@/components/ui/favorite-bookmark'
import {
  ResponsiveMenu,
  ResponsiveMenuContent,
  ResponsiveMenuItem,
  ResponsiveMenuSeparator,
  ResponsiveMenuTrigger,
} from '@/components/ui/responsive-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  LibraryGrid,
  LibraryNewTile,
  LibraryNoResults,
  LibraryPillSelect,
  LibraryRail,
  LibraryRailRow,
  LibraryScopeSelect,
  LibraryTileSkeletonGrid,
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
import { FeedTail } from '@/components/business/FeedTail'
import { PageLoadError } from '@/components/business/PageLoadError'
import { VoiceAvatarButton } from '@/components/business/voices/VoiceAvatar'
import { useRouter } from '@/i18n/navigation'
import { useIsMobile } from '@/hooks/use-mobile'
import { useLoadMoreOnScroll } from '@/hooks/use-load-more-on-scroll'
import type { UseVoiceLibraryReturn } from '@/hooks/use-voice-library'
import type { UseVoicesPageReturn } from '@/hooks/use-voices-page'
import { canPreviewVoiceSample } from '@/hooks/use-voice-sample-preview'
import { charactersOfVoice, voiceAvatarCover } from '@/lib/voice-avatar'
import { cn } from '@/lib/utils'
import { screenItemProps } from '@/lib/assistant-screen-scan'

import { VoiceTileMenuItems, type VoiceTileActions } from './VoiceTile'

/**
 * **声音库 · 桌面**（ui-spec §9「库 `LibraryPage`」，样件 E S22）：库同一副骨架。
 *
 * 第一行页签「全部音色（Fish Audio）/ 收藏 / 我的克隆」—— 「收藏」就是存下来的那几副公开嗓子
 * （音色卡本身就是收藏，⛔ 另加收藏列）。「全部」= 我的音色在前、公开库接在后面
 * （已经收藏的那副不再摆第二遍）。格子：灰底里一颗圆头像（点它试听），名字 + 一行来源在下；
 * 第一格虚线「克隆音色」。悬停出收藏（公开的那几副）/ 更多（改名 · 换头像 · 绑到角色 · 删除）。
 * 第二行语言切换条（「全部」才有）……… 搜索 · 排序。手机桌面同一份。
 * 声音还交不了助手（引用里没有声音这一类），⛔ 画那颗键。
 */

interface VoicesLibraryDeskProps {
  page: UseVoicesPageReturn
  onClone(): void
  cardActions(card: VoiceCardRecord): VoiceTileActions
}

export function VoicesLibraryDesk({
  page,
  onClone,
  cardActions,
}: VoicesLibraryDeskProps) {
  const t = useTranslations('VoicesPage')
  const tLib = useTranslations('VoicesPage.library')
  const { library, characters, preview } = page
  const onAll = library.tab === 'public'
  const router = useRouter()
  const isPhone = useIsMobile()

  /**
   * 「用这副嗓子配音」→ 配音台（`?voice=`）：那边当本次的临时音色，⛔ 改角色卡绑定。
   * 公开库那副还不是音色卡：先收藏（音色卡就是收藏），拿到新卡再去。
   */
  const openInBench = (voiceCardId: string) => {
    preview.stop()
    router.push(studioVoicePath(voiceCardId))
  }
  const saveAndOpenInBench = async (asset: VoiceAsset) => {
    const card = await library.toggleFavorite(asset)
    if (card) openInBench(card.id)
    else toast.error(t('useInBenchFailed'))
  }

  // 库一进来停在「全部」（同素材 / 角色库）；`useVoicesPage` 默认的「收藏」是手机页签的。
  const landed = useRef(false)
  const { setTab } = library
  useEffect(() => {
    if (landed.current) return
    landed.current = true
    setTab('public')
  }, [setTab])

  const select = (tab: typeof library.tab) => {
    preview.stop()
    library.setTab(tab)
  }

  const { needle, mine, publicVoices } = visibleVoices(library)
  const scrollRef = useRef<HTMLDivElement>(null)

  const renderCard = (card: VoiceCardRecord) => {
    const bound = charactersOfVoice(card.id, characters)
    const target = {
      id: card.id,
      url: card.sampleAudioUrl ?? card.referenceAudioUrl,
      voiceId: card.voiceId,
    }
    const meta =
      bound.length > 0
        ? t('boundTo', {
            names: bound.map((item) => item.name).join('、'),
          })
        : card.referenceAudioUrl
          ? tLib('metaCloned')
          : t('sourceFavorite')
    const menuItems = (
      <>
        <ResponsiveMenuItem onSelect={() => openInBench(card.id)}>
          <AudioLines aria-hidden />
          {t('useInBench')}
        </ResponsiveMenuItem>
        <ResponsiveMenuSeparator />
        <VoiceTileMenuItems actions={cardActions(card)} />
      </>
    )
    if (isPhone) {
      return (
        <VoiceLibraryPhoneRow
          key={card.id}
          name={card.name}
          cover={voiceAvatarCover(card, characters)}
          meta={meta}
          playing={preview.playingId === card.id}
          loading={preview.loadingId === card.id}
          progress={preview.progress}
          canPreview={canPreviewVoiceSample(target)}
          onPreview={() => preview.toggle(target)}
          moreLabel={t('actions', { name: card.name })}
          moreDisabled={page.pendingId === card.id}
          menuItems={menuItems}
        />
      )
    }
    return (
      <VoiceLibraryTile
        key={card.id}
        name={card.name}
        cover={voiceAvatarCover(card, characters)}
        meta={meta}
        playing={preview.playingId === card.id}
        loading={preview.loadingId === card.id}
        progress={preview.progress}
        canPreview={canPreviewVoiceSample(target)}
        onPreview={() => preview.toggle(target)}
        more={
          <ResponsiveMenu modal={false}>
            <ResponsiveMenuTrigger asChild>
              <MediaTileMoreTrigger
                label={t('actions', { name: card.name })}
                disabled={page.pendingId === card.id}
              />
            </ResponsiveMenuTrigger>
            <ResponsiveMenuContent align="start" label={card.name}>
              {menuItems}
            </ResponsiveMenuContent>
          </ResponsiveMenu>
        }
      />
    )
  }

  const renderAsset = (asset: VoiceAsset) => {
    const target = {
      id: asset.id,
      url: asset.sampleUrl,
      voiceId: asset.voiceId,
    }
    const meta = [
      VOICE_LIBRARY_SOURCE_LABEL,
      asset.author,
      ...asset.tags.slice(0, 1),
    ]
      .filter(Boolean)
      .join(' · ')
    const favorite = {
      saved: false,
      label: t('favorite'),
      pending: library.favoritePendingId === asset.id,
      onToggle: () => void library.toggleFavorite(asset),
    }
    const menuItems = (
      <ResponsiveMenuItem onSelect={() => void saveAndOpenInBench(asset)}>
        <AudioLines aria-hidden />
        {t('useInBenchPublic')}
      </ResponsiveMenuItem>
    )
    if (isPhone) {
      return (
        <VoiceLibraryPhoneRow
          key={asset.id}
          name={asset.title}
          cover={asset.coverImage}
          meta={meta}
          playing={preview.playingId === asset.id}
          loading={preview.loadingId === asset.id}
          progress={preview.progress}
          canPreview={canPreviewVoiceSample(target)}
          onPreview={() => preview.toggle(target)}
          favorite={favorite}
          moreLabel={t('actions', { name: asset.title })}
          moreDisabled={library.favoritePendingId === asset.id}
          menuItems={menuItems}
        />
      )
    }
    return (
      <VoiceLibraryTile
        key={asset.id}
        name={asset.title}
        cover={asset.coverImage}
        meta={meta}
        playing={preview.playingId === asset.id}
        loading={preview.loadingId === asset.id}
        progress={preview.progress}
        canPreview={canPreviewVoiceSample(target)}
        onPreview={() => preview.toggle(target)}
        favorite={favorite}
        more={
          <ResponsiveMenu modal={false}>
            <ResponsiveMenuTrigger asChild>
              <MediaTileMoreTrigger
                label={t('actions', { name: asset.title })}
                disabled={library.favoritePendingId === asset.id}
              />
            </ResponsiveMenuTrigger>
            <ResponsiveMenuContent align="start" label={asset.title}>
              {menuItems}
            </ResponsiveMenuContent>
          </ResponsiveMenu>
        }
      />
    )
  }

  const empty =
    !library.isLoading && mine.length === 0 && publicVoices.length === 0
  const filtered = needle !== '' || (onAll && library.language !== 'all')
  const body =
    library.isLoading && mine.length === 0 && publicVoices.length === 0 ? (
      isPhone ? (
        <VoicePhoneSkeletonList />
      ) : (
        <LibraryTileSkeletonGrid count={8} />
      )
    ) : library.error && empty ? (
      <PageLoadError
        title={library.error}
        onRetry={library.retry}
        retrying={library.isLoading}
        className="mt-10"
      />
    ) : empty && library.tab === 'favorites' && !needle ? (
      <VoiceFavoritesEmpty onBrowseAll={() => select('public')} />
    ) : empty && filtered ? (
      <VoiceLibraryNoResults library={library} />
    ) : (
      <div className="flex flex-col gap-5 md:gap-6">
        {isPhone ? (
          <div className="divide-y divide-border/60 overflow-hidden rounded-2xl bg-card shadow-ring">
            {mine.map(renderCard)}
            {publicVoices.map(renderAsset)}
          </div>
        ) : (
          <LibraryGrid>
            {library.tab === 'favorites' || needle ? null : (
              <LibraryNewTile
                label={t('clone')}
                icon={<Mic aria-hidden />}
                onClick={onClone}
              />
            )}
            {mine.map(renderCard)}
            {publicVoices.map(renderAsset)}
          </LibraryGrid>
        )}
        {onAll ? (
          <VoiceLibraryTail
            library={library}
            scrollRef={scrollRef}
            itemCount={publicVoices.length}
          />
        ) : null}
      </div>
    )

  return (
    <div className="@container flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <VoiceLibraryFilters
          library={library}
          scope={
            <VoiceLibraryScopeSelect library={library} onSelect={select} />
          }
          trailingAction={
            isPhone && library.tab !== 'favorites' ? (
              <button
                type="button"
                aria-label={t('clone')}
                onClick={onClone}
                className="touch-target grid size-9 shrink-0 place-items-center rounded-full bg-foreground text-background shadow-soft transition-transform duration-fast ease-standard active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Mic className="size-4" aria-hidden />
              </button>
            ) : null
          }
        />
        <div
          ref={scrollRef}
          className="mt-2.5 min-h-0 flex-1 overflow-y-auto pb-6 md:mt-3"
        >
          {body}
        </div>
      </div>
    </div>
  )
}

/** 搜了 / 筛了没有（ui-defaults §7，库整页与挑选框同一个）：回显搜索词 + 清除搜索 / 清除语言筛选。 */
export function VoiceLibraryNoResults({
  library,
}: {
  library: UseVoiceLibraryReturn
}) {
  return (
    <LibraryNoResults
      query={library.search}
      onClearSearch={() => library.setSearch('')}
      onClearFilters={
        library.tab === 'public' && library.language !== 'all'
          ? () => library.setLanguage('all')
          : undefined
      }
    />
  )
}

/**
 * 「全部」往下滚的尾巴（画廊 / 素材同一份 `FeedTail`）：离底 1.5 屏自己接下一页、在拿 = 一排灰块、
 * 没拿到 = 「这批没拿到 · 重试」（接着拿同一页，⛔ 自动重试）、拿完 = 「没有更多了」。库整页与挑选框共用。
 */
export function VoiceLibraryTail({
  library,
  scrollRef,
  itemCount,
}: {
  library: UseVoiceLibraryReturn
  /** 滚动的那一层（哨兵的观察 root）。 */
  scrollRef: RefObject<HTMLElement | null>
  itemCount: number
}) {
  const tFeedback = useTranslations('Feedback')
  const sentinelRef = useRef<HTMLDivElement>(null)
  const { hasMore, isLoadingMore, loadMoreFailed, loadMore } = library
  useLoadMoreOnScroll({
    scrollRef,
    sentinelRef,
    // ⚠ `loadMore` 每调一次就翻一页：在拿 / 刚失败时不挂哨兵，⛔ 连翻、⛔ 跳过失败那一页。
    hasNextPage: hasMore && !isLoadingMore && !loadMoreFailed,
    itemCount,
    loadMore,
  })
  return (
    <>
      <FeedTail
        loading={isLoadingMore}
        error={
          loadMoreFailed ? (library.error ?? tFeedback('batchFailed')) : null
        }
        ended={!hasMore}
        onRetry={library.retry}
        placeholder={<LibraryTileSkeletonGrid count={4} />}
      />
      <div ref={sentinelRef} aria-hidden className="h-px" />
    </>
  )
}

/** 「收藏」是空的：一句话 + 去「全部」挑。库整页与挑选框共用。 */
export function VoiceFavoritesEmpty({ onBrowseAll }: { onBrowseAll(): void }) {
  const t = useTranslations('VoicesPage')
  const tLib = useTranslations('VoicesPage.library')
  return (
    <EmptyState
      icon={<Bookmark aria-hidden />}
      title={t('emptyFavorites')}
      description={tLib('emptyFavoritesHint')}
      action={
        <Button
          type="button"
          size="sm"
          className="rounded-full"
          onClick={onBrowseAll}
        >
          {tLib('all')}
        </Button>
      }
    />
  )
}

/**
 * 这一格摆哪些：「全部」= 我的音色在前、公开库接在后面（已经收藏的那副不再摆第二遍）；
 * 搜索只筛我的那几副（公开库由内核拿词去问上游）。库整页与挑选框共用。
 */
export function visibleVoices(library: UseVoiceLibraryReturn) {
  const onAll = library.tab === 'public'
  const needle = library.search.trim().toLowerCase()
  const mine = (
    onAll
      ? [...library.favorites, ...library.cloned]
      : library.tab === 'cloned'
        ? library.cloned
        : library.favorites
  ).filter((card) => !needle || card.name.toLowerCase().includes(needle))
  const publicVoices = onAll
    ? library.publicVoices.filter((asset) => !library.favoriteCardOf(asset))
    : []
  return { onAll, needle, mine, publicVoices }
}

/** 分组药丸「全部音色 / 收藏 / 我的克隆」：库整页的工具行；挑选框在手机宽度（没地方摆左栏）也用它。 */
export function VoiceLibraryScopeSelect({
  library,
  onSelect,
}: {
  library: UseVoiceLibraryReturn
  onSelect: (tab: UseVoiceLibraryReturn['tab']) => void
}) {
  const tLib = useTranslations('VoicesPage.library')
  return (
    <LibraryScopeSelect
      label={tLib('scopeLabel')}
      value={library.tab}
      items={[
        {
          value: 'public' as const,
          label: tLib('allVoices'),
          meta: VOICE_LIBRARY_SOURCE_LABEL,
        },
        {
          value: 'favorites' as const,
          label: tLib('favorites'),
          meta: library.favorites.length,
        },
        {
          value: 'cloned' as const,
          label: tLib('cloned'),
          meta: library.cloned.length,
        },
      ]}
      current={
        library.tab === 'public' ? { label: tLib('allVoices') } : undefined
      }
      onChange={onSelect}
    />
  )
}

/** 挑选框（`VoicePickerDialog`）的左栏「全部（Fish Audio）/ 收藏 / 我的克隆」；库整页是分组药丸。 */
export function VoiceLibrarySectionRail({
  library,
  onSelect,
  className,
}: {
  library: UseVoiceLibraryReturn
  onSelect: (tab: UseVoiceLibraryReturn['tab']) => void
  className?: string
}) {
  const t = useTranslations('VoicesPage')
  const tLib = useTranslations('VoicesPage.library')
  return (
    <LibraryRail label={t('title')} className={className}>
      <LibraryRailRow
        icon={<LayoutGrid aria-hidden />}
        label={tLib('all')}
        trailing={VOICE_LIBRARY_SOURCE_LABEL}
        active={library.tab === 'public'}
        onSelect={() => onSelect('public')}
      />
      <LibraryRailRow
        icon={<Bookmark aria-hidden />}
        label={tLib('favorites')}
        trailing={library.favorites.length}
        active={library.tab === 'favorites'}
        onSelect={() => onSelect('favorites')}
      />
      <LibraryRailRow
        icon={<Mic aria-hidden />}
        label={tLib('cloned')}
        trailing={library.cloned.length}
        active={library.tab === 'cloned'}
        onSelect={() => onSelect('cloned')}
      />
    </LibraryRail>
  )
}

/** 工具行：语言切换条（「全部」才有）……… 搜索 · 排序（「全部」才有）· 可选手机末尾主动作。库整页与挑选框共用。 */
export function VoiceLibraryFilters({
  library,
  scope,
  trailingAction,
}: {
  library: UseVoiceLibraryReturn
  /** 库整页的分组药丸（挑选框不给 —— 那边分组在左栏）。 */
  scope?: ReactNode
  trailingAction?: ReactNode
}) {
  const t = useTranslations('VoicesPage')
  const tLib = useTranslations('VoicesPage.library')
  const tStudio = useTranslations('StudioPage')
  const onAll = library.tab === 'public'
  const endContent =
    onAll || trailingAction ? (
      <>
        {onAll ? (
          <LibraryPillSelect
            label={tStudio('voiceSortFilter')}
            value={library.sortBy}
            options={VOICE_LIBRARY_SORT_OPTIONS.map((option) => ({
              value: option.value,
              label: tStudio(option.labelKey),
            }))}
            onChange={library.setSortBy}
          />
        ) : null}
        {trailingAction}
      </>
    ) : null
  return (
    <LibraryToolbar
      className="shrink-0"
      scope={scope}
      segments={
        onAll ? (
          <LiquidSegmented
            ariaLabel={tLib('languages')}
            value={library.language}
            items={VOICE_LIBRARY_LANGUAGE_FILTERS.map((filter) => ({
              value: filter.value,
              label: tStudio(filter.labelKey),
            }))}
            onChange={library.setLanguage}
          />
        ) : null
      }
      search={{
        value: library.search,
        onChange: library.setSearch,
        placeholder: t('searchPlaceholder'),
        label: t('searchPlaceholder'),
      }}
      end={endContent}
    />
  )
}

/** 手机端 Apple Voice Memos / Music 风格的音色分组行：圆形可点试听头像 + 名字/来源 + 右侧收藏与底部动作单。 */
function VoiceLibraryPhoneRow({
  name,
  cover,
  meta,
  playing,
  loading,
  progress,
  canPreview,
  onPreview,
  favorite,
  moreLabel,
  moreDisabled,
  menuItems,
}: {
  name: string
  cover: string | null
  meta: string
  playing: boolean
  loading: boolean
  progress: number
  canPreview: boolean
  onPreview(): void
  favorite?: {
    saved: boolean
    label: string
    pending?: boolean
    onToggle(): void
  }
  moreLabel: string
  moreDisabled?: boolean
  menuItems: ReactNode
}) {
  const t = useTranslations('VoicesPage')
  return (
    <div
      data-testid="voice-tile"
      className="flex min-h-16 items-center gap-3 px-3.5 py-2.5 transition-colors duration-fast active:bg-muted/60"
      {...screenItemProps('voice', name, cover)}
    >
      <VoiceAvatarButton
        cover={cover}
        fallback="letter"
        name={name}
        size="library"
        glyph="always"
        playing={playing}
        loading={loading}
        progress={progress}
        disabled={!canPreview}
        ariaLabel={playing ? t('stopPreview') : t('preview')}
        onToggle={onPreview}
      />
      <button
        type="button"
        disabled={!canPreview}
        onClick={onPreview}
        className="touch-target-y flex min-w-0 flex-1 flex-col items-start text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
      >
        <span className="w-full truncate text-sm font-semibold text-foreground">
          {name}
        </span>
        <span className="w-full truncate text-xs text-muted-foreground">
          {meta}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        {favorite ? (
          <button
            type="button"
            aria-pressed={favorite.saved}
            aria-busy={favorite.pending || undefined}
            aria-label={favorite.label}
            disabled={favorite.pending}
            onClick={() => {
              if (!favorite.pending) favorite.onToggle()
            }}
            className="touch-target grid size-8 place-items-center rounded-full text-muted-foreground transition-colors duration-fast active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <FavoriteBookmark saved={favorite.saved} />
          </button>
        ) : null}
        <ResponsiveMenu modal={false}>
          <ResponsiveMenuTrigger asChild>
            <button
              type="button"
              aria-label={moreLabel}
              disabled={moreDisabled}
              className="touch-target grid size-8 place-items-center rounded-full text-muted-foreground transition-colors duration-fast active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </button>
          </ResponsiveMenuTrigger>
          <ResponsiveMenuContent align="end" label={name}>
            {menuItems}
          </ResponsiveMenuContent>
        </ResponsiveMenu>
      </div>
    </div>
  )
}

function VoicePhoneSkeletonList() {
  return (
    <div
      aria-hidden
      className="divide-y divide-border/60 overflow-hidden rounded-2xl bg-card shadow-ring"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="flex min-h-16 items-center gap-3 px-3.5 py-2.5"
        >
          <Skeleton className="size-10 shrink-0 rounded-full bg-muted" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-2/5 rounded-sm bg-muted" />
            <Skeleton className="h-3 w-3/5 rounded-sm bg-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * 声音的格子：灰底里一颗圆头像（点它试听），名字 + 一行来源在下。
 * 挑选框里（`onPick`）整格 = 挑这一副（头像照旧试听）；已经在的写「已在」、点不了。
 */
export function VoiceLibraryTile({
  name,
  cover,
  meta,
  playing,
  loading,
  progress,
  canPreview,
  onPreview,
  favorite,
  more,
  onPick,
  pickLabel,
  taken,
  takenLabel,
}: {
  name: string
  cover: string | null
  meta: string
  playing: boolean
  loading: boolean
  progress: number
  canPreview: boolean
  onPreview(): void
  favorite?: {
    saved: boolean
    label: string
    pending?: boolean
    onToggle(): void
  }
  more?: React.ReactNode
  onPick?: () => void
  pickLabel?: string
  taken?: boolean
  takenLabel?: string
}) {
  const t = useTranslations('VoicesPage')
  return (
    <div
      data-testid="voice-tile"
      className="min-w-0"
      // 助手「看屏」认得出这一格（音色库开着时报给它，`assistant-screen-scan`）。
      {...screenItemProps('voice', name, cover)}
    >
      <div
        className={cn(MEDIA_TILE_CLASS, 'grid aspect-3/4 place-items-center')}
      >
        <MediaTileShade />
        {onPick ? (
          <button
            type="button"
            onClick={onPick}
            disabled={taken}
            aria-label={pickLabel ?? name}
            className="absolute inset-0 z-10 rounded-12 focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-default"
          />
        ) : null}
        {taken && takenLabel ? (
          <span className="pointer-events-none absolute top-2 right-2 z-20 inline-flex h-5.5 items-center rounded-full bg-media-chip px-2 text-2xs font-semibold text-on-media-chip">
            {takenLabel}
          </span>
        ) : null}
        <span className="relative z-20 grid place-items-center">
          <VoiceAvatarButton
            cover={cover}
            fallback="letter"
            name={name}
            size="tile"
            playing={playing}
            loading={loading}
            progress={progress}
            disabled={!canPreview}
            ariaLabel={playing ? t('stopPreview') : t('preview')}
            onToggle={onPreview}
          />
        </span>
        <MediaTileActions favorite={favorite} more={more} />
      </div>
      <MediaTileCaption name={name} meta={meta} />
    </div>
  )
}
