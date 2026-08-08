import type { NodeProps } from '@xyflow/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NODE_MEDIA_KIND_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

vi.mock('../NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({
    updateNodeData: vi.fn(),
    generateMediaNode: vi.fn(),
  }),
}))

// NodeShell 是纯外壳（工具条 / 选中态 / 端口），与本文件要守的「窗内渲染什么」
// 无关，整体替身以免把它的 context 依赖一并拖进来。
vi.mock('./NodeShell', () => {
  const Pass = ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  )
  Pass.displayName = 'ShellPart'
  const Nothing = () => null
  Nothing.displayName = 'ShellNoop'
  const Shell = Object.assign(Pass, {
    Header: Nothing,
    Ingredients: Nothing,
    Body: Pass,
    Footer: Pass,
  })
  return { NodeShell: Shell }
})

vi.mock('./NodeProgressState', () => ({
  NodeProgressState: () => <div>progress</div>,
}))
vi.mock('./NodeVideoSurface', () => ({
  NodeVideoSurface: () => <div>video-surface</div>,
}))
vi.mock('./ImageCardMediaState', () => ({
  ImageCardStatusBadge: () => null,
  ImageCardFailedContent: () => <div>failed</div>,
}))

import { NodeMediaPreview } from './NodeMediaPreview'

function makeProps(
  data: Partial<NodeWorkflowNode['data']>,
): Parameters<typeof NodeMediaPreview>[0] {
  return {
    id: 'n1',
    type: NODE_TYPE_IDS.shotText,
    kind: NODE_MEDIA_KIND_IDS.text,
    selected: false,
    data: { prompt: '', status: 'idle', ...data } as NodeWorkflowNode['data'],
  } as unknown as NodeProps<NodeWorkflowNode> & {
    kind: typeof NODE_MEDIA_KIND_IDS.text
  }
}

describe('NodeMediaPreview — 文本族卡面', () => {
  it('写了内容就显示内容，而不是空态占位', () => {
    // 回归：窗内那段的判据是 `kind === text || !mediaUrl`，而文本节点的产物**就是
    // 文字**、永远没有 mediaUrl —— 两个条件恒成立，于是写多少字卡面都只显示
    // 「把场景、动作…」这句占位。真机上抓到两个写满内容的镜头文本节点都是这样。
    render(
      <NodeMediaPreview
        {...makeProps({
          scene: '深夜便利店-吧台',
          action: '小林坐在窗边吃泡面',
        })}
      />,
    )

    expect(screen.getByText(/深夜便利店-吧台/)).toBeInTheDocument()
    expect(
      screen.queryByText('StudioNode.workflowNodes.shotText.emptyPreview'),
    ).not.toBeInTheDocument()
  })

  it('真的没内容时才显示空态占位', () => {
    render(<NodeMediaPreview {...makeProps({})} />)

    expect(
      screen.getByText('StudioNode.workflowNodes.shotText.emptyPreview'),
    ).toBeInTheDocument()
  })
})
