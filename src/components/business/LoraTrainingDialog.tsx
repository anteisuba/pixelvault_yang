'use client'

import { useState, useCallback, useRef } from 'react'
import { Loader2, Plus, Sparkles, Upload, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useLoraTraining } from '@/hooks/use-lora-training'
import { LORA_TRAINING } from '@/constants/config'
import { cn } from '@/lib/utils'

interface LoraTrainingDialogProps {
  characterCardId?: string
  trigger?: React.ReactNode
}

export function LoraTrainingDialog({
  characterCardId,
  trigger,
}: LoraTrainingDialogProps) {
  const t = useTranslations('LoraTraining')
  const { keys } = useApiKeysContext()
  const { submit, isSubmitting, jobs } = useLoraTraining()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [triggerWord, setTriggerWord] = useState('')
  const [loraType, setLoraType] = useState<'subject' | 'style'>('subject')
  const [images, setImages] = useState<string[]>([])

  // Find Replicate keys
  const replicateKeys = keys.filter(
    (k) => k.adapterType === 'replicate' && k.isActive,
  )
  const selectedKeyId = replicateKeys[0]?.id

  const canSubmit =
    name.trim() &&
    triggerWord.trim() &&
    images.length >= LORA_TRAINING.MIN_IMAGES &&
    selectedKeyId &&
    !isSubmitting

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? [])
      for (const file of files) {
        if (images.length >= LORA_TRAINING.MAX_IMAGES) break
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          setImages((prev) => {
            if (prev.length >= LORA_TRAINING.MAX_IMAGES) return prev
            return [...prev, result]
          })
        }
        reader.readAsDataURL(file)
      }
      // Reset input so re-selecting same files works
      e.target.value = ''
    },
    [images.length],
  )

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !selectedKeyId) return
    const result = await submit({
      name: name.trim(),
      triggerWord: triggerWord.trim(),
      loraType,
      trainingImages: images,
      characterCardId,
      apiKeyId: selectedKeyId,
    })
    if (result) {
      setOpen(false)
      setName('')
      setTriggerWord('')
      setImages([])
    }
  }, [
    canSubmit,
    selectedKeyId,
    name,
    triggerWord,
    loraType,
    images,
    characterCardId,
    submit,
  ])

  // Active training jobs for this character
  const activeJobs = characterCardId
    ? jobs.filter(
        (j) =>
          j.characterCardId === characterCardId &&
          (j.status === 'QUEUED' || j.status === 'TRAINING'),
      )
    : []

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-1.5">
            <Sparkles className="size-3.5" />
            {t('title')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">{t('title')}</DialogTitle>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('name')}</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
              maxLength={100}
            />
          </div>

          {/* Trigger word */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('triggerWord')}</label>
            <Input
              value={triggerWord}
              onChange={(e) => setTriggerWord(e.target.value)}
              placeholder={t('triggerWordPlaceholder')}
              maxLength={50}
            />
            <p className="text-2xs text-muted-foreground">
              {t('triggerWordHint')}
            </p>
          </div>

          {/* Type selector */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('loraType')}</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setLoraType('subject')}
                className={cn(
                  'flex-1 rounded-lg border px-3 py-2 text-sm transition-colors',
                  loraType === 'subject'
                    ? 'border-primary/40 bg-primary/5 text-foreground'
                    : 'border-border/50 text-muted-foreground hover:border-primary/20',
                )}
              >
                {t('subject')}
              </button>
              <button
                type="button"
                onClick={() => setLoraType('style')}
                className={cn(
                  'flex-1 rounded-lg border px-3 py-2 text-sm transition-colors',
                  loraType === 'style'
                    ? 'border-primary/40 bg-primary/5 text-foreground'
                    : 'border-border/50 text-muted-foreground hover:border-primary/20',
                )}
              >
                {t('style')}
              </button>
            </div>
          </div>

          {/* Image upload */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">{t('uploadImages')}</label>
              <span className="text-2xs text-muted-foreground">
                {t('imageCount', { count: images.length })}
              </span>
            </div>
            <p className="text-2xs text-muted-foreground">{t('uploadHint')}</p>

            {/* Image grid */}
            <div className="grid grid-cols-5 gap-1.5">
              {images.map((img, i) => (
                <div
                  key={i}
                  className="group relative aspect-square overflow-hidden rounded-md border border-border/40"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- base64 data URLs */}
                  <img src={img} alt="" className="size-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="size-2.5" />
                  </button>
                </div>
              ))}

              {images.length < LORA_TRAINING.MAX_IMAGES && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex aspect-square items-center justify-center rounded-md border-2 border-dashed border-border/50 text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
                >
                  <Plus className="size-5" />
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* API Key status */}
          {!selectedKeyId && (
            <div className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-2">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                {t('noApiKey')}
              </p>
              <p className="text-2xs text-muted-foreground">
                {t('addApiKeyHint')}
              </p>
            </div>
          )}

          {/* Cost info */}
          <div className="flex items-center gap-3 text-2xs text-muted-foreground">
            <span>{t('cost')}</span>
            <span>·</span>
            <span>{t('estimatedTime')}</span>
          </div>

          {/* Active jobs */}
          {activeJobs.length > 0 && (
            <div className="space-y-1.5">
              {activeJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2"
                >
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                  <span className="flex-1 text-xs font-medium">{job.name}</span>
                  <Badge variant="secondary" className="text-2xs">
                    {job.status === 'QUEUED'
                      ? t('statusQueued')
                      : t('statusTraining')}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('submitting')}
              </>
            ) : (
              <>
                <Upload className="size-4" />
                {t('submit')}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
