'use client'

import { useState, useCallback, useRef } from 'react'
import {
  CheckCircle2,
  Clock,
  ImagePlus,
  Loader2,
  Sparkles,
  Star,
  Upload,
  X,
  XCircle,
  Copy,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

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
import {
  DEFAULT_LORA_TRAINING_BASE_MODEL,
  LORA_TRAINING_BASE_MODELS,
  type LoraTrainingBaseModel,
} from '@/constants/lora'
import { uploadLoraTrainingImageAPI } from '@/lib/api-client'
import type { GenerationRecord } from '@/types'
import { cn } from '@/lib/utils'

interface LoraTrainingFormProps {
  characterCardId?: string
  onSubmitted?: () => void
  showHeading?: boolean
  /** Hide the in-form recent-jobs list. The Studio /lora?section=train page
   *  surfaces the same data in its left sidebar via LoraTrainingHistorySidebar,
   *  so we don't want it duplicated below the submit button there. The dialog
   *  variant (no sidebar) keeps the default so users still see job status. */
  hideRecentJobs?: boolean
}

export function LoraTrainingForm({
  characterCardId,
  onSubmitted,
  showHeading = false,
  hideRecentJobs = false,
}: LoraTrainingFormProps) {
  const t = useTranslations('LoraTraining')
  const { keys } = useApiKeysContext()
  const { submit, isSubmitting, jobs } = useLoraTraining()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [triggerWord, setTriggerWord] = useState('')
  const [loraType, setLoraType] = useState<'subject' | 'style'>('subject')
  const [provider, setProvider] = useState<'replicate' | 'fal'>('replicate')
  const [baseModel, setBaseModel] = useState<LoraTrainingBaseModel>(
    DEFAULT_LORA_TRAINING_BASE_MODEL,
  )
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
  //
  // Extracted so both the <input type="file"> change and drop-zone drop
  // event funnel through the same logic — no duplicated cap math, no
  // dropped errors.
  const handleFiles = useCallback(
    async (files: File[]) => {
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

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? [])
      e.target.value = ''
      await handleFiles(files)
    },
    [handleFiles],
  )

  // Drop zone wrappers. dataTransfer.files may include non-image files
  // (folders, text drags); filter to images so we don't toast a confusing
  // "Upload failed" for the trash an OS file manager leaks in.
  const [isDragOver, setIsDragOver] = useState(false)
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])
  const handleDragLeave = useCallback(() => setIsDragOver(false), [])
  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragOver(false)
      const files = Array.from(e.dataTransfer.files ?? []).filter((f) =>
        f.type.startsWith('image/'),
      )
      await handleFiles(files)
    },
    [handleFiles],
  )

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // Promote any image to position 0 — that's the slot ensureLoraAssetFrom-
  // TrainingJob picks as the LoRA card cover. Pure UX: trainer itself
  // doesn't care about order (SGD shuffles the dataset).
  const setAsCover = useCallback((url: string) => {
    setImages((prev) => {
      const idx = prev.indexOf(url)
      if (idx <= 0) return prev
      const next = [...prev]
      const [picked] = next.splice(idx, 1)
      if (picked !== undefined) next.unshift(picked)
      return next
    })
  }, [])

  // dnd-kit drag-end: reorder the images array by the active/over URL ids.
  // useSortable wants stable, unique IDs — URLs work because we dedupe on
  // insert (handleFileChange and addImagesFromAssets both check membership).
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setImages((prev) => {
      const from = prev.indexOf(String(active.id))
      const to = prev.indexOf(String(over.id))
      if (from < 0 || to < 0) return prev
      return arrayMove(prev, from, to)
    })
  }, [])

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

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
      baseModel,
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
    baseModel,
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
        <label className="text-sm font-medium">{t('baseModel')}</label>
        <div className="grid grid-cols-3 gap-2">
          {LORA_TRAINING_BASE_MODELS.map((option) => {
            const isActive = baseModel === option.id
            const isComingSoon = !option.available
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  if (option.available) setBaseModel(option.id)
                }}
                disabled={isComingSoon}
                title={isComingSoon ? t('baseModelComingSoon') : undefined}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 rounded-lg border px-2 py-2 text-xs transition-colors',
                  isActive
                    ? 'border-primary/40 bg-primary/5 text-foreground'
                    : 'border-border/50 text-muted-foreground hover:border-primary/20',
                  isComingSoon &&
                    'cursor-not-allowed opacity-50 hover:border-border/50',
                )}
              >
                <span className="font-medium">{option.label}</span>
                {isComingSoon && (
                  <span className="text-[10px] text-muted-foreground">
                    {t('baseModelComingSoonBadge')}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <p className="text-2xs text-muted-foreground">{t('baseModelHint')}</p>
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
          {(() => {
            // Real-time progress hint — green inside the recommended 15-30
            // range, amber too few, blue plenty. Drives "is my dataset
            // good enough yet?" intuition without parsing the long
            // uploadHint paragraph.
            const n = images.length
            const tone =
              n < LORA_TRAINING.MIN_IMAGES
                ? 'text-destructive'
                : n < 15
                  ? 'text-amber-600 dark:text-amber-400'
                  : n <= 30
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-sky-600 dark:text-sky-400'
            return (
              <span className={cn('text-2xs font-medium', tone)}>
                {t('imageCountWithMax', {
                  count: n,
                  max: LORA_TRAINING.MAX_IMAGES,
                })}
              </span>
            )
          })()}
        </div>
        <p className="text-2xs text-muted-foreground">{t('uploadHint')}</p>

        {/* Drop zone wrapper — drag images directly here, or use the two
            buttons inside for explicit OS file picker / asset-library
            picker. The dashed border + center hint is the visual anchor
            for "this is where training images go". */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-4 transition-colors',
            isDragOver ? 'border-primary/60 bg-primary/5' : 'border-border/60',
            images.length === 0 ? 'py-8' : 'py-3',
          )}
        >
          {images.length === 0 && (
            <div className="flex flex-col items-center gap-1.5 text-center">
              <Upload className="size-6 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium text-foreground">
                {t('dropZoneHint', {
                  min: LORA_TRAINING.MIN_IMAGES,
                  max: LORA_TRAINING.MAX_IMAGES,
                })}
              </p>
              <p className="text-2xs text-muted-foreground">
                {t('dropZoneOr')}
              </p>
            </div>
          )}
          <div className="flex w-full gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={
                images.length >= LORA_TRAINING.MAX_IMAGES || uploadsInFlight > 0
              }
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border/60 bg-background px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground disabled:opacity-40"
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
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border/60 bg-background px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground disabled:opacity-40"
            >
              <ImagePlus className="size-3.5" />
              {t('uploadFromAssetLibrary')}
            </button>
          </div>
        </div>

        {images.length > 0 && (
          <p className="text-2xs text-muted-foreground">
            {t('dragToReorderHint')}
          </p>
        )}
        <DndContext
          sensors={dndSensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={images} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-4 gap-2">
              {images.map((img, i) => (
                <TrainingImageTile
                  key={img}
                  url={img}
                  isCover={i === 0}
                  onRemove={() => removeImage(i)}
                  onSetAsCover={() => setAsCover(img)}
                  coverBadgeLabel={t('coverBadge')}
                  setAsCoverLabel={t('setAsCover')}
                  removeLabel={t('removeImage')}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

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

      {!hideRecentJobs && recentJobs.length > 0 && (
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

/**
 * Sidebar variant of the training-jobs panel — used by the Studio
 * /lora?section=train two-column page layout where history lives in a
 * persistent left rail instead of below the form. Shares useLoraTraining
 * with the adjacent LoraTrainingForm; both hooks talk to the same API
 * and the small list payload makes the extra fetch a non-issue.
 *
 * Dataset reuse is a placeholder until the backend exposes a "saved
 * dataset" concept (PixAI ships this; we don't yet — punted from this
 * UI revamp).
 */
export function LoraTrainingHistorySidebar() {
  const t = useTranslations('LoraTraining')
  const { jobs, isLoading } = useLoraTraining()

  return (
    <aside className="flex h-full min-h-0 flex-col gap-3">
      <div className="space-y-1">
        <h3 className="font-display text-sm font-semibold tracking-tight">
          {t('historyTitle')}
        </h3>
        <p className="text-2xs text-muted-foreground">{t('historyHint')}</p>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : jobs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/60 px-3 py-6 text-center text-2xs text-muted-foreground">
            {t('historyEmpty')}
          </p>
        ) : (
          jobs.map((job) => (
            <div
              key={job.id}
              className={cn(
                'space-y-1 rounded-md border px-2.5 py-2',
                job.status === 'COMPLETED'
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : job.status === 'FAILED'
                    ? 'border-destructive/30 bg-destructive/5'
                    : job.status === 'CANCELED'
                      ? 'border-border/60 bg-muted/30'
                      : 'border-primary/20 bg-primary/5',
              )}
            >
              <div className="flex items-center gap-1.5">
                {job.status === 'COMPLETED' && (
                  <CheckCircle2 className="size-3 shrink-0 text-emerald-500" />
                )}
                {(job.status === 'QUEUED' || job.status === 'TRAINING') && (
                  <Loader2 className="size-3 shrink-0 animate-spin text-primary" />
                )}
                {job.status === 'FAILED' && (
                  <XCircle className="size-3 shrink-0 text-destructive" />
                )}
                {job.status === 'CANCELED' && (
                  <Clock className="size-3 shrink-0 text-muted-foreground" />
                )}
                <span className="flex-1 truncate text-2xs font-medium">
                  {job.name}
                </span>
              </div>
              <div className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
                <span className="truncate">
                  {job.status === 'COMPLETED'
                    ? t('statusCompleted')
                    : job.status === 'FAILED'
                      ? t('statusFailed')
                      : job.status === 'CANCELED'
                        ? t('statusCanceled')
                        : job.status === 'QUEUED'
                          ? t('statusQueued')
                          : t('statusTraining')}
                </span>
                {job.status === 'COMPLETED' && job.loraUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(job.loraUrl!)
                    }}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                    title={t('copyLoraUrl')}
                  >
                    <Copy className="size-2.5" />
                    {t('copyLoraUrl')}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="shrink-0 space-y-1.5 rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-2.5">
        <p className="text-2xs font-medium text-foreground">
          {t('datasetReuseTitle')}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {t('datasetReuseHint')}
        </p>
      </div>
    </aside>
  )
}

interface TrainingImageTileProps {
  url: string
  isCover: boolean
  onRemove: () => void
  onSetAsCover: () => void
  coverBadgeLabel: string
  setAsCoverLabel: string
  removeLabel: string
}

/**
 * Sortable thumbnail for the training image grid. URL doubles as the
 * dnd-kit item id since training images are deduped on insert. Cover-slot
 * (index 0) gets the persistent ⭐ badge; every other tile gets a hover-
 * revealed "set as cover" action. Pointer activation distance keeps a
 * regular click on the remove/cover buttons from being mistaken for the
 * start of a drag.
 */
function TrainingImageTile({
  url,
  isCover,
  onRemove,
  onSetAsCover,
  coverBadgeLabel,
  setAsCoverLabel,
  removeLabel,
}: TrainingImageTileProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: url })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'group relative aspect-square cursor-grab overflow-hidden rounded-md border bg-muted active:cursor-grabbing',
        isCover
          ? 'border-primary/50 ring-1 ring-primary/30'
          : 'border-border/40',
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- mixed base64 + R2 URLs */}
      <img
        src={url}
        alt=""
        className="size-full object-cover"
        draggable={false}
      />
      {isCover && (
        <span
          className="pointer-events-none absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-full bg-primary/90 px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground"
          aria-label={coverBadgeLabel}
        >
          <Star className="size-2.5 fill-current" aria-hidden />
          {coverBadgeLabel}
        </span>
      )}
      {!isCover && (
        <button
          type="button"
          // Stop propagation so the dnd-kit pointer listener doesn't claim
          // the click as a drag-start gesture.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onSetAsCover()
          }}
          aria-label={setAsCoverLabel}
          title={setAsCoverLabel}
          className="absolute left-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100"
        >
          <Star className="size-3" />
        </button>
      )}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        aria-label={removeLabel}
        title={removeLabel}
        className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-destructive group-hover:opacity-100"
      >
        <X className="size-3" />
      </button>
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
