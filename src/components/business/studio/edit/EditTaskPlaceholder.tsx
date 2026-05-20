'use client'

import { Construction } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { EDIT_TASKS, type EditTaskProvider } from '@/constants/edit-tasks'
import type { EditTaskKind } from '@/contexts/image-edit-context'

const PROVIDER_LABEL: Record<EditTaskProvider, string> = {
  fal: 'Fal',
  gemini: 'Gemini',
  openai: 'GPT',
}

/**
 * Placeholder rendered by every /studio/edit/<task> subroute before Phase 3
 * wires up the actual editor. Keeps the URL navigable, advertises which
 * providers will land on this task, and offers a way back to the grid.
 */
export function EditTaskPlaceholder({ task }: { task: EditTaskKind }) {
  const t = useTranslations('StudioImageEdit')
  const metadata = EDIT_TASKS.find((entry) => entry.task === task)
  const providers = metadata?.providers ?? []

  return (
    <section className="rounded-xl border border-dashed border-border bg-card/60 p-6 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Construction className="size-5" />
      </div>
      <h2 className="mt-3 text-base font-semibold text-foreground">
        {t('placeholder.title', { task: t(`tasks.${task}.label`) })}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('placeholder.subtitle')}
      </p>
      {providers.length > 0 ? (
        <div className="mt-3 inline-flex flex-wrap items-center justify-center gap-1.5">
          {providers.map((provider) => (
            <span
              key={provider}
              className="rounded-full border border-border/70 bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
            >
              {PROVIDER_LABEL[provider]}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  )
}
