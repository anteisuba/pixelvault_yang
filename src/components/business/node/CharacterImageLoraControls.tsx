'use client'

import { useCallback, useMemo, useState } from 'react'
import { KeyRound, Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  NODE_STUDIO_CHARACTER_IMAGE_LORAS,
  NODE_STUDIO_PLACEHOLDER_TOAST,
} from '@/constants/node-studio'
import {
  getCapabilityConfig,
  hasCapability,
} from '@/constants/provider-capabilities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLoraAssets } from '@/hooks/use-lora-assets'
import { cn } from '@/lib/utils'
import type {
  LoraAssetRecord,
  NodeWorkflowLoraSelection,
  NodeWorkflowModelSelection,
} from '@/types'

interface CharacterImageLoraControlsProps {
  value: NodeWorkflowLoraSelection[] | undefined
  model: NodeWorkflowModelSelection | undefined
  onChange(value: NodeWorkflowLoraSelection[]): void
  onInsertTrigger(triggerWord: string): void
}

function createCustomLoraId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `custom-lora-${Date.now()}`
}

function assetToSelection(asset: LoraAssetRecord): NodeWorkflowLoraSelection {
  return {
    assetId: asset.id,
    styleCode: asset.styleCode,
    name: asset.name,
    loraUrl: asset.loraUrl,
    triggerWord: asset.triggerWord,
    type: asset.type,
    baseModelFamily: asset.baseModelFamily,
    scale: asset.defaultScale,
  }
}

function getEffectiveMaxLoras(
  model: NodeWorkflowModelSelection | undefined,
): number {
  if (!model) {
    return NODE_STUDIO_CHARACTER_IMAGE_LORAS.maxItems
  }

  const config = getCapabilityConfig(model.adapterType, model.modelId)
  return Math.min(
    config.maxLoras ?? NODE_STUDIO_CHARACTER_IMAGE_LORAS.maxItems,
    NODE_STUDIO_CHARACTER_IMAGE_LORAS.maxItems,
  )
}

function isSupported(model: NodeWorkflowModelSelection | undefined): boolean {
  return model ? hasCapability(model.adapterType, 'lora', model.modelId) : false
}

export function CharacterImageLoraControls({
  value,
  model,
  onChange,
  onInsertTrigger,
}: CharacterImageLoraControlsProps) {
  const t = useTranslations('StudioNode.characterImage.lora')
  const selectedLoras = useMemo(() => value ?? [], [value])
  const selectedIds = useMemo(
    () => new Set(selectedLoras.map((lora) => lora.assetId)),
    [selectedLoras],
  )
  const {
    trainedAssets,
    favoriteAssets,
    discoverAssets,
    isLoadingMine,
    isLoadingDiscover,
    errorMine,
  } = useLoraAssets()
  const [customUrl, setCustomUrl] = useState('')
  const maxLoras = getEffectiveMaxLoras(model)
  const supportsLora = isSupported(model)
  const isFull = selectedLoras.length >= maxLoras

  const toggleAsset = useCallback(
    (asset: LoraAssetRecord) => {
      if (selectedIds.has(asset.id)) {
        onChange(selectedLoras.filter((lora) => lora.assetId !== asset.id))
        return
      }

      if (isFull) {
        toast.info(t('maxReached', { max: maxLoras }), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }

      onChange([...selectedLoras, assetToSelection(asset)])
    },
    [isFull, maxLoras, onChange, selectedIds, selectedLoras, t],
  )

  const updateScale = useCallback(
    (assetId: string, scale: number) => {
      onChange(
        selectedLoras.map((lora) =>
          lora.assetId === assetId ? { ...lora, scale } : lora,
        ),
      )
    },
    [onChange, selectedLoras],
  )

  const removeLora = useCallback(
    (assetId: string) => {
      onChange(selectedLoras.filter((lora) => lora.assetId !== assetId))
    },
    [onChange, selectedLoras],
  )

  const handleImportUrl = useCallback(() => {
    const trimmedUrl = customUrl.trim()
    if (!trimmedUrl) {
      return
    }

    try {
      const parsed = new URL(trimmedUrl)
      if (parsed.protocol !== 'https:') {
        throw new Error('LoRA URL must use HTTPS')
      }
    } catch {
      toast.error(t('invalidUrl'), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
      return
    }

    if (isFull) {
      toast.info(t('maxReached', { max: maxLoras }), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
      return
    }

    onChange([
      ...selectedLoras,
      {
        assetId: createCustomLoraId(),
        name: t('customName'),
        loraUrl: trimmedUrl,
        type: 'style',
        baseModelFamily: NODE_STUDIO_CHARACTER_IMAGE_LORAS.customBaseFamily,
        scale: NODE_STUDIO_CHARACTER_IMAGE_LORAS.defaultScale,
      },
    ])
    setCustomUrl('')
  }, [customUrl, isFull, maxLoras, onChange, selectedLoras, t])

  const renderAssetList = (assets: LoraAssetRecord[], loading: boolean) => {
    if (loading) {
      return (
        <div className="flex items-center gap-2 rounded-xl bg-node-panel-soft px-3 py-3 text-xs text-node-muted">
          <Spinner size="sm" />
          {t('loading')}
        </div>
      )
    }

    if (assets.length === 0) {
      return (
        <p className="rounded-xl bg-node-panel-soft px-3 py-3 text-xs text-node-muted">
          {t('empty')}
        </p>
      )
    }

    return (
      <div className="space-y-2">
        {assets.map((asset) => {
          const selected = selectedIds.has(asset.id)
          return (
            <button
              key={asset.id}
              type="button"
              onClick={() => toggleAsset(asset)}
              className={cn(
                'nodrag nopan nowheel flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors',
                selected
                  ? 'border-node-port-character/50 bg-node-port-character/10'
                  : 'border-node-panel-inner bg-node-panel-soft hover:border-node-port-character/40 hover:bg-node-panel-inner',
              )}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-node-panel-inner text-node-muted">
                <SlidersHorizontal className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-node-foreground">
                  {asset.name}
                </span>
                <span className="block truncate text-2xs text-node-muted">
                  {t('assetMeta', {
                    type: t(`types.${asset.type}`),
                    family: asset.baseModelFamily,
                  })}
                </span>
              </span>
              {selected ? (
                <span className="rounded-full bg-node-port-character/15 px-2 py-1 text-2xs font-semibold text-node-port-character">
                  {t('selected')}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={!supportsLora}
          className={cn(
            'nodrag nopan nowheel inline-flex h-8 min-w-0 items-center gap-1.5 rounded-2xl border border-node-panel-inner bg-node-panel-soft px-2.5 text-xs font-semibold text-node-muted transition-colors hover:border-node-edge hover:bg-node-panel-inner hover:text-node-foreground disabled:cursor-not-allowed disabled:text-node-subtle',
            selectedLoras.length > 0 && 'text-node-foreground',
          )}
          title={
            !supportsLora ? t(model ? 'unsupported' : 'noModel') : t('title')
          }
        >
          <SlidersHorizontal className="size-3.5 shrink-0" />
          {t('chip', {
            count: selectedLoras.length,
            max: maxLoras,
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
            {t('hint', { max: maxLoras })}
          </p>
        </div>

        <Tabs defaultValue="mine" className="p-3">
          <TabsList className="grid h-9 grid-cols-3 rounded-2xl bg-node-panel-soft p-1">
            <TabsTrigger
              value="mine"
              className="rounded-xl text-xs data-[state=active]:bg-node-foreground data-[state=active]:text-node-canvas"
            >
              {t('mineTab')}
            </TabsTrigger>
            <TabsTrigger
              value="discover"
              className="rounded-xl text-xs data-[state=active]:bg-node-foreground data-[state=active]:text-node-canvas"
            >
              {t('discoverTab')}
            </TabsTrigger>
            <TabsTrigger
              value="url"
              className="rounded-xl text-xs data-[state=active]:bg-node-foreground data-[state=active]:text-node-canvas"
            >
              {t('urlTab')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="mine" className="mt-3 max-h-56 overflow-y-auto">
            {errorMine ? (
              <p className="mb-2 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-100">
                {errorMine}
              </p>
            ) : null}
            {renderAssetList(
              [...trainedAssets, ...favoriteAssets],
              isLoadingMine,
            )}
          </TabsContent>
          <TabsContent
            value="discover"
            className="mt-3 max-h-56 overflow-y-auto"
          >
            {renderAssetList(discoverAssets, isLoadingDiscover)}
          </TabsContent>
          <TabsContent value="url" className="mt-3 space-y-2">
            <Input
              value={customUrl}
              onChange={(event) => setCustomUrl(event.target.value)}
              placeholder={t('urlPlaceholder')}
              className="nodrag nopan nowheel h-9 rounded-2xl border-node-panel-inner bg-node-panel-soft text-xs text-node-foreground placeholder:text-node-subtle"
            />
            <Button
              type="button"
              onClick={handleImportUrl}
              disabled={isFull}
              className="nodrag nopan nowheel h-9 w-full rounded-2xl bg-node-foreground text-xs font-semibold text-node-canvas hover:bg-node-foreground/90 disabled:bg-node-panel-inner disabled:text-node-muted"
            >
              <Plus className="mr-2 size-3.5" />
              {t('importUrl')}
            </Button>
          </TabsContent>
        </Tabs>

        <div className="space-y-2 border-t border-node-panel-inner p-3">
          {selectedLoras.length === 0 ? (
            <p className="rounded-xl bg-node-panel-soft px-3 py-2 text-xs text-node-muted">
              {t('noneSelected')}
            </p>
          ) : null}
          {selectedLoras.map((lora) => (
            <div
              key={lora.assetId}
              className="rounded-xl border border-node-panel-inner bg-node-panel-soft p-2"
            >
              <div className="flex items-center gap-2">
                <KeyRound className="size-3.5 shrink-0 text-node-muted" />
                <p className="min-w-0 flex-1 truncate text-xs font-semibold text-node-foreground">
                  {lora.name}
                </p>
                <button
                  type="button"
                  onClick={() => removeLora(lora.assetId)}
                  aria-label={t('remove')}
                  className="nodrag nopan nowheel flex size-7 items-center justify-center rounded-full text-node-muted hover:bg-node-panel-inner hover:text-node-foreground"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="range"
                  min={NODE_STUDIO_CHARACTER_IMAGE_LORAS.minScale}
                  max={NODE_STUDIO_CHARACTER_IMAGE_LORAS.maxScale}
                  step={NODE_STUDIO_CHARACTER_IMAGE_LORAS.scaleStep}
                  value={lora.scale}
                  onChange={(event) =>
                    updateScale(lora.assetId, Number(event.target.value))
                  }
                  aria-label={t('scaleLabel')}
                  className="nodrag nopan nowheel min-w-0 flex-1 accent-node-edge-active"
                />
                <span className="w-8 text-right text-xs font-semibold text-node-foreground">
                  {lora.scale.toFixed(2)}
                </span>
              </div>
              {lora.triggerWord ? (
                <button
                  type="button"
                  onClick={() => onInsertTrigger(lora.triggerWord ?? '')}
                  className="nodrag nopan nowheel mt-2 rounded-full border border-node-port-character/30 bg-node-port-character/10 px-2.5 py-1 text-2xs font-semibold text-node-port-character hover:bg-node-port-character/15"
                >
                  {t('insertTrigger')}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
