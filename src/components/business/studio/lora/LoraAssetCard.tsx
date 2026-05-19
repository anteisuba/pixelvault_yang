'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Palette, Globe2, Lock, Sparkles, Copy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { Switch } from '@/components/ui/switch'
import { useActiveLoraStack } from '@/hooks/use-active-lora-stack'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'
import type { LoraAssetRecord } from '@/types'

interface LoraAssetCardProps {
  asset: LoraAssetRecord
  /** Show the "Make public" toggle. Only sensible on the user's own cards. */
  showVisibilityToggle?: boolean
  /** Called when the toggle flips — should return whether the API succeeded. */
  onVisibilityChange?: (assetId: string, isPublic: boolean) => Promise<boolean>
}

/**
 * Single LoRA tile shown in `/studio/lora`.
 *
 * Primary action — "Use" — pushes the asset onto the session-wide
 * ActiveLoraStack (Week 1) and navigates the user to `/studio/image`
 * where the bar follows them. This is the bridge between the LoRA
 * library and the generation surfaces.
 */
export function LoraAssetCard({
  asset,
  showVisibilityToggle = false,
  onVisibilityChange,
}: LoraAssetCardProps) {
  const t = useTranslations('LoraWorkbench')
  const router = useRouter()
  const stack = useActiveLoraStack()
  const [isToggling, setIsToggling] = useState(false)

  const alreadyInStack = stack.items.some(
    (entry) => entry.asset.id === asset.id,
  )

  const handleUse = useCallback(() => {
    if (!alreadyInStack) {
      stack.push(asset)
    }
    toast.success(t('addedToStack', { name: asset.name }), {
      action: {
        label: t('goToStudio'),
        onClick: () => router.push(ROUTES.STUDIO_IMAGE),
      },
    })
  }, [alreadyInStack, asset, stack, router, t])

  const handleCopyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(asset.styleCode)
      toast.success(t('codeCopied'))
    } catch {
      toast.error(t('codeCopyFailed'))
    }
  }, [asset.styleCode, t])

  const handleVisibilityToggle = useCallback(
    async (next: boolean) => {
      if (!onVisibilityChange || isToggling) return
      setIsToggling(true)
      try {
        await onVisibilityChange(asset.id, next)
      } finally {
        setIsToggling(false)
      }
    },
    [asset.id, isToggling, onVisibilityChange],
  )

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-md">
      <div className="relative aspect-[4/5] overflow-hidden bg-muted">
        {asset.coverImageUrl ? (
          // Plain <img> is fine here — assets are user/curated content
          // and don't benefit from next/image's optimization pass.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.coverImageUrl}
            alt={asset.name}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <Palette className="size-12 opacity-30" strokeWidth={1.25} />
          </div>
        )}
        <span
          className={cn(
            'absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide backdrop-blur',
            asset.type === 'style'
              ? 'bg-purple-500/30 text-white'
              : 'bg-emerald-500/30 text-white',
          )}
        >
          {asset.type === 'style' ? t('typeStyle') : t('typeSubject')}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <div>
          <h3 className="line-clamp-1 font-medium text-foreground">
            {asset.name}
          </h3>
          <p className="line-clamp-1 text-xs text-muted-foreground">
            <span className="font-mono">{asset.triggerWord}</span>
          </p>
        </div>

        <div className="mt-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleUse}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              alreadyInStack
                ? 'bg-muted text-muted-foreground'
                : 'bg-foreground text-background hover:bg-foreground/85',
            )}
            aria-label={alreadyInStack ? t('alreadyInUse') : t('use')}
          >
            <Sparkles className="size-3" aria-hidden />
            {alreadyInStack ? t('alreadyInUse') : t('use')}
          </button>
          <button
            type="button"
            onClick={() => void handleCopyCode()}
            className="inline-flex items-center justify-center rounded-md border border-border p-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={t('copyCode')}
            title={asset.styleCode}
          >
            <Copy className="size-3" aria-hidden />
          </button>
        </div>

        {showVisibilityToggle ? (
          <label className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1 text-xs">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              {asset.isPublic ? (
                <Globe2 className="size-3" aria-hidden />
              ) : (
                <Lock className="size-3" aria-hidden />
              )}
              {asset.isPublic ? t('public') : t('private')}
            </span>
            <Switch
              checked={asset.isPublic}
              disabled={isToggling}
              onCheckedChange={(next) => void handleVisibilityToggle(next)}
              aria-label={t('togglePublicAria')}
            />
          </label>
        ) : null}
      </div>
    </article>
  )
}
