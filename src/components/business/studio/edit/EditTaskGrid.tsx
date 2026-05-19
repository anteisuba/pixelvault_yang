'use client'

import { ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  EDIT_TASKS,
  editTaskRoute,
  type EditTaskProvider,
} from '@/constants/edit-tasks'
import { useImageEdit } from '@/contexts/image-edit-context'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

const PROVIDER_LABEL: Record<EditTaskProvider, string> = {
  fal: 'Fal',
  gemini: 'Gemini',
  openai: 'GPT',
}

/**
 * 8-card grid of edit tasks. Clicking a card routes to the matching
 * /studio/edit/<task> page; source state lives in ImageEditContext (mounted
 * one level up in layout.tsx) so navigation never drops the loaded image.
 */
export function EditTaskGrid() {
  const t = useTranslations('StudioImageEdit')
  const { hasSource } = useImageEdit()

  return (
    <section className="rounded-xl border border-border/70 bg-card p-4">
      <div className="mb-4 flex items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {t('taskGrid.title')}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {hasSource
              ? t('taskGrid.subtitleReady')
              : t('taskGrid.subtitleLoadFirst')}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {EDIT_TASKS.map(({ task, icon: Icon, providers }) => (
          <Link
            key={task}
            href={editTaskRoute(task)}
            className={cn(
              'group flex flex-col gap-2 rounded-lg border border-border/70 bg-background/40 p-3 transition-colors hover:border-primary/40 hover:bg-background/70',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="size-4" />
              </div>
              <ArrowRight className="mt-1 size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {t(`tasks.${task}.label`)}
              </h3>
              <p className="mt-1 text-xs leading-snug text-muted-foreground">
                {t(`tasks.${task}.description`)}
              </p>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {providers.map((provider) => (
                <span
                  key={provider}
                  className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                >
                  {PROVIDER_LABEL[provider]}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
