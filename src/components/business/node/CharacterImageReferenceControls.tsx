'use client'

import Image from 'next/image'
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
} from 'react'
import {
  ArrowUpRight,
  Clipboard,
  ImagePlus,
  Library,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  NODE_STUDIO_CHARACTER_IMAGE_REFERENCES,
  NODE_STUDIO_IMAGE_INPUT,
  NODE_STUDIO_PLACEHOLDER_TOAST,
  NODE_STUDIO_REFERENCE_ROLES,
  NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID,
} from '@/constants/node-studio'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useNodeReferenceUpload } from '@/hooks/node/use-node-reference-upload'
import { cn } from '@/lib/utils'
import type {
  GenerationRecord,
  NodeWorkflowReferenceAsset,
  NodeWorkflowReferenceRole,
} from '@/types'

/** A closeup (面部特写) image merged read-only into the gallery grid — a
 *  SEPARATE node bound via edge, not a `referenceAssets` entry, so it has no
 *  weight/role/extract of its own (§二.2 视觉身份区 "吃进的 closeup 图并入
 *  陈列，标来源"). */
export interface CharacterReferenceGalleryExtraItem {
  id: string
  url: string
  label: string
}

interface CharacterImageReferenceControlsProps {
  value: NodeWorkflowReferenceAsset[] | undefined
  maxItems: number
  onChange(value: NodeWorkflowReferenceAsset[]): void
  /**
   * `'popover'` (default): the original compact chip + popover — unchanged
   * behavior for every existing caller (shot/frame/background inspectors).
   * `'gallery'`: S5c 二.2 档案面板视觉身份区 — an always-visible grid with
   * per-item hover controls (role/weight/remove/拆出) instead of a popover
   * list, used only by the character/background dossier body. Both modes
   * share every handler below — single source of truth for the CRUD, two
   * presentations.
   */
  mode?: 'popover' | 'gallery'
  /** Gallery mode only: closeup images to merge into the grid, read-only. */
  extraItems?: readonly CharacterReferenceGalleryExtraItem[]
  /** Gallery mode only: 拆出 (§三.4) — omitted entries get no extract button
   *  (there's nothing to wire it to outside the dossier body). */
  onExtract?(reference: NodeWorkflowReferenceAsset): void
}

export function createReferenceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `reference-${Date.now()}`
}

/**
 * Exported (not just used internally) so `StudioNodeWorkbench`'s S5c 三.3
 * 融合 handler builds `source:'canvas'` entries through the exact same
 * constructor as upload/asset/paste — one shape, one default role/weight,
 * instead of a second ad hoc object literal drifting out of sync.
 *
 * `categorySeed` (S5d ③): carries a loose image node's own `imageCategory` /
 * `imageCategoryLabel` (§6.0 "图片=素材原子") forward into the created
 * reference's `role`/`customLabel` when the loose image already had one set
 * before being fused — e.g. a 关键帧首-classified 素材 dragged onto a
 * character card keeps reading as 关键帧首 inside the card's gallery instead
 * of resetting to the default `identity` category. Omitted (every existing
 * caller) keeps the prior default-role behavior unchanged.
 */
export function createReferenceAsset(
  url: string,
  source: NodeWorkflowReferenceAsset['source'],
  sourceId?: string,
  name?: string,
  categorySeed?: { role?: NodeWorkflowReferenceRole; customLabel?: string },
): NodeWorkflowReferenceAsset {
  return {
    id: createReferenceId(),
    url,
    role:
      categorySeed?.role ?? NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.defaultRole,
    weight: NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.defaultWeight,
    source,
    sourceId,
    name,
    customLabel: categorySeed?.customLabel,
  }
}

export function CharacterImageReferenceControls({
  value,
  maxItems,
  onChange,
  mode = 'popover',
  extraItems,
  onExtract,
}: CharacterImageReferenceControlsProps) {
  const t = useTranslations('StudioNode.characterImage.reference')
  // Gallery-only strings live in the `dossier` ns (Allowed File Scope keeps
  // messages edits to castDock/ingest/dossier ns — `characterImage.reference`
  // is an existing ns this component only READS from unchanged elsewhere).
  const tDossier = useTranslations('StudioNode.dossier')
  const references = useMemo(() => value ?? [], [value])
  const [assetDialogOpen, setAssetDialogOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const pasteTargetRef = useRef<HTMLDivElement>(null)
  const { uploadFile, isUploading } = useNodeReferenceUpload()
  const effectiveMaxItems = Math.min(
    Math.max(maxItems, 0),
    NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.maxItems,
  )
  const isFull = references.length >= effectiveMaxItems
  const disabled = effectiveMaxItems === 0

  const updateReference = useCallback(
    (id: string, patch: Partial<NodeWorkflowReferenceAsset>) => {
      onChange(
        references.map((reference) =>
          reference.id === id ? { ...reference, ...patch } : reference,
        ),
      )
    },
    [onChange, references],
  )

  const removeReference = useCallback(
    (id: string) => {
      onChange(references.filter((reference) => reference.id !== id))
    },
    [onChange, references],
  )

  const appendReferences = useCallback(
    (nextReferences: NodeWorkflowReferenceAsset[]) => {
      onChange([...references, ...nextReferences].slice(0, effectiveMaxItems))
    },
    [effectiveMaxItems, onChange, references],
  )

  const handleFileInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? [])
      if (inputRef.current) {
        inputRef.current.value = ''
      }
      if (files.length === 0 || disabled || isFull) {
        return
      }

      const slots = effectiveMaxItems - references.length
      const uploadedReferences: NodeWorkflowReferenceAsset[] = []
      for (const file of files.slice(0, slots)) {
        if (!file.type.startsWith(NODE_STUDIO_IMAGE_INPUT.mimePrefix)) {
          continue
        }
        const result = await uploadFile(
          file,
          NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.uploadNote,
        )
        if (result.success && result.url) {
          uploadedReferences.push(
            createReferenceAsset(
              result.url,
              'upload',
              result.generationId,
              file.name,
            ),
          )
        } else {
          toast.error(result.error ?? t('uploadFailed'), {
            duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
            position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
          })
        }
      }

      if (uploadedReferences.length > 0) {
        appendReferences(uploadedReferences)
      }
    },
    [
      appendReferences,
      disabled,
      effectiveMaxItems,
      isFull,
      references.length,
      t,
      uploadFile,
    ],
  )

  const handlePaste = useCallback(
    async (event: ClipboardEvent<HTMLDivElement>) => {
      if (disabled || isFull) {
        return
      }

      const files = Array.from(event.clipboardData.files).filter((file) =>
        file.type.startsWith(NODE_STUDIO_IMAGE_INPUT.mimePrefix),
      )
      if (files.length === 0) {
        toast.info(t('pasteEmpty'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }

      event.preventDefault()
      const slots = effectiveMaxItems - references.length
      const uploadedReferences: NodeWorkflowReferenceAsset[] = []
      for (const file of files.slice(0, slots)) {
        const result = await uploadFile(
          file,
          NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.uploadNote,
        )
        if (result.success && result.url) {
          uploadedReferences.push(
            createReferenceAsset(
              result.url,
              'paste',
              result.generationId,
              file.name || NODE_STUDIO_IMAGE_INPUT.pastedFileName,
            ),
          )
        } else {
          toast.error(result.error ?? t('uploadFailed'), {
            duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
            position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
          })
        }
      }

      if (uploadedReferences.length > 0) {
        appendReferences(uploadedReferences)
      }
    },
    [
      appendReferences,
      disabled,
      effectiveMaxItems,
      isFull,
      references.length,
      t,
      uploadFile,
    ],
  )

  const handleSelectAssets = useCallback(
    (generations: GenerationRecord[]) => {
      const slots = effectiveMaxItems - references.length
      const nextReferences = generations
        .filter((generation) => generation.url)
        .slice(0, slots)
        .map((generation) =>
          createReferenceAsset(
            generation.url,
            'asset',
            generation.id,
            generation.prompt || undefined,
          ),
        )
      if (nextReferences.length > 0) {
        appendReferences(nextReferences)
      }
    },
    [appendReferences, effectiveMaxItems, references.length],
  )

  // Shared by both modes' "add a reference" Popover — same tabs, different
  // trigger chrome around it (compact chip vs a gallery "+" tile).
  const addPanelTabs = (
    <Tabs defaultValue="upload" className="p-3">
      <TabsList className="grid h-9 grid-cols-3 rounded-2xl bg-node-panel-soft p-1">
        <TabsTrigger
          value="upload"
          className="rounded-xl text-xs data-[state=active]:bg-node-foreground data-[state=active]:text-node-canvas"
        >
          {t('uploadTab')}
        </TabsTrigger>
        <TabsTrigger
          value="asset"
          className="rounded-xl text-xs data-[state=active]:bg-node-foreground data-[state=active]:text-node-canvas"
        >
          {t('assetTab')}
        </TabsTrigger>
        <TabsTrigger
          value="paste"
          className="rounded-xl text-xs data-[state=active]:bg-node-foreground data-[state=active]:text-node-canvas"
        >
          {t('pasteTab')}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="upload" className="mt-3">
        <button
          type="button"
          disabled={disabled || isFull || isUploading}
          onClick={() => inputRef.current?.click()}
          className="nodrag nopan nowheel flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-node-panel-inner bg-node-panel-soft px-4 text-center text-node-muted transition-colors hover:border-node-edge hover:text-node-foreground disabled:cursor-not-allowed disabled:text-node-subtle"
        >
          {isUploading ? (
            <Loader2 className="size-5 animate-spin text-node-muted" />
          ) : (
            <Upload className="size-5 text-node-muted" />
          )}
          <span className="text-xs font-semibold">
            {isFull ? t('maxReached') : t('uploadTitle')}
          </span>
          <span className="text-2xs">{t('uploadMeta')}</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={NODE_STUDIO_IMAGE_INPUT.accept}
          multiple
          className="hidden"
          onChange={handleFileInputChange}
        />
      </TabsContent>
      <TabsContent value="asset" className="mt-3">
        <Button
          type="button"
          disabled={disabled || isFull}
          onClick={() => setAssetDialogOpen(true)}
          className="nodrag nopan nowheel h-10 w-full rounded-2xl border border-node-panel-inner bg-node-panel-soft text-xs font-semibold text-node-foreground hover:border-node-edge hover:bg-node-panel-inner disabled:text-node-subtle"
        >
          <Library className="mr-2 size-4 text-node-muted" />
          {isFull ? t('maxReached') : t('selectAsset')}
        </Button>
      </TabsContent>
      <TabsContent value="paste" className="mt-3">
        <div
          ref={pasteTargetRef}
          role="button"
          tabIndex={0}
          onClick={() => pasteTargetRef.current?.focus()}
          onPaste={handlePaste}
          className="nodrag nopan nowheel flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-node-panel-inner bg-node-panel-soft px-4 text-center text-node-muted outline-none transition-colors hover:border-node-edge hover:text-node-foreground focus-visible:border-node-focus-ring focus-visible:ring-2 focus-visible:ring-node-focus-ring/20"
        >
          {isUploading ? (
            <Loader2 className="size-5 animate-spin text-node-muted" />
          ) : (
            <Clipboard className="size-5 text-node-muted" />
          )}
          <span className="text-xs font-semibold">
            {isFull ? t('maxReached') : t('pasteTitle')}
          </span>
          <span className="text-2xs">{t('pasteMeta')}</span>
        </div>
      </TabsContent>
    </Tabs>
  )

  const assetDialog = (
    <AssetSelectorDialog
      open={assetDialogOpen}
      onOpenChange={setAssetDialogOpen}
      title={t('assetDialogTitle')}
      description={t('assetDialogDescription')}
      mediaType="image"
      multiSelect
      maxSelection={Math.max(effectiveMaxItems - references.length, 0)}
      onConfirmMany={handleSelectAssets}
    />
  )

  if (mode === 'gallery') {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-node-foreground">
            {t('title')}
          </p>
          <span className="text-2xs font-medium text-node-muted">
            {t('chip', { count: references.length, max: effectiveMaxItems })}
          </span>
        </div>
        {disabled ? (
          <p className="rounded-xl bg-node-panel-soft px-3 py-2 text-xs text-node-muted">
            {t('unsupported')}
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {references.map((reference) => (
              <div
                key={reference.id}
                className="group node-card-window relative aspect-square overflow-hidden rounded-xl border border-node-panel-inner bg-node-card-window"
              >
                <Image
                  src={reference.url}
                  alt={reference.name ?? t('title')}
                  fill
                  sizes="120px"
                  className="object-cover"
                  unoptimized
                />
                {reference.source === 'canvas' ? (
                  <span className="absolute left-1 top-1 rounded-full bg-node-canvas/85 px-1.5 py-0.5 text-2xs font-medium text-node-foreground">
                    {tDossier('gallerySourceCanvas')}
                  </span>
                ) : null}
                <div className="absolute inset-0 flex flex-col justify-between bg-node-canvas/0 opacity-0 transition-opacity group-hover:bg-node-canvas/55 group-hover:opacity-100">
                  <div className="flex items-center justify-end gap-1 p-1">
                    {onExtract ? (
                      <button
                        type="button"
                        onClick={() => onExtract(reference)}
                        aria-label={tDossier('galleryExtract')}
                        title={tDossier('galleryExtract')}
                        className="nodrag flex size-6 items-center justify-center rounded-full bg-node-panel/90 text-node-foreground transition-colors hover:text-node-paint"
                      >
                        <ArrowUpRight className="size-3.5" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => removeReference(reference.id)}
                      aria-label={t('remove')}
                      title={t('remove')}
                      className="nodrag flex size-6 items-center justify-center rounded-full bg-node-panel/90 text-node-foreground transition-colors hover:text-node-status-failed"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <div className="space-y-1 p-1.5">
                    <select
                      value={reference.role}
                      onChange={(event) =>
                        updateReference(reference.id, {
                          role: event.target.value as NodeWorkflowReferenceRole,
                        })
                      }
                      className="nodrag nopan nowheel h-6 w-full rounded-lg border border-node-panel-inner/70 bg-node-panel/90 text-2xs font-semibold text-node-foreground"
                    >
                      {NODE_STUDIO_REFERENCE_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {t(`roles.${role}`)}
                        </option>
                      ))}
                    </select>
                    {reference.role === NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID ? (
                      <input
                        type="text"
                        value={reference.customLabel ?? ''}
                        onChange={(event) =>
                          updateReference(reference.id, {
                            customLabel: event.target.value || undefined,
                          })
                        }
                        placeholder={t('customLabelPlaceholder')}
                        aria-label={t('customLabelPlaceholder')}
                        className="nodrag nopan nowheel h-6 w-full rounded-lg border border-node-panel-inner/70 bg-node-panel/90 px-1.5 text-2xs text-node-foreground"
                      />
                    ) : null}
                    <input
                      type="range"
                      min={NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.minWeight}
                      max={NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.maxWeight}
                      step={NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.weightStep}
                      value={reference.weight}
                      onChange={(event) =>
                        updateReference(reference.id, {
                          weight: Number(event.target.value),
                        })
                      }
                      aria-label={t('weightLabel')}
                      className="nodrag nopan nowheel h-3 w-full accent-node-paint"
                    />
                  </div>
                </div>
              </div>
            ))}

            {extraItems?.map((item) => (
              <div
                key={item.id}
                title={item.label}
                className="node-card-window relative aspect-square overflow-hidden rounded-xl border border-node-port-character/40 bg-node-card-window"
              >
                <Image
                  src={item.url}
                  alt={item.label}
                  fill
                  sizes="120px"
                  className="object-cover"
                  unoptimized
                />
                <span className="absolute left-1 top-1 rounded-full bg-node-port-character/90 px-1.5 py-0.5 text-2xs font-semibold text-node-canvas">
                  {tDossier('gallerySourceCloseup')}
                </span>
              </div>
            ))}

            {!disabled && !isFull ? (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={tDossier('galleryAddAria')}
                    title={tDossier('galleryAddAria')}
                    className="nodrag nopan nowheel flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-node-panel-inner text-node-subtle transition-colors hover:border-node-paint/50 hover:text-node-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-node-paint/60"
                  >
                    <ImagePlus className="size-4" aria-hidden />
                    <span className="text-2xs font-medium">
                      {tDossier('galleryAdd')}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  sideOffset={8}
                  collisionPadding={12}
                  className="w-80 rounded-2xl border-node-panel-inner bg-node-panel/96 p-0 text-node-foreground shadow-node-panel backdrop-blur-xl"
                >
                  {addPanelTabs}
                </PopoverContent>
              </Popover>
            ) : null}
          </div>
        )}
        {assetDialog}
      </div>
    )
  }

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'nodrag nopan nowheel inline-flex h-8 min-w-0 items-center gap-1.5 rounded-2xl border border-node-panel-inner bg-node-panel-soft px-2.5 text-xs font-semibold text-node-muted transition-colors hover:border-node-edge hover:bg-node-panel-inner hover:text-node-foreground disabled:cursor-not-allowed disabled:text-node-subtle',
              references.length > 0 &&
                'border-node-port-character/45 bg-node-port-character/10 text-node-port-character',
            )}
          >
            <ImagePlus className="size-3.5 shrink-0" />
            {t('chip', {
              count: references.length,
              max: effectiveMaxItems,
            })}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="w-80 rounded-2xl border-node-panel-inner bg-node-panel/96 p-0 text-node-foreground shadow-node-panel backdrop-blur-xl"
        >
          <div className="border-b border-node-panel-inner px-4 py-3">
            <p className="text-sm font-semibold text-node-foreground">
              {t('title')}
            </p>
            <p className="mt-1 text-xs leading-5 text-node-muted">
              {disabled ? t('unsupported') : t('hint')}
            </p>
          </div>

          {addPanelTabs}

          <div className="space-y-2 border-t border-node-panel-inner p-3">
            {references.length === 0 ? (
              <p className="rounded-xl bg-node-panel-soft px-3 py-2 text-xs text-node-muted">
                {t('empty')}
              </p>
            ) : null}
            {references.map((reference) => (
              <div
                key={reference.id}
                className="flex gap-2 rounded-xl border border-node-panel-inner bg-node-panel-soft p-2"
              >
                <div className="relative size-10 overflow-hidden rounded-lg bg-node-panel-inner">
                  <Image
                    src={reference.url}
                    alt={reference.name ?? t('title')}
                    fill
                    sizes="40px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <select
                    value={reference.role}
                    onChange={(event) =>
                      updateReference(reference.id, {
                        role: event.target.value as NodeWorkflowReferenceRole,
                      })
                    }
                    className="nodrag nopan nowheel h-7 w-full rounded-xl border border-node-panel-inner bg-node-panel text-xs font-semibold text-node-foreground"
                  >
                    {NODE_STUDIO_REFERENCE_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {t(`roles.${role}`)}
                      </option>
                    ))}
                  </select>
                  {reference.role === NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID ? (
                    <input
                      type="text"
                      value={reference.customLabel ?? ''}
                      onChange={(event) =>
                        updateReference(reference.id, {
                          customLabel: event.target.value || undefined,
                        })
                      }
                      placeholder={t('customLabelPlaceholder')}
                      aria-label={t('customLabelPlaceholder')}
                      className="nodrag nopan nowheel h-7 w-full rounded-xl border border-node-panel-inner bg-node-panel px-2 text-xs text-node-foreground"
                    />
                  ) : null}
                  <input
                    type="range"
                    min={NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.minWeight}
                    max={NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.maxWeight}
                    step={NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.weightStep}
                    value={reference.weight}
                    onChange={(event) =>
                      updateReference(reference.id, {
                        weight: Number(event.target.value),
                      })
                    }
                    aria-label={t('weightLabel')}
                    className="nodrag nopan nowheel w-full accent-node-edge-active"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeReference(reference.id)}
                  aria-label={t('remove')}
                  className="nodrag nopan nowheel flex size-8 items-center justify-center rounded-full text-node-muted transition-colors hover:bg-node-panel-inner hover:text-node-foreground"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {assetDialog}
    </>
  )
}
