'use client'

import { memo, useState, useEffect, useCallback, useRef } from 'react'
import {
  AlertCircle,
  Check,
  Mic,
  Pause,
  Play,
  Search,
  Star,
  Trash2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  VOICE_CARD_PROVIDER,
  VOICE_LIBRARY_LANGUAGE_FILTERS,
  VOICE_LIBRARY_LANGUAGES,
  VOICE_LIBRARY_PAGE_SIZE,
  VOICE_LIBRARY_SORT_BY_VALUES,
  VOICE_LIBRARY_SORT_OPTIONS,
  VOICE_MARKET_SOURCE,
  VOICE_MARKET_SOURCES,
  type VoiceLibraryLanguage,
  type VoiceLibrarySortBy,
  type VoiceMarketSource,
} from '@/constants/voice-cards'
import type { VoiceCardRecord } from '@/types'
import type { VoiceAsset } from '@/types/voice-library'
import { useStudioFormOptional } from '@/contexts/studio-context'
import {
  getVoiceAssetId,
  isClonedVoiceCard,
  useVoiceLibrary,
} from '@/hooks/use-voice-library'
import {
  deleteVoiceCardAPI,
  getVoiceAPI,
  updateVoiceCardAPI,
} from '@/lib/api-client'
import { filterByQuery } from '@/lib/search-utils'
import { cn } from '@/lib/utils'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'

/**
 * ⚠ 数据、收藏、分流已经搬进 `useVoiceLibrary`（owner 2026-08-30 选 C）——
 * 配音间要看同一批嗓子但长得不一样，共用的是事实与规则，不是渲染。
 * 这个文件从此只负责**画布这一侧的皮肤**。
 */
type VoiceTab = 'public' | 'favorites' | 'cloned'

/**
 * Payload handed to consumers when a voice is picked. Carries the display name
 * and cover image alongside the id so downstream nodes/cards can show a real
 * label + preview instead of the raw voiceId. The sample URL travels with the
 * identity so selecting a voice does not throw away the playable preview the
 * library already loaded. Nullable media fields stay null when unavailable.
 */
export interface SelectedVoice {
  voiceId: string
  name: string
  coverImage: string | null
  sampleUrl: string | null
}

interface VoiceSelectorProps {
  className?: string
  onSelectComplete?: () => void
  selectedVoiceId?: string | null
  onSelectVoiceId?: (voice: SelectedVoice) => void
}

function isVoiceLibraryLanguage(value: string): value is VoiceLibraryLanguage {
  return VOICE_LIBRARY_LANGUAGES.some((language) => language === value)
}

function isVoiceLibrarySortBy(value: string): value is VoiceLibrarySortBy {
  return VOICE_LIBRARY_SORT_BY_VALUES.some((sortBy) => sortBy === value)
}

function isVoiceMarketSource(value: string): value is VoiceMarketSource {
  return VOICE_MARKET_SOURCES.some((source) => source === value)
}

function getVoiceInitial(title: string): string {
  return title.trim().charAt(0).toUpperCase() || 'V'
}

function voiceCardSearchFields(
  card: VoiceCardRecord,
): Array<string | null | undefined> {
  return [
    card.name,
    card.voiceId,
    card.provider,
    card.gender,
    card.age,
    card.pitch,
    ...card.tone,
  ]
}

function getVoiceCardProviderLabelKey(provider: string): string {
  if (provider === VOICE_CARD_PROVIDER.FISH_AUDIO) return 'voiceCardFishAudio'
  return 'voiceCardFalF5Tts'
}

const VOICE_SELECTOR_FALLBACK_STATE = {
  voiceCardId: null,
  voiceId: null,
} as const

const NOOP_DISPATCH = () => {}

export const VoiceSelector = memo(function VoiceSelector({
  className,
  onSelectComplete,
  selectedVoiceId,
  onSelectVoiceId,
}: VoiceSelectorProps) {
  const formCtx = useStudioFormOptional()
  const state = formCtx?.state ?? VOICE_SELECTOR_FALLBACK_STATE
  const dispatch = formCtx?.dispatch ?? NOOP_DISPATCH
  const t = useTranslations('StudioPage')
  /**
   * 取消收藏时，如果被取消的正是当前选中的那张卡，就把选中清掉。
   * 内核不认识画布的选中态，所以这一步由宿主自己接。
   */
  const library = useVoiceLibrary({
    onFavoriteRemoved: (cardId) => {
      if (state.voiceCardId === cardId) {
        dispatch({ type: 'SET_VOICE_CARD_ID', payload: null })
      }
    },
  })
  const {
    tab,
    setTab,
    publicVoices: voiceAssets,
    total,
    page,
    setPage,
    search,
    setSearch,
    language,
    setLanguage,
    sortBy,
    setSortBy,
    isLoading,
    error,
    favoritePendingId: favoritePendingVoiceId,
    favoriteCardOf,
    toggleFavorite: handleToggleFavorite,
  } = library
  const voiceCards = {
    cards: library.cards,
    refresh: library.refreshCards,
    isLoading: library.isLoading,
    error: library.error,
  }

  const [pendingVoiceCardId, setPendingVoiceCardId] = useState<string | null>(
    null,
  )
  /* 删卡与改名是画布自己的动作（内核只管收藏），错误也归自己显示。 */
  const [localError, setLocalError] = useState<string | null>(null)
  const [source, setSource] = useState<VoiceMarketSource>(
    VOICE_MARKET_SOURCE.ALL,
  )
  const [failedCoverIds, setFailedCoverIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null)
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({})
  /* 切分栏 / 换筛选后的重置（回第一页、清列表清错误）都在内核里，这里只做类型守卫。 */
  const handleTabChange = (nextTab: VoiceTab) => setTab(nextTab)

  const handleLanguageChange = (value: string) => {
    if (!isVoiceLibraryLanguage(value)) return
    setLanguage(value)
  }

  const handleSortChange = (value: string) => {
    if (!isVoiceLibrarySortBy(value)) return
    setSortBy(value)
  }

  const handleSourceChange = (value: string) => {
    if (!isVoiceMarketSource(value)) return
    setSource(value)
    setPage(1)
  }

  const handleSelectVoiceCard = async (card: VoiceCardRecord) => {
    if (onSelectVoiceId) {
      if (!card.voiceId) return
      // 克隆卡的音频在 referenceAudioUrl，收藏卡的在 sampleAudioUrl。
      let sampleUrl = card.referenceAudioUrl ?? card.sampleAudioUrl
      // 存量收藏卡是在「收藏只存文本」的年代建的，音频位是空的。**直接去声音库
      // 取它自带的试听**——不要再合成一次：合成花用户的 key、要等，产出的还是同
      // 一个音色念同一段固定文本。取到后顺手补回卡上，下次就不用再查。
      if (!sampleUrl && card.provider === VOICE_CARD_PROVIDER.FISH_AUDIO) {
        setPendingVoiceCardId(card.id)
        const resolved = await getVoiceAPI(card.voiceId)
        setPendingVoiceCardId(null)
        sampleUrl =
          (resolved.success &&
            resolved.data?.samples.find((sample) => sample.audio)?.audio) ||
          null
        if (sampleUrl) {
          const backfilled = await updateVoiceCardAPI(card.id, {
            sampleAudioUrl: sampleUrl,
          })
          if (backfilled.success) await voiceCards.refresh()
        }
      }
      onSelectVoiceId({
        voiceId: card.voiceId,
        name: card.name,
        coverImage: card.coverImage,
        sampleUrl,
      })
      onSelectComplete?.()
      return
    }

    const isSelected = state.voiceCardId === card.id
    dispatch({
      type: 'SET_VOICE_CARD_ID',
      payload: isSelected ? null : card.id,
    })
    dispatch({
      type: 'SET_VOICE_ID',
      payload: isSelected ? null : card.voiceId,
    })
    if (!isSelected && card.modelId) {
      dispatch({
        type: 'SET_OPTION_ID',
        payload: `workspace:${card.modelId}`,
      })
    }
    if (!isSelected) {
      dispatch({ type: 'SET_AUDIO_PACE', payload: card.pace })
      dispatch({
        type: 'SET_PRONUNCIATION_DICTIONARY',
        payload: card.pronunciationDictionary,
      })
      onSelectComplete?.()
    }
  }

  const handleDeleteVoiceCard = async (card: VoiceCardRecord) => {
    setPendingVoiceCardId(card.id)
    setLocalError(null)

    const result = await deleteVoiceCardAPI(card.id)
    if (result.success) {
      if (state.voiceCardId === card.id) {
        dispatch({ type: 'SET_VOICE_CARD_ID', payload: null })
      }
      if (state.voiceId === card.voiceId) {
        dispatch({ type: 'SET_VOICE_ID', payload: null })
      }
      await voiceCards.refresh()
    } else {
      setLocalError(t('voiceDeleteFailed'))
    }

    setPendingVoiceCardId(null)
  }

  const handleSelectAsset = (asset: VoiceAsset) => {
    if (onSelectVoiceId) {
      onSelectVoiceId({
        voiceId: asset.voiceId,
        name: asset.title,
        coverImage: asset.coverImage,
        sampleUrl: asset.sampleUrl,
      })
      onSelectComplete?.()
      return
    }

    const isSelected = state.voiceId === asset.voiceId
    dispatch({ type: 'SET_VOICE_CARD_ID', payload: null })
    dispatch({
      type: 'SET_VOICE_ID',
      payload: isSelected ? null : asset.voiceId,
    })
    if (!isSelected) {
      dispatch({
        type: 'SET_OPTION_ID',
        payload: `workspace:${asset.modelId}`,
      })
      onSelectComplete?.()
    }
  }

  const handleCoverError = (voiceId: string) => {
    setFailedCoverIds((current) => {
      const next = new Set(current)
      next.add(voiceId)
      return next
    })
  }

  const handleSampleToggle = (voiceId: string) => {
    const selectedAudio = audioRefs.current[voiceId]
    if (!selectedAudio) return

    for (const [id, audio] of Object.entries(audioRefs.current)) {
      if (id !== voiceId) audio?.pause()
    }

    if (playingVoiceId === voiceId) {
      selectedAudio.pause()
      setPlayingVoiceId(null)
      return
    }

    selectedAudio.currentTime = 0
    void selectedAudio
      .play()
      .then(() => setPlayingVoiceId(voiceId))
      .catch(() => setPlayingVoiceId(null))
  }

  const isPublicTab = tab === 'public'
  const isLocalCardsTab = !isPublicTab
  const usesExternalSelection = Boolean(onSelectVoiceId)
  const activeVoiceId = usesExternalSelection ? selectedVoiceId : state.voiceId
  const fishVoiceAssets = voiceAssets
  /**
   * 台账 F 顺带：「来源」下拉此前是**死控件** —— `source` 写进 state 之后既不
   * 进 `fetchVoices` 的请求参数，也不参与任何过滤，改它零请求零变化。一个永远
   * 改不动结果的筛选器比没有筛选器更糟：它正是让人以为「这个面板坏了」的东西。
   *
   * 今天公开档只有 fish-audio 一个来源，所以这条过滤在结果上多半是恒等的 ——
   * 但它现在是**真的**：接入第二个公开来源时不用再改这里。
   */
  const publicVoiceAssets =
    source === VOICE_MARKET_SOURCE.ALL
      ? fishVoiceAssets
      : fishVoiceAssets.filter((asset) => asset.provider === source)
  const publicVoiceTotal = total
  const totalPages = Math.max(1, Math.ceil(total / VOICE_LIBRARY_PAGE_SIZE))
  const localVoiceCards = filterByQuery(
    tab === 'cloned' ? library.cloned : library.favorites,
    search.trim(),
    voiceCardSearchFields,
  )
  const listIsLoading = isLocalCardsTab ? voiceCards.isLoading : isLoading
  const listError =
    isLocalCardsTab && voiceCards.error
      ? tab === 'cloned'
        ? t('voiceClonedLoadFailed')
        : t('voiceFavoritesLoadFailed')
      : error && publicVoiceAssets.length === 0
        ? error
        : null
  const selectedVoiceLabel =
    voiceCards.cards.find((card) =>
      usesExternalSelection
        ? card.voiceId === activeVoiceId
        : card.id === state.voiceCardId,
    )?.name ??
    publicVoiceAssets.find((asset) => asset.voiceId === activeVoiceId)?.title ??
    activeVoiceId

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-3', className)}>
      {/* Tab switcher */}
      <div className="flex gap-1 rounded-lg border border-border/60 p-0.5">
        <button
          type="button"
          onClick={() => handleTabChange('public')}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
            tab === 'public'
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:bg-muted/30',
          )}
        >
          {t('voiceMarket')}
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('favorites')}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
            tab === 'favorites'
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:bg-muted/30',
          )}
        >
          {t('voiceFavorites')}
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('cloned')}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
            tab === 'cloned'
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:bg-muted/30',
          )}
        >
          {t('voiceCloned')}
        </button>
      </div>

      <div
        className={cn(
          'grid gap-2',
          isLocalCardsTab
            ? 'grid-cols-1'
            : // Phone-portrait: 3-col grid where search spans all 3 (full
              // width) and the three filters sit side-by-side on the second
              // row — saves ~100px vs the old stacked layout.
              'grid-cols-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]',
        )}
      >
        <div className="relative col-span-3 min-w-0 sm:col-span-1">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('voiceSearch')}
            className="h-9 pl-9 text-xs"
          />
        </div>
        {isPublicTab && (
          <>
            <Select value={source} onValueChange={handleSourceChange}>
              <SelectTrigger
                size="sm"
                className="w-full border-border/60 text-xs sm:w-32"
                aria-label={t('voiceSourceFilter')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={VOICE_MARKET_SOURCE.ALL}>
                  {t('voiceSourceAll')}
                </SelectItem>
                <SelectItem value={VOICE_MARKET_SOURCE.FISH_AUDIO}>
                  {t('voiceCardFishAudio')}
                </SelectItem>
              </SelectContent>
            </Select>
            <Select value={language} onValueChange={handleLanguageChange}>
              <SelectTrigger
                size="sm"
                className="w-full border-border/60 text-xs sm:w-32"
                aria-label={t('voiceLanguageFilter')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VOICE_LIBRARY_LANGUAGE_FILTERS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={handleSortChange}>
              <SelectTrigger
                size="sm"
                className="w-full border-border/60 text-xs sm:w-32"
                aria-label={t('voiceSortFilter')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VOICE_LIBRARY_SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </div>

      {/* Voice list */}
      <div
        className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1"
        aria-busy={listIsLoading}
      >
        {listIsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="lg" className="text-muted-foreground" />
          </div>
        ) : listError ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>{listError}</span>
          </div>
        ) : isLocalCardsTab ? (
          localVoiceCards.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {search.trim()
                ? t('voiceNoResults')
                : tab === 'cloned'
                  ? t('voiceClonedEmpty')
                  : t('voiceFavoritesEmpty')}
            </div>
          ) : (
            localVoiceCards.map((card) => {
              const isSelected = usesExternalSelection
                ? activeVoiceId === card.voiceId
                : state.voiceCardId === card.id
              const isPending = pendingVoiceCardId === card.id
              const hasCardCover =
                Boolean(card.coverImage) && !failedCoverIds.has(card.id)
              const providerLabel = t(
                getVoiceCardProviderLabelKey(card.provider),
              )

              return (
                <div
                  key={card.id}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all',
                    isSelected
                      ? 'border border-primary/30 bg-primary/10'
                      : 'border border-transparent hover:bg-muted/30',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectVoiceCard(card)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <div
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/60 text-muted-foreground',
                      )}
                    >
                      {isSelected ? (
                        <Check className="size-4" />
                      ) : hasCardCover && card.coverImage ? (
                        <>
                          {/* Third-party cover images can come from arbitrary hosts; keep raw img fallback here. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={card.coverImage}
                            alt=""
                            className="size-full object-cover"
                            onError={() => handleCoverError(card.id)}
                          />
                        </>
                      ) : (
                        <Mic className="size-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {card.name}
                        </span>
                        <span className="shrink-0 rounded-full bg-muted/60 px-1.5 py-0.5 text-2xs text-muted-foreground">
                          {providerLabel}
                        </span>
                      </div>
                      <span className="text-2xs text-muted-foreground">
                        {isSelected
                          ? t('voiceCardSelected')
                          : tab === 'cloned'
                            ? t('voiceClonedSaved')
                            : t('voiceFavoriteSaved')}
                      </span>
                    </div>
                  </button>

                  {/* Cloned voices carry their own reference clip — give them the
                      same audition control as the public list for consistency. */}
                  {tab === 'cloned' && card.referenceAudioUrl ? (
                    <>
                      <audio
                        ref={(element) => {
                          audioRefs.current[card.id] = element
                        }}
                        src={card.referenceAudioUrl}
                        preload="none"
                        className="hidden"
                        onEnded={() => setPlayingVoiceId(null)}
                        onPause={() => {
                          if (playingVoiceId === card.id) {
                            setPlayingVoiceId(null)
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleSampleToggle(card.id)}
                        className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      >
                        {playingVoiceId === card.id ? (
                          <Pause className="size-3.5" />
                        ) : (
                          <Play className="size-3.5" />
                        )}
                        <span className="sr-only">
                          {playingVoiceId === card.id
                            ? t('voicePauseSample')
                            : t('voicePlaySample')}
                        </span>
                      </button>
                    </>
                  ) : null}

                  {/* Removal: cloned voices get a destructive trash (deletes the
                      clone); favorites get a filled star that un-favorites in
                      place — both call the same delete handler. */}
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => void handleDeleteVoiceCard(card)}
                    className={cn(
                      'shrink-0 rounded-md p-1 disabled:pointer-events-none disabled:opacity-50',
                      tab === 'cloned'
                        ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                        : 'text-primary hover:bg-muted/60',
                    )}
                  >
                    {isPending ? (
                      <Spinner size="sm" />
                    ) : tab === 'cloned' ? (
                      <Trash2 className="size-3.5" />
                    ) : (
                      <Star className="size-3.5 fill-current" />
                    )}
                    <span className="sr-only">
                      {tab === 'cloned'
                        ? t('voiceDelete')
                        : t('voiceUnfavorite')}
                    </span>
                  </button>
                </div>
              )
            })
          )
        ) : publicVoiceAssets.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            {t('voiceNoResults')}
          </div>
        ) : (
          publicVoiceAssets.map((asset) => {
            const isSelected = activeVoiceId === asset.voiceId
            const savedVoiceCard = voiceCards.cards.find(
              (card) =>
                card.voiceId === asset.voiceId &&
                card.provider === asset.provider,
            )
            const hasCoverImage =
              Boolean(asset.coverImage) && !failedCoverIds.has(asset.id)
            const isPlaying = playingVoiceId === asset.id
            const isFavoritePending = favoritePendingVoiceId === asset.id

            return (
              <div
                key={asset.id}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all',
                  isSelected
                    ? 'bg-primary/10 border border-primary/30'
                    : 'border border-transparent hover:bg-muted/30',
                )}
              >
                <button
                  type="button"
                  onClick={() => handleSelectAsset(asset)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  {/* Avatar / icon */}
                  <div
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold',
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/60 text-muted-foreground',
                    )}
                  >
                    {isSelected ? (
                      <Check className="size-4" />
                    ) : hasCoverImage && asset.coverImage ? (
                      <>
                        {/* Third-party cover images can come from arbitrary hosts; keep raw img fallback here. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={asset.coverImage}
                          alt=""
                          className="size-full object-cover"
                          onError={() => handleCoverError(asset.id)}
                        />
                      </>
                    ) : (
                      getVoiceInitial(asset.title)
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {asset.title}
                      </span>
                      <span className="shrink-0 rounded-full bg-muted/60 px-1.5 py-0.5 text-2xs text-muted-foreground">
                        {t(asset.sourceLabelKey)}
                      </span>
                      {asset.languages.length > 0 && (
                        <span className="shrink-0 rounded-full bg-muted/60 px-1.5 py-0.5 text-2xs text-muted-foreground">
                          {asset.languages.slice(0, 2).join(', ')}
                        </span>
                      )}
                    </div>
                    {asset.author && (
                      <span className="text-2xs text-muted-foreground">
                        {asset.author}
                      </span>
                    )}
                    {asset.tags.length > 0 && (
                      <span className="block truncate text-2xs text-muted-foreground/70">
                        {asset.tags.slice(0, 3).join(' · ')}
                      </span>
                    )}
                  </div>
                </button>

                {asset.sampleUrl && (
                  <>
                    <audio
                      ref={(element) => {
                        audioRefs.current[asset.id] = element
                      }}
                      src={asset.sampleUrl}
                      preload="none"
                      className="hidden"
                      onEnded={() => setPlayingVoiceId(null)}
                      onPause={() => {
                        if (playingVoiceId === asset.id) {
                          setPlayingVoiceId(null)
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleSampleToggle(asset.id)}
                      className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    >
                      {isPlaying ? (
                        <Pause className="size-3.5" />
                      ) : (
                        <Play className="size-3.5" />
                      )}
                      <span className="sr-only">
                        {isPlaying
                          ? t('voicePauseSample')
                          : t('voicePlaySample')}
                      </span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  disabled={isFavoritePending}
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleToggleFavorite(asset)
                  }}
                  className={cn(
                    'shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-50',
                    savedVoiceCard && 'text-primary hover:text-primary',
                  )}
                >
                  {isFavoritePending ? (
                    <Spinner size="sm" />
                  ) : (
                    <Star
                      className={cn(
                        'size-3.5',
                        savedVoiceCard && 'fill-current',
                      )}
                    />
                  )}
                  <span className="sr-only">
                    {savedVoiceCard ? t('voiceUnfavorite') : t('voiceFavorite')}
                  </span>
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* Pagination */}
      {isPublicTab && totalPages > 1 && (
        <div className="flex shrink-0 items-center justify-between border-t border-border/40 pt-2 text-xs text-muted-foreground">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="h-7 text-xs"
          >
            {t('voicePrev')}
          </Button>
          <span className="text-center">
            {t('voicePageStatus', {
              page,
              totalPages,
              total: publicVoiceTotal,
            })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="h-7 text-xs"
          >
            {t('voiceNext')}
          </Button>
        </div>
      )}

      {/* Selected indicator */}
      {selectedVoiceLabel && (
        <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-xs">
          <Check className="size-3.5 text-primary" />
          <span className="text-foreground">
            {t('voiceSelected')}:{' '}
            <span className="font-medium">{selectedVoiceLabel}</span>
          </span>
        </div>
      )}
    </div>
  )
})
