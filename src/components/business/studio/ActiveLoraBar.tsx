'use client'

import { useCallback } from 'react'
import Link from 'next/link'
import { Palette, Plus, Settings2, Share2, Trash2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { useActiveLoraStack } from '@/hooks/use-active-lora-stack'
import { ROUTES } from '@/constants/routes'
import {
  LORA_WORKBENCH_SEARCH_PARAM,
  LORA_WORKBENCH_SECTIONS,
} from '@/constants/lora'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'

const SCALE_MIN = 0
const SCALE_MAX = 1.5
const SCALE_STEP = 0.05

/**
 * ActiveLoraBar — Studio-wide chip strip showing the LoRA(s) currently
 * active for this session. Mirrors Krea's "style code" persistence:
 * once a user picks a LoRA, it stays attached across image / edit /
 * video tools until they clear it.
 *
 * Each chip is a Popover trigger — click to reveal a scale slider so
 * users can dial LoRA strength without leaving the canvas. A "+" button
 * jumps to the LoRA library; the bar hides entirely when nothing is
 * active so it never crowds an empty Studio.
 */
export function ActiveLoraBar({ className }: { className?: string }) {
  const t = useTranslations('LoraStack')
  const { items, setScale, remove, clear, isResolvingFromUrl, getShareUrl } =
    useActiveLoraStack()

  const handleShare = useCallback(async () => {
    const url = getShareUrl()
    if (!url) {
      toast.info(t('shareEmpty'))
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('shareCopied'))
    } catch {
      toast.error(t('shareCopyFailed'))
    }
  }, [getShareUrl, t])

  if (items.length === 0 && !isResolvingFromUrl) return null

  return (
    <div
      className={cn(
        'flex flex-col gap-2 border-b border-border/60 bg-background/95 px-3 py-2 text-sm backdrop-blur md:flex-row md:items-center md:px-4',
        className,
      )}
      role="region"
      aria-label={t('regionLabel')}
    >
      <div className="flex min-w-0 items-center gap-2 md:flex-1">
        <Palette
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          {t('label')}
        </span>

        {isResolvingFromUrl && items.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            {t('resolving')}
          </span>
        ) : null}

        <ul className="-mx-1 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
          {items.map((entry) => {
            const scale = entry.scale ?? entry.asset.defaultScale
            return (
              <li key={entry.asset.id} className="shrink-0 md:min-w-0">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex max-w-48 items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-xs transition-colors hover:bg-muted sm:max-w-64 md:max-w-xs"
                      title={t('chipTitle', {
                        trigger: entry.asset.triggerWord,
                        code: entry.asset.styleCode,
                      })}
                    >
                      <span className="truncate font-medium">
                        {entry.asset.name}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        ×{scale.toFixed(2)}
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-72 space-y-3"
                    side="bottom"
                    align="start"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="line-clamp-1 font-medium">
                          {entry.asset.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => remove(entry.asset.id)}
                          className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          aria-label={t('removeAria', {
                            name: entry.asset.name,
                          })}
                        >
                          <X className="size-3.5" aria-hidden />
                        </button>
                      </div>
                      <p className="font-mono text-2xs text-muted-foreground">
                        {entry.asset.triggerWord}
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          {t('scaleLabel')}
                        </span>
                        <span className="font-mono text-foreground">
                          ×{scale.toFixed(2)}
                        </span>
                      </div>
                      <Slider
                        min={SCALE_MIN}
                        max={SCALE_MAX}
                        step={SCALE_STEP}
                        value={[scale]}
                        onValueChange={(next) => {
                          const v = next[0]
                          if (typeof v === 'number') setScale(entry.asset.id, v)
                        }}
                      />
                      <p className="text-2xs text-muted-foreground">
                        {t('scaleHint')}
                      </p>
                    </div>
                  </PopoverContent>
                </Popover>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="flex items-center justify-end gap-1.5 md:justify-start">
        <Link
          href={`${ROUTES.STUDIO_LORA}?${LORA_WORKBENCH_SEARCH_PARAM}=${LORA_WORKBENCH_SECTIONS.COMMUNITY}`}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors hover:bg-muted md:h-auto md:w-auto md:gap-1 md:px-2 md:py-1 md:text-xs md:font-medium"
          aria-label={t('addMore')}
          title={t('addMore')}
        >
          <Plus className="size-3.5 md:size-3" aria-hidden />
          <span className="sr-only md:not-sr-only">{t('addMore')}</span>
        </Link>

        {items.length > 0 ? (
          <button
            type="button"
            onClick={() => void handleShare()}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors hover:bg-muted md:h-auto md:w-auto md:gap-1 md:px-2 md:py-1 md:text-xs md:font-medium"
            aria-label={t('share')}
            title={t('share')}
          >
            <Share2 className="size-3.5 md:size-3" aria-hidden />
            <span className="sr-only md:not-sr-only">{t('share')}</span>
          </button>
        ) : null}

        <Link
          href={ROUTES.STUDIO_LORA}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors hover:bg-muted md:h-auto md:w-auto md:px-2 md:py-1 md:text-xs md:font-medium"
          aria-label={t('manage')}
          title={t('manage')}
        >
          <Settings2 className="size-3.5 md:hidden" aria-hidden />
          <span className="sr-only md:not-sr-only">{t('manage')}</span>
        </Link>

        {items.length > 0 ? (
          <button
            type="button"
            onClick={clear}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:h-auto md:w-auto md:px-2 md:py-1 md:text-xs"
            aria-label={t('clear')}
            title={t('clear')}
          >
            <Trash2 className="size-3.5 md:hidden" aria-hidden />
            <span className="sr-only md:not-sr-only">{t('clear')}</span>
          </button>
        ) : null}
      </div>
    </div>
  )
}
