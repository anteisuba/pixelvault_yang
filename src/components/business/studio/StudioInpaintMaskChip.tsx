'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

import { getModelById } from '@/constants/models'
import { novelAiInpaintFallsBack } from '@/constants/novelai'
import { getCapabilityConfig } from '@/constants/provider-capabilities'
import { useStudioData, useStudioForm } from '@/contexts/studio-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { cn } from '@/lib/utils'
import type { AdvancedParams } from '@/types'
import { StudioInpaintEditor } from '@/components/business/studio/StudioInpaintEditor'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'

/**
 * StudioInpaintMaskChip —— 遮罩重绘的入口，长在参考图那一栏旁边。
 *
 * ⚠ 判据是**能力表**（`inpaint`），⛔ 组件里没有模型名分支 —— 与专属 chip 行
 * 同一条规矩。模型没声明 `inpaint` 就整颗不渲染（不支持不渲染）；声明了但底图
 * 不是恰好一张时画出来但点不动，并在 title 里说清为什么（⛔ 不隐藏，隐藏了用户
 * 不知道这个模型有这档能力）。
 *
 * 画布复用编辑域那块 `StudioInpaintEditor`（画笔 / 拉框 / 橡皮 / 撤销 / 清空，
 * 导出与源图逐像素同尺寸的黑白 PNG）；这里把它那条重绘指令关掉 —— 工作台的
 * 提示词就是这一枪的提示词。
 */
export function StudioInpaintMaskChip({ disabled }: { disabled?: boolean }) {
  const t = useTranslations('StudioInpaintMask')
  const { state, dispatch } = useStudioForm()
  const { imageUpload } = useStudioData()
  const { selectedModel } = useImageModelOptions()
  const [open, setOpen] = useState(false)
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  )

  const supportsInpaint = selectedModel
    ? getCapabilityConfig(
        selectedModel.adapterType,
        selectedModel.modelId,
      ).capabilities.includes('inpaint')
    : false

  const references = imageUpload.referenceImages
  const sourceImage = references.length === 1 ? references[0] : undefined
  const mask = state.advancedParams.inpaintMask

  const setMask = useCallback(
    (next: string | undefined) => {
      const params: AdvancedParams = { ...state.advancedParams }
      if (next) params.inpaintMask = next
      else delete params.inpaintMask
      dispatch({ type: 'SET_ADVANCED_PARAMS', payload: params })
    },
    [dispatch, state.advancedParams],
  )

  // 底图换掉 / 拿掉之后那张遮罩就不再对应任何东西了 —— 留着它会让下一枪带着
  // 一张对不上的遮罩跑，⛔ 不能只是不显示。
  useEffect(() => {
    if (!mask) return
    if (!sourceImage || !supportsInpaint) setMask(undefined)
  }, [mask, setMask, sourceImage, supportsInpaint])

  useEffect(() => {
    if (!open || !sourceImage) return
    const image = new Image()
    image.onload = () =>
      setSize({ width: image.naturalWidth, height: image.naturalHeight })
    image.src = sourceImage
    return () => {
      image.onload = null
    }
  }, [open, sourceImage])

  if (!selectedModel || !supportsInpaint) return null

  const externalModelId = getModelById(selectedModel.modelId)?.externalModelId
  const fallsBack = novelAiInpaintFallsBack(externalModelId)
  const unavailable = !sourceImage
  const reason = unavailable ? t('needsOneReference') : undefined

  return (
    <>
      <button
        type="button"
        disabled={disabled || unavailable}
        title={reason ?? (fallsBack ? t('fallbackHint') : undefined)}
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-2sm transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none',
          unavailable
            ? 'border-border bg-muted text-muted-foreground'
            : mask
              ? 'border-foreground bg-foreground text-background'
              : 'border-border bg-background text-foreground',
        )}
      >
        {mask ? t('labelSet') : t('label')}
      </button>
      {mask ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setMask(undefined)}
          className="text-2xs text-muted-foreground underline underline-offset-2 disabled:pointer-events-none"
        >
          {t('clear')}
        </button>
      ) : null}
      <ResponsiveDialog open={open} onOpenChange={setOpen}>
        <ResponsiveDialogContent className="sm:max-w-4xl">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t('title')}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {fallsBack ? t('fallbackHint') : t('description')}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          {sourceImage && size ? (
            <StudioInpaintEditor
              imageUrl={sourceImage}
              imageWidth={size.width}
              imageHeight={size.height}
              showPrompt={false}
              onApply={(maskDataUrl) => {
                setMask(maskDataUrl)
                setOpen(false)
              }}
              onCancel={() => setOpen(false)}
            />
          ) : null}
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  )
}
