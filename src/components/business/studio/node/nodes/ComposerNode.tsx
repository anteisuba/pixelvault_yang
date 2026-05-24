'use client'

import { useCallback, type ChangeEvent } from 'react'
import type { NodeProps } from '@xyflow/react'
import { Loader2, SendHorizontal } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useNodeWorkflowActions } from '@/components/business/studio/node/NodeWorkflowActionsContext'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { NodeShell } from './NodeShell'

export function ComposerNode({
  id,
  data,
  selected,
}: NodeProps<NodeWorkflowNode>) {
  const t = useTranslations('StudioNode.composer')
  const { sendFromComposer, updateNodeData } = useNodeWorkflowActions()
  const isRunning = data.status === NODE_STATUS_IDS.running

  const handlePromptChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeData(id, { prompt: event.target.value })
    },
    [id, updateNodeData],
  )

  const handleSend = useCallback(() => {
    void sendFromComposer?.(id)
  }, [id, sendFromComposer])

  return (
    <NodeShell type={NODE_TYPE_IDS.composer} selected={selected}>
      <NodeShell.Header type={NODE_TYPE_IDS.composer} status={data.status} />
      <NodeShell.Body className="space-y-3">
        <Textarea
          value={data.prompt}
          onChange={handlePromptChange}
          aria-label={t('promptLabel')}
          placeholder={t('placeholder')}
          className="nodrag nowheel min-h-28 resize-none rounded-2xl border-node-panel-inner bg-node-panel-soft text-sm leading-6 text-node-foreground shadow-none placeholder:text-node-subtle focus-visible:border-node-amber focus-visible:ring-node-amber/30"
        />
      </NodeShell.Body>
      <NodeShell.Footer>
        <p className="truncate text-2xs font-medium text-node-subtle">
          {isRunning ? t('generatingHint') : t('readyHint')}
        </p>
        <Button
          type="button"
          size="icon-sm"
          disabled={isRunning}
          onClick={handleSend}
          aria-label={t('send')}
          className="rounded-2xl bg-node-foreground text-node-canvas hover:bg-node-foreground/90 disabled:bg-node-panel-inner disabled:text-node-muted"
        >
          {isRunning ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <SendHorizontal className="size-4" />
          )}
        </Button>
      </NodeShell.Footer>
    </NodeShell>
  )
}
