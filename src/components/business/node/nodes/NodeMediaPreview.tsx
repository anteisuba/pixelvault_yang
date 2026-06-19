'use client'

import Image from 'next/image'
import { useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import {
  AlertCircle,
  FileText,
  ImageIcon,
  Loader2,
  Mic2,
  Video,
  WandSparkles,
} from 'lucide-react'
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
import {
  buildNodeWorkflowPrompt,
  getNodeWorkflowFieldValue,
} from '@/lib/node-workflow-prompt'
import type { NodeWorkflowNode } from '@/types/node-workflow'
import { cn } from '@/lib/utils'

import { NodeShell } from './NodeShell'
import {
  getDefaultEditorFields,
  NodeActionButton,
  NodeExpandButton,
  NodeFieldEditor,
  NodeModelSelector,
} from './NodeCardControls'
import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'

interface NodeMediaPreviewProps extends NodeProps<NodeWorkflowNode> {
  type: NodeWorkflowNodeType
  kind: NodeWorkflowMediaKind
}

function getEmptyIcon(kind: NodeWorkflowMediaKind) {
  switch (kind) {
    case NODE_MEDIA_KIND_IDS.video:
      return <Video className="size-8 text-node-port-video" />
    case NODE_MEDIA_KIND_IDS.audio:
      return <Mic2 className="size-8 text-node-port-voice" />
    case NODE_MEDIA_KIND_IDS.text:
      return <FileText className="size-8 text-node-foreground" />
    default:
      return <ImageIcon className="size-8 text-node-foreground" />
  }
}

function getMediaStatusLabelKey(
  hasMedia: boolean,
  kind: NodeWorkflowMediaKind,
): 'statusIdle' | 'statusSuccess' | 'statusTextReady' {
  if (kind === NODE_MEDIA_KIND_IDS.text) {
    return 'statusTextReady'
  }

  return hasMedia ? 'statusSuccess' : 'statusIdle'
}

function getSummaryFields(
  type: NodeWorkflowNodeType,
): readonly NodeWorkflowFieldId[] {
  return (
    NODE_WORKFLOW_FIELDS_BY_NODE_TYPE[type] ?? [NODE_WORKFLOW_FIELD_IDS.prompt]
  ).slice(0, 3)
}

export function NodeMediaPreview({
  id,
  type,
  kind,
  data,
  selected,
}: NodeMediaPreviewProps) {
  const [expanded, setExpanded] = useState(false)
  const t = useTranslations('StudioNode.mediaNodes')
  const tFields = useTranslations('StudioNode.workflowFields')
  const tWorkflows = useTranslations('StudioNode.workflowNodes')
  const { generateMediaNode } = useNodeWorkflowActions()
  const mediaUrl = typeof data.mediaUrl === 'string' ? data.mediaUrl : null
  const summaryFields = getSummaryFields(type)
  const editorFields = getDefaultEditorFields(type)
  const hasWorkflowPrompt = Boolean(buildNodeWorkflowPrompt(type, data))
  const generationStatus =
    data.generationStatus ??
    (mediaUrl
      ? NODE_GENERATION_STATUS_IDS.success
      : NODE_GENERATION_STATUS_IDS.idle)
  const isPending =
    generationStatus === NODE_GENERATION_STATUS_IDS.pending ||
    data.status === NODE_STATUS_IDS.running
  const isError =
    generationStatus === NODE_GENERATION_STATUS_IDS.error ||
    (data.status === NODE_STATUS_IDS.failed && Boolean(data.generationError))

  return (
    <NodeShell
      type={type}
      selected={selected}
      status={data.status}
      className={cn(
        'node-canvas-panel-motion',
        expanded && 'z-10 w-node-card-expanded',
      )}
    >
      <NodeShell.Header
        type={type}
        status={data.status}
        action={
          <NodeExpandButton
            expanded={expanded}
            onToggle={() => setExpanded((value) => !value)}
          />
        }
      />
      <NodeShell.Body className="space-y-3">
        <div className="relative aspect-video overflow-hidden rounded-2xl border border-node-panel-inner bg-node-panel-soft">
          {mediaUrl && kind === NODE_MEDIA_KIND_IDS.image ? (
            <Image
              src={mediaUrl}
              alt={t('imageAlt')}
              fill
              sizes="320px"
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
              <Mic2 className="size-8 text-node-port-voice" />
              <audio src={mediaUrl} controls className="w-full" />
            </div>
          ) : null}

          {kind === NODE_MEDIA_KIND_IDS.text || !mediaUrl ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
              {getEmptyIcon(kind)}
              <p className="text-xs leading-5 text-node-muted">
                {tWorkflows(`${type}.emptyPreview`)}
              </p>
            </div>
          ) : null}

          {isPending ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-node-canvas/70 text-node-foreground backdrop-blur-sm">
              <Loader2 className="size-5 animate-spin text-node-foreground" />
              <span className="text-xs font-semibold">{t('generating')}</span>
            </div>
          ) : null}
        </div>

        <div className="space-y-2 rounded-2xl border border-node-panel-inner bg-node-panel-soft p-3">
          {summaryFields.map((fieldId) => {
            const value = getNodeWorkflowFieldValue(data, fieldId)

            return (
              <div key={fieldId}>
                <p className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
                  {tFields(`${fieldId}.label`)}
                </p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-node-foreground">
                  {value || tFields(`${fieldId}.placeholder`)}
                </p>
              </div>
            )
          })}
        </div>

        {expanded ? (
          <>
            <NodeModelSelector nodeId={id} type={type} data={data} />
            <NodeFieldEditor nodeId={id} data={data} fields={editorFields} />
            {kind === NODE_MEDIA_KIND_IDS.image ? (
              <NodeActionButton
                disabled={!hasWorkflowPrompt || isPending}
                onClick={() => generateMediaNode?.(id)}
              >
                <WandSparkles className="mr-1.5 size-4" />
                {t(mediaUrl ? 'regenerate' : 'generate')}
              </NodeActionButton>
            ) : null}
          </>
        ) : null}

        {isError ? (
          <div className="flex gap-2 rounded-2xl border border-node-status-failed bg-node-status-failed/50 p-3 text-sm text-node-status-failed-fg">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p className="line-clamp-3 text-xs leading-5 text-node-status-failed-fg/80">
              {data.generationError}
            </p>
          </div>
        ) : null}
      </NodeShell.Body>
      <NodeShell.Footer>
        <p className="truncate text-2xs font-medium text-node-subtle">
          {hasWorkflowPrompt
            ? t(getMediaStatusLabelKey(Boolean(mediaUrl), kind))
            : tWorkflows(`${type}.footerEmpty`)}
        </p>
        <span className="flex size-8 items-center justify-center rounded-2xl bg-node-panel-inner text-node-foreground">
          <WandSparkles className="size-4" />
        </span>
      </NodeShell.Footer>
    </NodeShell>
  )
}
