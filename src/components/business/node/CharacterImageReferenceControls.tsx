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

interface CharacterImageReferenceControlsProps {
  value: NodeWorkflowReferenceAsset[] | undefined
  maxItems: number
  onChange(value: NodeWorkflowReferenceAsset[]): void
}

function createReferenceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `reference-${Date.now()}`
}

function createReferenceAsset(
  url: string,
  source: NodeWorkflowReferenceAsset['source'],
  sourceId?: string,
  name?: string,
): NodeWorkflowReferenceAsset {
  return {
    id: createReferenceId(),
    url,
    role: NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.defaultRole,
    weight: NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.defaultWeight,
    source,
    sourceId,
    name,
  }
}

export function CharacterImageReferenceControls({
  value,
  maxItems,
  onChange,
}: CharacterImageReferenceControlsProps) {
  const t = useTranslations('StudioNode.characterImage.reference')
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

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'nodrag nopan nowheel inline-flex h-8 min-w-0 items-center gap-1.5 rounded-2xl border border-node-panel-inner bg-node-panel-soft px-2.5 text-xs font-semibold text-node-muted transition-colors hover:border-node-amber/40 hover:bg-node-panel-inner hover:text-node-foreground disabled:cursor-not-allowed disabled:text-node-subtle',
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
                className="nodrag nopan nowheel flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-node-panel-inner bg-node-panel-soft px-4 text-center text-node-muted transition-colors hover:border-node-amber/40 hover:text-node-foreground disabled:cursor-not-allowed disabled:text-node-subtle"
              >
                {isUploading ? (
                  <Loader2 className="size-5 animate-spin text-node-amber" />
                ) : (
                  <Upload className="size-5 text-node-amber" />
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
                className="nodrag nopan nowheel h-10 w-full rounded-2xl border border-node-panel-inner bg-node-panel-soft text-xs font-semibold text-node-foreground hover:border-node-amber/40 hover:bg-node-panel-inner disabled:text-node-subtle"
              >
                <Library className="mr-2 size-4 text-node-amber" />
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
                className="nodrag nopan nowheel flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-node-panel-inner bg-node-panel-soft px-4 text-center text-node-muted outline-none transition-colors hover:border-node-amber/40 hover:text-node-foreground focus-visible:border-node-amber/60 focus-visible:ring-2 focus-visible:ring-node-amber/20"
              >
                {isUploading ? (
                  <Loader2 className="size-5 animate-spin text-node-amber" />
                ) : (
                  <Clipboard className="size-5 text-node-amber" />
                )}
                <span className="text-xs font-semibold">
                  {isFull ? t('maxReached') : t('pasteTitle')}
                </span>
                <span className="text-2xs">{t('pasteMeta')}</span>
              </div>
            </TabsContent>
          </Tabs>

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
    </>
  )
}
