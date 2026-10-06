'use client'

import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { ImagePlus, Upload } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useImageUpload } from '@/hooks/use-image-upload'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import {
  StudioImageEditStage,
  type StudioImageEditTarget,
} from './StudioImageEditStage'

function ImageEditSourcePicker({
  onSelect,
  references,
}: {
  onSelect: (target: StudioImageEditTarget) => void
  references: readonly { url: string }[]
}) {
  const t = useTranslations('StudioImageEdit')
  const {
    referenceImage,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    openFilePicker,
    isUploading,
    fileInputRef,
    handleInputChange,
  } = useImageUpload()
  const [libraryOpen, setLibraryOpen] = useState(false)
  useEffect(() => {
    if (referenceImage) onSelect({ url: referenceImage })
  }, [onSelect, referenceImage])

  return (
    <div
      className="m-auto flex w-full max-w-xl flex-col items-center gap-4 py-8 text-center"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <p className="text-sm text-muted-foreground">{t('chooseSourceHint')}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          type="button"
          onClick={openFilePicker}
          disabled={isUploading}
          className="rounded-full"
        >
          {isUploading ? <Spinner size="sm" /> : <Upload className="size-4" />}
          {t('uploadSource')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setLibraryOpen(true)}
          disabled={isUploading}
          className="rounded-full"
        >
          <ImagePlus className="size-4" />
          {t('chooseSource')}
        </Button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label={t('uploadSource')}
        onChange={handleInputChange}
      />
      {references.length ? (
        <div className="flex max-w-full flex-wrap justify-center gap-2">
          {references.map((reference, index) => (
            <button
              key={`${index}:${reference.url}`}
              type="button"
              disabled={isUploading}
              aria-label={t('stageEditingReference', {
                index: index + 1,
                total: references.length,
              })}
              className="size-20 overflow-hidden rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() =>
                onSelect({
                  url: reference.url,
                  referenceIndex: index,
                  referenceTotal: references.length,
                })
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={reference.url}
                alt=""
                className="size-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
      <AssetSelectorDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        mediaType="image"
        title={t('chooseSource')}
        description={t('chooseSourceHint')}
        onSelect={(generation) =>
          onSelect({ url: generation.url, generationId: generation.id })
        }
      />
    </div>
  )
}

export function StudioImageEditWorkspace({
  active,
  target,
  sessionId,
  onSelect,
  onTargetChange,
  onBack,
  onChangeSource,
  onRunStateChange,
  children,
  references,
}: {
  active: boolean
  target: StudioImageEditTarget | null
  sessionId: number
  onSelect: (target: StudioImageEditTarget) => void
  onTargetChange: (target: StudioImageEditTarget) => void
  onBack: () => void
  onChangeSource: () => void
  onRunStateChange: (state: 'running' | 'success' | 'error') => void
  children: (slots: {
    stage: ReactNode
    params: ReactNode
    composer: ReactNode
  }) => ReactNode
  references: readonly { url: string }[]
}) {
  const [composerContainer, setComposerContainer] =
    useState<HTMLDivElement | null>(null)
  const mobile = useIsMobile()
  useLayoutEffect(() => {
    const layout = composerContainer?.closest<HTMLElement>('.studio-layout-v2')
    // 量的是外面那条固定条（含上下留白与安全区），不是里面那张卡。
    const bar = composerContainer?.parentElement
    if (!active || !mobile || !bar || !layout) return
    const update = () =>
      layout.style.setProperty(
        '--studio-mobile-composer-height',
        `${Math.ceil(bar.getBoundingClientRect().height)}px`,
      )
    update()
    const observer = new ResizeObserver(update)
    observer.observe(bar)
    return () => {
      observer.disconnect()
      layout.style.removeProperty('--studio-mobile-composer-height')
    }
  }, [active, composerContainer, mobile])
  const body = target ? (
    <StudioImageEditStage
      key={sessionId}
      target={target}
      onBack={onBack}
      onTargetChange={onTargetChange}
      onChangeSource={onChangeSource}
      onRunStateChange={onRunStateChange}
      composerContainer={composerContainer}
      active={active}
    />
  ) : (
    <ImageEditSourcePicker onSelect={onSelect} references={references} />
  )

  return children({
    stage:
      active || target ? (
        <div
          className={active ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
          aria-hidden={!active}
        >
          {body}
        </div>
      ) : null,
    params:
      !mobile && target ? (
        <div
          ref={setComposerContainer}
          className={active ? undefined : 'hidden'}
        />
      ) : null,
    composer:
      mobile && target ? (
        <div
          className={cn(
            'studio-mobile-composer studio-tags-mobile-composer fixed inset-x-0 z-40 flex min-h-0 flex-col bg-surface-workbench px-2.5 pt-2.5',
            !active && 'hidden',
          )}
        >
          <div
            ref={setComposerContainer}
            className="min-h-0 overflow-y-auto rounded-2xl bg-card px-3 pt-2.5 pb-2 shadow-float"
          />
        </div>
      ) : null,
  })
}
