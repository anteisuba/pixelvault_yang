'use client'

import { useTranslations } from 'next-intl'

import { DEFAULT_WORKFLOW_ID } from '@/constants/workflows'
import { useStudioContext } from '@/contexts/studio-context'

export function StudioWorkflowSummary() {
  const t = useTranslations()
  const tStudio = useTranslations('StudioPage')
  const { state, selectedWorkflowId, getSelectedWorkflow } = useStudioContext()
  const workflow = getSelectedWorkflow()
  const showInitialHint =
    !selectedWorkflowId ||
    (selectedWorkflowId === DEFAULT_WORKFLOW_ID && state.prompt.trim() === '')

  if (!workflow) {
    return (
      <section className="grid gap-1" aria-live="polite">
        <p className="font-serif text-sm leading-6 text-muted-foreground">
          {tStudio('workflowEmptyHint')}
        </p>
      </section>
    )
  }

  return (
    <section className="grid gap-1 sm:grid-cols-2 sm:items-end">
      <div className="grid gap-1">
        <h2 className="font-display text-xl font-semibold leading-tight text-foreground sm:text-2xl">
          {t(workflow.publicNameKey)}
        </h2>
        {showInitialHint ? (
          <p className="font-serif text-sm leading-6 text-muted-foreground">
            {tStudio('workflowEmptyHint')}
          </p>
        ) : null}
      </div>
      <p className="font-serif text-sm leading-6 text-muted-foreground">
        {t(workflow.descriptionKey)}
      </p>
    </section>
  )
}
