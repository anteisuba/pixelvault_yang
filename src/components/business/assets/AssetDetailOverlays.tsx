'use client'

import { useTranslations } from 'next-intl'

import { Check } from '@/components/icons'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { AssetDetailActions } from '@/hooks/use-asset-detail-actions'
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'

/**
 * 一张素材详情的两层弹出：公开范围（底部抽屉）与音频封面挑图。全屏详情、
 * `/assets/<id>` 整页与就地查看器共用，状态都在 `useAssetDetailActions` 里。
 */
export function AssetDetailOverlays({
  generation,
  actions,
}: {
  generation: GenerationRecord
  actions: AssetDetailActions
}) {
  const t = useTranslations('AssetsPage')
  const {
    currentPublishScope,
    isPublishScopeOpen,
    setIsPublishScopeOpen,
    applyPublishScope,
    isPublishing,
    coverPickerOpen,
    setCoverPickerOpen,
    applyCover,
  } = actions

  return (
    <>
      {generation.outputType === 'AUDIO' && (
        <AssetSelectorDialog
          open={coverPickerOpen}
          onOpenChange={setCoverPickerOpen}
          title={t('detailCoverDialogTitle')}
          description={t('detailCoverDialogDescription')}
          mediaType="image"
          onSelect={(image) => void applyCover(image.url)}
        />
      )}
      <Sheet
        open={isPublishScopeOpen}
        onOpenChange={(nextOpen) => {
          if (!isPublishing) setIsPublishScopeOpen(nextOpen)
        }}
      >
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="mx-auto max-w-lg gap-0 rounded-t-2xl border-border/70 p-0"
        >
          <SheetHeader className="px-5 pt-5 pb-3 text-left">
            <SheetTitle className="text-base">
              {t('detailPublishScopeTitle')}
            </SheetTitle>
            <SheetDescription>
              {t('detailPublishScopeDescription')}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-2 px-5 pb-2">
            <PublishScopeOption
              title={t('detailPublishScopeAsset')}
              description={t('detailPublishScopeAssetDescription')}
              selected={currentPublishScope === 'asset'}
              disabled={isPublishing}
              onClick={() => void applyPublishScope('asset')}
            />
            <PublishScopeOption
              title={t('detailPublishScopeAssetAndPrompt')}
              description={t('detailPublishScopeAssetAndPromptDescription')}
              selected={currentPublishScope === 'assetAndPrompt'}
              disabled={isPublishing}
              onClick={() => void applyPublishScope('assetAndPrompt')}
            />
            <PublishScopeOption
              title={t('detailPublishScopePrivate')}
              description={t('detailPublishScopePrivateDescription')}
              selected={currentPublishScope === 'private'}
              disabled={isPublishing}
              onClick={() => void applyPublishScope('private')}
            />
          </div>
          <SheetFooter className="px-5 pt-2 pb-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsPublishScopeOpen(false)}
              disabled={isPublishing}
            >
              {t('detailPublishScopeCancel')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}

function PublishScopeOption({
  title,
  description,
  selected,
  disabled,
  onClick,
}: {
  title: string
  description: string
  selected: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors disabled:cursor-wait disabled:opacity-70',
        selected
          ? 'border-primary/40 bg-primary/10'
          : 'border-border/70 bg-card hover:bg-muted/40',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border',
          selected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border text-transparent',
        )}
      >
        <Check className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">
          {title}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
          {description}
        </span>
      </span>
    </button>
  )
}
