import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@xyflow/react', () => ({
  useNodes: () => [],
  useEdges: () => [],
}))

const { updateNodeData, handleMerge } = vi.hoisted(() => ({
  updateNodeData: vi.fn(),
  handleMerge: vi.fn(),
}))

vi.mock('../NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({ updateNodeData }),
}))

const { mergeState } = vi.hoisted(() => ({
  mergeState: {
    upstreamVideoUrls: ['https://cdn.test/a.mp4', 'https://cdn.test/b.mp4'],
    clipCount: 2,
    // minClips > clipCount 是故意的：让九槽阵列测试同时覆盖三种格子
    // （已填 / 未填但必须 / 未填且可选），而不是恰好卡在 2=2 的边界上。
    minClips: 3,
    maxClips: 8,
    clipOverrides: new Map<string, { startSec?: number; endSec?: number }>(),
    hasAnyTrim: false,
    canMerge: true,
    isMerging: false,
    disabledReason: null as { kind: string; min?: number; max?: number } | null,
    disabledReasonText: null as string | null,
    handleMerge,
  },
}))

vi.mock('@/hooks/node/use-video-merge-action', () => ({
  useVideoMergeAction: () => mergeState,
}))

import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

import { NodeDetailFrame } from './NodeDetailFrame'
import { VideoMergeDetailBody } from './VideoMergeDetailBody'

function renderBody(data: Partial<NodeWorkflowNodeData> = {}) {
  return render(
    <VideoMergeDetailBody
      nodeId="merge-1"
      type={NODE_TYPE_IDS.videoMerge}
      data={
        {
          prompt: '',
          status: NODE_STATUS_IDS.idle,
          ...data,
        } as NodeWorkflowNodeData
      }
    >
      {(slots) => (
        <NodeDetailFrame identity={<span>identity</span>} slots={slots} />
      )}
    </VideoMergeDetailBody>,
  )
}

describe('VideoMergeDetailBody', () => {
  /**
   * 有成片（`mediaUrl` 在）＝回归基准：七槽满员，一像素不改（画布修法包 C
   * 「有内容态不改」）。素材架仍在自己的槽位上，不随空态让位搬走。
   */
  it('有成片时七槽严格按 2→3→4→5→6→7 排布，素材架不让位', () => {
    const { container } = renderBody({
      mediaUrl: 'https://cdn.test/merged.mp4',
    })

    expect(
      Array.from(container.querySelectorAll('[data-node-detail-slot]')).map(
        (element) => element.getAttribute('data-node-detail-slot'),
      ),
    ).toEqual([
      'identity-bar',
      'subject-stage',
      'compose-desk',
      'source-rack',
      'relations-strip',
      'evidence-drawer',
      'action-dock',
    ])
  })

  /**
   * 画布修法包 C（2026-08-26）：空态让位——还没有成片时素材架整栏让位给
   * 主体台的九槽阵列，`source-rack` 那一格从 DOM 里消失（不是渲染了个空
   * div——契约判据是「整栏不在 DOM 里」，同角色族素材架整栏不渲染的判法）。
   * 其余六槽顺序不跳、身份不变——这是契约唯一不可推翻的一条。
   */
  it('空态：素材架让位给九槽阵列，DOM 序去掉 source-rack 但其余不跳', () => {
    const { container } = renderBody()

    expect(
      Array.from(container.querySelectorAll('[data-node-detail-slot]')).map(
        (element) => element.getAttribute('data-node-detail-slot'),
      ),
    ).toEqual([
      'identity-bar',
      'subject-stage',
      'compose-desk',
      'relations-strip',
      'evidence-drawer',
      'action-dock',
    ])

    const stage = container.querySelector(
      '[data-node-detail-slot="subject-stage"]',
    )
    // 九槽阵列此刻寄居在 stage 里：已接的两段（clipCount:2）按序填上前两格；
    // 第三格未填但在 `minClips`（=3）之内，标「必须」——一眼验完「已填/未填
    // 必须/未填可选」三种格子。
    expect(stage?.textContent).toContain('https://cdn.test/a.mp4')
    expect(stage?.textContent).toContain('https://cdn.test/b.mp4')
    expect(stage?.textContent).toContain('slotRequired')
    expect(stage?.textContent).toContain('slotOptional')
  })

  /**
   * ⚠ 账本 ② 拍板：逐段裁剪算**编排**不算材料（`mergeSettings` 是本节点可写
   * 状态，而且它决定后端走哪条路）。上游片段列表才是材料。这条断言把两者
   * 分别钉在各自的槽里 —— 迁移前它们是右轨里同一块带边框面板的上下两半。
   * ⚠ 传 `mediaUrl` 走「有内容」态：素材架在这个状态下才是今天那份纯文本
   * `<ol>`——空态时同一份材料改在 stage 的九槽阵列里，见上面两条新增用例。
   */
  it('上游片段在素材架、裁剪按钮在编排台，输入框收进浮层', () => {
    const { container } = renderBody({
      mediaUrl: 'https://cdn.test/merged.mp4',
    })

    const rack = container.querySelector(
      '[data-node-detail-slot="source-rack"]',
    )
    const desk = container.querySelector(
      '[data-node-detail-slot="compose-desk"]',
    )
    expect(rack?.textContent).toContain('https://cdn.test/a.mp4')
    expect(desk?.querySelector('button')).toHaveAccessibleName('trim.editLabel')
    // 参数收成一颗按钮：输入框在**浮层里**，不在一级面上。
    expect(
      screen.queryByLabelText('trim.startLabelA11y'),
    ).not.toBeInTheDocument()
  })

  /**
   * ⚠ 迁移前那两个裁剪输入是 `value={String(stored)}` + 每次 change 就
   * `Number()` 后夹范围再落库 —— 敲「1.」那一帧点就被吃掉，**用户打不出小数**。
   * `DraftNumberField` 只在 blur/Enter 时提交。
   */
  it('裁剪输入在编辑期间不落库，失焦才提交', () => {
    renderBody()
    fireEvent.click(screen.getByRole('button', { name: 'trim.editLabel' }))

    const start = screen.getAllByLabelText('trim.startLabelA11y')[0]
    fireEvent.change(start, { target: { value: '1.' } })
    expect(updateNodeData).not.toHaveBeenCalled()

    fireEvent.change(start, { target: { value: '1.5' } })
    fireEvent.blur(start)
    expect(updateNodeData).toHaveBeenCalledWith('merge-1', {
      mergeSettings: {
        clips: [
          { url: 'https://cdn.test/a.mp4', startSec: 1.5, endSec: undefined },
        ],
      },
    })
  })
})
