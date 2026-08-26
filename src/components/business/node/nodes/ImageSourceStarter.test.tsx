import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  NODE_GENERATION_STATUS_IDS,
  NODE_STATUS_IDS,
} from '@/constants/node-types'

// §7 owner 2026-07-28 真机实测缺陷③④：这份测试只覆盖这两条新加的分支——
// 「真正的空态」与「生成中/生成失败」现在必须区分开（同 NodeShell.test.tsx /
// LooseImageCard.test.tsx 的既有惯例，stub 掉整个重的子组件/模块，只测本文件
// 自己的逻辑）。上传三态（空/上传中/上传失败）在改动前就有效，本文件不重
// 复验证，只加这次新长出来的部分。

const mocks = vi.hoisted(() => ({
  updateNodeData: vi.fn(),
  setExpandedNodeId: vi.fn(),
  consumePendingPasteFile: vi.fn(() => undefined as File | undefined),
  generateMediaNode: vi.fn(async () => {}),
}))

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
}))

// §7 owner 2026-07-28 缺陷④续：`useUpdateNodeInternals` only works inside a
// ReactFlowProvider (its own doc says so). Real usage is always inside one
// (this component only ever renders as a React Flow custom node type) — the
// mock here just needs to exist so the hook call doesn't throw; the actual
// "does it get called on the right transition" behavior is a React Flow
// internal, not something worth re-testing against a fake store here.
vi.mock('@xyflow/react', () => ({
  useUpdateNodeInternals: () => vi.fn(),
}))

vi.mock('../NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => mocks,
}))

vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: () => null,
}))

// 只关心 NodeSell 收到的 showSourceHandle/showTargetHandle/status/className——
// 真实 NodeShell 会往下渲染 @xyflow/react 的 <Handle>，那个脱离 ReactFlow
// context 没法测（同 NodeShell.test.tsx 的取舍：它也没有测 NodeShellRoot 本
// 体），这里把整个组件换成一个把关键 props 打成 data-* 属性的壳，直接断言
// 传参，比在真实 DOM 里找一个必然渲染不出来的 <Handle> 靠谱。
vi.mock('./NodeShell', () => {
  const NodeShellMock = ({
    children,
    showSourceHandle,
    showTargetHandle,
    status,
    className,
  }: {
    children: ReactNode
    showSourceHandle?: boolean
    showTargetHandle?: boolean
    status?: string
    className?: string
  }) => (
    <div
      data-testid="node-shell"
      data-show-source={String(showSourceHandle)}
      data-show-target={String(showTargetHandle)}
      data-status={status}
      data-classname={className ?? ''}
    >
      {children}
    </div>
  )
  // eslint `react/display-name` 要求这两个内联组件有名字——测试替身也不例外，
  // 否则 React DevTools / 报错栈里全是匿名组件，排查时定位不到是哪个替身。
  const NodeShellHeaderMock = () => null
  NodeShellHeaderMock.displayName = 'NodeShellHeaderMock'
  const NodeShellBodyMock = ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )
  NodeShellBodyMock.displayName = 'NodeShellBodyMock'
  NodeShellMock.Header = NodeShellHeaderMock
  NodeShellMock.Body = NodeShellBodyMock
  return { NodeShell: NodeShellMock }
})

import { ImageSourceStarter } from './ImageSourceStarter'

describe('ImageSourceStarter — 生成中 / 生成失败 (canvas-generate-composer.md §7 owner 2026-07-28 缺陷③④)', () => {
  beforeEach(() => {
    mocks.updateNodeData.mockClear()
    mocks.generateMediaNode.mockClear()
  })

  it('真正的空态：两个端口都不露，虚线卡边，空态提示', () => {
    render(<ImageSourceStarter nodeId="node-1" status={NODE_STATUS_IDS.idle} />)

    const shell = screen.getByTestId('node-shell')
    expect(shell).toHaveAttribute('data-show-source', 'false')
    expect(shell).toHaveAttribute('data-show-target', 'false')
    expect(shell.getAttribute('data-classname')).toContain(
      'canvas-card--dashed',
    )
    // 台账 B6（2026-08-03）：空态**不再盖章**。这条原先断言的是
    // `getByText('badgeEmpty')` —— 空本身已经由虚线卡边 + 空窗说了两遍，
    // 第三遍只是占掉一行。留下来的是**具体**的那句（uploadHint 告诉你能做什么），
    // 撤掉的是泛的那个（「空」）。
    expect(screen.queryByText('badgeEmpty')).not.toBeInTheDocument()
    expect(screen.getByText('uploadHint')).toBeInTheDocument()
  })

  // 《第一次交互》刀一 task B：这个组件只在「还没有图」时渲染，所以收窄是无
  // 条件的——上传/生成开始时卡不该从 320 跳回 400。两态各锁一次，防止有人把
  // 它挂回 isEmpty。
  it.each([
    ['真正的空态', NODE_STATUS_IDS.idle],
    ['上传/生成中', NODE_STATUS_IDS.running],
  ])('%s：卡宽都收窄到空态档', (_label, status) => {
    render(<ImageSourceStarter nodeId="node-1" status={status} />)

    expect(
      screen.getByTestId('node-shell').getAttribute('data-classname'),
    ).toContain('canvas-card--w-empty')
  })

  it('生成中（composer/generateMediaNode 已把 generationStatus/status 写进节点）：两个端口都露，非虚线，无百分比', () => {
    render(
      <ImageSourceStarter
        nodeId="node-1"
        status={NODE_STATUS_IDS.running}
        generationStatus={NODE_GENERATION_STATUS_IDS.pending}
      />,
    )

    const shell = screen.getByTestId('node-shell')
    expect(shell).toHaveAttribute('data-show-source', 'true')
    expect(shell).toHaveAttribute('data-show-target', 'true')
    expect(shell.getAttribute('data-classname')).not.toContain(
      'canvas-card--dashed',
    )
    expect(screen.getByText('badgeGenerating')).toBeInTheDocument()
    expect(screen.getByText('generating')).toBeInTheDocument()
    // 硬要求：生成中不显示百分比——不应该出现 uploading 的百分比文案。
    expect(screen.queryByText(/uploading:/)).not.toBeInTheDocument()
  })

  it('生成失败：两个端口都露，显示具体原因，重试调用 generateMediaNode(nodeId)', () => {
    render(
      <ImageSourceStarter
        nodeId="node-1"
        status={NODE_STATUS_IDS.failed}
        generationStatus={NODE_GENERATION_STATUS_IDS.error}
        generationError="费用超限，请稍后重试"
      />,
    )

    const shell = screen.getByTestId('node-shell')
    expect(shell).toHaveAttribute('data-show-source', 'true')
    expect(shell).toHaveAttribute('data-show-target', 'true')
    expect(screen.getByText('badgeFailed')).toBeInTheDocument()
    expect(screen.getByText('费用超限，请稍后重试')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'retry' }))
    expect(mocks.generateMediaNode).toHaveBeenCalledTimes(1)
    expect(mocks.generateMediaNode).toHaveBeenCalledWith('node-1')
  })

  it('生成失败但没有具体原因字符串时，回退到通用文案而不是空白', () => {
    render(
      <ImageSourceStarter
        nodeId="node-1"
        status={NODE_STATUS_IDS.idle}
        generationStatus={NODE_GENERATION_STATUS_IDS.error}
      />,
    )
    expect(screen.getByText('generationFailed')).toBeInTheDocument()
  })
})
