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
  it('keeps a generated video visible above the expanded composer', () => {
    const data: NodeWorkflowNodeData = {
      mediaUrl: 'https://cdn.test/generated-video.mp4',
      prompt: 'A cinematic close-up',
      status: NODE_STATUS_IDS.done,
    }

    const { container } = render(
      <VideoDetailBody
        nodeId="video-1"
        type={NODE_TYPE_IDS.seedance}
        data={data}
      />,
    )

    const video = container.querySelector('video')
    expect(video).toHaveAttribute('src', 'https://cdn.test/generated-video.mp4')
    expect(video).toHaveAttribute('controls')
    expect(screen.getByText('video-composer-detail')).toBeInTheDocument()
  })

  it('keeps an ungenerated node focused on the expanded composer', () => {
    const data: NodeWorkflowNodeData = {
      prompt: 'A cinematic close-up',
      status: NODE_STATUS_IDS.ready,
    }

    const { container } = render(
      <VideoDetailBody
        nodeId="video-1"
        type={NODE_TYPE_IDS.seedance}
        data={data}
      />,
    )

    expect(container.querySelector('video')).toBeNull()
    expect(screen.getByText('video-composer-detail')).toBeInTheDocument()
  })
})
