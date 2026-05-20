'use client'

import { Sparkles, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  /** Pick-a-preset action handler — opens preset grid focus, or selects first preset. */
  onSelectPreset: () => void
  /** Direct image-upload action — bypasses preset selection. */
  onUploadImages: () => void
  className?: string
}

/**
 * First-load illustration + dual CTA. Replaces the bare "fill these
 * fields" form that used to greet a user landing on /studio/lora?
 * section=train with no history. The two CTAs map to the two real
 * starting points: pick a preset (guided) or start uploading (manual).
 *
 * Inline SVG so we avoid an extra network request — the motif stays
 * under 4KB and inherits color tokens from the editorial surface.
 */
export function EmptyState({
  onSelectPreset,
  onUploadImages,
  className,
}: EmptyStateProps) {
  const t = useTranslations('LoraTraining')

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-5 rounded-2xl border border-dashed border-border/60 bg-muted/20 px-6 py-12 text-center sm:py-16',
        className,
      )}
    >
      <EmptyIllustration />
      <div className="max-w-md space-y-2">
        <h3 className="font-display text-xl font-semibold tracking-tight">
          {t('emptyTitle')}
        </h3>
        <p className="text-sm text-muted-foreground">{t('emptyDescription')}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onSelectPreset}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.98]"
        >
          <Sparkles className="size-3.5" aria-hidden />
          {t('emptyCtaPreset')}
        </button>
        <button
          type="button"
          onClick={onUploadImages}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted/40"
        >
          <Upload className="size-3.5" aria-hidden />
          {t('emptyCtaUpload')}
        </button>
      </div>
    </div>
  )
}

/**
 * Camera-plus-sparkle motif. Pure SVG, no external file — the colors
 * pick up `currentColor` so it reads correctly on both editorial and
 * dark Krea overlay surfaces.
 */
function EmptyIllustration() {
  return (
    <svg
      width="120"
      height="120"
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="text-primary"
    >
      <rect
        x="16"
        y="32"
        width="88"
        height="64"
        rx="8"
        className="fill-primary/5 stroke-primary/30"
        strokeWidth="2"
      />
      <circle
        cx="60"
        cy="64"
        r="18"
        className="fill-primary/10 stroke-primary/40"
        strokeWidth="2"
      />
      <circle cx="60" cy="64" r="9" className="fill-primary/20" />
      <rect
        x="46"
        y="22"
        width="28"
        height="14"
        rx="3"
        className="fill-primary/10 stroke-primary/30"
        strokeWidth="2"
      />
      <path
        d="M92 28 L94 34 L100 36 L94 38 L92 44 L90 38 L84 36 L90 34 Z"
        className="fill-primary"
      />
      <path
        d="M28 88 L29 92 L33 93 L29 94 L28 98 L27 94 L23 93 L27 92 Z"
        className="fill-primary/70"
      />
      <path
        d="M100 80 L101 83 L104 84 L101 85 L100 88 L99 85 L96 84 L99 83 Z"
        className="fill-primary/50"
      />
    </svg>
  )
}
