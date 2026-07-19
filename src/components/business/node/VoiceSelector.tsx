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
  VOICE_API_ERROR_CODES,
  VOICE_CARD_DEFAULT_PACE,
  VOICE_CARD_PROVIDER,
  VOICE_LIBRARY_LANGUAGE_FILTERS,
  VOICE_LIBRARY_LANGUAGES,
  VOICE_LIBRARY_PAGE_SIZE,
  VOICE_LIBRARY_SORT_BY_VALUES,
  VOICE_LIBRARY_SORT_OPTIONS,
  VOICE_MARKET_SOURCE,
  VOICE_MARKET_SOURCES,
  type VoiceCardProvider,
  type VoiceLibraryLanguage,
  type VoiceLibrarySortBy,
  type VoiceMarketSource,
} from '@/constants/voice-cards'
import { AI_MODELS } from '@/constants/models'
import type { FishAudioVoice } from '@/services/fish-audio-voice.service'
import type { VoiceCardRecord } from '@/types'
import { useStudioFormOptional } from '@/contexts/studio-context'
import { useVoiceCards } from '@/hooks/cards/use-voice-cards'
import {
  createVoiceCardAPI,
  deleteVoiceCardAPI,
  listVoicesAPI,
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

type VoiceTab = 'public' | 'favorites' | 'cloned'

interface VoiceAsset {
  id: string
  voiceId: string
  provider: VoiceCardProvider
  modelId: string
  title: string
  description: string | null
  languages: string[]
  tags: string[]
  author: string | null
  coverImage: string | null
  sampleUrl: string | null
  sampleText: string | null
  sourceLabelKey: string
}

/**
 * Payload handed to consumers when a voice is picked. Carries the display name
 * and cover image alongside the id so downstream nodes/cards can show a real
 * label + preview instead of the raw voiceId. `coverImage` is null when the
 * source (a cloned voice, or a favorite saved before covers were persisted)
 * has none.
 */
export interface SelectedVoice {
  voiceId: string
  name: string
  coverImage: string | null
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

function getVoiceAssetId(provider: VoiceCardProvider, voiceId: string): string {
  return `${provider}:${voiceId}`
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

function isClonedVoiceCard(card: VoiceCardRecord): boolean {
  return Boolean(card.referenceAudioUrl)
}

function getVoiceCardProviderLabelKey(provider: string): string {
  if (provider === VOICE_CARD_PROVIDER.FISH_AUDIO) return 'voiceCardFishAudio'
  return 'voiceCardFalF5Tts'
}

function mapFishVoiceToAsset(voice: FishAudioVoice): VoiceAsset {
  return {
    id: getVoiceAssetId(VOICE_CARD_PROVIDER.FISH_AUDIO, voice.id),
    voiceId: voice.id,
    provider: VOICE_CARD_PROVIDER.FISH_AUDIO,
    modelId: AI_MODELS.FISH_AUDIO_S2_PRO,
    title: voice.title,
    description: voice.description,
    languages: voice.languages,
    tags: voice.tags,
    author: voice.author?.nickname ?? null,
    coverImage: voice.coverImage,
    sampleUrl: voice.samples[0]?.audio ?? null,
    sampleText: voice.samples[0]?.text ?? null,
    sourceLabelKey: 'voiceCardFishAudio',
  }
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
  const voiceCards = useVoiceCards()

  const [tab, setTab] = useState<VoiceTab>('public')
  const [fishVoices, setFishVoices] = useState<FishAudioVoice[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [favoritePendingVoiceId, setFavoritePendingVoiceId] = useState<
    string | null
  >(null)
  const [pendingVoiceCardId, setPendingVoiceCardId] = useState<string | null>(
    null,
  )
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [language, setLanguage] = useState<VoiceLibraryLanguage>('all')
  const [source, setSource] = useState<VoiceMarketSource>(
    VOICE_MARKET_SOURCE.ALL,
  )
  const [sortBy, setSortBy] = useState<VoiceLibrarySortBy>('score')
  const [failedCoverIds, setFailedCoverIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null)
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({})
  const voiceRequestIdRef = useRef(0)

  const fetchVoices = useCallback(async () => {
    const requestId = voiceRequestIdRef.current + 1
    voiceRequestIdRef.current = requestId

    if (tab !== 'public') {
      setFishVoices([])
      setTotal(0)
      setError(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)
    const result = await listVoicesAPI({
      page,
      pageSize: VOICE_LIBRARY_PAGE_SIZE,
      search: debouncedSearch || undefined,
      language: language === 'all' ? undefined : language,
      sortBy,
    })
    if (voiceRequestIdRef.current !== requestId) return

    if (result.success && result.data) {
      setFishVoices(result.data.items)
      setTotal(result.data.total)
    } else {
      setFishVoices([])
      setTotal(0)
      setError(
        result.errorCode === VOICE_API_ERROR_CODES.MISSING_API_KEY
          ? t('voiceApiKeyRequired')
          : t('voiceLoadFailed'),
      )
    }
    setIsLoading(false)
  }, [tab, page, debouncedSearch, language, sortBy, t])

  useEffect(() => {
    const id = requestAnimationFrame(() => void fetchVoices())
    return () => cancelAnimationFrame(id)
  }, [fetchVoices])

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(1)
    }, 300)

    return () => clearTimeout(id)
  }, [search])

  const handleTabChange = (nextTab: VoiceTab) => {
    if (nextTab === tab) return
    setTab(nextTab)
    setPage(1)
    setFishVoices([])
    setTotal(0)
    setError(null)
  }

  const handleLanguageChange = (value: string) => {
    if (!isVoiceLibraryLanguage(value)) return
    setLanguage(value)
    setPage(1)
  }

  const handleSortChange = (value: string) => {
    if (!isVoiceLibrarySortBy(value)) return
    setSortBy(value)
    setPage(1)
  }

  const handleSourceChange = (value: string) => {
    if (!isVoiceMarketSource(value)) return
    setSource(value)
    setPage(1)
  }

  const handleToggleFavorite = async (asset: VoiceAsset) => {
    const existingCard = voiceCards.cards.find(
      (card) =>
        card.voiceId === asset.voiceId && card.provider === asset.provider,
    )

    setFavoritePendingVoiceId(asset.id)
    setError(null)

    const result = existingCard
      ? await deleteVoiceCardAPI(existingCard.id)
      : await createVoiceCardAPI({
          name: asset.title,
          provider: asset.provider,
          modelId: asset.modelId,
          voiceId: asset.voiceId,
          coverImage: asset.coverImage ?? undefined,
          tone: [],
          pace: VOICE_CARD_DEFAULT_PACE,
          pronunciationDictionary: {},
          sampleText: asset.sampleText ?? undefined,
        })

    if (result.success) {
      if (existingCard && state.voiceCardId === existingCard.id) {
        dispatch({ type: 'SET_VOICE_CARD_ID', payload: null })
      }
      await voiceCards.refresh()
    } else {
      setError(t('voiceFavoriteFailed'))
    }

    setFavoritePendingVoiceId(null)
  }

  const handleSelectVoiceCard = (card: VoiceCardRecord) => {
    if (onSelectVoiceId) {
      if (!card.voiceId) return
      onSelectVoiceId({
        voiceId: card.voiceId,
        name: card.name,
        coverImage: card.coverImage,
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
    setError(null)

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
      setError(t('voiceDeleteFailed'))
    }

    setPendingVoiceCardId(null)
  }

  const handleSelectAsset = (asset: VoiceAsset) => {
    if (onSelectVoiceId) {
      onSelectVoiceId({
        voiceId: asset.voiceId,
        name: asset.title,
        coverImage: asset.coverImage,
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
  const fishVoiceAssets = fishVoices.map(mapFishVoiceToAsset)
  const publicVoiceAssets = fishVoiceAssets
  const publicVoiceTotal = total
  const totalPages = Math.max(1, Math.ceil(total / VOICE_LIBRARY_PAGE_SIZE))
  const localVoiceCards = filterByQuery(
    voiceCards.cards.filter((card) =>
      tab === 'cloned' ? isClonedVoiceCard(card) : !isClonedVoiceCard(card),
    ),
    debouncedSearch,
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
              {debouncedSearch
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
            onClick={() => setPage((p) => p - 1)}
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
            onClick={() => setPage((p) => p + 1)}
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
