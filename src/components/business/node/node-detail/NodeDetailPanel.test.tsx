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
      cache[tag] = ({ children, className, style }: MotionMockProps) => {
        const Tag = tag as 'div'
        return (
          <Tag className={className} style={style}>
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
  },
}))

vi.mock('./GenericDetailBody', () => ({
  GenericDetailBody: ({ nodeId }: { nodeId: string }) => (
    <div>generic-body-{nodeId}</div>
  ),
}))

vi.mock('../nodes/ImageRolePicker', () => ({
  ImageRolePickerBody: ({ nodeId }: { nodeId: string }) => (
    <div>role-picker-{nodeId}</div>
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

  it('falls back to the generic body for unregistered types', () => {
    nodesState.nodes = [makeNode('n2', NODE_TYPE_IDS.composer)]
    render(<NodeDetailPanel expandedNodeId="n2" onClose={vi.fn()} />)
    expect(screen.getByText('generic-body-n2')).toBeInTheDocument()
  })

  it('shows the role picker (not a default form) for a role-less image node', () => {
    // Regression: a freshly-added image node with no role must offer the role
    // chooser when expanded, instead of falling through to the shot form.
    nodesState.nodes = [makeNode('img1', NODE_TYPE_IDS.image)]
    render(<NodeDetailPanel expandedNodeId="img1" onClose={vi.fn()} />)
    expect(screen.getByText('role-picker-img1')).toBeInTheDocument()
    expect(screen.queryByText('generic-body-img1')).not.toBeInTheDocument()
  })

  it('returns to the canvas from a normal node breadcrumb crumb', () => {
    nodesState.nodes = [makeNode('n1', NODE_TYPE_IDS.seedance)]
    const onClose = vi.fn()
    render(<NodeDetailPanel expandedNodeId="n1" onClose={onClose} />)

    // A non-image node's parent crumb is the canvas — clicking it closes.
    fireEvent.click(screen.getByLabelText('backToCanvas'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('navigates an image role detail back up to the chooser, not the canvas', () => {
    // Image nodes are a two-step flow (pick role → edit detail). From a role's
    // detail the breadcrumb returns UP to the chooser (返回上一层), keeping the
    // panel open, instead of closing back to the canvas.
    nodesState.nodes = [
      makeNode('img1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.shot,
      }),
    ]
    const onClose = vi.fn()
    render(<NodeDetailPanel expandedNodeId="img1" onClose={onClose} />)

    // Role detail shows (generic body), not the chooser.
    expect(screen.getByText('generic-body-img1')).toBeInTheDocument()
    expect(screen.queryByText('role-picker-img1')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('backToCanvas')).not.toBeInTheDocument()

    // The parent crumb returns to the chooser without closing the panel.
    fireEvent.click(screen.getByLabelText('backToRolePicker'))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('role-picker-img1')).toBeInTheDocument()
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
})
