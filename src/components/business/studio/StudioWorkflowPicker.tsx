'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'

import {
  WORKFLOWS,
  type Workflow,
  type WorkflowMediaGroup,
} from '@/constants/workflows'
import { useStudioContext } from '@/contexts/studio-context'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface StudioWorkflowPickerProps {
  currentMediaGroup: WorkflowMediaGroup
}

function translateWorkflow(
  t: ReturnType<typeof useTranslations>,
  workflow: Workflow,
) {
  return {
    name: t(workflow.publicNameKey),
    description: t(workflow.descriptionKey),
  }
}

export function StudioWorkflowPicker({
  currentMediaGroup,
}: StudioWorkflowPickerProps) {
  const t = useTranslations()
  const { selectedWorkflowId, setSelectedWorkflowId } = useStudioContext()
  const workflows = useMemo(
    () =>
      WORKFLOWS.filter((workflow) => workflow.mediaGroup === currentMediaGroup),
    [currentMediaGroup],
  )

  return (
    <div className="studio-stagger flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3 xl:grid-cols-5">
      {workflows.map((workflow) => {
        const selected = workflow.id === selectedWorkflowId
        const copy = translateWorkflow(t, workflow)

        return (
          <button
            key={workflow.id}
            type="button"
            aria-pressed={selected}
            data-selected={selected ? 'true' : 'false'}
            data-testid={`workflow-card-${workflow.id}`}
            onClick={() => setSelectedWorkflowId(workflow.id)}
            className="group min-w-56 text-left outline-none sm:min-w-0"
          >
            <Card
              className={cn(
                'h-full gap-0 overflow-hidden border py-0 shadow-none transition-all duration-300 ease-out',
                'group-hover:-translate-y-0.5 group-hover:border-primary/35 group-focus-visible:ring-2 group-focus-visible:ring-ring/50',
                selected
                  ? 'border-primary/50 bg-primary/5 shadow-md shadow-primary/5'
                  : 'border-border/60 bg-card/90',
              )}
            >
              <CardContent className="grid gap-2 px-4 py-4">
                <div className="font-display text-sm font-semibold leading-tight text-foreground">
                  {copy.name}
                </div>
                <p className="font-serif text-xs leading-5 text-muted-foreground">
                  {copy.description}
                </p>
              </CardContent>
            </Card>
          </button>
        )
      })}
    </div>
  )
}
