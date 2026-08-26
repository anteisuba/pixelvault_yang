import { render } from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

// 只替身「与本测试要守的事无关」的重依赖——同 NodeMediaPreview.test.tsx /
// VideoReferenceNode.test.tsx 已立的先例，不整体 mock 掉本文件的逻辑。
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@xyflow/react', () => ({
  NodeToolbar: ({ children }: { children: ReactNode }) => children,
  Position: { Right: 'right' },
}))

vi.mock('../NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({
    updateNodeData: vi.fn(),
    setExpandedNodeId: vi.fn(),
    multiSelectActive: false,
    canvasNodeDragActive: false,
  }),
}))

// VideoComposer 拖着一整条 studio 表单依赖，与「卡宽收不收窄」无关，替身掉。
vi.mock('../composer/VideoComposer', () => ({
  VideoComposer: () => null,
}))

vi.mock('../CanvasPopIn', () => ({
  CanvasPopIn: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('./NodeProgressState', () => ({
  NodeProgressState: () => null,
}))

vi.mock('./NodeVideoSurface', () => ({
  NodeVideoSurface: () => <div>video-surface</div>,
}))

// NodeShell 是纯外壳（工具条/选中态/端口），本文件只需要它把 className 转发
// 出来——同 NodeMediaPreview.test.tsx 的替身写法。
vi.mock('./NodeShell', () => {
  const Root = ({
    children,
    className,
  }: {
    children?: ReactNode
    className?: string
  }) => (
    <div data-testid="node-shell" className={className}>
      {children}
    </div>
  )
  Root.displayName = 'ShellRoot'
  const Nothing = () => null
  Nothing.displayName = 'ShellHeader'
  const Body = ({ children }: { children: ReactNode }) => <>{children}</>
  Body.displayName = 'ShellBody'
  const Shell = Object.assign(Root, {
    Header: Nothing,
    Body,
    Footer: ({ children }: { children: ReactNode }) => (
      <footer>{children}</footer>
    ),
  })
  return { NodeShell: Shell }
})

import { SeedanceNode } from './SeedanceNode'

function makeProps(
  data: Partial<Record<string, unknown>>,
): ComponentProps<typeof SeedanceNode> {
  return {
    id: 'seedance-1',
    type: 'seedance',
    data: { prompt: '', status: 'idle', ...data },
    selected: false,
  } as unknown as ComponentProps<typeof SeedanceNode>
}

describe('SeedanceNode — 空态卡宽（《画布修法》02 节刀 1 task B）', () => {
  it('还没有视频时收窄到 canvas-card--w-empty（320），不再是常驻 420 的组装台宽度', () => {
    const { getByTestId } = render(<SeedanceNode {...makeProps({})} />)

    expect(getByTestId('node-shell').className).toContain(
      'canvas-card--w-empty',
    )
  })

  it('已经有视频时维持既有的 canvas-video-card 宽度，不收窄（回归：有内容态不受影响）', () => {
    const { getByTestId } = render(
      <SeedanceNode
        {...makeProps({
          mediaUrl: 'https://cdn.example.com/reference.mp4',
          status: 'done',
        })}
      />,
    )
    const className = getByTestId('node-shell').className

    expect(className).toContain('canvas-video-card')
    expect(className).not.toContain('canvas-card--w-empty')
  })
})
