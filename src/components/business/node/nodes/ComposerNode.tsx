'use client'

import { useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { SendHorizontal } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'
import { cn } from '@/lib/utils'

import { NodeShell } from './NodeShell'
import {
  getDefaultEditorFields,
  NodeActionButton,
  NodeExpandButton,
  NodeFieldEditor,
} from './NodeCardControls'
import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'

export function ComposerNode({
  id,
  data,
  selected,
}: NodeProps<NodeWorkflowNode>) {
  const [expanded, setExpanded] = useState(false)
  const t = useTranslations('StudioNode.composer')
  const { sendFromComposer } = useNodeWorkflowActions()
  const prompt = data.prompt.trim()

  return (
    <NodeShell
      type={NODE_TYPE_IDS.composer}
      selected={selected}
      status={data.status}
      className={cn(
        'node-canvas-panel-motion',
        expanded && 'z-10 w-node-card-expanded',
      )}
    >
      <NodeShell.Header
        type={NODE_TYPE_IDS.composer}
        status={data.status}
        action={
          <NodeExpandButton
            expanded={expanded}
            onToggle={() => setExpanded((value) => !value)}
          />
        }
      />
      <NodeShell.Body className="space-y-3">
        <div className="min-h-32 rounded-2xl border border-node-panel-inner bg-node-panel-soft p-3">
          <p className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
            {t('promptLabel')}
          </p>
          <p className="mt-2 line-clamp-5 text-sm leading-6 text-node-foreground">
            {prompt || t('placeholder')}
          </p>
        </div>
        {expanded ? (
          <>
            <NodeFieldEditor
              nodeId={id}
              data={data}
              fields={getDefaultEditorFields(NODE_TYPE_IDS.composer)}
            />
            <NodeActionButton
              disabled={!prompt}
              onClick={() => sendFromComposer?.(id)}
            >
              <SendHorizontal className="mr-1.5 size-4" />
              {t('send')}
            </NodeActionButton>
          </>
        ) : null}
      </NodeShell.Body>
      <NodeShell.Footer>
        <p className="truncate text-2xs font-medium text-node-subtle">
          {t('readyHint')}
        </p>
        <span className="flex size-8 items-center justify-center rounded-2xl bg-node-panel-inner text-node-foreground">
          <SendHorizontal className="size-4" />
        </span>
      </NodeShell.Footer>
    </NodeShell>
  )
}
