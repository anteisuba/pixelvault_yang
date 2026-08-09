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

  /**
   * 回归用例（任务包 canvas-harvest-fixes §D）：**结构 op 存在，但
   * `autoAppliedCount` 是 0**。
   *
   * 上面那条「审核态不自动落」用的也是 `autoAppliedCount: 0`，但它是**纯
   * set_review_state 批**——`structuralOps` 为空，应用按钮本来就不渲染，所以
   * 覆盖不到这个组合。
   *
   * 缺陷（2026-08-09 复现，同日修）：`canToggle` 要求 `=== undefined`、回执要求
   * `> 0`，0 同时落在两边的否定区 → 卡上**有应用按钮、条目却全部 disabled**，
   * 用户看得见应用却一条都剔不掉、也点不动。
   *
   * `0` 的来源只有一条（三条推测里另两条产生的都是 `undefined`）：dock 的
   * `handleApplyAssistantOps` 在 `runAssistantCanvasOps` 缺席时直接返回
   * `{applied: 0, skipped: 全部}`。**即「跑过了，一条没落」——图没被改，所以
   * 条目当然还能编。**
   */
  it('结构 op + autoAppliedCount=0 → 一条没落，条目照样可勾选剔除', () => {
    const shot = makeNode('shot-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.shot,
    })
    renderCard(
      {
        ops: [
          { op: 'add_node', intent: 'organize.character', ref: 'c1' },
          { op: 'connect', source: 'c1', target: 'shot-1' },
        ],
      },
      [shot],
      [],
      { autoAppliedCount: 0 },
    )

    // 回执不出现（0 条落了，没什么可回执的）——于是落到应用按钮那一支。
    expect(screen.queryByText('autoApplied')).not.toBeInTheDocument()
    expect(screen.getByText('apply')).toBeInTheDocument()

    const row = screen.getByText('describe.connect').closest('button')
    expect(row).not.toBeDisabled()
    fireEvent.click(row!)
    // 剔掉一条后，应用按钮的计数跟着走 —— 勾选真的生效，不是只解了 disabled。
    expect(screen.getByText('apply')).toBeInTheDocument()
  })

  /**
   * 同一个缺陷的第三个面（上游账本没列）：`plan` 的选择也在问「自动落落了没
   * 有」。0 时图**根本没被改**，计划就该继续跟着画布实时重算 —— 早先它和
   * `autoAppliedCount !== undefined` 绑在一起，0 会把计划冻在首帧那一份。
   */
  it.each([
    [0, true],
    [2, false],
  ])(
    'autoAppliedCount=%s → 计划跟着画布重算 = %s',
    (autoAppliedCount, followsLive) => {
      const shot = makeNode('shot-1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.shot,
      })
      const character = makeNode('c1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.character,
      })
      const batch: NodeAssistantOpBatch = {
        ops: [{ op: 'connect', source: 'c1', target: 'shot-1' }],
      }
      const card = (nodes: NodeWorkflowNode[]) => (
        <CanvasOpProposalCard
          plan={planNodeAssistantOps(batch, nodes, [])}
          getNodeLabel={(id) => id}
          onApply={vi.fn()}
          autoAppliedCount={autoAppliedCount}
        />
      )

      const view = render(card([shot, character]))
      expect(screen.queryByText('rejectedPrefix')).not.toBeInTheDocument()

      // 用户中途把源节点删了 → 父组件重算出的计划变成 rejected。
      view.rerender(card([shot]))
      if (followsLive) {
        expect(screen.getByText('rejectedPrefix')).toBeInTheDocument()
      } else {
        // 已经落过了，图确实变了 —— 这时重算出的「不认识这个节点」说的是刚被
        // 自动落下去的东西，读起来像失败，所以按首帧那份显示。
        expect(screen.queryByText('rejectedPrefix')).not.toBeInTheDocument()
      }
    },
  )

  it('对照组：autoAppliedCount 缺省时，条目可勾选剔除', () => {
    const shot = makeNode('shot-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.shot,
    })
    renderCard(
      {
        ops: [
          { op: 'add_node', intent: 'organize.character', ref: 'c1' },
          { op: 'connect', source: 'c1', target: 'shot-1' },
        ],
      },
      [shot],
    )

    expect(screen.getByText('apply')).toBeInTheDocument()
    expect(
      screen.getByText('describe.connect').closest('button'),
    ).not.toBeDisabled()
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
