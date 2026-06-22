'use client'

import type { NodeProps } from '@xyflow/react'
import { SendHorizontal } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { NodeShell } from './NodeShell'
import { NodeExpandButton } from './NodeCardControls'

export function ComposerNode({
  id,
  data,
  selected,
}: NodeProps<NodeWorkflowNode>) {
  const t = useTranslations('StudioNode.composer')
  const prompt = data.prompt.trim()

  return (
    <NodeShell
      nodeId={id}
      type={NODE_TYPE_IDS.composer}
      selected={selected}
      status={data.status}
    >
      <NodeShell.Header
        type={NODE_TYPE_IDS.composer}
        status={data.status}
        action={<NodeExpandButton nodeId={id} />}
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
