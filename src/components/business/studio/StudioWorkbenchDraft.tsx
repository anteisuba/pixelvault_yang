'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeft,
  BadgeCheck,
  ChevronDown,
  Clock3,
  FolderTree,
  Images,
  Layers3,
  MoveDiagonal2,
  Plus,
  RefreshCcw,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  SquareDashedMousePointer,
  TriangleAlert,
  WandSparkles,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'

interface ChromeItem {
  icon: LucideIcon
  label: string
  value: string
}

interface ModelOption {
  id: string
  model: string
  provider: string
  requests: number
  selected?: boolean
}

interface FilmstripFrame {
  id: string
  model: string
  gradient: string
  selected?: boolean
}

const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'flux-kontext',
    model: 'FLUX Kontext Pro',
    provider: 'fal.ai',
    requests: 284,
    selected: true,
  },
  {
    id: 'gpt-image',
    model: 'OpenAI GPT Image 1.5',
    provider: 'OpenAI',
    requests: 96,
  },
  {
    id: 'gemini',
    model: 'Gemini 2.5 Flash Image',
    provider: 'Google',
    requests: 143,
  },
]

const FILMSTRIP_FRAMES: FilmstripFrame[] = [
  {
    id: '01',
    model: 'FLUX Kontext Pro',
    gradient:
      'linear-gradient(145deg, rgba(203,117,86,0.92), rgba(114,79,160,0.88))',
  },
  {
    id: '02',
    model: 'OpenAI GPT Image 1.5',
    gradient:
      'linear-gradient(145deg, rgba(58,97,122,0.94), rgba(217,166,104,0.85))',
    selected: true,
  },
  {
    id: '03',
    model: 'Gemini 2.5 Flash Image',
    gradient:
      'linear-gradient(145deg, rgba(112,138,86,0.92), rgba(236,198,145,0.88))',
  },
  {
    id: '04',
    model: 'FLUX LoRA',
    gradient:
      'linear-gradient(145deg, rgba(70,88,128,0.94), rgba(202,120,96,0.84))',
  },
  {
    id: '05',
    model: 'Seedream 5.0 Lite',
    gradient:
      'linear-gradient(145deg, rgba(114,76,57,0.92), rgba(205,160,98,0.84))',
  },
]

interface SectionShellProps {
  title: string
  description?: string
  className?: string
  children: ReactNode
}

function SectionShell({
  title,
  description,
  className,
  children,
}: SectionShellProps) {
  return (
    <section
      className={cn(
        'rounded-3xl border border-border/60 bg-card/70 p-4 shadow-sm',
        className,
      )}
    >
      <div className="mb-4 space-y-1">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  )
}

interface StatusPillProps {
  label: string
  tone: 'neutral' | 'accent' | 'warning' | 'danger'
}

function StatusPill({ label, tone }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium',
        tone === 'neutral' &&
          'border-border/60 bg-background text-muted-foreground',
        tone === 'accent' &&
          'border-primary/25 bg-primary/10 text-primary',
        tone === 'warning' &&
          'border-chart-4/30 bg-chart-4/10 text-foreground',
        tone === 'danger' &&
          'border-destructive/25 bg-destructive/10 text-destructive',
      )}
    >
      {label}
    </span>
  )
}

export function StudioWorkbenchDraft() {
  const locale = useLocale()
  const t = useTranslations('StudioWorkbenchDraft')
  const tCommon = useTranslations('Common')

  const chromeItems: ChromeItem[] = [
    {
      icon: FolderTree,
      label: t('chrome.project'),
      value: t('chrome.projectValue'),
    },
    {
      icon: Layers3,
      label: t('chrome.route'),
      value: t('chrome.routeValue'),
    },
    {
      icon: WandSparkles,
      label: t('chrome.model'),
      value: t('chrome.modelValue'),
    },
    {
      icon: Clock3,
      label: t('chrome.quota'),
      value: t('chrome.quotaValue'),
    },
    {
      icon: Images,
      label: t('chrome.references'),
      value: t('chrome.referencesValue'),
    },
  ]

  const advancedGroups = [
    t('compose.advancedGroups.composition'),
    t('compose.advancedGroups.reference'),
    t('compose.advancedGroups.quality'),
    t('compose.advancedGroups.provider'),
  ]

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 md:px-6 xl:px-8">
      <SectionShell
        title={t('title')}
        description={t('description')}
        className="bg-background/90"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
                {t('eyebrow')}
              </span>
              <span className="text-sm text-muted-foreground">{t('note')}</span>
            </div>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
              {t('summary')}
            </p>
          </div>
          <Button asChild>
            <Link href={`/${locale}${ROUTES.STUDIO}`}>
              <ArrowLeft className="size-4" />
              {t('actions.backToStudio')}
            </Link>
          </Button>
        </div>
      </SectionShell>

      <SectionShell
        title={t('desktop.title')}
        description={t('desktop.description')}
      >
        <div className="overflow-hidden rounded-3xl border border-border/60 bg-background">
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-muted/35 px-4 py-3">
            {chromeItems.map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                className="inline-flex min-w-fit items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-2"
              >
                <Icon className="size-3.5 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">
                  {label}
                </span>
                <span className="text-xs font-semibold text-foreground">
                  {value}
                </span>
              </div>
            ))}
          </div>

          <div className="grid gap-4 p-4 xl:grid-cols-12">
            <aside className="space-y-4 xl:col-span-2">
              <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      {t('sidebar.title')}
                    </p>
                    <p className="mt-1 text-sm text-foreground">
                      {t('sidebar.projectCount')}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex size-8 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2">
                    <p className="text-xs font-medium text-primary">
                      {t('chrome.projectValue')}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('sidebar.projects')}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background px-3 py-2">
                    <p className="text-xs font-medium text-foreground">
                      {t('sidebar.altProject')}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('sidebar.projects')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {t('sidebar.routes')}
                </p>
                <div className="mt-3 space-y-2">
                  <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2">
                    <p className="text-xs font-medium text-foreground">
                      {t('chrome.routeValue')}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('sidebar.routeHealth')}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background px-3 py-2">
                    <p className="text-xs font-medium text-foreground">
                      {t('sidebar.backupRoute')}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('sidebar.routeFallback')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {t('sidebar.collections')}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusPill label={t('sidebar.collectionCharacter')} tone="neutral" />
                  <StatusPill label={t('sidebar.collectionStyle')} tone="neutral" />
                  <StatusPill label={t('sidebar.collectionRecipe')} tone="neutral" />
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  {t('sidebar.collectionHint')}
                </p>
              </div>
            </aside>

            <div className="space-y-4 xl:col-span-6">
              <div className="rounded-2xl border border-border/60 bg-card/80 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      {t('compose.title')}
                    </p>
                    <p className="mt-1 text-sm text-foreground">
                      {t('compose.subtitle')}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-2 text-xs font-medium text-foreground"
                  >
                    {t('compose.modelMenu')}
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  {MODEL_OPTIONS.map((option) => (
                    <div
                      key={option.id}
                      className={cn(
                        'flex items-center gap-3 rounded-2xl border px-3 py-3',
                        option.selected
                          ? 'border-primary/25 bg-primary/10'
                          : 'border-border/60 bg-background',
                      )}
                    >
                      <span
                        className={cn(
                          'size-2 rounded-full',
                          option.selected ? 'bg-primary' : 'bg-emerald-500',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {option.model}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {option.provider}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {tCommon('creditCount', { count: option.requests })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 bg-card/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {t('compose.promptLabel')}
                </p>
                <div className="mt-3 rounded-2xl border border-border/60 bg-background px-4 py-4">
                  <p className="font-sans text-sm leading-7 text-foreground">
                    {t('compose.promptValue')}
                  </p>
                  <p className="mt-4 text-xs text-muted-foreground">
                    {t('compose.promptHint')}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-border/60 bg-card/80 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      {t('compose.referenceTitle')}
                    </p>
                    <StatusPill
                      label={t('compose.referenceBadge')}
                      tone="accent"
                    />
                  </div>
                  <div className="mt-3 rounded-2xl border border-dashed border-primary/25 bg-primary/5 px-4 py-6 text-center">
                    <SquareDashedMousePointer className="mx-auto size-5 text-primary" />
                    <p className="mt-3 text-sm font-medium text-foreground">
                      {t('compose.referenceDrop')}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {t('compose.referenceHint')}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/60 bg-card/80 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      {t('compose.statusTitle')}
                    </p>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                    >
                      <Sparkles className="size-4" />
                      {t('compose.generate')}
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusPill label={t('compose.statusGenerating')} tone="accent" />
                    <StatusPill label={t('compose.statusReady')} tone="neutral" />
                    <StatusPill
                      label={t('compose.statusMissingModel')}
                      tone="warning"
                    />
                    <StatusPill
                      label={t('compose.statusMissingReference')}
                      tone="warning"
                    />
                    <StatusPill label={t('compose.statusFailed')} tone="danger" />
                  </div>
                  <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/10 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex gap-2">
                        <TriangleAlert className="mt-0.5 size-4 text-destructive" />
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {t('compose.failureTitle')}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {t('compose.failureHint')}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-full border border-destructive/20 bg-background px-3 py-1.5 text-xs font-medium text-destructive"
                      >
                        <RefreshCcw className="size-3.5" />
                        {t('preview.retry')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 bg-card/80 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    {t('compose.advancedTitle')}
                  </p>
                  <SlidersHorizontal className="size-4 text-muted-foreground" />
                </div>
                <div className="mt-3 space-y-2">
                  {advancedGroups.map((groupName, index) => (
                    <div
                      key={groupName}
                      className={cn(
                        'rounded-2xl border px-3 py-3',
                        index === 0
                          ? 'border-primary/20 bg-primary/5'
                          : 'border-border/60 bg-background',
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">
                          {groupName}
                        </p>
                        <ChevronDown
                          className={cn(
                            'size-4 text-muted-foreground',
                            index === 0 && 'rotate-180',
                          )}
                        />
                      </div>
                      {index === 0 ? (
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          {t('compose.advancedOpenHint')}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4 xl:col-span-4">
              <div className="rounded-2xl border border-border/60 bg-card/80 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      {t('preview.title')}
                    </p>
                    <p className="mt-1 text-sm text-foreground">
                      {t('preview.subtitle')}
                    </p>
                  </div>
                  <StatusPill label={t('preview.badge')} tone="accent" />
                </div>

                <div className="mt-4 overflow-hidden rounded-3xl border border-border/60 bg-background">
                  <div
                    className="aspect-square w-full"
                    style={{
                      backgroundImage:
                        'linear-gradient(160deg, rgba(67,103,138,0.96), rgba(219,165,103,0.84), rgba(204,113,86,0.92))',
                    }}
                  />
                  <div className="space-y-2 border-t border-border/60 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">
                        {t('preview.selectionTitle')}
                      </p>
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground"
                      >
                        <MoveDiagonal2 className="size-3.5" />
                        {t('preview.openDetail')}
                      </button>
                    </div>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {t('preview.selectionHint')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 bg-card/80 p-4">
                <div className="flex items-start gap-3">
                  <BadgeCheck className="mt-0.5 size-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {t('preview.recoveryTitle')}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {t('preview.recoveryHint')}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3 xl:col-span-10 xl:col-start-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    {t('preview.filmstripTitle')}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('preview.filmstripHint')}
                  </p>
                </div>
                <StatusPill label={t('preview.selected')} tone="neutral" />
              </div>

              <div className="flex gap-3 overflow-x-auto pb-2">
                {FILMSTRIP_FRAMES.map((frame) => (
                  <button
                    key={frame.id}
                    type="button"
                    className={cn(
                      'w-36 flex-shrink-0 overflow-hidden rounded-2xl border bg-background text-left',
                      frame.selected
                        ? 'border-primary/25 shadow-sm'
                        : 'border-border/60',
                    )}
                  >
                    <div
                      className="aspect-square w-full"
                      style={{ backgroundImage: frame.gradient }}
                    />
                    <div className="space-y-1 px-3 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-foreground">
                          {frame.id}
                        </span>
                        {frame.selected ? (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            {t('preview.selected')}
                          </span>
                        ) : null}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {frame.model}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </SectionShell>

      <SectionShell
        title={t('mobile.title')}
        description={t('mobile.description')}
      >
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
              <p className="text-sm font-medium text-foreground">
                {t('mobile.note')}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusPill label={t('mobile.preview')} tone="accent" />
                <StatusPill label={t('mobile.compose')} tone="neutral" />
                <StatusPill label={t('mobile.history')} tone="neutral" />
                <StatusPill label={t('mobile.tools')} tone="neutral" />
              </div>
            </div>
          </div>

          <div className="mx-auto w-full max-w-sm rounded-3xl border border-border/60 bg-card/80 p-3 shadow-sm lg:col-span-1">
            <div className="space-y-3 rounded-3xl border border-border/60 bg-background p-3">
              <div
                className="overflow-hidden rounded-2xl border border-border/60"
                style={{
                  backgroundImage:
                    'linear-gradient(160deg, rgba(67,103,138,0.94), rgba(219,165,103,0.82), rgba(204,113,86,0.9))',
                }}
              >
                <div className="aspect-video w-full" />
                <div className="border-t border-white/15 bg-black/20 px-3 py-3 backdrop-blur-sm">
                  <p className="text-xs font-medium text-white">
                    {t('mobile.preview')}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 bg-card/80 p-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {t('mobile.compose')}
                </p>
                <p className="mt-2 text-sm text-foreground">
                  {t('compose.promptValue')}
                </p>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {FILMSTRIP_FRAMES.slice(0, 4).map((frame) => (
                  <div
                    key={frame.id}
                    className="w-20 flex-shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-background"
                  >
                    <div
                      className="aspect-square w-full"
                      style={{ backgroundImage: frame.gradient }}
                    />
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border/60 bg-muted/25 px-4 py-3 text-sm font-medium text-foreground"
              >
                <Settings2 className="size-4" />
                {t('mobile.sheetLabel')}
              </button>
            </div>
          </div>
        </div>
      </SectionShell>
    </div>
  )
}
