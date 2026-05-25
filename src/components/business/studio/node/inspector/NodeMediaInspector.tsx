'use client'

import Image from 'next/image'
import { Loader2, Mic2, Video, WandSparkles } from 'lucide-react'
import { useCallback, type ChangeEvent } from 'react'
import { useTranslations } from 'next-intl'

import {
  NODE_GENERATION_STATUS_IDS,
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
  NODE_WORKFLOW_FIELDS_BY_NODE_TYPE,
  NODE_WORKFLOW_FIELD_IDS,
  type NodeWorkflowFieldId,
  type NodeWorkflowMediaKind,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { WorkflowModelPicker } from '@/components/business/studio/node/WorkflowModelPicker'
import {
  buildNodeWorkflowPrompt,
  getNodeWorkflowFieldValue,
} from '@/lib/node-workflow-prompt'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { InspectorField } from './InspectorField'

interface NodeMediaInspectorProps {
  node: NodeWorkflowNode
  type: NodeWorkflowNodeType
  kind: NodeWorkflowMediaKind
}

function getStatusLabelKey(
  generationStatus: string | undefined,
  hasMedia: boolean,
  kind: NodeWorkflowMediaKind,
):
  | 'statusIdle'
  | 'statusPending'
  | 'statusSuccess'
  | 'statusError'
  | 'statusTextReady' {
  if (kind === NODE_MEDIA_KIND_IDS.text) {
    return 'statusTextReady'
  }

  switch (generationStatus) {
    case NODE_GENERATION_STATUS_IDS.pending:
      return 'statusPending'
    case NODE_GENERATION_STATUS_IDS.success:
      return 'statusSuccess'
    case NODE_GENERATION_STATUS_IDS.error:
      return 'statusError'
    default:
      return hasMedia ? 'statusSuccess' : 'statusIdle'
  }
}

export function NodeMediaInspector({
  node,
  type,
  kind,
}: NodeMediaInspectorProps) {
  const t = useTranslations('StudioNode.mediaNodes')
  const tFields = useTranslations('StudioNode.workflowFields')
  const tWorkflows = useTranslations('StudioNode.workflowNodes')
  const { generateMediaNode, modelOptionsByType, updateNodeData } =
    useNodeWorkflowActions()
  const mediaUrl =
    typeof node.data.mediaUrl === 'string' ? node.data.mediaUrl : null
  const modelOptions = modelOptionsByType[type] ?? []
  const prompt = buildNodeWorkflowPrompt(type, node.data).trim()
  const fields = NODE_WORKFLOW_FIELDS_BY_NODE_TYPE[type] ?? [
    NODE_WORKFLOW_FIELD_IDS.prompt,
  ]
  const generationStatus =
    node.data.generationStatus ??
    (mediaUrl
      ? NODE_GENERATION_STATUS_IDS.success
      : NODE_GENERATION_STATUS_IDS.idle)
  const isPending =
    generationStatus === NODE_GENERATION_STATUS_IDS.pending ||
    node.data.status === NODE_STATUS_IDS.running
  const isTextNode = kind === NODE_MEDIA_KIND_IDS.text
  const disabledReason = isPending
    ? t('generating')
    : !node.data.model && !isTextNode
      ? t('noModel')
      : !prompt && !isTextNode
        ? t('noPrompt')
        : null
  const statusLabelKey = getStatusLabelKey(
    generationStatus,
    Boolean(mediaUrl),
    kind,
  )

  const handleFieldChange = useCallback(
    (fieldId: NodeWorkflowFieldId, value: string) => {
      const nextData = {
        ...node.data,
        [fieldId]: value,
      }

      updateNodeData(node.id, {
        [fieldId]: value,
        status: buildNodeWorkflowPrompt(type, nextData).trim()
          ? NODE_STATUS_IDS.ready
          : NODE_STATUS_IDS.idle,
      })
    },
    [node.data, node.id, type, updateNodeData],
  )

  const handleGenerate = useCallback(() => {
    void generateMediaNode?.(node.id)
  }, [generateMediaNode, node.id])

  const renderField = (fieldId: NodeWorkflowFieldId) => {
    const value = getNodeWorkflowFieldValue(node.data, fieldId)
    const isLongField =
      fieldId === NODE_WORKFLOW_FIELD_IDS.prompt ||
      fieldId === NODE_WORKFLOW_FIELD_IDS.action ||
      fieldId === NODE_WORKFLOW_FIELD_IDS.composition ||
      fieldId === NODE_WORKFLOW_FIELD_IDS.dialogue ||
      fieldId === NODE_WORKFLOW_FIELD_IDS.motion
    const commonClassName =
      'w-full rounded-2xl border border-node-panel-inner bg-node-panel-soft px-3 text-sm leading-6 text-node-foreground outline-none placeholder:text-node-subtle focus-visible:border-node-amber focus-visible:ring-2 focus-visible:ring-node-amber/20'

    return (
      <InspectorField
        key={fieldId}
        label={tFields(`${fieldId}.label`)}
        statusDotClassName="bg-node-amber"
      >
        {isLongField ? (
          <Textarea
            value={value}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              handleFieldChange(fieldId, event.target.value)
            }
            aria-label={tFields(`${fieldId}.label`)}
            placeholder={tFields(`${fieldId}.placeholder`)}
            className="min-h-24 resize-none rounded-2xl border-node-panel-inner bg-node-panel-soft text-sm leading-6 text-node-foreground shadow-none placeholder:text-node-subtle focus-visible:border-node-amber focus-visible:ring-node-amber/30"
          />
        ) : (
          <input
            value={value}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              handleFieldChange(fieldId, event.target.value)
            }
            aria-label={tFields(`${fieldId}.label`)}
            placeholder={tFields(`${fieldId}.placeholder`)}
            className={`${commonClassName} h-10`}
          />
        )}
      </InspectorField>
    )
  }

  return (
    <div className="space-y-4">
      <div className="relative aspect-video overflow-hidden rounded-2xl border border-node-panel-inner bg-node-panel-soft">
        {mediaUrl && kind === NODE_MEDIA_KIND_IDS.image ? (
          <Image
            src={mediaUrl}
            alt={t('imageAlt')}
            fill
            sizes="360px"
            className="object-cover"
            unoptimized
          />
        ) : null}

        {mediaUrl && kind === NODE_MEDIA_KIND_IDS.video ? (
          <video
            src={mediaUrl}
            className="h-full w-full object-cover"
            controls
            muted
          />
        ) : null}

        {mediaUrl && kind === NODE_MEDIA_KIND_IDS.audio ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4">
            <Mic2 className="size-8 text-fuchsia-200" />
            <audio src={mediaUrl} controls className="w-full" />
          </div>
        ) : null}

        {!mediaUrl ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            {kind === NODE_MEDIA_KIND_IDS.video ? (
              <Video className="size-8 text-teal-200" />
            ) : (
              <WandSparkles className="size-8 text-node-amber" />
            )}
            <p className="text-xs leading-5 text-node-muted">
              {tWorkflows(`${type}.emptyPreview`)}
            </p>
          </div>
        ) : null}

        {isPending ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-node-canvas/70 text-node-foreground backdrop-blur-sm">
            <Loader2 className="size-5 animate-spin text-node-amber" />
            <span className="text-xs font-semibold">{t('generating')}</span>
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        {fields.map((fieldId) => renderField(fieldId))}
      </div>

      {!isTextNode ? (
        <div className="rounded-2xl border border-node-panel-inner bg-node-panel-soft p-2">
          <WorkflowModelPicker
            value={node.data.model}
            options={modelOptions}
            onChange={(model) => updateNodeData(node.id, { model })}
          />
          <p className="mt-1 truncate px-1 text-2xs font-medium text-node-subtle">
            {t(statusLabelKey)}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-node-panel-inner bg-node-panel-soft px-3 py-2 text-xs leading-5 text-node-muted">
          {t(statusLabelKey)}
        </div>
      )}

      {node.data.generationError ? (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-xs leading-5 text-red-100">
          {node.data.generationError}
        </div>
      ) : null}

      {!isTextNode ? (
        <TooltipProvider delayDuration={250}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex w-full">
                <Button
                  type="button"
                  disabled={Boolean(disabledReason)}
                  onClick={handleGenerate}
                  className="h-10 w-full rounded-2xl bg-node-foreground text-sm font-semibold text-node-canvas hover:bg-node-foreground/90 disabled:bg-node-panel-inner disabled:text-node-muted"
                >
                  {isPending ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <WandSparkles className="mr-2 size-4" />
                  )}
                  {mediaUrl ? t('regenerate') : t('generate')}
                </Button>
              </span>
            </TooltipTrigger>
            {disabledReason ? (
              <TooltipContent side="top">{disabledReason}</TooltipContent>
            ) : null}
          </Tooltip>
        </TooltipProvider>
      ) : null}
    </div>
  )
}
