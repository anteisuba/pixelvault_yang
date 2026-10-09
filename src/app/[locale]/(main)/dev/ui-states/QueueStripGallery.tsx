'use client'

import { useEffect, useState } from 'react'

import { ASSISTANT_OPERATOR_CONFIRM_KIND_IDS } from '@/constants/assistant-operator'
import {
  NODE_STATUS_IDS,
  type NodeWorkflowStatus,
} from '@/constants/node-types'
import {
  STUDIO_OPERATOR_CONFIRM_STATUS_IDS,
  type StudioOperatorConfirmStatus,
} from '@/constants/studio-assistant-operator'
import { StudioOperatorQueueCard } from '@/components/business/studio/assistant-operator/StudioOperatorQueueCard'

/**
 * 助手「多张生成」确认卡（队列条，方向 C）的样板间：确认之后那几格的进度与出图要真花钱
 * 跑一轮才看得到。第一张可以真点（去掉一格、确认后按顺序跑完，第三格失败）；下面三张
 * 是定格的状态。
 */
const NODES = [
  { id: 'q-1', name: '女德拉科 · 黑袍' },
  { id: 'q-2', name: '哈利 · 黑袍' },
  { id: 'q-3', name: '罗恩 · 黑袍' },
  { id: 'q-4', name: '克拉布 · 黑袍' },
]
const PREVIEW: Record<string, string> = {
  'q-1': '/showcase/showcase-01.webp',
  'q-2': '/showcase/showcase-02.webp',
  'q-3': '/showcase/showcase-03.webp',
  'q-4': '/showcase/showcase-04.webp',
}
/** 确认后第几秒跑完（⛔ 不按真进度：样板间只演顺序）。 */
const FINISH_AT_S: Record<string, number> = { 'q-1': 4, 'q-2': 6, 'q-4': 8 }

type Run = { status: NodeWorkflowStatus; previewUrl?: string }

function confirmOf(
  status: StudioOperatorConfirmStatus,
  nodes = NODES,
  decidedAt?: string,
) {
  return {
    id: `queue-${status}`,
    kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate,
    status,
    ...(decidedAt ? { decidedAt } : {}),
    request: {
      model: { id: 'gpt-image-2.5-flare', label: 'Flare' },
      count: 1,
      specs: { aspectRatio: '3:4', resolution: '1K', durationSeconds: null },
      canvasNode: nodes[0],
      canvasNodes: nodes,
    },
  } as const
}

function LiveQueue() {
  const [chosen, setChosen] = useState<typeof NODES | null>(null)
  const [decidedAt, setDecidedAt] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!decidedAt) return
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [decidedAt])
  const elapsed = decidedAt ? (now - Date.parse(decidedAt)) / 1000 : 0
  const runOf = (id: string): Run => {
    if (!decidedAt) return { status: NODE_STATUS_IDS.idle }
    if (id === 'q-3')
      return elapsed > 5
        ? { status: NODE_STATUS_IDS.failed }
        : { status: NODE_STATUS_IDS.running }
    return elapsed > (FINISH_AT_S[id] ?? 0)
      ? { status: NODE_STATUS_IDS.done, previewUrl: PREVIEW[id] }
      : { status: NODE_STATUS_IDS.running }
  }
  return (
    <StudioOperatorQueueCard
      confirm={
        decidedAt
          ? confirmOf(
              STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed,
              chosen ?? NODES,
              decidedAt,
            )
          : confirmOf(STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle)
      }
      nodes={chosen ?? NODES}
      runOf={runOf}
      costOf={() => 0.048}
      canGenerate
      onConfirm={(ids) => {
        setChosen(NODES.filter((node) => ids.includes(node.id)))
        setDecidedAt(new Date().toISOString())
      }}
      onCancel={() => {}}
      onRetry={() => {}}
      formatTime={() => '11:24'}
    />
  )
}

export function QueueStripGallery() {
  const [key, setKey] = useState(0)
  const stillRuns: Record<string, Run> = {
    'q-1': { status: NODE_STATUS_IDS.done, previewUrl: PREVIEW['q-1'] },
    'q-2': { status: NODE_STATUS_IDS.running },
    'q-3': { status: NODE_STATUS_IDS.failed },
    'q-4': { status: NODE_STATUS_IDS.running },
  }
  const [startedAt] = useState(() =>
    new Date(Date.now() - 12_000).toISOString(),
  )
  return (
    <div className="flex flex-col items-center gap-6">
      <button
        type="button"
        onClick={() => setKey((value) => value + 1)}
        className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
      >
        重来一遍
      </button>
      <div className="flex w-108 flex-col gap-3 rounded-2xl bg-muted p-3">
        <LiveQueue key={key} />
      </div>
      <div className="flex w-108 flex-col gap-3 rounded-2xl bg-muted p-3">
        <StudioOperatorQueueCard
          confirm={confirmOf(
            STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed,
            NODES,
            startedAt,
          )}
          nodes={NODES}
          runOf={(id) => stillRuns[id]}
          canGenerate
          onConfirm={() => {}}
          onCancel={() => {}}
          onRetry={() => {}}
          formatTime={() => '11:24'}
        />
      </div>
      <div className="flex w-108 flex-col gap-3 rounded-2xl bg-muted p-3">
        <StudioOperatorQueueCard
          confirm={confirmOf(
            STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled,
            NODES,
            startedAt,
          )}
          nodes={NODES}
          canGenerate
          onConfirm={() => {}}
          onCancel={() => {}}
          onRetry={() => {}}
          formatTime={() => '11:24'}
        />
      </div>
    </div>
  )
}
