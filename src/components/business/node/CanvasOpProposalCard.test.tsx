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
  extra: { autoAppliedCount?: number; onUndoAutoApply?: () => void } = {},
) {
  const onApply = vi
    .fn()
    .mockResolvedValue({ applied: 1, skipped: 0, createdNodeIds: ['node-new'] })
  render(
    <CanvasOpProposalCard
      plan={planNodeAssistantOps(batch, nodes, edges)}
      getNodeLabel={(id) => id}
      onApply={onApply}
      {...extra}
    />,
  )
  return onApply
}

describe('CanvasOpProposalCard', () => {
  // B1：批准一条自己看不到内容的写操作等于没有审批，而提示词是 add_node 里唯一
  // 有内容的部分。
  it('把助手写进来的提示词原样显示出来供审阅', () => {
    const prompt =
      'Chibi three-view sheet, same hairstyle and outfit as the reference, only the palette becomes navy and sky blue.'
    renderCard({
      ops: [
        {
          op: 'add_node',
          intent: 'image.shot',
          ref: 's1',
          name: '蓝白配色版',
          prompt,
        },
      ],
    })

    expect(screen.getByText(prompt)).toBeInTheDocument()
  })

  // B3：结构 op 已经自动落了 —— 卡这时不是审批入口，是回执 + 后悔药。再留一个
  // 「应用」按钮，点下去就是把同一批再落一遍。
  it('自动落之后显示回执与撤销，不再显示应用按钮', () => {
    const onUndo = vi.fn()
    renderCard(
      {
        ops: [
          { op: 'add_node', intent: 'organize.character', ref: 'c1' },
          { op: 'add_node', intent: 'organize.scene', ref: 's1' },
        ],
      },
      [],
      [],
      { autoAppliedCount: 2, onUndoAutoApply: onUndo },
    )

    expect(screen.queryByText('apply')).not.toBeInTheDocument()
    expect(screen.getByText('autoApplied')).toBeInTheDocument()

    fireEvent.click(screen.getByText('undoAutoApplied'))
    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  // 审核态是「用户对产出的判断」不是结构 —— 助手连自批都被钉死禁止，降级成自动
  // 落违背同一个意图。所以它跟 generate 一样逐条确认。
  it('审核态不自动落，走自己的逐条确认', async () => {
    const shot = makeNode('shot-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.shot,
      mediaUrl: 'https://cdn.example.com/shot.png',
    })
    const onApply = renderCard(
      {
        ops: [
          {
            op: 'set_review_state',
            target: 'shot-1',
            state: NODE_REVIEW_STATE_IDS.rejected,
            reason: '构图偏了',
          },
        ],
      },
      [shot],
      [],
      { autoAppliedCount: 0 },
    )

    expect(screen.queryByText('apply')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('confirmReview'))

    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1))
    expect(onApply.mock.calls[0][0]).toHaveLength(1)
  })

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
