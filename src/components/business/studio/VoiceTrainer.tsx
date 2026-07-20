'use client'

import { memo, useEffect, useRef, useState } from 'react'
import { Mic, Plus, Trash2, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  VOICE_API_ERROR_CODES,
  VOICE_TRAIN_MAX_FILES,
  VOICE_TRAIN_MAX_FILE_BYTES,
} from '@/constants/voice-cards'
import { useStudioForm } from '@/contexts/studio-context'
import { useVoiceCards } from '@/hooks/cards/use-voice-cards'
import { createVoiceAPI, transcribeVoiceAPI } from '@/lib/api-client'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'

interface UploadedFile {
  file: File
  name: string
}

type TrainStage = 'idle' | 'uploading' | 'finalizing'

const UPLOAD_TO_FINALIZE_MS = 1500

/**
 * VoiceTrainer — Upload audio to create a custom Fish Audio voice (clone).
 * Fast mode: voice is instantly available after creation.
 */
export const VoiceTrainer = memo(function VoiceTrainer() {
  const { dispatch } = useStudioForm()
  const t = useTranslations('StudioPage')
  const voiceCards = useVoiceCards()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const stageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [title, setTitle] = useState('')
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [transcript, setTranscript] = useState('')
  const [enhance, setEnhance] = useState(false)
  const [trainStage, setTrainStage] = useState<TrainStage>('idle')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const isTraining = trainStage !== 'idle'

  useEffect(
    () => () => {
      if (stageTimerRef.current) clearTimeout(stageTimerRef.current)
    },
    [],
  )

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files
    if (!selected) return

    const incoming = Array.from(selected)
    const oversized = incoming.find((f) => f.size > VOICE_TRAIN_MAX_FILE_BYTES)
    if (oversized) {
      toast.error(
        t('voiceTrainFileTooLarge', {
          name: oversized.name,
          maxMb: Math.floor(VOICE_TRAIN_MAX_FILE_BYTES / 1024 / 1024),
        }),
      )
      e.target.value = ''
      return
    }

    const remaining = VOICE_TRAIN_MAX_FILES - files.length
    if (remaining <= 0) {
      toast.error(t('voiceTrainTooManyFiles', { max: VOICE_TRAIN_MAX_FILES }))
      e.target.value = ''
      return
    }

    const accepted = incoming.slice(0, remaining)
    if (accepted.length < incoming.length) {
      toast.error(t('voiceTrainTooManyFiles', { max: VOICE_TRAIN_MAX_FILES }))
    }

    const newFiles: UploadedFile[] = accepted.map((f) => ({
      file: f,
      name: f.name,
    }))
    setFiles((prev) => [...prev, ...newFiles])

    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleTrain = async () => {
    if (!title.trim() || files.length === 0) return

    setTrainStage('uploading')
    stageTimerRef.current = setTimeout(() => {
      setTrainStage('finalizing')
      stageTimerRef.current = null
    }, UPLOAD_TO_FINALIZE_MS)

    const formData = new FormData()
    formData.append('title', title.trim())

    for (const f of files) {
      formData.append('voices', f.file)
    }

    if (transcript.trim()) {
      formData.append('texts', transcript.trim())
    }

    if (enhance) {
      formData.append('enhance_audio_quality', 'true')
    }

    const result = await createVoiceAPI(formData)
    if (stageTimerRef.current) {
      clearTimeout(stageTimerRef.current)
      stageTimerRef.current = null
    }
    setTrainStage('idle')

    if (result.success && result.data) {
      toast.success(t('voiceTrainSuccess'))
      const selectedVoiceId = result.voiceCard?.voiceId ?? result.data.id
      dispatch({
        type: 'SET_VOICE_CARD_ID',
        payload: result.voiceCard?.id ?? null,
      })
      dispatch({ type: 'SET_VOICE_ID', payload: selectedVoiceId })
      void voiceCards.refresh()
      // Reset form
      setTitle('')
      setFiles([])
      setTranscript('')
    } else {
      toast.error(
        result.errorCode === VOICE_API_ERROR_CODES.MISSING_API_KEY
          ? t('voiceApiKeyRequired')
          : (result.error ?? t('voiceTrainFailed')),
      )
    }
  }

  const handleTranscribe = async () => {
    const firstFile = files[0]?.file
    if (!firstFile || isTranscribing) return

    setIsTranscribing(true)
    const formData = new FormData()
    formData.append('audio', firstFile)
    formData.append('ignore_timestamps', 'true')

    const result = await transcribeVoiceAPI(formData)
    setIsTranscribing(false)

    if (result.success && result.data) {
      setTranscript(result.data.text)
      toast.success(t('voiceTranscribeSuccess'))
    } else {
      toast.error(
        result.errorCode === VOICE_API_ERROR_CODES.MISSING_API_KEY
          ? t('voiceApiKeyRequired')
          : (result.error ?? t('voiceTranscribeFailed')),
      )
    }
  }

  const canTrain = title.trim().length > 0 && files.length > 0 && !isTraining
  const canTranscribe = files.length > 0 && !isTranscribing

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">{t('voiceTrainDesc')}</p>

      {/* Voice name */}
      <div className="flex flex-col gap-1.5">
        <label className="font-display text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {t('voiceTrainName')}
        </label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('voiceTrainNamePlaceholder')}
          className="h-9 text-sm"
          maxLength={100}
        />
      </div>

      {/* Audio upload */}
      <div className="flex flex-col gap-1.5">
        <label className="font-display text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {t('voiceTrainAudio')}
        </label>

        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        {files.length > 0 && (
          <div className="space-y-1">
            {files.map((f, i) => (
              <div
                key={`${f.name}-${i}`}
                className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-2"
              >
                <Mic className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                  {f.name}
                </span>
                <span className="shrink-0 text-2xs text-muted-foreground">
                  {(f.file.size / 1024).toFixed(0)} KB
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'flex items-center justify-center gap-2 rounded-lg border-2 border-dashed py-6 text-xs transition-colors',
            'border-border/60 text-muted-foreground hover:border-primary/30 hover:text-primary',
          )}
        >
          <Upload className="size-4" />
          {t('voiceTrainUpload')}
        </button>
        <p className="text-2xs text-muted-foreground">
          {t('voiceTrainUploadHint')}
        </p>
      </div>

      {/* Optional transcript */}
      <div className="flex flex-col gap-1.5">
        <label className="font-display text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {t('voiceTrainTranscript')}{' '}
          <span className="normal-case tracking-normal text-muted-foreground/60">
            ({t('voiceTrainOptional')})
          </span>
        </label>
        <Textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder={t('voiceTrainTranscriptPlaceholder')}
          className="min-h-[80px] resize-y text-xs"
        />
        <p className="text-2xs text-muted-foreground">
          {t('voiceTrainTranscriptHint')}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleTranscribe}
          disabled={!canTranscribe}
          className="h-8 w-fit gap-2 text-xs"
        >
          {isTranscribing && <Spinner size="sm" />}
          {files.length > 1 ? t('voiceTranscribeFirst') : t('voiceTranscribe')}
        </Button>
      </div>

      {/* Enhance toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={enhance}
          onChange={(e) => setEnhance(e.target.checked)}
          className="size-4 rounded border-border accent-primary"
        />
        <span className="text-xs text-foreground">
          {t('voiceTrainEnhance')}
        </span>
      </label>

      {/* Train button */}
      <Button
        onClick={handleTrain}
        disabled={!canTrain}
        className="h-10 gap-2 rounded-xl text-sm font-medium"
      >
        {trainStage === 'idle' ? (
          <>
            <Plus className="size-4" />
            {t('voiceTrainCreate')}
          </>
        ) : (
          <>
            <Spinner size="md" />
            {trainStage === 'uploading'
              ? t('voiceTrainStageUploading')
              : t('voiceTraining')}
          </>
        )}
      </Button>
    </div>
  )
})
