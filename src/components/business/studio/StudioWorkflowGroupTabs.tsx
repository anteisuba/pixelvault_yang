'use client'

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import {
  WORKFLOWS,
  WORKFLOW_MEDIA_GROUPS,
  type WorkflowId,
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
  const { getSelectedWorkflow, setSelectedWorkflowId } = useStudioContext()
  const selectedWorkflow = getSelectedWorkflow()
  const selectedMediaGroup =
    selectedWorkflow?.mediaGroup ?? WORKFLOW_MEDIA_GROUPS.IMAGE

  return (
    <StudioWorkflowGroupTabsContent
      key={selectedMediaGroup}
      initialMediaGroup={selectedMediaGroup}
      selectedMediaGroup={selectedMediaGroup}
      setSelectedWorkflowId={setSelectedWorkflowId}
      className={className}
    >
      {children}
    </StudioWorkflowGroupTabsContent>
  )
}

interface StudioWorkflowGroupTabsContentProps extends StudioWorkflowGroupTabsProps {
  initialMediaGroup: WorkflowMediaGroup
  selectedMediaGroup: WorkflowMediaGroup
  setSelectedWorkflowId: (workflowId: WorkflowId) => void
}

function StudioWorkflowGroupTabsContent({
  children,
  className,
  initialMediaGroup,
  selectedMediaGroup,
  setSelectedWorkflowId,
}: StudioWorkflowGroupTabsContentProps) {
  const tStudio = useTranslations('StudioPage')
  const [currentMediaGroup, setCurrentMediaGroup] =
    useState<WorkflowMediaGroup>(initialMediaGroup)

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

  const handleMediaGroupChange = useCallback(
    (group: WorkflowMediaGroup) => {
      setCurrentMediaGroup(group)

      if (selectedMediaGroup === group) {
        return
      }

      const firstWorkflowInGroup = WORKFLOWS.find(
        (workflow) => workflow.mediaGroup === group,
      )
      if (firstWorkflowInGroup) {
        setSelectedWorkflowId(firstWorkflowInGroup.id)
      }
    },
    [selectedMediaGroup, setSelectedWorkflowId],
  )

  return (
    <Tabs
      value={currentMediaGroup}
      onValueChange={(value) => {
        if (isWorkflowMediaGroup(value)) {
          handleMediaGroupChange(value)
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
            onClick={() => handleMediaGroupChange(group)}
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
