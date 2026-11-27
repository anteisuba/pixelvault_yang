'use client'
/* eslint-disable @next/next/no-img-element -- reference thumbnails are remote R2/gallery URLs */

import { useCallback, useRef, useState, type ChangeEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  AlertTriangle,
  ChevronDown,
  Image as ImageIcon,
  Plus,
  UserRound,
  X,
} from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  ImageAccordion,
  type ImageAccordionItem,
} from '@/components/ui/image-accordion'
import { Slider } from '@/components/ui/slider'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { ImagePickerPopoverBody } from '@/components/business/studio-shared/ImagePickerPopoverBody'
import {
  StudioToolPopoverContent,
  StudioToolSurface,
  StudioToolSurfaceTrigger,
} from '@/components/business/studio-shared/primitives/tool-surface'
import { getModelById } from '@/constants/models'
import { SPRING } from '@/constants/motion'
import {
  NOVELAI_MAX_PRECISE_REFERENCES,
  getNovelAiPreciseReferenceAnlasCost,
  getNovelAiPreciseReferenceContract,
  type NovelAiPreciseReferenceKind,
} from '@/constants/novelai'
import { CLIENT_UPLOAD_MAX_BYTES } from '@/constants/uploads'
import { useStudioData, useStudioForm } from '@/contexts/studio-context'
import { AssetSelectorDialog } from '@/features/assets'
import { sameCharacterPick } from '@/features/cards'
import { useCharacterCardUsage } from '@/features/cards/hooks'
import {
  ReferenceImageLibraryDialog,
  ReferenceImagePickerBody,
} from '@/features/studio/components/ReferenceImageChip'
import { StudioInpaintMaskChip } from '@/features/studio/components/StudioInpaintMaskChip'
import { useStudioCharacterOutlet } from '@/features/studio/hooks/use-studio-character-outlet'
import { useStudioRunModels } from '@/hooks/use-studio-run-models'
import { uploadImageFileAPI } from '@/lib/api-client'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { prepareImageUpload } from '@/lib/prepare-image-upload'
import type { StudioCharacterOutletEntry } from '@/lib/studio-character-outlet'
import { gateNonRasterInput } from '@/lib/svg-to-png-request'
import { cn } from '@/lib/utils'
import type {
  AdvancedParams,
  CharacterImagePick,
  GenerationRecord,
} from '@/types'
import type { NovelAiPreciseReference } from '@/types/novelai'

function createPreciseRefId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID()
  }
  return `pref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function formatStrengthValue(value: number): string {
  return String(Number(value.toFixed(2)))
}

/**
 * 标签台统一参考区：将「图生图 / 局部重绘底图（Base Canvas）」与「NovelAI 多图精确参考
 * （Precise Reference）」完全解耦并列呈现，严格按当前模型的 `NOVELAI_GENERATION_CONTRACT`
 * 决定类型枚举、强度上限、保真度、同套服装开关与遮罩重绘冲突提示。
 */
export function StudioNovelAiReferenceSection({
  disabled = false,
  compact = false,
}: {
  disabled?: boolean
  compact?: boolean
}) {
  const reducedMotion = Boolean(useReducedMotion())
  const t = useTranslations('StudioTags.references')
  const tImageChip = useTranslations('ImageChip')
  const tImageUpload = useTranslations('ImageUpload')
  const tErrors = useTranslations('Errors')
  const { state, dispatch } = useStudioForm()
  const { imageUpload, characters } = useStudioData()
  const { runModels } = useStudioRunModels()
  const characterOutlet = useStudioCharacterOutlet()

  const [basePopoverOpen, setBasePopoverOpen] = useState(false)
  const [baseLibraryOpen, setBaseLibraryOpen] = useState(false)
  const [precisePopoverOpen, setPrecisePopoverOpen] = useState(false)
  const [preciseLibraryOpen, setPreciseLibraryOpen] = useState(false)
  const [expandedRefId, setExpandedRefId] = useState<string | null>(null)
  const [uploadingPrecise, setUploadingPrecise] = useState(false)
  const preciseFileInputRef = useRef<HTMLInputElement>(null)

  const primaryModel = runModels[0]
  const externalModelId = primaryModel
    ? getModelById(primaryModel.modelId)?.externalModelId
    : undefined
  const preciseContract = getNovelAiPreciseReferenceContract(externalModelId)

  const manualRefs: readonly NovelAiPreciseReference[] =
    state.advancedParams.novelAi?.preciseReferences ?? []
  const cardPreciseCount = characterOutlet.novelAiPreciseReferenceCount
  const totalPreciseCount = manualRefs.length + cardPreciseCount
  const maxPrecise = preciseContract?.maxCount ?? NOVELAI_MAX_PRECISE_REFERENCES
  const remainingPreciseSlots = Math.max(0, maxPrecise - totalPreciseCount)
  const isPreciseFull = remainingPreciseSlots <= 0

  const baseEntry = imageUpload.referenceEntries[0]
  const hasInpaintMask = typeof state.advancedParams.inpaintMask === 'string'
  const hasV5InpaintConflict =
    hasInpaintMask &&
    totalPreciseCount > 0 &&
    preciseContract?.canCombineWithInpaint === false
  const anlasCost =
    preciseContract && !hasV5InpaintConflict
      ? getNovelAiPreciseReferenceAnlasCost(totalPreciseCount)
      : 0

  const updateManualRefs = useCallback(
    (
      updater: (
        prev: readonly NovelAiPreciseReference[],
      ) => readonly NovelAiPreciseReference[],
    ) => {
      const prev = state.advancedParams.novelAi?.preciseReferences ?? []
      const next = [...updater(prev)].slice(0, NOVELAI_MAX_PRECISE_REFERENCES)
      const nextParams: AdvancedParams = {
        ...state.advancedParams,
        novelAi:
          next.length > 0
            ? {
                ...state.advancedParams.novelAi,
                preciseReferences: next,
              }
            : undefined,
      }
      if (!nextParams.novelAi) delete nextParams.novelAi
      dispatch({ type: 'SET_ADVANCED_PARAMS', payload: nextParams })
    },
    [dispatch, state.advancedParams],
  )

  const clearInpaintMask = useCallback(() => {
    const nextParams: AdvancedParams = { ...state.advancedParams }
    delete nextParams.inpaintMask
    dispatch({ type: 'SET_ADVANCED_PARAMS', payload: nextParams })
  }, [dispatch, state.advancedParams])

  const appendPreciseImageUrl = useCallback(
    (url: string) => {
      if (!url || !preciseContract) return
      if (gateNonRasterInput({ url }, (png) => appendPreciseImageUrl(png.url)))
        return
      const newId = createPreciseRefId()
      const defaultKind: NovelAiPreciseReferenceKind = 'character&style'
      updateManualRefs((prev) => {
        if (prev.length + cardPreciseCount >= maxPrecise) return prev
        if (prev.some((item) => item.url === url)) return prev
        return [
          ...prev,
          {
            id: newId,
            url,
            kind: defaultKind,
            strength: preciseContract.strength.default,
            fidelity: preciseContract.fidelity?.default ?? 1,
            preferSameOutfit: true,
            source: { type: 'user' },
          },
        ]
      })
      setExpandedRefId(newId)
    },
    [cardPreciseCount, maxPrecise, preciseContract, updateManualRefs],
  )

  const uploadPreciseFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/') || isPreciseFull) return
      setUploadingPrecise(true)
      try {
        const maxMb = String(CLIENT_UPLOAD_MAX_BYTES / 1024 / 1024)
        const prepared = await prepareImageUpload(file, {
          maxBytes: CLIENT_UPLOAD_MAX_BYTES,
          messages: {
            compressing: tImageUpload('compressing'),
            compressed: ({ from, to }) =>
              tImageUpload('compressed', { from, to }),
            gifTooLarge: tImageUpload('gifTooLarge', { maxMb }),
            tooLarge: tImageUpload('tooLarge', { maxMb }),
          },
        })
        if (!prepared) return
        const response = await uploadImageFileAPI(prepared)
        if (response.success && response.data?.generation.url) {
          appendPreciseImageUrl(response.data.generation.url)
        } else {
          toast.error(
            getApiErrorMessage(tErrors, response, tImageUpload('uploadFailed')),
          )
        }
      } catch {
        toast.error(tImageUpload('uploadFailed'))
      } finally {
        setUploadingPrecise(false)
      }
    },
    [appendPreciseImageUrl, isPreciseFull, tErrors, tImageUpload],
  )

  const handlePreciseFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void uploadPreciseFile(file)
    setPrecisePopoverOpen(false)
  }

  const handlePickPreciseAssets = (generations: GenerationRecord[]) => {
    for (const gen of generations) {
      if (gen.outputType === 'IMAGE') appendPreciseImageUrl(gen.url)
    }
  }

  const refKey = (ref: NovelAiPreciseReference): string => ref.id ?? ref.url

  const patchManualRef = (
    key: string,
    patch: Partial<Omit<NovelAiPreciseReference, 'id' | 'url'>>,
  ) => {
    updateManualRefs((prev) =>
      prev.map((item) => (refKey(item) === key ? { ...item, ...patch } : item)),
    )
  }

  const removeManualRef = (key: string) => {
    updateManualRefs((prev) => prev.filter((item) => refKey(item) !== key))
    setExpandedRefId((current) => (current === key ? null : current))
  }

  const kindLabel = (kind: NovelAiPreciseReferenceKind): string => {
    switch (kind) {
      case 'character':
        return t('kinds.character')
      case 'outfit':
        return t('kinds.outfit')
      case 'style':
        return t('kinds.style')
      case 'character&style':
        return t('kinds.characterStyle')
    }
  }

  const cardEntriesWithImages = characterOutlet.entries.filter(
    (entry) => entry.images.length > 0,
  )
  const hasInactiveCards =
    characters.activeCardIds.length > 0 && !characters.novelAiPreciseReference

  const manualRefKeys = new Set(manualRefs.map((ref) => refKey(ref)))
  const accordionItems: ImageAccordionItem[] = [
    ...cardEntriesWithImages.flatMap((entry) =>
      entry.images
        .filter((image): image is typeof image & { url: string } =>
          Boolean(image.url),
        )
        .map((image, idx) => ({
          id: `card:${entry.card.id}:${idx}`,
          src: image.url,
          alt: `${entry.card.name} · ${t('preciseTitle')}`,
          label: entry.card.name,
          active: false,
        })),
    ),
    ...manualRefs.map((ref, idx) => {
      const key = refKey(ref)
      return {
        id: key,
        src: ref.url,
        alt: `${t('preciseTitle')} #${idx + 1}`,
        label: kindLabel(ref.kind),
        active: expandedRefId === key,
      }
    }),
  ]

  return (
    <section
      aria-label={t('sectionTitle')}
      data-testid="novelai-reference-section"
      className={cn(
        'flex min-w-0 flex-col gap-2',
        compact && 'border-t border-border pt-2',
      )}
    >
      {/* 1. 并排双槽触发卡（图一方案 A）：底图重绘 | 精确参考，空态极简一行、有图原地展开 */}
      <div
        className={cn(
          'grid min-w-0 gap-1.5',
          preciseContract ? 'grid-cols-2' : 'grid-cols-1',
        )}
      >
        <StudioToolSurface
          open={basePopoverOpen}
          onOpenChange={setBasePopoverOpen}
        >
          <StudioToolSurfaceTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label={t('addBaseCanvas')}
              title={t('baseCanvasTitle')}
              className={cn(
                'touch-target-y flex min-w-0 items-center justify-between gap-2 rounded-12 border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50',
                baseEntry
                  ? 'border-foreground/15 bg-muted/80 hover:bg-muted'
                  : 'border-dashed border-border bg-muted/40 hover:border-foreground/25 hover:bg-muted/70',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-2xs font-semibold text-foreground">
                  {t('baseSlotTitle')}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {baseEntry
                    ? hasInpaintMask
                      ? t('baseInpaintLabel')
                      : t('baseImg2ImgLabel')
                    : t('baseSlotSub')}
                </span>
              </span>
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-card text-foreground shadow-seg">
                <Plus className="size-3.5" aria-hidden />
              </span>
            </button>
          </StudioToolSurfaceTrigger>
          <StudioToolPopoverContent
            size="action"
            side="right"
            align="start"
            sideOffset={8}
            className="max-h-96 overflow-y-auto overscroll-contain p-3.5"
            label={t('addBaseCanvas')}
          >
            <ReferenceImagePickerBody
              disabled={disabled}
              onDone={() => setBasePopoverOpen(false)}
              onOpenLibrary={() => {
                setBasePopoverOpen(false)
                setBaseLibraryOpen(true)
              }}
            />
          </StudioToolPopoverContent>
        </StudioToolSurface>

        {preciseContract ? (
          <StudioToolSurface
            open={precisePopoverOpen}
            onOpenChange={setPrecisePopoverOpen}
          >
            <StudioToolSurfaceTrigger asChild>
              <button
                type="button"
                disabled={disabled || isPreciseFull || uploadingPrecise}
                aria-label={t('addPrecise')}
                title={t('preciseEmptyHint')}
                className={cn(
                  'touch-target-y flex min-w-0 items-center justify-between gap-2 rounded-12 border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50',
                  totalPreciseCount > 0
                    ? 'border-foreground/15 bg-muted/80 hover:bg-muted'
                    : 'border-dashed border-border bg-muted/40 hover:border-foreground/25 hover:bg-muted/70',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-2xs font-semibold text-foreground">
                    <span className="truncate">{t('preciseTitle')}</span>
                    <span className="shrink-0 font-mono text-[11px] font-normal tabular-nums text-muted-foreground">
                      {totalPreciseCount}/{maxPrecise}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                    {anlasCost > 0 ? (
                      <span className="font-mono font-semibold tabular-nums text-foreground">
                        +{anlasCost} Anlas
                      </span>
                    ) : (
                      <span className="truncate">{t('preciseSlotSub')}</span>
                    )}
                  </span>
                </span>
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-card text-foreground shadow-seg">
                  {uploadingPrecise ? (
                    <Spinner className="size-3.5" aria-hidden />
                  ) : (
                    <Plus className="size-3.5" aria-hidden />
                  )}
                </span>
              </button>
            </StudioToolSurfaceTrigger>
            <StudioToolPopoverContent
              size="action"
              side="right"
              align="start"
              sideOffset={8}
              className="max-h-96 overflow-y-auto overscroll-contain p-3.5"
              label={t('addPrecise')}
            >
              <input
                ref={preciseFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePreciseFileInput}
                disabled={disabled || isPreciseFull}
              />
              <ImagePickerPopoverBody
                dropHint={tImageChip('dropHint')}
                recentLabel={tImageChip('recentAssets')}
                recentEmptyLabel={tImageChip('recentAssetsEmpty')}
                openLibraryLabel={tImageChip('openLibrary')}
                disabledReason={
                  isPreciseFull
                    ? t('preciseLimitReached', { max: maxPrecise })
                    : undefined
                }
                onPickFile={() => preciseFileInputRef.current?.click()}
                onDropFile={(file) => {
                  void uploadPreciseFile(file)
                  setPrecisePopoverOpen(false)
                }}
                onPickAsset={(generation) => {
                  if (generation.outputType === 'IMAGE') {
                    appendPreciseImageUrl(generation.url)
                  }
                  setPrecisePopoverOpen(false)
                }}
                onOpenLibrary={() => {
                  if (isPreciseFull) return
                  setPrecisePopoverOpen(false)
                  setPreciseLibraryOpen(true)
                }}
              />
            </StudioToolPopoverContent>
          </StudioToolSurface>
        ) : null}
      </div>

      {/* 2. 已挂底图卡片 */}
      {baseEntry ? (
        <div className="flex items-center gap-2 rounded-12 bg-muted/60 p-2">
          <img
            src={baseEntry.url}
            alt={t('baseCanvasTitle')}
            className="size-9 shrink-0 rounded-lg object-cover ring-1 ring-border ring-inset"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-2sm font-semibold text-foreground">
              {hasInpaintMask ? t('baseInpaintLabel') : t('baseImg2ImgLabel')}
            </div>
            <div className="text-2xs text-muted-foreground">
              {t('baseCanvasHint')}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <StudioInpaintMaskChip disabled={disabled} />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={disabled}
              aria-label={t('removeBaseCanvas')}
              onClick={() => imageUpload.removeReferenceImage(0)}
            >
              <X className="size-3.5" aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}

      {/* 3. 已挂精确参考内容（有图或有提示时原地展开，零空态废话占位） */}
      {preciseContract ? (
        hasV5InpaintConflict ||
        hasInactiveCards ||
        accordionItems.length >= 2 ||
        cardEntriesWithImages.length > 0 ||
        manualRefs.length > 0 ? (
          <div className="flex flex-col gap-2">
            {hasV5InpaintConflict ? (
              <div
                role="status"
                className="flex items-start gap-2 rounded-12 bg-status-risk/10 px-2.5 py-2 text-2xs text-foreground"
              >
                <AlertTriangle
                  className="mt-0.5 size-3.5 shrink-0 text-status-risk"
                  aria-hidden
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <p>{t('v5InpaintConflict')}</p>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={clearInpaintMask}
                    className="touch-target-y font-semibold underline underline-offset-2"
                  >
                    {t('clearInpaintToUsePrecise')}
                  </button>
                </div>
              </div>
            ) : null}

            {hasInactiveCards ? (
              <div className="flex items-center justify-between gap-2 rounded-12 bg-muted/40 px-2.5 py-1.5 text-2xs text-muted-foreground">
                <span className="truncate">
                  {t('characterCardsPausedHint')}
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => characters.setNovelAiPreciseReference(true)}
                  className="touch-target-y shrink-0 font-semibold text-foreground underline underline-offset-2"
                >
                  {t('enableCharacterCardsPrecise')}
                </button>
              </div>
            ) : null}

            {accordionItems.length >= 2 ? (
              <ImageAccordion
                items={accordionItems}
                ariaLabel={t('preciseTitle')}
                onSelect={(id) => {
                  if (!manualRefKeys.has(id)) return
                  setExpandedRefId((current) => (current === id ? null : id))
                }}
                className={cn(hasV5InpaintConflict && 'opacity-50')}
              />
            ) : null}

            {cardEntriesWithImages.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {cardEntriesWithImages.map((entry) => (
                  <CharacterCardPreciseRefRows
                    key={entry.card.id}
                    entry={entry}
                    kindLabel={kindLabel}
                    disabled={disabled}
                  />
                ))}
              </div>
            ) : null}

            {manualRefs.length > 0 ? (
              <ul
                className={cn(
                  'flex flex-col gap-1.5',
                  hasV5InpaintConflict && 'opacity-50',
                )}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  {manualRefs.map((ref) => {
                    const key = refKey(ref)
                    const isExpanded = expandedRefId === key
                    const effectiveStrength = Math.min(
                      ref.strength,
                      preciseContract.strength.max,
                    )
                    const kindSupported = preciseContract.kinds.includes(
                      ref.kind,
                    )
                    const fidelityRange = preciseContract.fidelity
                    const effectiveFidelity =
                      ref.fidelity ?? fidelityRange?.default ?? 1
                    const preferSameOutfit =
                      ref.preferSameOutfit ?? ref.kind === 'character&style'
                    const showPreferSameOutfit =
                      preciseContract.supportsPreferSameOutfit &&
                      (ref.kind === 'character' ||
                        ref.kind === 'character&style')
                    return (
                      <motion.li
                        key={key}
                        layout={!reducedMotion}
                        initial={
                          reducedMotion ? false : { opacity: 0, scale: 0.96 }
                        }
                        animate={{ opacity: 1, scale: 1 }}
                        exit={
                          reducedMotion
                            ? undefined
                            : { opacity: 0, scale: 0.94 }
                        }
                        transition={
                          reducedMotion ? { duration: 0 } : SPRING.slot
                        }
                        data-testid="novelai-precise-ref-card"
                        className="rounded-12 bg-muted/60 p-2"
                      >
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            disabled={disabled}
                            onClick={() =>
                              setExpandedRefId(isExpanded ? null : key)
                            }
                            className="touch-target-y flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:shadow-focus"
                          >
                            <img
                              src={ref.url}
                              alt={kindLabel(ref.kind)}
                              className="size-9 shrink-0 rounded-lg object-cover ring-1 ring-border ring-inset"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 text-2sm font-semibold text-foreground">
                                <span className="truncate">
                                  {kindLabel(ref.kind)}
                                </span>
                                {showPreferSameOutfit && preferSameOutfit ? (
                                  <span className="shrink-0 text-2xs font-normal text-muted-foreground">
                                    · {t('sameOutfitShort')}
                                  </span>
                                ) : null}
                                {!kindSupported ? (
                                  <span className="shrink-0 text-2xs font-normal text-status-risk">
                                    · {t('unsupportedKindOnModel')}
                                  </span>
                                ) : null}
                              </div>
                              <div className="font-mono text-2xs tabular-nums text-muted-foreground">
                                {t('strengthSummary', {
                                  value: formatStrengthValue(effectiveStrength),
                                })}
                                {fidelityRange
                                  ? ` · ${t('fidelitySummary', {
                                      value:
                                        formatStrengthValue(effectiveFidelity),
                                    })}`
                                  : ''}
                              </div>
                            </div>
                            <ChevronDown
                              aria-hidden
                              className={cn(
                                'size-4 shrink-0 text-muted-foreground transition-transform duration-fast',
                                isExpanded && 'rotate-180',
                              )}
                            />
                          </button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            disabled={disabled}
                            aria-label={t('removePrecise')}
                            onClick={() => removeManualRef(key)}
                          >
                            <X className="size-3.5" aria-hidden />
                          </Button>
                        </div>

                        {isExpanded ? (
                          <div className="mt-2.5 flex flex-col gap-2.5 border-t border-border pt-2.5">
                            {/* Kind Selector */}
                            <div className="flex flex-col gap-1">
                              <span className="text-2xs text-muted-foreground">
                                {t('kindLabel')}
                              </span>
                              <div className="flex flex-wrap gap-1 rounded-full bg-fill-strong p-1">
                                {preciseContract.kinds.map((kind) => {
                                  const active = ref.kind === kind
                                  return (
                                    <button
                                      key={kind}
                                      type="button"
                                      disabled={disabled}
                                      aria-pressed={active}
                                      onClick={() =>
                                        patchManualRef(key, {
                                          kind,
                                          ...(kind === 'character&style'
                                            ? { preferSameOutfit: true }
                                            : {}),
                                        })
                                      }
                                      className={cn(
                                        'touch-target-y h-7 flex-1 rounded-full px-2 text-2xs transition-colors focus-visible:outline-none focus-visible:shadow-focus',
                                        active
                                          ? 'bg-card font-semibold text-foreground shadow-seg'
                                          : 'text-muted-foreground hover:text-foreground',
                                      )}
                                    >
                                      {kindLabel(kind)}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>

                            {/* Strength Fat Slider */}
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between text-2xs">
                                <span className="text-muted-foreground">
                                  {t('strengthLabel')}
                                </span>
                                <span className="font-mono font-semibold tabular-nums text-foreground">
                                  {formatStrengthValue(effectiveStrength)} /{' '}
                                  {preciseContract.strength.max}
                                </span>
                              </div>
                              <Slider
                                aria-label={t('strengthLabel')}
                                min={preciseContract.strength.min}
                                max={preciseContract.strength.max}
                                step={preciseContract.strength.step}
                                value={[effectiveStrength]}
                                disabled={disabled}
                                onValueChange={([next]) => {
                                  if (typeof next === 'number') {
                                    patchManualRef(key, {
                                      strength: Number(next.toFixed(2)),
                                    })
                                  }
                                }}
                              />
                            </div>

                            {/* Fidelity Fat Slider (V4.5 only) */}
                            {fidelityRange ? (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center justify-between text-2xs">
                                  <span className="text-muted-foreground">
                                    {t('fidelityLabel')}
                                  </span>
                                  <span className="font-mono font-semibold tabular-nums text-foreground">
                                    {formatStrengthValue(effectiveFidelity)}
                                  </span>
                                </div>
                                <Slider
                                  aria-label={t('fidelityLabel')}
                                  min={fidelityRange.min}
                                  max={fidelityRange.max}
                                  step={fidelityRange.step}
                                  value={[effectiveFidelity]}
                                  disabled={disabled}
                                  onValueChange={([next]) => {
                                    if (typeof next === 'number') {
                                      patchManualRef(key, {
                                        fidelity: Number(next.toFixed(2)),
                                      })
                                    }
                                  }}
                                />
                              </div>
                            ) : null}

                            {/* Prefer Same Outfit Switch (V5 character / character&style only) */}
                            {showPreferSameOutfit ? (
                              <label className="flex items-center justify-between gap-2 text-2sm text-foreground">
                                <span>{t('preferSameOutfit')}</span>
                                <Switch
                                  checked={preferSameOutfit}
                                  disabled={disabled}
                                  onCheckedChange={(checked) =>
                                    patchManualRef(key, {
                                      preferSameOutfit: checked,
                                    })
                                  }
                                />
                              </label>
                            ) : null}
                          </div>
                        ) : null}
                      </motion.li>
                    )
                  })}
                </AnimatePresence>
              </ul>
            ) : null}
          </div>
        ) : null
      ) : manualRefs.length > 0 ? (
        <p className="rounded-12 bg-muted/40 px-2.5 py-2 text-2xs text-muted-foreground">
          {t('preciseUnsupportedOnModel', { count: manualRefs.length })}
        </p>
      ) : null}

      <ReferenceImageLibraryDialog
        open={baseLibraryOpen}
        onOpenChange={setBaseLibraryOpen}
      />
      <AssetSelectorDialog
        open={preciseLibraryOpen}
        onOpenChange={setPreciseLibraryOpen}
        title={t('pickPreciseTitle')}
        description={t('pickPreciseDescription')}
        mediaType="image"
        multiSelect
        maxSelection={remainingPreciseSlots}
        onConfirmMany={handlePickPreciseAssets}
      />
    </section>
  )
}

function CharacterCardPreciseRefRows({
  entry,
  kindLabel,
  disabled,
}: {
  entry: StudioCharacterOutletEntry
  kindLabel: (kind: NovelAiPreciseReferenceKind) => string
  disabled: boolean
}) {
  const t = useTranslations('StudioTags.references')
  const { characters } = useStudioData()
  const { card } = entry
  const needsUsage = entry.images.some((image) => image.url === null)
  const usage = useCharacterCardUsage(card.id, needsUsage)

  const removeImage = (pick: CharacterImagePick) => {
    const current = entry.picked
      ? (characters.imagePicks[card.id] ?? [])
      : entry.images.map((image) => image.pick)
    characters.setImagePicks(
      card.id,
      current.filter((item) => !sameCharacterPick(item, pick)),
    )
  }

  return (
    <>
      {entry.images.map((image) => {
        const url =
          image.url ??
          ('generationId' in image.pick
            ? (() => {
                const pick = image.pick
                const generation = usage.generations.find(
                  (item) => item.id === pick.generationId,
                )
                return generation?.thumbnailUrl ?? generation?.url ?? null
              })()
            : null)
        const key =
          'slotId' in image.pick ? image.pick.slotId : image.pick.generationId
        return (
          <div
            key={`${card.id}:${key}`}
            data-testid="novelai-card-precise-ref"
            className="flex items-center gap-2 rounded-12 bg-muted/60 p-2"
          >
            <div className="relative size-9 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-border ring-inset">
              {url ? (
                <img
                  src={url}
                  alt={card.name}
                  className="size-full object-cover"
                />
              ) : (
                <div className="grid size-full place-items-center text-muted-foreground">
                  <ImageIcon className="size-4" aria-hidden />
                </div>
              )}
              <span
                title={t('fromCharacterCard')}
                className="absolute right-0 bottom-0 grid size-4 place-items-center rounded-tl bg-foreground text-background"
              >
                <UserRound className="size-2.5" aria-hidden />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-2sm font-semibold text-foreground">
                {card.name}
              </div>
              <div className="text-2xs text-muted-foreground">
                {image.preciseKind
                  ? kindLabel(image.preciseKind)
                  : t('kinds.character')}{' '}
                · {t('fromCharacterCard')}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={disabled}
              aria-label={t('removeCardPrecise', { name: card.name })}
              onClick={() => removeImage(image.pick)}
            >
              <X className="size-3.5" aria-hidden />
            </Button>
          </div>
        )
      })}
    </>
  )
}
