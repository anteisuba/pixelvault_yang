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
    maxClips: 8,
    clipOverrides: new Map<string, { startSec?: number; endSec?: number }>(),
    hasAnyTrim: false,
    canMerge: true,
    isMerging: false,
    disabledReason: null as { kind: string; min?: number; max?: number } | null,
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
  it('七槽严格按 2→3→4→5→6→7 排布', () => {
    const { container } = renderBody()

    expect(
      Array.from(container.querySelectorAll('[data-node-detail-slot]')).map(
        (element) => element.getAttribute('data-node-detail-slot'),
      ),
    ).toEqual([
      'identity-bar',
      'subject-stage',
      'source-rack',
      'compose-desk',
      'relations-strip',
      'evidence-drawer',
      'action-dock',
    ])
  })

  /**
   * ⚠ 账本 ② 拍板：逐段裁剪算**编排**不算材料（`mergeSettings` 是本节点可写
   * 状态，而且它决定后端走哪条路）。上游片段列表才是材料。这条断言把两者
   * 分别钉在各自的槽里 —— 迁移前它们是右轨里同一块带边框面板的上下两半。
   */
  it('上游片段在素材架、裁剪按钮在编排台，输入框收进浮层', () => {
    const { container } = renderBody()

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
