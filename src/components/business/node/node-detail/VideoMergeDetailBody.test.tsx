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

vi.mock('../inspector/VideoMergeInspector', () => ({
  VideoMergeInspector: ({ node }: { node: NodeWorkflowNode }) => {
    received.node = node
    return <div data-testid="video-merge-inspector">{node.id}</div>
  },
}))

import { VideoMergeDetailBody } from './VideoMergeDetailBody'

describe('VideoMergeDetailBody', () => {
  it('mounts the real merge inspector with synthesized node data', () => {
    const data = {
      prompt: '',
      status: 'idle',
    } as NodeWorkflowNodeData

    render(
      <VideoMergeDetailBody
        nodeId="merge-1"
        type={NODE_TYPE_IDS.videoMerge}
        data={data}
      />,
    )

    expect(screen.getByTestId('video-merge-inspector')).toHaveTextContent(
      'merge-1',
    )
    expect(received.node).toMatchObject({
      id: 'merge-1',
      type: NODE_TYPE_IDS.videoMerge,
      data,
    })
  })
})
