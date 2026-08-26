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
  const Pass = ({
    children,
    className,
  }: {
    children: React.ReactNode
    className?: string
  }) => <div className={className}>{children}</div>
  Pass.displayName = 'ShellPart'
  const Nothing = () => null
  Nothing.displayName = 'ShellNoop'
  const Shell = Object.assign(Pass, {
    Header: Nothing,
    Body: Pass,
    Footer: ({ children }: { children: React.ReactNode }) => (
      <footer data-testid="node-footer">{children}</footer>
    ),
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

    // 画布修法 06 节：收起卡面的空态改读 emptyState（状态词），不再是
    // emptyPreview（那句教学句还留给详情面板的证据抽屉用，见 NodeMediaPreview
    // 里的同款注释）。
    expect(
      screen.getByText('StudioNode.workflowNodes.shotText.emptyState'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('StudioNode.workflowNodes.shotText.emptyPreview'),
    ).not.toBeInTheDocument()
  })

  it('文本节点使用白色纸面且不渲染状态底栏', () => {
    render(<NodeMediaPreview {...makeProps({ scene: '白色文本框' })} />)

    const text = screen.getByText('白色文本框')
    expect(text.closest('.canvas-text-preview-surface')).not.toBeNull()
    expect(screen.queryByTestId('node-footer')).not.toBeInTheDocument()
  })

  // 《画布修法》02 节刀 1 task C：text kind 脱离 16:9 主窗——一段字被撑成电影
  // 幕。空态与有内容态都不该再带 aspect-video，高度改由
  // .canvas-text-preview-surface 自己的 min-height 兜底（canvas.css）。
  it('空态与有内容态都不再套 aspect-video——高度改由内容/CSS 地板决定，不锁 16:9', () => {
    const { rerender } = render(<NodeMediaPreview {...makeProps({})} />)
    expect(
      screen
        .getByText('StudioNode.workflowNodes.shotText.emptyState')
        .closest('.canvas-text-preview-surface'),
    ).not.toHaveClass('aspect-video')

    rerender(<NodeMediaPreview {...makeProps({ scene: '有内容态' })} />)
    expect(
      screen.getByText(/有内容态/).closest('.canvas-text-preview-surface'),
    ).not.toHaveClass('aspect-video')
  })

  it('图片节点不渲染状态底栏', () => {
    render(
      <NodeMediaPreview
        {...makeProps({})}
        type={NODE_TYPE_IDS.shot}
        kind={NODE_MEDIA_KIND_IDS.image}
      />,
    )

    expect(screen.queryByTestId('node-footer')).not.toBeInTheDocument()
  })
})

describe('NodeMediaPreview — 片盒卡面（videoMerge，画布修法 06 节）', () => {
  it('空态显示专属状态词，不落回旧的教学句 key', () => {
    render(
      <NodeMediaPreview
        {...makeProps({})}
        type={NODE_TYPE_IDS.videoMerge}
        kind={NODE_MEDIA_KIND_IDS.video}
      />,
    )

    expect(
      screen.getByText('StudioNode.workflowNodes.videoMerge.emptyState'),
    ).toBeInTheDocument()
  })

  it('不渲染底栏——「等待合并」教学句与装饰性 WandSparkles 圆钮随之一起消失', () => {
    render(
      <NodeMediaPreview
        {...makeProps({})}
        type={NODE_TYPE_IDS.videoMerge}
        kind={NODE_MEDIA_KIND_IDS.video}
      />,
    )

    expect(screen.queryByTestId('node-footer')).not.toBeInTheDocument()
    expect(
      screen.queryByText('StudioNode.workflowNodes.videoMerge.footerEmpty'),
    ).not.toBeInTheDocument()
  })
})

describe('NodeMediaPreview — 空态卡宽收窄（《画布修法》02 节刀 1 task B）', () => {
  it('镜头图空态收到 canvas-card--w-empty（320），不再是常驻 400 的 w-node-card', () => {
    const { container } = render(
      <NodeMediaPreview
        {...makeProps({})}
        type={NODE_TYPE_IDS.shot}
        kind={NODE_MEDIA_KIND_IDS.image}
      />,
    )

    expect(container.firstElementChild).toHaveClass('canvas-card--w-empty')
  })

  it('镜头文本空态与有内容态都收到 canvas-card--w-empty（宽度不随内容变化，只有高度变）', () => {
    const { container: emptyContainer } = render(
      <NodeMediaPreview {...makeProps({})} />,
    )
    expect(emptyContainer.firstElementChild).toHaveClass('canvas-card--w-empty')

    const { container: filledContainer } = render(
      <NodeMediaPreview {...makeProps({ scene: '有内容态' })} />,
    )
    expect(filledContainer.firstElementChild).toHaveClass(
      'canvas-card--w-empty',
    )
  })

  it('片盒空态收到 canvas-card--w-empty，落地视频后回到既有宽度算法（回归：有内容态不受影响）', () => {
    const { container: emptyContainer } = render(
      <NodeMediaPreview
        {...makeProps({})}
        type={NODE_TYPE_IDS.videoMerge}
        kind={NODE_MEDIA_KIND_IDS.video}
      />,
    )
    expect(emptyContainer.firstElementChild).toHaveClass('canvas-card--w-empty')

    const { container: filledContainer } = render(
      <NodeMediaPreview
        {...makeProps({ mediaUrl: 'https://cdn.example.com/merged.mp4' })}
        type={NODE_TYPE_IDS.videoMerge}
        kind={NODE_MEDIA_KIND_IDS.video}
      />,
    )
    expect(filledContainer.firstElementChild).not.toHaveClass(
      'canvas-card--w-empty',
    )
  })

  it('身份卡族（characterImage/backgroundImage）不收窄——那两个 type 走的是固定 240 宽的身份卡族', () => {
    const { container: characterContainer } = render(
      <NodeMediaPreview
        {...makeProps({})}
        type={NODE_TYPE_IDS.characterImage}
        kind={NODE_MEDIA_KIND_IDS.image}
      />,
    )
    expect(characterContainer.firstElementChild).not.toHaveClass(
      'canvas-card--w-empty',
    )

    const { container: backgroundContainer } = render(
      <NodeMediaPreview
        {...makeProps({})}
        type={NODE_TYPE_IDS.backgroundImage}
        kind={NODE_MEDIA_KIND_IDS.image}
      />,
    )
    expect(backgroundContainer.firstElementChild).not.toHaveClass(
      'canvas-card--w-empty',
    )
  })
})
