'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { VOICE_LIBRARY_SOURCE_LABEL } from '@/constants/voice-cards'
import { useVoiceLibrary } from '@/hooks/use-voice-library'
import {
  canPreviewVoiceSample,
  useVoiceSamplePreview,
} from '@/hooks/use-voice-sample-preview'
import type { VoiceCardRecord } from '@/types'
import type { VoiceAsset } from '@/types/voice-library'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { LibraryGrid, LibraryNewTile } from '@/components/ui/library-kit'
import {
  LIBRARY_PICKER_DIALOG_CLASS,
  LibraryPickerHeader,
} from '@/components/ui/library-picker'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { Spinner } from '@/components/ui/spinner'
import { Mic } from '@/components/icons'
import { VoiceTrainer } from '@/components/business/studio/VoiceTrainer'

import {
  VoiceLibraryFilters,
  VoiceLibrarySectionRail,
  VoiceLibraryTile,
  visibleVoices,
} from './VoicesLibraryDesk'

interface VoicePickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 挑中的那一副（公开库的先收藏成一张音色卡再给，宿主只认卡）。框随后自己关。 */
  onPick: (card: VoiceCardRecord) => void
  /** 已经在用的那几张卡（配音间里已经在场的）：写「已在」、点不了。 */
  takenIds?: ReadonlySet<string>
  /** 位置满了：标题旁写一句，格子都点不了。 */
  fullLabel?: string | null
}

/**
 * 挑音色（ui-spec ㉔，样件 E S26）：正中的框，里面是声音库那副骨架（左栏全部 · 收藏 ·
 * 我的克隆，搜索 + 语言切换条）。只填一个位置：点一格就选上、框关掉，⛔ 黑条；头像照旧试听。
 * 取数、收藏、分流全走 `useVoiceLibrary`（与库整页、画布同一份）。
 */
export function VoicePickerDialog({
  open,
  onOpenChange,
  ...rest
}: VoicePickerDialogProps) {
  const t = useTranslations('VoicesPage.picker')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={LIBRARY_PICKER_DIALOG_CLASS}
      >
        <DialogTitle className="sr-only">{t('title')}</DialogTitle>
        <DialogDescription className="sr-only">
          {t('description')}
        </DialogDescription>
        {open ? (
          <VoicePickerBody {...rest} onClose={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function VoicePickerBody({
  onPick,
  takenIds,
  fullLabel,
  onClose,
}: Omit<VoicePickerDialogProps, 'open' | 'onOpenChange'> & {
  onClose: () => void
}) {
  const t = useTranslations('VoicesPage')
  const tPicker = useTranslations('VoicesPage.picker')
  const tCommon = useTranslations('Common')
  const library = useVoiceLibrary({ initialTab: 'public' })
  const preview = useVoiceSamplePreview()
  const [pendingId, setPendingId] = useState<string | null>(null)
  // 配音间那边照样能克隆（owner 10-23）：「我的克隆」第一格虚线「克隆音色」。
  const [cloning, setCloning] = useState(false)
  const { onAll, needle, mine, publicVoices } = visibleVoices(library)
  const full = Boolean(fullLabel)

  const finish = (card: VoiceCardRecord) => {
    preview.stop()
    onPick(card)
    onClose()
  }
  const pickAsset = async (asset: VoiceAsset) => {
    if (pendingId) return
    setPendingId(asset.id)
    // 公开库的嗓子要先落成一张音色卡（新卡只能从返回值拿，⛔ 再读过期的 favoriteCardOf）。
    const card =
      library.favoriteCardOf(asset) ?? (await library.toggleFavorite(asset))
    setPendingId(null)
    if (card) finish(card)
  }

  const select = (tab: typeof library.tab) => {
    preview.stop()
    library.setTab(tab)
  }

  const renderCard = (card: VoiceCardRecord) => {
    const target = {
      id: card.id,
      url: card.sampleAudioUrl ?? card.referenceAudioUrl,
      voiceId: card.voiceId,
    }
    const taken = takenIds?.has(card.id) ?? false
    return (
      <VoiceLibraryTile
        key={card.id}
        name={card.name}
        cover={card.coverImage}
        meta={
          card.referenceAudioUrl ? t('library.metaCloned') : t('sourceFavorite')
        }
        playing={preview.playingId === card.id}
        loading={preview.loadingId === card.id}
        progress={preview.progress}
        canPreview={canPreviewVoiceSample(target)}
        onPreview={() => preview.toggle(target)}
        onPick={full || taken ? undefined : () => finish(card)}
        pickLabel={tPicker('pickLabel', { name: card.name })}
        taken={taken}
        takenLabel={tPicker('taken')}
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
        loading={preview.loadingId === asset.id || pendingId === asset.id}
        progress={preview.progress}
        canPreview={canPreviewVoiceSample(target)}
        onPreview={() => preview.toggle(target)}
        onPick={full ? undefined : () => void pickAsset(asset)}
        pickLabel={tPicker('pickLabel', { name: asset.title })}
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
  ) : empty && (library.tab !== 'cloned' || needle) ? (
    <p className="py-10 text-center text-sm text-muted-foreground">
      {needle ? t('emptyPublic') : t('emptyFavorites')}
    </p>
  ) : (
    <div className="flex flex-col gap-6">
      <LibraryGrid>
        {library.tab === 'cloned' && !needle ? (
          <LibraryNewTile
            label={t('clone')}
            icon={<Mic aria-hidden />}
            onClick={() => setCloning(true)}
          />
        ) : null}
        {mine.map(renderCard)}
        {publicVoices.map(renderAsset)}
      </LibraryGrid>
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
    <>
      <LibraryPickerHeader
        title={tPicker('title')}
        lock={fullLabel}
        closeLabel={tCommon('close')}
        onClose={onClose}
      />
      <div className="flex min-h-0 flex-1 gap-6 pt-4 pr-5 pl-3">
        <VoiceLibrarySectionRail library={library} onSelect={select} />
        <div className="flex min-w-0 flex-1 flex-col">
          <VoiceLibraryFilters library={library} />
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-6">{body}</div>
        </div>
      </div>
      <ResponsiveDialog open={cloning} onOpenChange={setCloning}>
        <ResponsiveDialogContent className="sm:max-w-xl">
          <ResponsiveDialogTitle>{t('clone')}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="sr-only">
            {t('clone')}
          </ResponsiveDialogDescription>
          <VoiceTrainer
            onCreated={() => {
              void library.refreshCards()
              setCloning(false)
            }}
          />
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  )
}
