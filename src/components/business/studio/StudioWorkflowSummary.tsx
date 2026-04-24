'use client'

import { useTranslations } from 'next-intl'

import { useStudioContext } from '@/contexts/studio-context'

export function StudioWorkflowSummary() {
  const t = useTranslations()
  const { selectedWorkflowId, getSelectedWorkflow } = useStudioContext()
  const workflow = getSelectedWorkflow()

  if (!workflow) {
    return (
      <section className="grid gap-1" aria-live="polite">
        <h2 className="font-display text-xl font-semibold leading-tight text-foreground">
          {selectedWorkflowId}
        </h2>
      </section>
    )
  }

  return (
    <section className="grid gap-1 sm:grid-cols-2 sm:items-end">
      <h2 className="font-display text-xl font-semibold leading-tight text-foreground sm:text-2xl">
        {t(workflow.publicNameKey)}
      </h2>
      <p className="font-serif text-sm leading-6 text-muted-foreground">
        {t(workflow.descriptionKey)}
      </p>
    </section>
  )
}
