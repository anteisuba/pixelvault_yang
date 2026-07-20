'use client'

import { memo, useCallback, useRef, useState } from 'react'
import { FileAudio2, Trash2, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { VOICE_API_ERROR_CODES } from '@/constants/voice-cards'
import { useStudioForm } from '@/contexts/studio-context'
import { transcribeVoiceAPI } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

const ACCEPTED_AUDIO_MIME = 'audio/*'
// Fish Audio ASR rejects payloads over ~25 MB; bound the client too so the
// user gets a clear error before paying for an upload round-trip.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024

interface AudioTranscribeDialogProps {
  onComplete?: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

export const AudioTranscribeDialog = memo(function AudioTranscribeDialog({
  onComplete,
}: AudioTranscribeDialogProps) {
  const t = useTranslations('AudioTranscribe')
  const { state, dispatch } = useStudioForm()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [isTranscribing, setIsTranscribing] = useState(false)

  const handlePick = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const selected = event.target.files?.[0] ?? null
      event.target.value = ''
      if (!selected) return

      if (selected.size > MAX_AUDIO_BYTES) {
        toast.error(t('errorTooLarge', { max: formatBytes(MAX_AUDIO_BYTES) }))
        return
      }
      if (!selected.type.startsWith('audio/')) {
        toast.error(t('errorNotAudio'))
        return
      }
      setFile(selected)
    },
    [t],
  )

  const handleClear = useCallback(() => {
    setFile(null)
  }, [])

  const handleTranscribe = useCallback(async () => {
    if (!file || isTranscribing) return
    setIsTranscribing(true)

    const formData = new FormData()
    formData.append('audio', file)
    formData.append('ignore_timestamps', 'true')

    const result = await transcribeVoiceAPI(formData)
    setIsTranscribing(false)

    if (!result.success || !result.data) {
      toast.error(
        result.errorCode === VOICE_API_ERROR_CODES.MISSING_API_KEY
          ? t('errorApiKeyRequired')
          : (result.error ?? t('errorFailed')),
      )
      return
    }

    const transcribed = result.data.text.trim()
    if (!transcribed) {
      toast.warning(t('errorEmptyResult'))
      return
    }

    // Append when the user already has prompt text so transcribing doesn't
    // destroy in-progress work. Replace when the prompt is empty.
    const nextPrompt = state.prompt.trim()
      ? `${state.prompt.trimEnd()}\n\n${transcribed}`
      : transcribed

    dispatch({ type: 'SET_PROMPT', payload: nextPrompt })
    toast.success(t('success'))
    setFile(null)
    onComplete?.()
  }, [dispatch, file, isTranscribing, onComplete, state.prompt, t])

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">{t('description')}</p>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_AUDIO_MIME}
        onChange={handlePick}
        className="sr-only"
        aria-label={t('uploadLabel')}
      />

      {file ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2 text-xs">
            <FileAudio2 className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-foreground">{file.name}</span>
            <span className="shrink-0 text-muted-foreground">
              {formatBytes(file.size)}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isTranscribing}
            onClick={handleClear}
            aria-label={t('removeFile')}
            className="h-7 w-7 shrink-0 p-0"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isTranscribing}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-background/50 px-4 py-8 text-xs text-muted-foreground transition-colors',
            'hover:border-primary/40 hover:bg-muted/30 hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <Upload className="size-5" />
          <span>{t('pickFile')}</span>
          <span className="text-2xs text-muted-foreground/70">
            {t('limits', { max: formatBytes(MAX_AUDIO_BYTES) })}
          </span>
        </button>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-2xs text-muted-foreground">
          {state.prompt.trim() ? t('hintAppend') : t('hintReplace')}
        </p>
        <Button
          type="button"
          size="sm"
          disabled={!file || isTranscribing}
          onClick={handleTranscribe}
          className="h-8 gap-1.5 px-3 text-xs"
        >
          {isTranscribing ? (
            <Spinner size="sm" />
          ) : (
            <FileAudio2 className="size-3.5" />
          )}
          {t('transcribe')}
        </Button>
      </div>
    </div>
  )
})
