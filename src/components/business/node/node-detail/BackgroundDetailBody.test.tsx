import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NODE_TYPE_IDS } from '@/constants/node-types'
import type {
  NodeWorkflowNode,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'

const { received } = vi.hoisted(() => ({
  received: {
    node: null as NodeWorkflowNode | null,
    layout: null as string | null,
  },
}))

vi.mock('../inspector/BackgroundImageInspector', () => ({
  BackgroundImageInspector: ({
    node,
    layout,
  }: {
    node: NodeWorkflowNode
    layout?: string
  }) => {
    received.node = node
    received.layout = layout ?? null
    return <div data-testid="background-inspector">{node.id}</div>
  },
}))

import { BackgroundDetailBody } from './BackgroundDetailBody'

describe('BackgroundDetailBody', () => {
  it('mounts the inspector with a node synthesized from the body props', () => {
    const data = {
      prompt: 'a misty forest',
      status: 'idle',
      location: 'forest',
    } as NodeWorkflowNodeData

    render(
      <BackgroundDetailBody
        nodeId="bg-1"
        type={NODE_TYPE_IDS.backgroundImage}
        data={data}
      />,
    )

    expect(screen.getByTestId('background-inspector')).toHaveTextContent('bg-1')
    expect(received.node).toMatchObject({
      id: 'bg-1',
      type: NODE_TYPE_IDS.backgroundImage,
      data,
    })
    expect(received.node?.position).toEqual({ x: 0, y: 0 })
    expect(received.layout).toBe('object-studio')
  })
})
