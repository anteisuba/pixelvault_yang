'use client'

import { useState, useCallback, useRef } from 'react'
import {
  CheckCircle2,
  Clock,
  ImagePlus,
  Loader2,
  Sparkles,
  Upload,
  X,
  XCircle,
  Copy,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

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
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useLoraTraining } from '@/hooks/use-lora-training'
import { LORA_TRAINING } from '@/constants/config'
import { uploadLoraTrainingImageAPI } from '@/lib/api-client'
import type { GenerationRecord } from '@/types'
import { cn } from '@/lib/utils'

interface LoraTrainingFormProps {
  characterCardId?: string
  onSubmitted?: () => void
  showHeading?: boolean
}

export function LoraTrainingForm({
  characterCardId,
  onSubmitted,
  showHeading = false,
}: LoraTrainingFormProps) {
  const t = useTranslations('LoraTraining')
  const { keys } = useApiKeysContext()
  const { submit, isSubmitting, jobs } = useLoraTraining()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [triggerWord, setTriggerWord] = useState('')
  const [loraType, setLoraType] = useState<'subject' | 'style'>('subject')
  const [provider, setProvider] = useState<'replicate' | 'fal'>('replicate')
  const [images, setImages] = useState<string[]>([])
  const [assetSelectorOpen, setAssetSelectorOpen] = useState(false)
  const [uploadsInFlight, setUploadsInFlight] = useState(0)

  const providerKeys = keys.filter(
    (k) => k.adapterType === provider && k.isActive,
  )
  const selectedKeyId = providerKeys[0]?.id

  const hasReplicateKey = keys.some(
    (k) => k.adapterType === 'replicate' && k.isActive,
  )
  const hasFalKey = keys.some((k) => k.adapterType === 'fal' && k.isActive)

  const canSubmit =
    name.trim() &&
    triggerWord.trim() &&
    images.length >= LORA_TRAINING.MIN_IMAGES &&
    selectedKeyId &&
    !isSubmitting &&
    uploadsInFlight === 0

  // Stream each picked file straight to R2 instead of FileReader→base64.
  // Uploads run in parallel (Promise.all) so the user sees the count climb
  // as they finish, not as a single blocking submit. `uploadsInFlight`
  // gates the submit button so users can't kick off training with a half-
  // uploaded dataset.
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? [])
      e.target.value = ''
      if (files.length === 0) return

      // Trim against the current count *and* the in-flight uploads so a
      // user mashing the upload button can't overrun MAX_IMAGES.
      const slotsLeft =
        LORA_TRAINING.MAX_IMAGES - images.length - uploadsInFlight
      if (slotsLeft <= 0) {
        toast.warning(t('uploadMaxReached', { max: LORA_TRAINING.MAX_IMAGES }))
        return
      }
      const batch = files.slice(0, slotsLeft)

      setUploadsInFlight((n) => n + batch.length)
      const results = await Promise.all(
        batch.map((file) => uploadLoraTrainingImageAPI(file)),
      )
      setUploadsInFlight((n) => n - batch.length)

      const urls: string[] = []
      for (const r of results) {
        if (r.success && r.data) {
          urls.push(r.data.url)
        } else {
          toast.error(r.error ?? t('uploadFailed'))
        }
      }
      if (urls.length > 0) {
        setImages((prev) => {
          // Re-check the cap on the freshest state — another in-flight
          // batch may have landed between our slotsLeft calc and now.
          const room = LORA_TRAINING.MAX_IMAGES - prev.length
          return [...prev, ...urls.slice(0, room)]
        })
      }
    },
    [images.length, uploadsInFlight, t],
  )

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // Asset-library multi-pick: take what the dialog hands back, dedupe
  // against the URLs we already hold (assets the user picks twice are a
  // common misclick), and cap the total to MAX_IMAGES so the API can't
  // 400 us later. Prefer the original-quality output URL; fall back to
  // previewUrl when (e.g. legacy rows) outputUrl is missing.
  const addImagesFromAssets = useCallback((generations: GenerationRecord[]) => {
    setImages((prev) => {
      const seen = new Set(prev)
      const next = [...prev]
      for (const gen of generations) {
        if (next.length >= LORA_TRAINING.MAX_IMAGES) break
        const url = gen.url ?? gen.previewUrl
        if (!url || seen.has(url)) continue
        next.push(url)
        seen.add(url)
      }
      return next
    })
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
      provider,
    })
    if (result) {
      setName('')
      setTriggerWord('')
      setImages([])
      onSubmitted?.()
    }
  }, [
    canSubmit,
    selectedKeyId,
    name,
    triggerWord,
    loraType,
    provider,
    images,
    characterCardId,
    submit,
    onSubmitted,
  ])

  const recentJobs = jobs.slice(0, 5)

  return (
    <div className="space-y-4">
      {showHeading ? (
        <div className="space-y-1">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            {t('title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label className="text-sm font-medium">{t('name')}</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('namePlaceholder')}
          maxLength={100}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">{t('triggerWord')}</label>
        <Input
          value={triggerWord}
          onChange={(e) => setTriggerWord(e.target.value)}
          placeholder={t('triggerWordPlaceholder')}
          maxLength={50}
        />
        <p className="text-2xs text-muted-foreground">{t('triggerWordHint')}</p>
      </div>

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

      <div className="space-y-1.5">
        <label className="text-sm font-medium">{t('selectApiKey')}</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setProvider('replicate')}
            className={cn(
              'flex-1 rounded-lg border px-3 py-2 text-xs transition-colors',
              provider === 'replicate'
                ? 'border-primary/40 bg-primary/5 text-foreground'
                : 'border-border/50 text-muted-foreground hover:border-primary/20',
              !hasReplicateKey && 'opacity-50',
            )}
            disabled={!hasReplicateKey}
          >
            Replicate
            {!hasReplicateKey && (
              <span className="ml-1 text-2xs text-muted-foreground">
                (no key)
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setProvider('fal')}
            className={cn(
              'flex-1 rounded-lg border px-3 py-2 text-xs transition-colors',
              provider === 'fal'
                ? 'border-primary/40 bg-primary/5 text-foreground'
                : 'border-border/50 text-muted-foreground hover:border-primary/20',
              !hasFalKey && 'opacity-50',
            )}
            disabled={!hasFalKey}
          >
            fal.ai
            {!hasFalKey && (
              <span className="ml-1 text-2xs text-muted-foreground">
                (no key)
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">{t('uploadImages')}</label>
          <span className="text-2xs text-muted-foreground">
            {t('imageCount', { count: images.length })}
          </span>
        </div>
        <p className="text-2xs text-muted-foreground">{t('uploadHint')}</p>

        {/* Two equal entry points: local disk vs PixelVault asset library.
            Picking from the library skips the base64 round-trip — assets
            already live in R2 as URLs we can hand straight to the trainer. */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={
              images.length >= LORA_TRAINING.MAX_IMAGES || uploadsInFlight > 0
            }
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-dashed border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground disabled:opacity-40"
          >
            {uploadsInFlight > 0 ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Upload className="size-3.5" />
            )}
            {uploadsInFlight > 0
              ? t('uploadInProgress', { count: uploadsInFlight })
              : t('uploadFromLocal')}
          </button>
          <button
            type="button"
            onClick={() => setAssetSelectorOpen(true)}
            disabled={images.length >= LORA_TRAINING.MAX_IMAGES}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-dashed border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground disabled:opacity-40"
          >
            <ImagePlus className="size-3.5" />
            {t('uploadFromAssetLibrary')}
          </button>
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          {images.map((img, i) => (
            <div
              key={i}
              className="group relative aspect-square overflow-hidden rounded-md border border-border/40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- mixed base64 + R2 URLs */}
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

      {!hasReplicateKey && !hasFalKey && (
        <div className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-2">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            {t('noApiKey')}
          </p>
          <p className="text-2xs text-muted-foreground">{t('addApiKeyHint')}</p>
        </div>
      )}

      <div className="flex items-center gap-3 text-2xs text-muted-foreground">
        <span>{t('cost')}</span>
        <span>·</span>
        <span>{t('estimatedTime')}</span>
      </div>

      {recentJobs.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {t('viewJobs')}
          </p>
          {recentJobs.map((job) => (
            <div
              key={job.id}
              className={cn(
                'rounded-lg border px-3 py-2.5 space-y-1.5',
                job.status === 'COMPLETED'
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : job.status === 'FAILED'
                    ? 'border-destructive/30 bg-destructive/5'
                    : 'border-primary/20 bg-primary/5',
              )}
            >
              <div className="flex items-center gap-2">
                {job.status === 'COMPLETED' && (
                  <CheckCircle2 className="size-3.5 text-emerald-500" />
                )}
                {(job.status === 'QUEUED' || job.status === 'TRAINING') && (
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                )}
                {job.status === 'FAILED' && (
                  <XCircle className="size-3.5 text-destructive" />
                )}
                {job.status === 'CANCELED' && (
                  <Clock className="size-3.5 text-muted-foreground" />
                )}
                <span className="flex-1 text-xs font-medium">{job.name}</span>
                <Badge variant="secondary" className="text-2xs">
                  {job.status === 'COMPLETED'
                    ? t('statusCompleted')
                    : job.status === 'FAILED'
                      ? t('statusFailed')
                      : job.status === 'CANCELED'
                        ? t('statusCanceled')
                        : job.status === 'QUEUED'
                          ? t('statusQueued')
                          : t('statusTraining')}
                </Badge>
              </div>

              {job.status === 'COMPLETED' && (
                <div className="space-y-1 rounded-md bg-background/60 p-2">
                  <p className="text-2xs font-medium text-emerald-600 dark:text-emerald-400">
                    {t('trainedLoraReady')}
                  </p>
                  <p className="text-2xs text-muted-foreground">
                    {t('usageHint', { triggerWord: job.triggerWord })}
                  </p>
                  {job.loraUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(job.loraUrl!)
                      }}
                      className="flex items-center gap-1 text-2xs text-primary hover:underline"
                    >
                      <Copy className="size-3" />
                      {t('copyLoraUrl')}
                    </button>
                  )}
                </div>
              )}

              {job.status === 'FAILED' && job.errorMessage && (
                <p className="text-2xs text-destructive">{job.errorMessage}</p>
              )}
            </div>
          ))}
        </div>
      )}

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

      {/* Asset library picker — lives outside the form flow because it's a
          full-screen modal. Restricts to images (the only thing trainers
          consume) and respects the same MAX_IMAGES cap as local uploads. */}
      <AssetSelectorDialog
        open={assetSelectorOpen}
        onOpenChange={setAssetSelectorOpen}
        title={t('assetSelectorTitle')}
        description={t('assetSelectorDescription')}
        mediaType="image"
        multiSelect
        maxSelection={LORA_TRAINING.MAX_IMAGES - images.length}
        onConfirmMany={addImagesFromAssets}
      />
    </div>
  )
}

interface LoraTrainingDialogProps {
  characterCardId?: string
  trigger?: React.ReactNode
  /** Controlled open state (optional — uses internal state if omitted) */
  open?: boolean
  /** Callback when open state changes (required when `open` is provided) */
  onOpenChange?: (open: boolean) => void
}

export function LoraTrainingDialog({
  characterCardId,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: LoraTrainingDialogProps) {
  const t = useTranslations('LoraTraining')

  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {controlledOpen === undefined && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button variant="outline" size="sm" className="gap-1.5">
              <Sparkles className="size-3.5" />
              {t('title')}
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{t('title')}</DialogTitle>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </DialogHeader>

        <div className="pt-2">
          <LoraTrainingForm
            characterCardId={characterCardId}
            onSubmitted={() => setOpen(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
