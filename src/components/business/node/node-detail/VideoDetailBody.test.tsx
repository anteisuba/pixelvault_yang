import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { received } = vi.hoisted(() => ({
  received: { density: '' as string, hasChildren: false },
}))

vi.mock('../composer/VideoComposer', () => ({
  VideoComposer: ({
    density,
    children,
  }: {
    density: string
    children?: (slots: unknown) => ReactNode
  }) => {
    received.density = density
    received.hasChildren = typeof children === 'function'
    return <div data-testid="video-composer">{density}</div>
  },
}))

import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

import { VideoDetailBody } from './VideoDetailBody'

/**
 * ⚠ 这一族的内容**没有搬家**：监视器/引用/提示词/参数近千行仍住在
 * `VideoComposer` 里，S7 做的是重排不是搬迁。所以这份测试测的只有转接本身 ——
 * 槽表渲染函数必须原样透传下去，槽的排布由 `VideoComposer` 自己的实现负责。
 */
describe('VideoDetailBody', () => {
  it('把槽表渲染函数透传给 detail 档的 composer', () => {
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
      >
        {() => <div>frame</div>}
      </VideoDetailBody>,
    )

    expect(screen.getByTestId('video-composer')).toHaveTextContent('detail')
    expect(received.density).toBe('detail')
    expect(received.hasChildren).toBe(true)
  })
})
