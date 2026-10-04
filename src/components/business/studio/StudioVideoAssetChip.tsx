'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import * as Toolbar from '@radix-ui/react-toolbar'
import { useTranslations } from 'next-intl'

import { Paperclip } from '@/components/icons'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import {
  StudioToolPopoverContent,
  StudioToolSurface,
  StudioToolSurfaceTrigger,
  useStudioChipClasses,
} from '@/components/business/studio-shared/primitives/tool-surface'
import { useStudioForm } from '@/contexts/studio-context'
import type { UseStudioVideoAssetsReturn } from '@/hooks/use-studio-video-assets'
import { useVideoModelOptions } from '@/hooks/use-video-model-options'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { cn } from '@/lib/utils'

interface StudioVideoAssetChipProps {
  /** 宿主（提示词区）那一份 —— 与输入框里的素材排同一份。 */
  assets: UseStudioVideoAssetsReturn
  disabled?: boolean
}

interface AddItem {
  key: 'upload' | 'image' | 'video' | 'audio'
  label: string
  /** 非 null = 灰着，写为什么（⛔ 不藏：满了加号灰、不藏，与画布视频卡同一条）。 */
  reason: string | null
}

interface StudioVideoAssetMenuProps {
  /** 宿主那一份 —— 与输入框里的素材排同一份。 */
  assets: UseStudioVideoAssetsReturn
  disabled?: boolean
  /** 落了一项（或交给了素材库 / 音频面板）—— 宿主收起自己的弹层。 */
  onDone: () => void
  /** 素材库挑图 / 挑视频 —— 弹窗由宿主挂在弹层**外面**，收起弹层时它不跟着卸载。 */
  onPickLibrary: (kind: 'image' | 'video') => void
}

/**
 * 「往这一枪里挂东西」的菜单身体：上传图片 / 从素材库选图 / 选参考视频 / 添加音频，
 * 挂满了或这个型号不收的那一项灰着写原因。工具行这颗 chip 与手机输入条的「＋」抽屉
 * 共用（owner 2026-10-02），⛔ 不在宿主里各算一份容量。
 */
export function StudioVideoAssetMenu({
  assets,
  disabled,
  onDone,
  onPickLibrary,
}: StudioVideoAssetMenuProps) {
  const t = useTranslations('StudioVideoSlots')
  const tModels = useTranslations('Models')
  const { state, dispatch } = useStudioForm()
  const { selectedModel } = useVideoModelOptions(state.selectedOptionId ?? '')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { capacity } = assets
  const model = selectedModel
    ? getTranslatedModelLabel(tModels, selectedModel.modelId)
    : ''
  const audios = state.videoAudioRefs.length

  // 图进哪一格按型号定（`addImage`）：收参考 → 参考；不收 → 首帧、尾帧。满没满也按那一格算。
  const intoReferences = capacity.references !== 0
  const imageCount = assets.images.filter((image) =>
    intoReferences ? image.role === 'reference' : image.role !== 'reference',
  ).length
  const imageMax = intoReferences ? capacity.references : capacity.frames
  // 还没选型号时能力表是空的 —— 说「先选型号」，⛔ 不说某个空名字「不收」。
  const pickModel = model ? null : t('menu.pickModel')
  const imageReason =
    pickModel ??
    (!assets.acceptsImages
      ? t('menu.noImage', { model })
      : imageMax !== null && imageCount >= imageMax
        ? t('menu.imagesFull', { count: imageCount, max: imageMax })
        : null)
  const videoReason =
    pickModel ??
    (capacity.videos <= 0
      ? t('menu.noVideo', { model })
      : assets.videos.length >= capacity.videos
        ? t('menu.videosFull', {
            count: assets.videos.length,
            max: capacity.videos,
          })
        : null)
  const audioReason =
    pickModel ??
    (capacity.audios <= 0
      ? t('menu.noAudio', { model })
      : audios >= capacity.audios
        ? t('menu.audiosFull', { count: audios, max: capacity.audios })
        : null)

  const items: AddItem[] = [
    { key: 'upload', label: t('uploadImage'), reason: imageReason },
    { key: 'image', label: t('pickImage'), reason: imageReason },
    { key: 'video', label: t('pickVideo'), reason: videoReason },
    { key: 'audio', label: t('addAudio'), reason: audioReason },
  ]

  const pick = (key: AddItem['key']) => {
    if (key === 'upload') {
      fileInputRef.current?.click()
      return
    }
    onDone()
    if (key === 'audio') dispatch({ type: 'OPEN_PANEL', payload: 'videoAudio' })
    else onPickLibrary(key)
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    onDone()
    // 一张一张传：编号跟着选的顺序走。
    void (async () => {
      for (const file of files) await assets.uploadImageFile(file)
    })()
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled || imageReason !== null}
      />
      <div className="flex flex-col gap-0.5">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            disabled={disabled || item.reason !== null}
            onClick={() => pick(item.key)}
            className="flex min-h-8.5 flex-col items-start justify-center gap-px rounded-lg px-2.5 py-1.5 text-left text-2sm transition-colors duration-fast ease-linear hover:bg-surface-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:text-muted-foreground/70 disabled:hover:bg-transparent motion-reduce:transition-none coarse:min-h-11"
          >
            {item.label}
            {item.reason ? (
              <small className="text-2xs leading-4 text-muted-foreground/70">
                {item.reason}
              </small>
            ) : null}
          </button>
        ))}
      </div>
      <div className="mx-1.5 my-1 h-px bg-border/60" aria-hidden />
      <p className="px-2.5 pt-0.5 pb-1 text-2xs leading-4 text-muted-foreground">
        {t('menu.dropHint')}
      </p>
    </>
  )
}

/** 素材库 —— 一次落一个（与帧槽、参考视频的消费端同形），⛔ 不为统一改成多选。 */
export function StudioVideoAssetLibraryDialog({
  assets,
  kind,
  onClose,
}: {
  assets: UseStudioVideoAssetsReturn
  kind: 'image' | 'video' | null
  onClose: () => void
}) {
  const t = useTranslations('StudioVideoSlots')
  return (
    <AssetSelectorDialog
      open={kind !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      onSelect={(generation) => {
        if (kind) assets.acceptGeneration(generation, kind)
        onClose()
      }}
      title={t('libraryTitle')}
      description={t('libraryDescription')}
      mediaType={kind === 'video' ? 'video' : 'image'}
    />
  )
}

/**
 * 视频台工具行的「素材」chip（owner 2026-09-27 视频台 A）：往这一枪里挂图、参考视频、
 * 音频的唯一一颗按钮。挂上的东西出现在输入框顶上那一排（`StudioVideoAssetRail`），
 * 拖进输入框是同一个入口。
 */
export function StudioVideoAssetChip({
  assets,
  disabled,
}: StudioVideoAssetChipProps) {
  const t = useTranslations('StudioVideoSlots')
  const chip = useStudioChipClasses()
  const [open, setOpen] = useState(false)
  const [picker, setPicker] = useState<'image' | 'video' | null>(null)

  return (
    <>
      <StudioToolSurface open={open} onOpenChange={setOpen}>
        <StudioToolSurfaceTrigger asChild>
          <Toolbar.Button
            type="button"
            disabled={disabled}
            aria-label={t('chipLabel')}
            data-testid="video-asset-add"
            className={cn(chip.trigger, chip.compact, open && chip.open)}
          >
            <Paperclip className="size-4 shrink-0" aria-hidden />
            <span className={chip.compactLabel}>{t('chipLabel')}</span>
          </Toolbar.Button>
        </StudioToolSurfaceTrigger>
        <StudioToolPopoverContent
          side="top"
          align={chip.popoverAlign}
          sideOffset={chip.popoverSideOffset}
          label={t('add')}
          className="w-62 p-1.5"
        >
          <StudioVideoAssetMenu
            assets={assets}
            disabled={disabled}
            onDone={() => setOpen(false)}
            onPickLibrary={setPicker}
          />
        </StudioToolPopoverContent>
      </StudioToolSurface>

      <StudioVideoAssetLibraryDialog
        assets={assets}
        kind={picker}
        onClose={() => setPicker(null)}
      />
    </>
  )
}
