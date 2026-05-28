'use client'

import type { NodeProps } from '@xyflow/react'
import { IdCard, Mic2, Music2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { NodeShell } from './NodeShell'

export function VoiceNode(props: NodeProps<NodeWorkflowNode>) {
  const { data, selected } = props
  const t = useTranslations('StudioNode.voiceProfile')
  const hasVoiceProfile = Boolean(
    data.voiceName ||
    data.voiceId ||
    data.voiceReferenceAudioUrl ||
    data.voiceStyle ||
    data.voiceEmotion,
  )
  const status = hasVoiceProfile ? NODE_STATUS_IDS.ready : data.status
  const voiceTitle =
    data.voiceName || data.voiceId || data.voiceProvider || t('emptyTitle')
  const providerLabel = data.voiceProvider || t('providerFallback')

  return (
    <NodeShell
      type={NODE_TYPE_IDS.voice}
      selected={selected}
      showTargetHandle={false}
    >
      <NodeShell.Header type={NODE_TYPE_IDS.voice} status={status} />
      <NodeShell.Body className="space-y-3">
        <div className="flex min-h-28 flex-col items-center justify-center gap-3 rounded-xl border border-node-panel-inner bg-node-panel-soft px-4 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-node-amber/15 text-node-amber">
            <Mic2 className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-node-foreground">
              {voiceTitle}
            </p>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-node-muted">
              {hasVoiceProfile ? t('readyDescription') : t('emptyDescription')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="min-w-0 rounded-xl border border-node-panel-inner bg-node-panel-soft p-3">
            <p className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
              {t('providerLabel')}
            </p>
            <p className="mt-1 truncate text-xs font-semibold text-node-foreground">
              {providerLabel}
            </p>
          </div>
          <div className="min-w-0 rounded-xl border border-node-panel-inner bg-node-panel-soft p-3">
            <p className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
              {t('referenceLabel')}
            </p>
            <p className="mt-1 truncate text-xs font-semibold text-node-foreground">
              {data.voiceReferenceAudioName || t('referenceEmpty')}
            </p>
          </div>
        </div>

        {data.voiceStyle || data.voiceEmotion ? (
          <div className="space-y-1 rounded-xl border border-node-panel-inner bg-node-panel-soft p-3 text-xs leading-5 text-node-muted">
            {data.voiceStyle ? (
              <p className="line-clamp-2">{data.voiceStyle}</p>
            ) : null}
            {data.voiceEmotion ? (
              <p className="line-clamp-2">{data.voiceEmotion}</p>
            ) : null}
          </div>
        ) : null}
      </NodeShell.Body>
      <NodeShell.Footer>
        <p className="truncate text-2xs font-medium text-node-subtle">
          {hasVoiceProfile ? t('footerReady') : t('footerEmpty')}
        </p>
        <span className="flex size-8 items-center justify-center rounded-xl bg-node-panel-inner text-node-amber">
          {data.voiceId ? (
            <IdCard className="size-4" />
          ) : (
            <Music2 className="size-4" />
          )}
        </span>
      </NodeShell.Footer>
    </NodeShell>
  )
}
