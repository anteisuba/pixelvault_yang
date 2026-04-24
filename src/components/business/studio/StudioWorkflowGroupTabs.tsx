'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import {
  WORKFLOWS,
  WORKFLOW_MEDIA_GROUPS,
  type WorkflowMediaGroup,
} from '@/constants/workflows'
import { useStudioContext } from '@/contexts/studio-context'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

const WORKFLOW_MEDIA_GROUP_ORDER = [
  WORKFLOW_MEDIA_GROUPS.IMAGE,
  WORKFLOW_MEDIA_GROUPS.VIDEO,
  WORKFLOW_MEDIA_GROUPS.AUDIO,
] as const

interface StudioWorkflowGroupTabsProps {
  children?: (currentMediaGroup: WorkflowMediaGroup) => ReactNode
  className?: string
}

function isWorkflowMediaGroup(value: string): value is WorkflowMediaGroup {
  return WORKFLOW_MEDIA_GROUP_ORDER.some((group) => group === value)
}

export function StudioWorkflowGroupTabs({
  children,
  className,
}: StudioWorkflowGroupTabsProps) {
  const tStudio = useTranslations('StudioPage')
  const { getSelectedWorkflow } = useStudioContext()
  const selectedWorkflow = getSelectedWorkflow()
  const [currentMediaGroup, setCurrentMediaGroup] =
    useState<WorkflowMediaGroup>(
      selectedWorkflow?.mediaGroup ?? WORKFLOW_MEDIA_GROUPS.IMAGE,
    )

  const workflowCounts = useMemo(
    () =>
      WORKFLOW_MEDIA_GROUP_ORDER.reduce(
        (acc, group) => ({
          ...acc,
          [group]: WORKFLOWS.filter((workflow) => workflow.mediaGroup === group)
            .length,
        }),
        {} as Record<WorkflowMediaGroup, number>,
      ),
    [],
  )

  const groupLabels: Record<WorkflowMediaGroup, string> = {
    [WORKFLOW_MEDIA_GROUPS.IMAGE]: tStudio('modeImage'),
    [WORKFLOW_MEDIA_GROUPS.VIDEO]: tStudio('modeVideo'),
    [WORKFLOW_MEDIA_GROUPS.AUDIO]: tStudio('modeAudio'),
  }

  return (
    <Tabs
      value={currentMediaGroup}
      onValueChange={(value) => {
        if (isWorkflowMediaGroup(value)) {
          setCurrentMediaGroup(value)
        }
      }}
      className={cn('gap-3', className)}
    >
      <TabsList
        variant="line"
        className="w-full justify-start overflow-x-auto rounded-none border-b border-border/60 pb-0"
      >
        {WORKFLOW_MEDIA_GROUP_ORDER.map((group) => (
          <TabsTrigger
            key={group}
            value={group}
            onClick={() => setCurrentMediaGroup(group)}
            className="min-w-fit px-3 py-2 text-xs font-semibold data-[state=active]:text-primary sm:text-sm"
          >
            <span>{groupLabels[group]}</span>
            <span className="rounded-full border border-border/60 px-1.5 py-0.5 text-3xs text-muted-foreground">
              {workflowCounts[group]}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
      {children?.(currentMediaGroup)}
    </Tabs>
  )
}
