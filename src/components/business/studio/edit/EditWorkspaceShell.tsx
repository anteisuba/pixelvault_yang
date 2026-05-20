'use client'
/* eslint-disable @next/next/no-img-element */

import {
  AlertCircle,
  ArrowLeft,
  Clipboard,
  ImageIcon,
  Loader2,
  Upload,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { USER_UPLOAD_ACCEPTED_MIME_TYPES } from '@/constants/uploads'
import { ImageEditProvider, useImageEdit } from '@/contexts/image-edit-context'
import { Link, usePathname } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { Button } from '@/components/ui/button'

/**
 * Header + banner + source preview card + asset dialog + hidden file input.
 * Pinned at the top of every /studio/edit/* page so the source state survives
 * task-route navigation and the user always sees what they're working on.
 */
function EditShellInner({ children }: { children: React.ReactNode }) {
  const t = useTranslations('StudioImageEdit')
  // `usePathname` from next-intl strips the locale prefix, so /zh/studio/edit
  // and /en/studio/edit both surface as /studio/edit. Overview = exactly that;
  // anything under /studio/edit/<task> is a task subpage with a tools panel.
  const pathname = usePathname()
  const isTaskPage = /^\/studio\/edit\/[^/]+/.test(pathname)
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
        {isTaskPage ? (
          <Link
            href="/studio/edit"
            className="-mx-2 inline-flex h-11 items-center gap-2 self-start rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            {t('placeholder.backToGrid')}
          </Link>
        ) : null}

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

        <div
          className={cn(
            'gap-4',
            isTaskPage
              ? 'grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start'
              : 'flex flex-col',
          )}
        >
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
            <div
              className={cn(
                'flex items-center justify-center bg-muted/40 p-4',
                // Task subpages keep the tall canvas so the user can actually
                // see their image while editing. The /edit overview shrinks
                // the empty state to a single compact row so the task grid
                // sits above the fold.
                displayImage || isTaskPage ? 'min-h-96' : 'min-h-32',
              )}
            >
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
              ) : isTaskPage ? (
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
              ) : (
                // Overview-only compact row: actions inline, no big icon block.
                <div className="flex w-full flex-col items-center gap-2 sm:flex-row sm:justify-center">
                  <p className="text-sm text-muted-foreground">
                    {t('emptyStateTitle')}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => setAssetPickerOpen(true)}
                      disabled={isBusy}
                    >
                      <ImageIcon className="size-3.5" />
                      {t('chooseFromAssets')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isBusy}
                    >
                      {isUploadingSource ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Upload className="size-3.5" />
                      )}
                      {t('uploadSource')}
                    </Button>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/80">
                    <Clipboard className="size-3" />
                    ⌘V
                  </span>
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

          <div className="space-y-4">{children}</div>
        </div>
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
