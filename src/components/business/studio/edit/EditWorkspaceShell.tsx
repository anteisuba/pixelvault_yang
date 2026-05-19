'use client'
/* eslint-disable @next/next/no-img-element */

import {
  AlertCircle,
  Clipboard,
  ImageIcon,
  Loader2,
  Upload,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { USER_UPLOAD_ACCEPTED_MIME_TYPES } from '@/constants/uploads'
import { ImageEditProvider, useImageEdit } from '@/contexts/image-edit-context'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { Button } from '@/components/ui/button'

/**
 * Header + banner + source preview card + asset dialog + hidden file input.
 * Pinned at the top of every /studio/edit/* page so the source state survives
 * task-route navigation and the user always sees what they're working on.
 */
function EditShellInner({ children }: { children: React.ReactNode }) {
  const t = useTranslations('StudioImageEdit')
  const {
    source,
    bannerError,
    maskEditError,
    isUploadingSource,
    isBusy,
    assetPickerOpen,
    result,
    hasSource,
    displayImage,
    displayWidth,
    displayHeight,
    setBannerError,
    setAssetPickerOpen,
    setSourceFromGeneration,
    handleFileChange,
    handlePaste,
    updateLoadedDimensions,
    fileInputRef,
    pasteTargetRef,
  } = useImageEdit()

  const activeError = maskEditError ?? bannerError

  return (
    <div className="min-h-svh bg-background px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        {activeError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span className="flex-1">{activeError}</span>
            <button
              type="button"
              onClick={() => setBannerError(null)}
              className="text-xs underline-offset-2 hover:underline"
              aria-label={t('dismissError')}
            >
              {t('dismissError')}
            </button>
          </div>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          accept={USER_UPLOAD_ACCEPTED_MIME_TYPES.join(',')}
          className="hidden"
          onChange={handleFileChange}
          disabled={isUploadingSource || isBusy}
        />

        <section
          ref={pasteTargetRef}
          tabIndex={0}
          onPaste={handlePaste}
          className="overflow-hidden rounded-xl border border-border/70 bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {result ? t('resultTitle') : t('sourceTitle')}
              </h2>
              {hasSource ? (
                <p className="text-xs text-muted-foreground">
                  {source?.generationId
                    ? t('sourceBadgeGeneration')
                    : t('sourceBadgeExternal')}
                </p>
              ) : null}
            </div>
            {hasSource ? (
              <p className="text-xs tabular-nums text-muted-foreground">
                {displayWidth} × {displayHeight}
              </p>
            ) : null}
          </div>
          <div className="flex min-h-96 items-center justify-center bg-muted/40 p-4">
            {displayImage ? (
              <img
                src={displayImage}
                alt={result ? t('resultAlt') : t('sourceAlt')}
                onLoad={updateLoadedDimensions}
                className="max-h-[70svh] max-w-full rounded-lg object-contain"
                style={{
                  aspectRatio: `${displayWidth} / ${displayHeight}`,
                }}
              />
            ) : (
              <div className="w-full max-w-md text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ImageIcon className="size-5" />
                </div>
                <p className="mt-3 text-base font-semibold text-foreground">
                  {t('emptyStateTitle')}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('emptyStateSubtitle')}
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-center rounded-lg"
                    onClick={() => setAssetPickerOpen(true)}
                    disabled={isBusy}
                  >
                    <ImageIcon className="size-4" />
                    <span>{t('chooseFromAssets')}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-center rounded-lg"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isBusy}
                  >
                    {isUploadingSource ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Upload className="size-4" />
                    )}
                    <span>{t('uploadSource')}</span>
                  </Button>
                </div>
                <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                  <Clipboard className="size-3" />
                  {t('pasteShortcut')}
                </p>
              </div>
            )}
          </div>
          {hasSource ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 bg-card/60 px-4 py-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Clipboard className="size-3" />
                {t('pasteShortcut')}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setAssetPickerOpen(true)}
                  disabled={isBusy}
                >
                  {t('chooseFromAssets')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isBusy}
                >
                  {isUploadingSource ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Upload className="size-3" />
                  )}
                  {t('uploadSource')}
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        {children}
      </div>

      <AssetSelectorDialog
        open={assetPickerOpen}
        onOpenChange={setAssetPickerOpen}
        onSelect={(generation) => {
          if (generation.outputType !== 'IMAGE') return
          setSourceFromGeneration(generation)
        }}
        title={t('chooseFromAssets')}
        description={t('sourcePickerDescription')}
        mediaType="image"
      />
    </div>
  )
}

export function EditWorkspaceShell({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ImageEditProvider>
      <EditShellInner>{children}</EditShellInner>
    </ImageEditProvider>
  )
}
