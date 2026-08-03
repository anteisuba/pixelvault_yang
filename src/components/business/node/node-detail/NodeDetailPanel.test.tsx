import type { CSSProperties, ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// Stub motion/react so enter/exit animation doesn't pull framer's matchMedia
// path into jsdom. We only need className/style/children to flow through.
vi.mock('motion/react', () => {
  const cache: Record<string, (props: MotionMockProps) => ReactNode> = {}
  const make = (tag: string) => {
    if (!cache[tag]) {
      cache[tag] = (props: MotionMockProps) => {
        const {
          children,
          className,
          style,
          initial,
          animate,
          exit,
          transition,
          ...rest
        } = props
        void initial
        void animate
        void exit
        void transition
        const Tag = tag as 'div'
        return (
          <Tag className={className} style={style} {...rest}>
            {children}
          </Tag>
        )
      }
    }
    return cache[tag]
  }
  return {
    AnimatePresence: ({ children }: { children?: ReactNode }) => (
      <>{children}</>
    ),
    motion: new Proxy(
      {} as Record<string, (props: MotionMockProps) => ReactNode>,
      {
        get: (_target, tag: string) => make(tag),
      },
    ),
    useReducedMotion: () => false,
  }
})

interface MotionMockProps {
  children?: ReactNode
  className?: string
  style?: CSSProperties
  initial?: unknown
  animate?: unknown
  exit?: unknown
  transition?: unknown
  [key: string]: unknown
}

const { nodesState } = vi.hoisted(() => ({
  nodesState: { nodes: [] as Array<Record<string, unknown>> },
}))

vi.mock('@xyflow/react', () => ({
  useNodes: () => nodesState.nodes,
}))

vi.mock('./registry', () => ({
  NODE_DETAIL_REGISTRY: {
    seedance: ({ nodeId }: { nodeId: string }) => (
      <div>video-body-{nodeId}</div>
    ),
    // S5d ③: a role-less image node now presents as `image` itself
    // (LooseImageDetailBody), not a role picker.
    image: ({ nodeId }: { nodeId: string }) => (
      <div>loose-image-body-{nodeId}</div>
    ),
  },
}))

vi.mock('./GenericDetailBody', () => ({
  GenericDetailBody: ({ nodeId }: { nodeId: string }) => (
    <div>generic-body-{nodeId}</div>
  ),
}))

import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'

import { NodeDetailPanel } from './NodeDetailPanel'

function makeNode(
  id: string,
  type: string,
  extraData: Record<string, unknown> = {},
) {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { prompt: '', status: 'idle', ...extraData },
  }
}

describe('NodeDetailPanel', () => {
  beforeEach(() => {
    nodesState.nodes = []
  })

  it('renders nothing when no node is expanded', () => {
    nodesState.nodes = [makeNode('n1', NODE_TYPE_IDS.seedance)]
    const { container } = render(
      <NodeDetailPanel expandedNodeId={null} onClose={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the expanded node no longer exists', () => {
    nodesState.nodes = []
    const { container } = render(
      <NodeDetailPanel expandedNodeId="ghost" onClose={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('dispatches the registered detail body for a video node', () => {
    nodesState.nodes = [makeNode('n1', NODE_TYPE_IDS.seedance)]
    render(<NodeDetailPanel expandedNodeId="n1" onClose={vi.fn()} />)
    expect(screen.getByText('video-body-n1')).toBeInTheDocument()
  })

  it('presents every family in the shared labelled object-studio dialog', () => {
    nodesState.nodes = [makeNode('n1', NODE_TYPE_IDS.seedance)]
    render(<NodeDetailPanel expandedNodeId="n1" onClose={vi.fn()} />)

    const dialog = screen.getByRole('dialog', { name: 'seedance' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('data-node-detail-layout', 'object-studio')
    expect(dialog).toHaveAttribute('data-node-detail-family', 'seedance')
    expect(
      dialog.querySelector('[data-node-detail-body="true"]'),
    ).toBeInTheDocument()
  })

  it('falls back to the generic body for unregistered types', () => {
    nodesState.nodes = [makeNode('n2', NODE_TYPE_IDS.composer)]
    render(<NodeDetailPanel expandedNodeId="n2" onClose={vi.fn()} />)
    expect(screen.getByText('generic-body-n2')).toBeInTheDocument()
  })

  it('dispatches the loose-image body (not a role picker) for a role-less image node', () => {
    // S5d ③: the role picker is retired entirely — a freshly-added image node
    // with no role presents as `image` itself (LooseImageDetailBody), same as
    // every other registered type.
    nodesState.nodes = [makeNode('img1', NODE_TYPE_IDS.image)]
    render(<NodeDetailPanel expandedNodeId="img1" onClose={vi.fn()} />)
    expect(screen.getByText('loose-image-body-img1')).toBeInTheDocument()
    expect(screen.queryByText('generic-body-img1')).not.toBeInTheDocument()
  })

  it('dispatches the shot body for a role=shot image node (not the loose-image body)', () => {
    nodesState.nodes = [
      makeNode('img1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.shot,
      }),
    ]
    // `shot` isn't registered in this test's mocked registry, so it falls
    // back to the generic body — the point under test is that it does NOT
    // resolve as `image` (loose-image-body) despite sharing the node type.
    render(<NodeDetailPanel expandedNodeId="img1" onClose={vi.fn()} />)
    expect(screen.getByText('generic-body-img1')).toBeInTheDocument()
    expect(screen.queryByText('loose-image-body-img1')).not.toBeInTheDocument()
  })

  it('returns to the canvas from the breadcrumb crumb (single layer, no role-picker parent anymore)', () => {
    nodesState.nodes = [makeNode('n1', NODE_TYPE_IDS.seedance)]
    const onClose = vi.fn()
    render(<NodeDetailPanel expandedNodeId="n1" onClose={onClose} />)

    fireEvent.click(screen.getByLabelText('backToCanvas'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on backdrop click and Escape', () => {
    nodesState.nodes = [makeNode('n1', NODE_TYPE_IDS.seedance)]
    const onClose = vi.fn()
    render(<NodeDetailPanel expandedNodeId="n1" onClose={onClose} />)

    fireEvent.click(screen.getAllByLabelText('close')[0])
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  /**
   * ⚠ 回归锁（2026-08-03 真机复现后加）。
   *
   * 聚焦 effect 曾挂 `[node]`，而 `node` 来自 `nodes.find(...)`、
   * `updateNodeData` 又是整体换新对象 —— 于是**每敲一个字符 node 就换一次身份**，
   * effect 重跑：cleanup 先把焦点还给来源，effect 体再抢到「收起」按钮上。
   * 真机实测（镜头文本 · 动作字段）敲 `abcde` 只有 `a` 进得去，后四个全丢。
   * 依赖收敛到 `node.id` 之后才恢复正常。
   */
  it('节点数据变化不重夺焦点（依赖是 id 不是整个 node 对象）', () => {
    nodesState.nodes = [makeNode('n1', NODE_TYPE_IDS.seedance)]
    const { rerender } = render(
      <NodeDetailPanel expandedNodeId="n1" onClose={vi.fn()} />,
    )

    // 模拟用户把焦点放进正文里的某个输入框
    const field = document.createElement('textarea')
    document.body.appendChild(field)
    field.focus()
    expect(document.activeElement).toBe(field)

    // 模拟一次击键：updateNodeData 换出一个**新的 node 对象**（同 id、新 data）
    nodesState.nodes = [makeNode('n1', NODE_TYPE_IDS.seedance, { prompt: 'a' })]
    rerender(<NodeDetailPanel expandedNodeId="n1" onClose={vi.fn()} />)

    expect(document.activeElement, '数据变化不得把焦点抢回收起按钮').toBe(field)

    field.remove()
  })

  it('切换到另一个节点时重新接管焦点', () => {
    nodesState.nodes = [
      makeNode('n1', NODE_TYPE_IDS.seedance),
      makeNode('n2', NODE_TYPE_IDS.seedance),
    ]
    const { rerender } = render(
      <NodeDetailPanel expandedNodeId="n1" onClose={vi.fn()} />,
    )

    const field = document.createElement('textarea')
    document.body.appendChild(field)
    field.focus()

    rerender(<NodeDetailPanel expandedNodeId="n2" onClose={vi.fn()} />)

    // 换了节点 = 换了对象，面板应重新接管焦点（而不是停在上一个节点的输入框里）
    expect(document.activeElement).not.toBe(field)
    expect(document.activeElement?.getAttribute('aria-label')).toBe('close')

    field.remove()
  })
})
