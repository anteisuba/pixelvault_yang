import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../composer/VideoComposer', () => ({
  VideoComposer: ({ density }: { density: string }) => (
    <div>video-composer-{density}</div>
  ),
}))

import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

import { VideoDetailBody } from './VideoDetailBody'

describe('VideoDetailBody', () => {
  it('is a thin dispatch to the detail-density composer (monitor lives in VideoComposer)', () => {
    const data: NodeWorkflowNodeData = {
      mediaUrl: 'https://cdn.test/generated-video.mp4',
      prompt: 'A cinematic close-up',
      status: NODE_STATUS_IDS.done,
    }

    render(
      <VideoDetailBody
        nodeId="video-1"
        type={NODE_TYPE_IDS.seedance}
        data={data}
      />,
    )

    expect(screen.getByText('video-composer-detail')).toBeInTheDocument()
  })

  it('renders the same dispatch for an ungenerated node', () => {
    const data: NodeWorkflowNodeData = {
      prompt: 'A cinematic close-up',
      status: NODE_STATUS_IDS.ready,
    }

    render(
      <VideoDetailBody
        nodeId="video-1"
        type={NODE_TYPE_IDS.seedance}
        data={data}
      />,
    )

    expect(screen.getByText('video-composer-detail')).toBeInTheDocument()
  })
})
