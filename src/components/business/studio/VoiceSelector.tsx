'use client'

import { memo, useState, useEffect, useCallback, useRef } from 'react'
import { Check, Loader2, Mic, Search, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useStudioForm } from '@/contexts/studio-context'
import { listVoicesAPI, deleteVoiceAPI } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import type { FishAudioVoice } from '@/services/fish-audio-voice.service'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

/**
 * VoiceSelector — Browse and select Fish Audio voices for TTS.
 * Two tabs: Public voice library / My voices.
 */
export const VoiceSelector = memo(function VoiceSelector() {
  const { state, dispatch } = useStudioForm()
  const t = useTranslations('StudioPage')

  const [tab, setTab] = useState<'public' | 'my'>('public')
  const [voices, setVoices] = useState<FishAudioVoice[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const fetchVoices = useCallback(async () => {
    setIsLoading(true)
    const result = await listVoicesAPI({
      self: tab === 'my',
      page,
      pageSize: 20,
      search: search || undefined,
    })
    if (result.success && result.data) {
      setVoices(result.data.items)
      setTotal(result.data.total)
    }
    setIsLoading(false)
  }, [tab, page, search])

  const isFirstRender = useRef(true)
  useEffect(() => {
    const id = requestAnimationFrame(() => void fetchVoices())
    return () => cancelAnimationFrame(id)
  }, [fetchVoices])

  // Reset page when switching tabs or search
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    const id = requestAnimationFrame(() => setPage(1))
    return () => cancelAnimationFrame(id)
  }, [tab, search])

  const handleSelect = (voiceId: string) => {
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

  const totalPages = Math.ceil(total / 20)

  return (
    <div className="flex flex-col gap-3">
      {/* Tab switcher */}
      <div className="flex gap-1 rounded-lg border border-border/60 p-0.5">
        <button
          type="button"
          onClick={() => setTab('public')}
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
          onClick={() => setTab('my')}
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

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('voiceSearch')}
          className="h-9 pl-9 text-xs"
        />
      </div>

      {/* Voice list */}
      <div className="max-h-[320px] overflow-y-auto space-y-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : voices.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            {tab === 'my' ? t('voiceMyEmpty') : t('voiceNoResults')}
          </div>
        ) : (
          voices.map((voice) => {
            const isSelected = state.voiceId === voice.id
            const sampleUrl = voice.samples[0]?.audio

            return (
              <button
                key={voice.id}
                type="button"
                onClick={() => handleSelect(voice.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all',
                  isSelected
                    ? 'bg-primary/10 border border-primary/30'
                    : 'border border-transparent hover:bg-muted/30',
                )}
              >
                {/* Avatar / icon */}
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
                  ) : voice.coverImage ? (
                    <img
                      src={voice.coverImage}
                      alt=""
                      className="size-9 rounded-full object-cover"
                    />
                  ) : (
                    <Mic className="size-4" />
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
                </div>

                {/* Sample play (mini) */}
                {sampleUrl && (
                  <audio src={sampleUrl} preload="none" className="hidden" />
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
                  </button>
                )}
              </button>
            )
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="h-7 text-xs"
          >
            {t('voicePrev')}
          </Button>
          <span>
            {page} / {totalPages}
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
      {state.voiceId && (
        <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-xs">
          <Check className="size-3.5 text-primary" />
          <span className="text-foreground">
            {t('voiceSelected')}:{' '}
            <span className="font-medium">
              {voices.find((v) => v.id === state.voiceId)?.title ??
                state.voiceId}
            </span>
          </span>
        </div>
      )}
    </div>
  )
})
