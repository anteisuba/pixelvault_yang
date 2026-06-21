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

import { NODE_TYPE_IDS } from '@/constants/node-types'

import { NodeDetailPanel } from './NodeDetailPanel'

function makeNode(id: string, type: string) {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { prompt: '', status: 'idle' },
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
