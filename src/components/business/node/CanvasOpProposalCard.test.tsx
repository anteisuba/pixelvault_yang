import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  NODE_IMAGE_ROLE_IDS,
  NODE_REVIEW_STATE_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { planNodeAssistantOps } from '@/lib/node-assistant-op-plan'
import type { NodeAssistantOpBatch } from '@/types/node-assistant-ops'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import { CanvasOpProposalCard } from './CanvasOpProposalCard'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

function makeNode(
  id: string,
  type: NodeWorkflowNode['type'],
  data: Record<string, unknown> = {},
): NodeWorkflowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { prompt: '', status: 'idle', ...data },
  } as NodeWorkflowNode
}

function renderCard(
  batch: NodeAssistantOpBatch,
  nodes: NodeWorkflowNode[] = [],
  edges: NodeWorkflowEdge[] = [],
) {
  const onApply = vi
    .fn()
    .mockResolvedValue({ applied: 1, skipped: 0, createdNodeIds: ['node-new'] })
  render(
    <CanvasOpProposalCard
      plan={planNodeAssistantOps(batch, nodes, edges)}
      getNodeLabel={(id) => id}
      onApply={onApply}
    />,
  )
  return onApply
}

describe('CanvasOpProposalCard', () => {
  it('结构操作整批一次应用', async () => {
    const shot = makeNode('shot-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.shot,
    })
    const onApply = renderCard(
      {
        ops: [
          { op: 'add_node', intent: 'organize.character', ref: 'c1' },
          { op: 'connect', source: 'c1', target: 'shot-1' },
        ],
      },
      [shot],
    )

    fireEvent.click(screen.getByText('apply'))

    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1))
    expect(onApply.mock.calls[0][0]).toHaveLength(2)
    expect(screen.getByText('appliedSummary')).toBeInTheDocument()
  })

  it('逐条剔除后只应用剩下的那些', async () => {
    const shot = makeNode('shot-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.shot,
    })
    const onApply = renderCard(
      {
        ops: [
          { op: 'add_node', intent: 'organize.character', ref: 'c1' },
          { op: 'connect', source: 'c1', target: 'shot-1' },
        ],
      },
      [shot],
    )

    fireEvent.click(screen.getByText('describe.connect'))
    fireEvent.click(screen.getByText('apply'))

    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1))
    const applied = onApply.mock.calls[0][0] as { op: { op: string } }[]
    expect(applied).toHaveLength(1)
    expect(applied[0]?.op.op).toBe('add_node')
  })

  it('被拒的 op 带出理由，且不进应用批次', async () => {
    const onApply = renderCard({
      ops: [
        { op: 'add_node', intent: 'image.shot' },
        { op: 'connect', source: 'ghost', target: 'other-ghost' },
      ],
    })

    expect(screen.getByText('rejectedPrefix')).toBeInTheDocument()

    fireEvent.click(screen.getByText('apply'))
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1))
    expect(onApply.mock.calls[0][0]).toHaveLength(1)
  })

  it('烧 credit 的生成不混进整批应用，自己单独一条确认', async () => {
    const shot = makeNode('shot-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.shot,
      model: {
        adapterType: AI_ADAPTER_TYPES.GEMINI,
        modelId: 'gemini-3.1-flash-image-preview',
        apiKeyId: 'key-1',
      },
    })
    const onApply = renderCard(
      {
        ops: [
          { op: 'rename', target: 'shot-1', name: '雨夜开场镜' },
          { op: 'generate', target: 'shot-1' },
        ],
      },
      [shot],
    )

    fireEvent.click(screen.getByText('apply'))
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1))
    const structural = onApply.mock.calls[0][0] as { op: { op: string } }[]
    expect(structural).toHaveLength(1)
    expect(structural[0]?.op.op).toBe('rename')

    fireEvent.click(screen.getByText('confirmGenerate'))
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(2))
    const generate = onApply.mock.calls[1][0] as { op: { op: string } }[]
    expect(generate).toHaveLength(1)
    expect(generate[0]?.op.op).toBe('generate')
  })

  it('助手自批的那条永远出现在卡上、永远不可应用', () => {
    const shot = makeNode('shot-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.shot,
      mediaUrl: 'https://cdn/shot.png',
    })
    renderCard(
      {
        ops: [
          {
            op: 'set_review_state',
            target: 'shot-1',
            state: NODE_REVIEW_STATE_IDS.approved,
          },
        ],
      },
      [shot],
    )

    expect(screen.getByText('rejectedPrefix')).toBeInTheDocument()
    // 一条 ready 的结构 op 都没有 → 整个应用按钮不出现
    expect(screen.queryByText('apply')).not.toBeInTheDocument()
  })
})
