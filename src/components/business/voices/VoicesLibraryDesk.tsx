'use client'

import { useTranslations } from 'next-intl'

import {
  VOICE_LIBRARY_LANGUAGE_FILTERS,
  VOICE_LIBRARY_SORT_OPTIONS,
  VOICE_LIBRARY_SOURCE_LABEL,
} from '@/constants/voice-cards'
import type { VoiceCardRecord } from '@/types'
import type { VoiceAsset } from '@/types/voice-library'
import { Bookmark, LayoutGrid, Mic } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
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
import { Spinner } from '@/components/ui/spinner'
import { VoiceAvatarButton } from '@/components/business/node/voice-library/VoiceAvatar'
import type { UseVoicesPageReturn } from '@/hooks/use-voices-page'
import { canPreviewVoiceSample } from '@/hooks/use-voice-sample-preview'
import { charactersOfVoice, voiceAvatarCover } from '@/lib/voice-avatar'
import { cn } from '@/lib/utils'

import { VoiceTileMenuItems, type VoiceTileActions } from './VoiceTile'

/**
 * **声音库 · 桌面**（ui-spec §9「库 `LibraryPage`」，样件 E S22）：库同一副骨架。
 *
 * 左栏「全部（Fish Audio）/ 收藏 / 我的克隆」—— 「收藏」就是存下来的那几副公开嗓子
 * （音色卡本身就是收藏，⛔ 另加收藏列）。「全部」= 我的音色在前、公开库接在后面
 * （已经收藏的那副不再摆第二遍）。格子：灰底里一颗圆头像（点它试听），名字 + 一行来源在下；
 * 第一格虚线「克隆音色」。悬停出收藏（公开的那几副）/ 更多（改名 · 换头像 · 绑到角色 · 删除）。
 * 声音还交不了助手（引用里没有声音这一类），⛔ 画那颗键。
 * 手机照旧（等手机端整体重设计）。
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
  const tStudio = useTranslations('StudioPage')
  const { library, characters, preview } = page
  const onAll = library.tab === 'public'

  const select = (tab: typeof library.tab) => {
    preview.stop()
    library.setTab(tab)
  }

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

  const renderCard = (card: VoiceCardRecord) => {
    const bound = charactersOfVoice(card.id, characters)
    const target = {
      id: card.id,
      url: card.sampleAudioUrl ?? card.referenceAudioUrl,
      voiceId: card.voiceId,
    }
    return (
      <VoiceLibraryTile
        key={card.id}
        name={card.name}
        cover={voiceAvatarCover(card, characters)}
        meta={
          bound.length > 0
            ? t('boundTo', {
                names: bound.map((item) => item.name).join('、'),
              })
            : card.referenceAudioUrl
              ? tLib('metaCloned')
              : t('sourceFavorite')
        }
        playing={preview.playingId === card.id}
        loading={preview.loadingId === card.id}
        progress={preview.progress}
        canPreview={canPreviewVoiceSample(target)}
        onPreview={() => preview.toggle(target)}
        more={
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <MediaTileMoreTrigger
                label={t('actions', { name: card.name })}
                disabled={page.pendingId === card.id}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <VoiceTileMenuItems actions={cardActions(card)} />
            </DropdownMenuContent>
          </DropdownMenu>
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
    return (
      <VoiceLibraryTile
        key={asset.id}
        name={asset.title}
        cover={asset.coverImage}
        meta={[
          VOICE_LIBRARY_SOURCE_LABEL,
          asset.author,
          ...asset.tags.slice(0, 1),
        ]
          .filter(Boolean)
          .join(' · ')}
        playing={preview.playingId === asset.id}
        loading={preview.loadingId === asset.id}
        progress={preview.progress}
        canPreview={canPreviewVoiceSample(target)}
        onPreview={() => preview.toggle(target)}
        favorite={{
          saved: false,
          label: t('favorite'),
          pending: library.favoritePendingId === asset.id,
          onToggle: () => void library.toggleFavorite(asset),
        }}
      />
    )
  }

  const empty =
    !library.isLoading && mine.length === 0 && publicVoices.length === 0
  const body = library.isLoading ? (
    <div className="flex justify-center py-16">
      <Spinner size="lg" className="text-muted-foreground" />
    </div>
  ) : library.error && empty ? (
    <EmptyState tone="error" title={library.error} />
  ) : empty && library.tab === 'favorites' && !needle ? (
    <EmptyState
      icon={<Bookmark aria-hidden />}
      title={t('emptyFavorites')}
      description={tLib('emptyFavoritesHint')}
      action={
        <Button
          type="button"
          size="sm"
          className="rounded-full"
          onClick={() => select('public')}
        >
          {tLib('all')}
        </Button>
      }
    />
  ) : (
    <div className="flex flex-col gap-6">
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
      {empty && needle ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {t('emptyPublic')}
        </p>
      ) : null}
      {onAll && library.hasMore ? (
        <Button
          type="button"
          variant="secondary"
          className="self-center rounded-full"
          disabled={library.isLoadingMore}
          onClick={library.loadMore}
        >
          {library.isLoadingMore ? <Spinner size="sm" /> : null}
          {t('loadMore')}
        </Button>
      ) : null}
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 gap-8">
      <LibraryRail label={t('title')} className="pt-0.5">
        <LibraryRailRow
          icon={<LayoutGrid aria-hidden />}
          label={tLib('all')}
          trailing={VOICE_LIBRARY_SOURCE_LABEL}
          active={onAll}
          onSelect={() => select('public')}
        />
        <LibraryRailRow
          icon={<Bookmark aria-hidden />}
          label={tLib('favorites')}
          trailing={library.favorites.length}
          active={library.tab === 'favorites'}
          onSelect={() => select('favorites')}
        />
        <LibraryRailRow
          icon={<Mic aria-hidden />}
          label={tLib('cloned')}
          trailing={library.cloned.length}
          active={library.tab === 'cloned'}
          onSelect={() => select('cloned')}
        />
      </LibraryRail>

      <div className="flex min-w-0 flex-1 flex-col">
        <LibraryToolbar
          className="shrink-0"
          search={
            <LibrarySearch
              value={library.search}
              onChange={library.setSearch}
              placeholder={t('searchPlaceholder')}
              label={t('searchPlaceholder')}
            />
          }
          end={
            onAll ? (
              <LibraryPillSelect
                label={tStudio('voiceSortFilter')}
                value={library.sortBy}
                options={VOICE_LIBRARY_SORT_OPTIONS.map((option) => ({
                  value: option.value,
                  label: tStudio(option.labelKey),
                }))}
                onChange={library.setSortBy}
              />
            ) : null
          }
        />
        {onAll ? (
          <div className="mt-3 flex shrink-0">
            <LiquidSegmented
              ariaLabel={tLib('languages')}
              value={library.language}
              items={VOICE_LIBRARY_LANGUAGE_FILTERS.map((filter) => ({
                value: filter.value,
                label: tStudio(filter.labelKey),
              }))}
              onChange={library.setLanguage}
            />
          </div>
        ) : null}
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-6">{body}</div>
      </div>
    </div>
  )
}

/** 声音的格子：灰底里一颗圆头像（点它试听），名字 + 一行来源在下。 */
function VoiceLibraryTile({
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
}) {
  const t = useTranslations('VoicesPage')
  return (
    <div data-testid="voice-tile" className="min-w-0">
      <div
        className={cn(MEDIA_TILE_CLASS, 'grid aspect-3/4 place-items-center')}
      >
        <MediaTileShade />
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
        <MediaTileActions favorite={favorite} more={more} />
      </div>
      <MediaTileCaption name={name} meta={meta} />
    </div>
  )
}
