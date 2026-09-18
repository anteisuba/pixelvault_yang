'use client'
/* eslint-disable @next/next/no-img-element */

import { useState } from 'react'

import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

import { Download, Layers } from '@/components/icons'
import { downloadRemoteAsset } from '@/lib/api-client'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { GenerationLayerRecord } from '@/types'

/**
 * 图层拆分产物的浏览条（进度表 62）。
 *
 * ⚠ **底图不在这个列表里** —— 底图就是详情页正在看的那张图本身（provider 的
 * z_index 0）。这里只列 z_index ≥ 1 的图层，按 zIndex 升序，越靠后越靠上层。
 *
 * 做到「能看 + 能各自下载」为止：⛔ 不做图层编辑、不做叠放预览、不新造一个
 * 图片浏览器 —— 点开一张图层就是打开它自己的 URL，走浏览器原生那一套。
 */
interface GenerationLayerStripProps {
  layers: readonly GenerationLayerRecord[]
  labelClassName?: string
}

export function GenerationLayerStrip({
  layers,
  labelClassName,
}: GenerationLayerStripProps) {
  const t = useTranslations('GenerationLayers')
  const tErrors = useTranslations('Errors')
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  if (layers.length === 0) return null

  const handleDownload = async (layer: GenerationLayerRecord) => {
    setDownloadingId(layer.id)
    try {
      const result = await downloadRemoteAsset(
        layer.url,
        `layer-${layer.zIndex}.png`,
      )
      if (!result.success) {
        toast.error(getApiErrorMessage(tErrors, result, t('downloadFailed')))
      }
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="space-y-2">
      <p className={cn(labelClassName, 'flex items-center gap-1.5')}>
        <Layers className="size-3" />
        {t('sectionLabel', { count: layers.length })}
      </p>
      <ul className="flex flex-col gap-2">
        {layers.map((layer) => (
          <li
            key={layer.id}
            className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/20 p-2"
          >
            {/* 透明通道靠棋盘格底才看得出来，纯色底上一张抠好的图层和没抠的没区别。 */}
            <span className="studio-alpha-checkerboard flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60">
              <img
                src={layer.url}
                alt={layer.name ?? t('layerFallbackName', { z: layer.zIndex })}
                className="max-h-full max-w-full object-contain"
                loading="lazy"
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-foreground">
                {layer.name ?? t('layerFallbackName', { z: layer.zIndex })}
              </span>
              {layer.description ? (
                <span className="block truncate text-xs text-muted-foreground">
                  {layer.description}
                </span>
              ) : null}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              aria-label={t('downloadLayer')}
              disabled={downloadingId === layer.id}
              onClick={() => void handleDownload(layer)}
            >
              <Download className="size-3.5" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
