'use client'

import { memo, useState, useRef } from 'react'
import { Loader2, Mic, Plus, Trash2, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { useStudioForm } from '@/contexts/studio-context'
import { createVoiceAPI } from '@/lib/api-client'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

interface UploadedFile {
  file: File
  name: string
}

/**
 * VoiceTrainer — Upload audio to create a custom Fish Audio voice (clone).
 * Fast mode: voice is instantly available after creation.
 */
export const VoiceTrainer = memo(function VoiceTrainer() {
  const { dispatch } = useStudioForm()
  const t = useTranslations('StudioPage')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [transcript, setTranscript] = useState('')
  const [enhance, setEnhance] = useState(false)
  const [isTraining, setIsTraining] = useState(false)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files
    if (!selected) return

    const newFiles: UploadedFile[] = Array.from(selected).map((f) => ({
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

    setIsTraining(true)
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
    setIsTraining(false)

    if (result.success && result.data) {
      toast.success(t('voiceTrainSuccess'))
      // Auto-select the newly created voice
      dispatch({ type: 'SET_VOICE_ID', payload: result.data.id })
      // Reset form
      setTitle('')
      setFiles([])
      setTranscript('')
    } else {
      toast.error(result.error ?? t('voiceTrainFailed'))
    }
  }

  const canTrain = title.trim().length > 0 && files.length > 0 && !isTraining

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-full bg-primary/10">
          <Mic className="size-4 text-primary" />
        </div>
        <div>
          <h4 className="text-sm font-medium text-foreground">
            {t('voiceTrainTitle')}
          </h4>
          <p className="text-2xs text-muted-foreground">
            {t('voiceTrainDesc')}
          </p>
        </div>
      </div>

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
        {isTraining ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {t('voiceTraining')}
          </>
        ) : (
          <>
            <Plus className="size-4" />
            {t('voiceTrainCreate')}
          </>
        )}
      </Button>
    </div>
  )
})
