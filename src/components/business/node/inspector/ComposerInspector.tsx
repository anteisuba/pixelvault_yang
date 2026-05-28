'use client'

import { useCallback, type KeyboardEvent } from 'react'
import { Loader2, SendHorizontal } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { NODE_STATUS_IDS } from '@/constants/node-types'
import { SCRIPT_PLANNER_PROVIDER_IDS } from '@/constants/script-breakdown'
import { Button } from '@/components/ui/button'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import {
  CanvasPlannerRouteSelector,
  getPlannerKeyOptionId,
  type NodePlannerRouteSelection,
} from '../CanvasPlannerRouteSelector'
import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { IMEAwareTextarea } from './IMEAwareField'
import { InspectorField } from './InspectorField'

interface ComposerInspectorProps {
  node: NodeWorkflowNode
}

export function ComposerInspector({ node }: ComposerInspectorProps) {
  const t = useTranslations('StudioNode.composer')
  const tInspector = useTranslations('StudioNode.inspector')
  const { sendFromComposer, updateNodeData } = useNodeWorkflowActions()
  const isRunning = node.data.status === NODE_STATUS_IDS.running
  const plannerRoute: NodePlannerRouteSelection | null =
    node.data.plannerApiKeyId &&
    (node.data.plannerProvider === SCRIPT_PLANNER_PROVIDER_IDS.gemini ||
      node.data.plannerProvider === SCRIPT_PLANNER_PROVIDER_IDS.deepseek ||
      node.data.plannerProvider === SCRIPT_PLANNER_PROVIDER_IDS.openai)
      ? {
          optionId:
            node.data.plannerRouteOptionId ??
            getPlannerKeyOptionId(node.data.plannerApiKeyId),
          plannerProvider: node.data.plannerProvider,
          apiKeyId: node.data.plannerApiKeyId,
        }
      : null

  const handlePromptChange = useCallback(
    (next: string) => {
      updateNodeData(node.id, { prompt: next })
    },
    [node.id, updateNodeData],
  )

  const handlePlannerRouteChange = useCallback(
    (selection: NodePlannerRouteSelection) => {
      updateNodeData(node.id, {
        plannerProvider: selection.plannerProvider,
        plannerApiKeyId: selection.apiKeyId,
        plannerRouteOptionId: selection.optionId,
      })
    },
    [node.id, updateNodeData],
  )

  const stopCanvasKeyboardEvent = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      event.stopPropagation()
    },
    [],
  )

  const handleSend = useCallback(() => {
    void sendFromComposer?.(node.id)
  }, [node.id, sendFromComposer])

  return (
    <div className="space-y-4">
      <InspectorField
        label={t('promptLabel')}
        statusDotClassName="bg-node-amber"
      >
        <IMEAwareTextarea
          value={node.data.prompt}
          onValueChange={handlePromptChange}
          onKeyDownCapture={stopCanvasKeyboardEvent}
          onKeyUpCapture={stopCanvasKeyboardEvent}
          aria-label={t('promptLabel')}
          placeholder={t('placeholder')}
          className="min-h-36 w-full resize-none rounded-2xl border border-node-panel-inner bg-node-panel-soft px-3 py-2 text-sm leading-6 text-node-foreground shadow-none outline-none placeholder:text-node-subtle focus-visible:border-node-amber focus-visible:ring-2 focus-visible:ring-node-amber/30"
        />
      </InspectorField>

      <InspectorField label={tInspector('plannerRoute')}>
        <CanvasPlannerRouteSelector
          value={plannerRoute}
          onChange={handlePlannerRouteChange}
          className="w-full"
        />
      </InspectorField>

      <Button
        type="button"
        onClick={handleSend}
        disabled={isRunning}
        className="h-10 w-full rounded-2xl bg-node-foreground text-sm font-semibold text-node-canvas hover:bg-node-foreground/90 disabled:bg-node-panel-inner disabled:text-node-muted"
      >
        {isRunning ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <SendHorizontal className="mr-2 size-4" />
        )}
        {t('send')}
      </Button>
    </div>
  )
}
