import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NodeWorkflowNodeData } from '@/types/node-workflow'

// 《画布修法》刀二·B3（2026-08-26）：片盒的合并入口从近场工具条（卡一高就
// 被顶出视口）撤下，改挂到片盒自己的右侧侧车。这组用例只守侧车本身——
// NodeMediaPreview 的媒体窗渲染是既有逻辑、与这次改动无关，替身掉（同
// SeedanceNode.test.tsx 的写法）；CanvasImageSelectionToolbar 整体替身是因为
// 它的顶层还拉着 CharacterImageReferenceControls 一类重依赖，与 NodeShell.test.tsx
// 处理同一类问题同一个方子，这里只要它导出的 ToolbarLabelButton 桩件。
vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
}))

vi.mock('@xyflow/react', () => ({
  NodeToolbar: ({
    children,
    isVisible,
  }: {
    children: ReactNode
    isVisible?: boolean
  }) => (isVisible ? <div role="toolbar">{children}</div> : null),
  Position: { Top: 'top', Right: 'right' },
}))

const mocks = vi.hoisted(() => ({
  setExpandedNodeId: vi.fn(),
  multiSelectActive: false,
  canvasNodeDragActive: false,
}))

vi.mock('../NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => mocks,
}))

vi.mock('../CanvasPopIn', () => ({
  CanvasPopIn: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('../CanvasImageSelectionToolbar', () => ({
  ToolbarLabelButton: ({
    label,
    onClick,
    disabled,
  }: {
    label: string
    onClick: () => void
    disabled?: boolean
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {label}
    </button>
  ),
}))

vi.mock('./NodeMediaPreview', () => ({
  NodeMediaPreview: () => <div data-testid="media-preview" />,
}))

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}))

const { mergeState } = vi.hoisted(() => ({
  mergeState: {
    clipCount: 2,
    maxClips: 8,
    canMerge: true,
    isMerging: false,
    disabledReasonText: null as string | null,
    handleMerge: vi.fn(),
  },
}))

vi.mock('@/hooks/node/use-video-merge-action', () => ({
  useVideoMergeAction: () => mergeState,
}))

import { VideoMergeNode } from './VideoMergeNode'

function makeProps(data: Partial<NodeWorkflowNodeData> = {}, selected = true) {
  return {
    id: 'merge-1',
    type: 'videoMerge',
    data: { prompt: '', status: 'idle', ...data },
    selected,
  } as unknown as Parameters<typeof VideoMergeNode>[0]
}

beforeEach(() => {
  mocks.setExpandedNodeId.mockClear()
  mergeState.handleMerge.mockClear()
  mergeState.canMerge = true
  mergeState.isMerging = false
  mergeState.disabledReasonText = null
})

describe('VideoMergeNode — B3 片盒右侧侧车（一族一扇门）', () => {
  it('选中即可见「开始合并」与片段计数，不必先打开详情面板', () => {
    render(<VideoMergeNode {...makeProps()} />)
    expect(
      screen.getByRole('button', { name: 'merge.run' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('clipCount:{"count":2,"max":8}'),
    ).toBeInTheDocument()
  })

  it('点击「开始合并」派发 handleMerge（与详情面板动作坞同一条通道）', () => {
    render(<VideoMergeNode {...makeProps()} />)
    fireEvent.click(screen.getByRole('button', { name: 'merge.run' }))
    expect(mergeState.handleMerge).toHaveBeenCalledTimes(1)
  })

  it('已有媒体时按钮改读「重新合并」', () => {
    render(
      <VideoMergeNode
        {...makeProps({ mediaUrl: 'https://cdn.test/merged.mp4' })}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'merge.regenerate' }),
    ).toBeInTheDocument()
  })

  it('禁用原因非空时按钮 disabled 且原因文本可见', () => {
    mergeState.canMerge = false
    mergeState.disabledReasonText = '至少需要 2 段视频。'
    render(<VideoMergeNode {...makeProps()} />)
    expect(screen.getByRole('button', { name: 'merge.run' })).toBeDisabled()
    expect(screen.getByText('至少需要 2 段视频。')).toBeInTheDocument()
  })

  it('⤢ 展开——空态近场工具条已整条不渲染，侧车是详情面板唯一的近场入口', () => {
    render(<VideoMergeNode {...makeProps()} />)
    fireEvent.click(screen.getByRole('button', { name: 'expand' }))
    expect(mocks.setExpandedNodeId).toHaveBeenCalledWith('merge-1')
  })

  it('未选中时侧车不可见', () => {
    render(<VideoMergeNode {...makeProps({}, false)} />)
    expect(
      screen.queryByRole('button', { name: 'merge.run' }),
    ).not.toBeInTheDocument()
  })
})
