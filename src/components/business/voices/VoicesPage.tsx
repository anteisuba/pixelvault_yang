'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

import { Mic, Plus, Search } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { Spinner } from '@/components/ui/spinner'
import { VoiceTrainer } from '@/components/business/studio/VoiceTrainer'
import { useIsMobile } from '@/hooks/use-mobile'
import { useVoicesPage } from '@/hooks/use-voices-page'
import { canPreviewVoiceSample } from '@/hooks/use-voice-sample-preview'
import { charactersOfVoice, voiceAvatarCover } from '@/lib/voice-avatar'
import { cn } from '@/lib/utils'
import type { VoiceCardRecord } from '@/types'
import type { VoiceAsset, VoiceLibraryTab } from '@/types/voice-library'

import {
  VoiceBindDialog,
  VoiceCoverDialog,
  VoiceRenameDialog,
} from './VoiceDialogs'
import { VoicesLibraryDesk } from './VoicesLibraryDesk'
import { VoiceTile, type VoiceTileActions } from './VoiceTile'

/**
 * **音色库页** `/voices`（「声音」模块第 1 个 PR，owner 10-23）。
 *
 * 地台 + 白卡，与角色页同一套：上面一行是三个页签（我的收藏 · 我的克隆 · 找音色）
 * 和动作，下面一张白卡放卡片网格（手机）；桌面换成库骨架 `VoicesLibraryDesk`（ui-spec §9，样件 E S22）。找新音色与克隆在配音间的选角弹窗里也照样能做
 * （owner 10-23：选角弹窗保持原样），这一页多出来的是管理：改名、换头像、绑到角色、删除。
 */

const TABS: readonly VoiceLibraryTab[] = ['favorites', 'cloned', 'public']

const GRID_CLASS =
  'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'

export function VoicesPage() {
  const t = useTranslations('VoicesPage')
  const page = useVoicesPage()
  const isMobile = useIsMobile()
  const { library, characters, preview } = page

  const [renaming, setRenaming] = useState<VoiceCardRecord | null>(null)
  const [covering, setCovering] = useState<VoiceCardRecord | null>(null)
  const [bindingId, setBindingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<VoiceCardRecord | null>(null)
  const [cloning, setCloning] = useState(false)

  // 绑定弹窗读最新的卡（绑完角色列表会刷新，卡本身不变，但留着 id 才不会读到旧对象）。
  const binding = useMemo(
    () => library.cards.find((card) => card.id === bindingId) ?? null,
    [bindingId, library.cards],
  )

  const tabLabel: Record<VoiceLibraryTab, string> = {
    favorites: t('tabFavorites', { count: library.favorites.length }),
    cloned: t('tabCloned', { count: library.cloned.length }),
    public: t('tabPublic'),
  }

  const cardActions = (card: VoiceCardRecord): VoiceTileActions => ({
    onRename: () => setRenaming(card),
    onChangeCover:
      charactersOfVoice(card.id, characters).length > 0
        ? null
        : () => setCovering(card),
    onBind: () => setBindingId(card.id),
    onDelete: () => setDeleting(card),
  })

  const onPublic = library.tab === 'public'
  const myCards = library.tab === 'cloned' ? library.cloned : library.favorites

  const renderCard = (card: VoiceCardRecord) => {
    const bound = charactersOfVoice(card.id, characters)
    const target = {
      id: card.id,
      url: card.sampleAudioUrl ?? card.referenceAudioUrl,
      voiceId: card.voiceId,
    }
    return (
      <VoiceTile
        key={card.id}
        name={card.name}
        cover={voiceAvatarCover(card, characters)}
        meta={card.referenceAudioUrl ? t('sourceCloned') : t('sourceFavorite')}
        characters={bound.map((character) => character.name)}
        playing={preview.playingId === card.id}
        loading={preview.loadingId === card.id}
        progress={preview.progress}
        canPreview={canPreviewVoiceSample(target)}
        onPreview={() => preview.toggle(target)}
        pending={page.pendingId === card.id}
        actions={cardActions(card)}
      />
    )
  }

  const renderAsset = (asset: VoiceAsset) => {
    const saved = library.favoriteCardOf(asset)
    const target = {
      id: asset.id,
      url: asset.sampleUrl,
      voiceId: asset.voiceId,
    }
    return (
      <VoiceTile
        key={asset.id}
        name={asset.title}
        cover={asset.coverImage}
        meta={[asset.author, ...asset.tags.slice(0, 2)]
          .filter(Boolean)
          .join(' · ')}
        playing={preview.playingId === asset.id}
        loading={preview.loadingId === asset.id}
        progress={preview.progress}
        canPreview={canPreviewVoiceSample(target)}
        onPreview={() => preview.toggle(target)}
        pending={library.favoritePendingId === asset.id}
        favorite={{
          on: saved !== null,
          onToggle: () => void library.toggleFavorite(asset),
        }}
      />
    )
  }

  const body = (() => {
    if (library.isLoading) {
      return (
        <div className="flex justify-center py-16">
          <Spinner size="lg" className="text-muted-foreground" />
        </div>
      )
    }
    if (
      library.error &&
      (onPublic ? library.publicVoices : myCards).length === 0
    ) {
      return <EmptyState tone="error" title={library.error} />
    }
    if (onPublic) {
      if (library.publicVoices.length === 0) {
        // 搜不到不是「这里还没有东西」，⛔ 不走空态原语（empty-state 契约的例外类）。
        return (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {t('emptyPublic')}
          </p>
        )
      }
      return (
        <div className="flex flex-col gap-6">
          <div className={GRID_CLASS}>
            {library.publicVoices.map(renderAsset)}
          </div>
          {library.hasMore ? (
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
    }
    if (myCards.length === 0) {
      return library.tab === 'cloned' ? (
        <EmptyState
          icon={<Mic aria-hidden />}
          title={t('emptyCloned')}
          description={t('emptyClonedHint')}
          action={
            <Button
              type="button"
              size="sm"
              className="rounded-full"
              onClick={() => setCloning(true)}
            >
              {t('clone')}
            </Button>
          }
        />
      ) : (
        <EmptyState
          icon={<Search aria-hidden />}
          title={t('emptyFavorites')}
          description={t('emptyFavoritesHint')}
          action={
            <Button
              type="button"
              size="sm"
              className="rounded-full"
              onClick={() => library.setTab('public')}
            >
              {t('tabPublic')}
            </Button>
          }
        />
      )
    }
    return <div className={GRID_CLASS}>{myCards.map(renderCard)}</div>
  })()

  const dialogs = (
    <>
      <VoiceRenameDialog
        card={renaming}
        onOpenChange={(open) => {
          if (!open) setRenaming(null)
        }}
        onSave={page.rename}
      />
      <VoiceCoverDialog
        card={covering}
        onOpenChange={(open) => {
          if (!open) setCovering(null)
        }}
        onPickUrl={page.setCoverUrl}
        onUpload={page.uploadCover}
      />
      <VoiceBindDialog
        card={binding}
        characters={characters}
        voiceName={(id) =>
          library.cards.find((card) => card.id === id)?.name ?? null
        }
        pendingId={page.pendingId}
        onOpenChange={(open) => {
          if (!open) setBindingId(null)
        }}
        onToggle={(card, characterId, bound) =>
          void page.bindCharacter(card, characterId, bound)
        }
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={t('deleteTitle')}
        description={t('deleteConfirm', { name: deleting?.name ?? '' })}
        cancelLabel={t('cancel')}
        confirmLabel={t('delete')}
        onConfirm={() => {
          if (deleting) void page.remove(deleting)
          setDeleting(null)
        }}
      />
      {/* ⭐ 直接用工作台那个 `VoiceTrainer`（配音间的选角弹窗也挂它），不另写一套。 */}
      <ResponsiveDialog open={cloning} onOpenChange={setCloning}>
        <ResponsiveDialogContent className="sm:max-w-xl">
          <ResponsiveDialogTitle>{t('clone')}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="sr-only">
            {t('clone')}
          </ResponsiveDialogDescription>
          <VoiceTrainer
            onCreated={() => {
              void library.refreshCards()
              library.setTab('cloned')
              setCloning(false)
            }}
          />
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  )

  if (!isMobile) {
    return (
      <main className="flex h-page flex-col bg-background pt-3 pr-5.5 text-foreground">
        <h1 className="sr-only">{t('title')}</h1>
        <VoicesLibraryDesk
          page={page}
          onClone={() => setCloning(true)}
          cardActions={cardActions}
        />
        {dialogs}
      </main>
    )
  }

  return (
    <main className="workbench-ground workbench-ground-flush-phone h-page flex-col gap-3 text-foreground">
      <h1 className="sr-only">{t('title')}</h1>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 max-md:px-4 max-md:pt-2">
        <div
          role="tablist"
          aria-label={t('title')}
          className="flex items-center gap-4"
        >
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={library.tab === tab}
              onClick={() => {
                preview.stop()
                library.setTab(tab)
              }}
              className={cn(
                'min-h-11 text-lg font-semibold transition-colors duration-fast outline-none focus-visible:underline',
                library.tab === tab
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tabLabel[tab]}
            </button>
          ))}
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2 max-md:w-full">
          {onPublic ? (
            <label className="flex h-9 w-72 min-w-0 items-center gap-2 rounded-full bg-background px-3.5 text-2sm text-muted-foreground max-md:flex-1">
              <Search className="size-4 shrink-0" aria-hidden />
              <input
                type="search"
                value={library.search}
                onChange={(event) => library.setSearch(event.target.value)}
                placeholder={t('searchPlaceholder')}
                aria-label={t('searchPlaceholder')}
                className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
          ) : null}
          <Button
            type="button"
            className="shrink-0 rounded-full"
            onClick={() => setCloning(true)}
          >
            <Plus className="size-4" />
            {t('clone')}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border bg-background px-5 pt-6 pb-12 max-md:rounded-none max-md:border-0 max-md:px-4 md:px-8">
        {body}
      </div>

      {dialogs}
    </main>
  )
}
