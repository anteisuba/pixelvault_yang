'use client'

import { memo, useState, useEffect, useCallback, useRef } from 'react'
import {
  AlertCircle,
  Check,
  Loader2,
  Mic,
  Pause,
  Play,
  Search,
  Trash2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useStudioForm } from '@/contexts/studio-context'
import { useVoiceCards } from '@/hooks/use-voice-cards'
import { listVoicesAPI, deleteVoiceAPI } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import {
  VOICE_CARD_PROVIDER,
  VOICE_LIBRARY_LANGUAGE_FILTERS,
  VOICE_LIBRARY_LANGUAGES,
  VOICE_LIBRARY_PAGE_SIZE,
  VOICE_LIBRARY_SORT_BY_VALUES,
  VOICE_LIBRARY_SORT_OPTIONS,
  type VoiceLibraryLanguage,
  type VoiceLibrarySortBy,
} from '@/constants/voice-cards'
import type { FishAudioVoice } from '@/services/fish-audio-voice.service'
import type { VoiceCardRecord } from '@/types'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * VoiceSelector — Browse and select Fish Audio voices for TTS.
 * Two tabs: Public voice library / My voices.
 */
function isVoiceLibraryLanguage(value: string): value is VoiceLibraryLanguage {
  return VOICE_LIBRARY_LANGUAGES.some((language) => language === value)
}

function isVoiceLibrarySortBy(value: string): value is VoiceLibrarySortBy {
  return VOICE_LIBRARY_SORT_BY_VALUES.some((sortBy) => sortBy === value)
}

function getVoiceInitial(title: string): string {
  return title.trim().charAt(0).toUpperCase() || 'V'
}

export const VoiceSelector = memo(function VoiceSelector() {
  const { state, dispatch } = useStudioForm()
  const t = useTranslations('StudioPage')
  const voiceCards = useVoiceCards()

  const [tab, setTab] = useState<'public' | 'my'>('public')
  const [voices, setVoices] = useState<FishAudioVoice[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [language, setLanguage] = useState<VoiceLibraryLanguage>('all')
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
    setIsLoading(true)
    setError(null)
    const result = await listVoicesAPI({
      self: tab === 'my',
      page,
      pageSize: VOICE_LIBRARY_PAGE_SIZE,
      search: debouncedSearch || undefined,
      language: language === 'all' ? undefined : language,
      sortBy,
    })
    if (voiceRequestIdRef.current !== requestId) return

    if (result.success && result.data) {
      setVoices(result.data.items)
      setTotal(result.data.total)
    } else {
      setVoices([])
      setTotal(0)
      setError(result.error ?? t('voiceLoadFailed'))
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

  const handleTabChange = (nextTab: 'public' | 'my') => {
    if (nextTab === tab) return
    setTab(nextTab)
    setPage(1)
    setVoices([])
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

  const handleSelectVoiceCard = (card: VoiceCardRecord) => {
    const isSelected = state.voiceCardId === card.id
    dispatch({
      type: 'SET_VOICE_CARD_ID',
      payload: isSelected ? null : card.id,
    })
    dispatch({
      type: 'SET_VOICE_ID',
      payload: isSelected ? null : card.voiceId,
    })
    if (!isSelected) {
      dispatch({ type: 'SET_AUDIO_PACE', payload: card.pace })
      dispatch({
        type: 'SET_PRONUNCIATION_DICTIONARY',
        payload: card.pronunciationDictionary,
      })
    }
  }

  const handleSelect = (voiceId: string) => {
    dispatch({ type: 'SET_VOICE_CARD_ID', payload: null })
    dispatch({
      type: 'SET_VOICE_ID',
      payload: state.voiceId === voiceId ? null : voiceId,
    })
  }

  const handleDelete = async (voiceId: string) => {
    const result = await deleteVoiceAPI(voiceId)
    if (result.success) {
      if (state.voiceId === voiceId) {
        dispatch({ type: 'SET_VOICE_ID', payload: null })
      }
      void fetchVoices()
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

  const totalPages = Math.max(1, Math.ceil(total / VOICE_LIBRARY_PAGE_SIZE))
  const selectedVoiceLabel =
    voiceCards.cards.find((card) => card.id === state.voiceCardId)?.name ??
    voices.find((voice) => voice.id === state.voiceId)?.title ??
    state.voiceId

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {(voiceCards.cards.length > 0 || voiceCards.isLoading) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-medium text-muted-foreground/70">
              {t('voiceCards')}
            </span>
            {voiceCards.isLoading && (
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            )}
          </div>
          {voiceCards.cards.length > 0 && (
            <div className="space-y-1">
              {voiceCards.cards.map((card) => {
                const isSelected = state.voiceCardId === card.id
                const providerLabel =
                  card.provider === VOICE_CARD_PROVIDER.FISH_AUDIO
                    ? t('voiceCardFishAudio')
                    : t('voiceCardFalF5Tts')

                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => handleSelectVoiceCard(card)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all',
                      isSelected
                        ? 'border border-primary/30 bg-primary/10'
                        : 'border border-transparent hover:bg-muted/30',
                    )}
                  >
                    <div
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-full',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/60 text-muted-foreground',
                      )}
                    >
                      {isSelected ? (
                        <Check className="size-4" />
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
                        {t('voiceCardSelected')}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

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
          {t('voicePublic')}
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('my')}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
            tab === 'my'
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:bg-muted/30',
          )}
        >
          {t('voiceMy')}
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="relative min-w-0">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('voiceSearch')}
            className="h-9 pl-9 text-xs"
          />
        </div>
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
      </div>

      {/* Voice list */}
      <div
        className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1"
        aria-busy={isLoading}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : voices.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            {tab === 'my' ? t('voiceMyEmpty') : t('voiceNoResults')}
          </div>
        ) : (
          voices.map((voice) => {
            const isSelected = state.voiceId === voice.id
            const sampleUrl = voice.samples[0]?.audio
            const hasCoverImage =
              Boolean(voice.coverImage) && !failedCoverIds.has(voice.id)
            const isPlaying = playingVoiceId === voice.id

            return (
              <div
                key={voice.id}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all',
                  isSelected
                    ? 'bg-primary/10 border border-primary/30'
                    : 'border border-transparent hover:bg-muted/30',
                )}
              >
                <button
                  type="button"
                  onClick={() => handleSelect(voice.id)}
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
                    ) : hasCoverImage && voice.coverImage ? (
                      <>
                        {/* Third-party cover images can come from arbitrary hosts; keep raw img fallback here. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={voice.coverImage}
                          alt=""
                          className="size-full object-cover"
                          onError={() => handleCoverError(voice.id)}
                        />
                      </>
                    ) : (
                      getVoiceInitial(voice.title)
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {voice.title}
                      </span>
                      {voice.languages.length > 0 && (
                        <span className="shrink-0 rounded-full bg-muted/60 px-1.5 py-0.5 text-2xs text-muted-foreground">
                          {voice.languages.slice(0, 2).join(', ')}
                        </span>
                      )}
                    </div>
                    {voice.author && (
                      <span className="text-2xs text-muted-foreground">
                        {voice.author.nickname}
                      </span>
                    )}
                    {voice.tags.length > 0 && (
                      <span className="block truncate text-2xs text-muted-foreground/70">
                        {voice.tags.slice(0, 2).join(' · ')}
                      </span>
                    )}
                  </div>
                </button>

                {sampleUrl && (
                  <>
                    <audio
                      ref={(element) => {
                        audioRefs.current[voice.id] = element
                      }}
                      src={sampleUrl}
                      preload="none"
                      className="hidden"
                      onEnded={() => setPlayingVoiceId(null)}
                      onPause={() => {
                        if (playingVoiceId === voice.id) {
                          setPlayingVoiceId(null)
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleSampleToggle(voice.id)}
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

                {/* Delete (my voices only) */}
                {tab === 'my' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleDelete(voice.id)
                    }}
                    className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                    <span className="sr-only">{t('voiceDelete')}</span>
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
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
              total,
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
