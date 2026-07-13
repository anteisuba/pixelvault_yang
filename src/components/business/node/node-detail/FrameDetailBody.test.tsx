import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NODE_TYPE_IDS } from '@/constants/node-types'
import type {
  NodeWorkflowNode,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'

const { received } = vi.hoisted(() => ({
  received: { node: null as NodeWorkflowNode | null },
}))

vi.mock('../inspector/FrameImageInspector', () => ({
  FrameImageInspector: ({ node }: { node: NodeWorkflowNode }) => {
    received.node = node
    return <div data-testid="frame-inspector">{node.id}</div>
  },
}))

import { FrameDetailBody } from './FrameDetailBody'

describe('FrameDetailBody', () => {
  it('mounts the keyframe inspector with synthesized legacy presentation data', () => {
    const data = {
      prompt: 'opening frame',
      role: 'frame',
      status: 'idle',
    } as NodeWorkflowNodeData

    render(
      <FrameDetailBody
        nodeId="frame-1"
        type={NODE_TYPE_IDS.frameImage}
        data={data}
      />,
    )

    expect(screen.getByTestId('frame-inspector')).toHaveTextContent('frame-1')
    expect(received.node).toMatchObject({
      id: 'frame-1',
      type: NODE_TYPE_IDS.frameImage,
      data,
    })
  })
})
