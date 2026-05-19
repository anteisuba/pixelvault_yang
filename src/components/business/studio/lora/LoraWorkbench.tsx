'use client'

import { Plus, Compass, Library, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { LoraTrainingDialog } from '@/components/business/LoraTrainingDialog'
import { LoraAssetCard } from '@/components/business/studio/lora/LoraAssetCard'
import { useLoraAssets } from '@/hooks/use-lora-assets'

/**
 * /studio/lora — the LoRA library + training entry point.
 *
 * Three regions, top-to-bottom:
 *
 *   1. Hero CTA — "Train a new LoRA" — opens the existing training dialog
 *   2. My LoRAs — owned + curated. Each card has a "Use" button (push to
 *      ActiveLoraStack) and a "Make public" toggle so the user can share.
 *   3. Discover — public LoRAs from other users. Use only — no toggle.
 *
 * Generation itself doesn't happen here: clicking "Use" pushes the LoRA
 * onto the session stack and surfaces a toast that links to /studio/image.
 * The ActiveLoraBar (mounted by the studio layout) follows the user there.
 */
export function LoraWorkbench() {
  const t = useTranslations('LoraWorkbench')
  const {
    myAssets,
    discoverAssets,
    isLoadingMine,
    isLoadingDiscover,
    refresh,
    setVisibility,
  } = useLoraAssets()

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-8 sm:px-6 lg:px-8">
      {/* ── Hero / Train CTA ─────────────────────────────────────── */}
      <section className="overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl space-y-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              {t('heroTitle')}
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t('heroSubtitle')}
            </p>
          </div>
          <LoraTrainingDialog
            trigger={
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-colors hover:bg-foreground/85"
              >
                <Plus className="size-4" aria-hidden />
                {t('trainCTA')}
              </button>
            }
          />
        </div>
      </section>

      {/* ── My LoRAs ──────────────────────────────────────────────── */}
      <section className="space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Library className="size-5 text-muted-foreground" aria-hidden />
            <h2 className="font-display text-xl font-semibold tracking-tight">
              {t('myLorasTitle')}
            </h2>
            <span className="text-xs text-muted-foreground">
              ({myAssets.length})
            </span>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('refresh')}
          </button>
        </header>

        {isLoadingMine ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden />
          </div>
        ) : myAssets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">{t('myLorasEmpty')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {myAssets.map((asset) => (
              <LoraAssetCard
                key={asset.id}
                asset={asset}
                showVisibilityToggle={asset.isOwn}
                onVisibilityChange={setVisibility}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Discover ─────────────────────────────────────────────── */}
      <section className="space-y-4">
        <header className="flex items-center gap-2">
          <Compass className="size-5 text-muted-foreground" aria-hidden />
          <h2 className="font-display text-xl font-semibold tracking-tight">
            {t('discoverTitle')}
          </h2>
          <span className="text-xs text-muted-foreground">
            ({discoverAssets.length})
          </span>
        </header>
        <p className="text-xs text-muted-foreground">{t('discoverHint')}</p>

        {isLoadingDiscover ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden />
          </div>
        ) : discoverAssets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {t('discoverEmpty')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {discoverAssets.map((asset) => (
              <LoraAssetCard key={asset.id} asset={asset} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
