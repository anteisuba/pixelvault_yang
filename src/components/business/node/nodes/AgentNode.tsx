'use client'

import type { NodeProps } from '@xyflow/react'
import { AlertCircle, Bot, Film, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { NODE_STUDIO_AGENT_MODE_IDS } from '@/constants/node-studio'
import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { SCRIPT_BREAKDOWN_SUMMARY_FIELDS } from '@/constants/script-breakdown'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { NodeShell } from './NodeShell'

export function AgentNode({ data, selected }: NodeProps<NodeWorkflowNode>) {
  const t = useTranslations('StudioNode.agent')
  const breakdown = data.breakdown
  const seedancePromptPlan = data.seedancePromptPlan
  const isSeedancePromptMode =
    data.agentMode === NODE_STUDIO_AGENT_MODE_IDS.seedancePrompt
  const isRunning = data.status === NODE_STATUS_IDS.running
  const isFailed =
    data.status === NODE_STATUS_IDS.failed && Boolean(data.generationError)

  return (
    <NodeShell
      type={NODE_TYPE_IDS.agent}
      selected={selected}
      status={data.status}
    >
      <NodeShell.Header type={NODE_TYPE_IDS.agent} status={data.status} />
      <NodeShell.Body className="space-y-3">
        {isRunning ? (
          <div className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-2xl border border-node-panel-inner bg-node-panel-soft px-4 text-center">
            <Loader2 className="size-5 animate-spin text-node-foreground" />
            <div>
              <p className="text-sm font-semibold text-node-foreground">
                {isSeedancePromptMode
                  ? t('seedance.generatingTitle')
                  : t('generatingTitle')}
              </p>
              <p className="mt-1 text-xs leading-5 text-node-muted">
                {isSeedancePromptMode
                  ? t('seedance.generatingDescription')
                  : t('generatingDescription')}
              </p>
            </div>
          </div>
        ) : null}

        {!isRunning && isFailed ? (
          <div className="flex gap-2 rounded-2xl border border-node-status-failed bg-node-status-failed/50 p-3 text-sm text-node-status-failed-fg">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold">{t('failedTitle')}</p>
              <p className="mt-1 line-clamp-3 text-xs leading-5 text-node-status-failed-fg/80">
                {data.generationError}
              </p>
            </div>
          </div>
        ) : null}

        {!isRunning && !isFailed && !isSeedancePromptMode && !breakdown ? (
          <div className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-2xl border border-node-panel-inner bg-node-panel-soft px-4 text-center">
            <Bot className="size-6 text-node-foreground" />
            <div>
              <p className="text-sm font-semibold text-node-foreground">
                {t('emptyTitle')}
              </p>
              <p className="mt-1 text-xs leading-5 text-node-muted">
                {t('emptyDescription')}
              </p>
            </div>
          </div>
        ) : null}

        {!isRunning &&
        !isFailed &&
        isSeedancePromptMode &&
        !seedancePromptPlan ? (
          <div className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-2xl border border-node-panel-inner bg-node-panel-soft px-4 text-center">
            <Film className="size-6 text-node-foreground" />
            <div>
              <p className="text-sm font-semibold text-node-foreground">
                {t('seedance.emptyTitle')}
              </p>
              <p className="mt-1 text-xs leading-5 text-node-muted">
                {t('seedance.emptyDescription')}
              </p>
            </div>
          </div>
        ) : null}

        {!isRunning && !isSeedancePromptMode && breakdown ? (
          <>
            <div className="rounded-2xl border border-node-panel-inner bg-node-panel-soft p-3">
              <p className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
                {t('logline')}
              </p>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-node-foreground">
                {breakdown.logline}
              </p>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {SCRIPT_BREAKDOWN_SUMMARY_FIELDS.map((field) => (
                <div
                  key={field}
                  className="rounded-2xl border border-node-panel-inner bg-node-panel-soft px-2 py-2 text-center"
                >
                  <p className="text-base font-semibold text-node-foreground">
                    {breakdown[field].length}
                  </p>
                  <p className="mt-0.5 truncate text-2xs text-node-muted">
                    {t(`counts.${field}`)}
                  </p>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {!isRunning && isSeedancePromptMode && seedancePromptPlan ? (
          <>
            <div className="rounded-2xl border border-node-panel-inner bg-node-panel-soft p-3">
              <p className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
                {t('seedance.finalPrompt')}
              </p>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-node-foreground">
                {seedancePromptPlan.finalPrompt}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-node-panel-inner bg-node-panel-soft px-2 py-2 text-center">
                <p className="truncate text-base font-semibold text-node-foreground">
                  {seedancePromptPlan.duration}
                </p>
                <p className="mt-0.5 truncate text-2xs text-node-muted">
                  {t('seedance.duration')}
                </p>
              </div>
              <div className="rounded-2xl border border-node-panel-inner bg-node-panel-soft px-2 py-2 text-center">
                <p className="text-base font-semibold text-node-foreground">
                  {seedancePromptPlan.timeline.length}
                </p>
                <p className="mt-0.5 truncate text-2xs text-node-muted">
                  {t('seedance.timeline')}
                </p>
              </div>
            </div>
          </>
        ) : null}
      </NodeShell.Body>
    </NodeShell>
  )
}
