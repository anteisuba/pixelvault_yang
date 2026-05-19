'use client'

import Link from 'next/link'
import { Palette, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useActiveLoraStack } from '@/hooks/use-active-lora-stack'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'

/**
 * ActiveLoraBar — Studio-wide chip strip showing the LoRA(s) currently
 * active for this session. Mirrors Krea's "style code" persistence:
 * once a user picks a LoRA, it stays attached across image / edit /
 * video tools until they clear it.
 *
 * The bar is intentionally low-chrome — it hides itself completely
 * when nothing is active so it never crowds the canvas.
 */
export function ActiveLoraBar({ className }: { className?: string }) {
  const t = useTranslations('LoraStack')
  const { items, remove, clear, isResolvingFromUrl } = useActiveLoraStack()

  if (items.length === 0 && !isResolvingFromUrl) return null

  return (
    <div
      className={cn(
        'flex items-center gap-2 border-b border-border/60 bg-background/95 px-4 py-2 text-sm backdrop-blur',
        className,
      )}
      role="region"
      aria-label={t('regionLabel')}
    >
      <Palette className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="shrink-0 text-xs font-medium text-muted-foreground">
        {t('label')}
      </span>

      {isResolvingFromUrl && items.length === 0 ? (
        <span className="text-xs text-muted-foreground">{t('resolving')}</span>
      ) : null}

      <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {items.map((entry) => {
          const scale = entry.scale ?? entry.asset.defaultScale
          return (
            <li key={entry.asset.id}>
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-xs"
                title={t('chipTitle', {
                  trigger: entry.asset.triggerWord,
                  code: entry.asset.styleCode,
                })}
              >
                <span className="font-medium">{entry.asset.name}</span>
                <span className="text-muted-foreground">
                  ×{scale.toFixed(2)}
                </span>
                <button
                  type="button"
                  onClick={() => remove(entry.asset.id)}
                  className="-mr-0.5 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={t('removeAria', { name: entry.asset.name })}
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            </li>
          )
        })}
      </ul>

      <Link
        href={ROUTES.STUDIO_LORA}
        className="shrink-0 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
      >
        {t('manage')}
      </Link>

      {items.length > 0 ? (
        <button
          type="button"
          onClick={clear}
          className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {t('clear')}
        </button>
      ) : null}
    </div>
  )
}
