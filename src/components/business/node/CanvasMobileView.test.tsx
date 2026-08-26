import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}))

const { flowState, actions, mockFocusNode, mockUpdateNodeData } = vi.hoisted(
  () => ({
    flowState: {
      nodes: [] as Array<Record<string, unknown>>,
      edges: [] as Array<Record<string, unknown>>,
    },
    mockFocusNode: vi.fn(),
    mockUpdateNodeData: vi.fn(),
    actions: {
      reviewMode: undefined as
        | {
            active: boolean
            queue: Array<{ nodeId: string; url: string }>
            current: { nodeId: string; url: string } | null
            currentNode: Record<string, unknown> | null
            currentDecided: boolean
            remaining: number
            hasNext: boolean
            hasPrev: boolean
            enter: ReturnType<typeof vi.fn>
            exit: ReturnType<typeof vi.fn>
            goNext: ReturnType<typeof vi.fn>
            goPrev: ReturnType<typeof vi.fn>
          }
        | undefined,
    },
  }),
)

vi.mock('@xyflow/react', () => ({
  useNodes: () => flowState.nodes,
  useEdges: () => flowState.edges,
}))

vi.mock('./NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({
    focusNode: mockFocusNode,
    updateNodeData: mockUpdateNodeData,
    reviewMode: actions.reviewMode,
  }),
}))

import {
  NODE_IMAGE_ROLE_IDS,
  NODE_REVIEW_STATE_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'

import { CanvasMobileView } from './CanvasMobileView'

function makeNode(
  id: string,
  type: string,
  data: Record<string, unknown> = {},
) {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    selected: false,
    data: { prompt: '', status: NODE_STATUS_IDS.idle, ...data },
  }
}

function makeReviewMode(
  overrides: Partial<NonNullable<typeof actions.reviewMode>> = {},
) {
  return {
    active: false,
    queue: [],
    current: null,
    currentNode: null,
    currentDecided: false,
    remaining: 0,
    hasNext: false,
    hasPrev: false,
    enter: vi.fn(),
    exit: vi.fn(),
    goNext: vi.fn(),
    goPrev: vi.fn(),
    ...overrides,
  }
}

describe('CanvasMobileView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    flowState.nodes = []
    flowState.edges = []
    actions.reviewMode = makeReviewMode()
  })

  function renderDefault() {
    return render(
      <CanvasMobileView
        peeking={false}
        onEnterPeek={vi.fn()}
        onExitPeek={vi.fn()}
      />,
    )
  }

  it('defaults to the node list, not a shrunk canvas', () => {
    flowState.nodes = [
      makeNode('image-1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.character,
        characterName: '黛西',
        mediaUrl: 'https://cdn.example.com/daisy.png',
      }),
    ]

    renderDefault()

    expect(screen.getByTestId('canvas-mobile-view')).toBeInTheDocument()
    expect(screen.getByTestId('canvas-node-locator')).toBeInTheDocument()
    expect(
      screen.queryByTestId('canvas-mobile-node-preview'),
    ).not.toBeInTheDocument()
  })

  it('opens a read-only preview with media, status, and connections when a row is tapped', () => {
    flowState.nodes = [
      makeNode('image-1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.character,
        characterName: '黛西',
        mediaUrl: 'https://cdn.example.com/daisy.png',
        status: NODE_STATUS_IDS.done,
      }),
      makeNode('video-1', NODE_TYPE_IDS.seedance, {
        mediaLabel: '渡轮甲板',
      }),
    ]
    flowState.edges = [{ id: 'e1', source: 'image-1', target: 'video-1' }]

    renderDefault()
    fireEvent.click(
      screen.getByRole('button', { name: 'locateNode {"name":"黛西"}' }),
    )

    const preview = screen.getByTestId('canvas-mobile-node-preview')
    expect(preview).toBeInTheDocument()
    // 名字
    expect(within(preview).getByText('黛西')).toBeInTheDocument()
    // 媒体：主图渲染为 <img>
    const img = within(preview).getByRole('img') as HTMLImageElement
    expect(img.src).toBe('https://cdn.example.com/daisy.png')
    // 连了谁——下游
    expect(within(preview).getByText('渡轮甲板')).toBeInTheDocument()
    // 点击列表不再飞相机——手机预览换的是这条通路
    expect(mockFocusNode).not.toHaveBeenCalled()
  })

  it('shows connected nodes and lets tapping one retarget the preview', () => {
    flowState.nodes = [
      makeNode('card-1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.character,
        characterName: '黛西',
      }),
      makeNode('shot-1', NODE_TYPE_IDS.shot, { mediaLabel: '开场镜头' }),
    ]
    flowState.edges = [{ id: 'e1', source: 'card-1', target: 'shot-1' }]

    renderDefault()
    fireEvent.click(
      screen.getByRole('button', { name: 'locateNode {"name":"黛西"}' }),
    )
    // 下游分组里点「开场镜头」应切到该节点的预览
    fireEvent.click(screen.getByText('开场镜头'))

    const preview = screen.getByTestId('canvas-mobile-node-preview')
    expect(within(preview).getByText('开场镜头')).toBeInTheDocument()
    // 反向连接：上游应能看到「黛西」
    expect(within(preview).getByText('黛西')).toBeInTheDocument()
  })

  it('hides every editing/generation entry point in the preview (no prompt box, no generate/upload/delete controls)', () => {
    flowState.nodes = [
      makeNode('shot-1', NODE_TYPE_IDS.shot, {
        mediaLabel: '镜头',
        mediaUrl: 'https://cdn.example.com/shot.png',
      }),
    ]

    renderDefault()
    fireEvent.click(
      screen.getByRole('button', { name: 'locateNode {"name":"镜头"}' }),
    )

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /generate/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /upload/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /delete/i }),
    ).not.toBeInTheDocument()
  })

  it('does not show a start-review entry when nothing is awaiting review', () => {
    actions.reviewMode = makeReviewMode({ remaining: 0 })
    renderDefault()

    expect(
      screen.queryByText('topbar.startReview {"count":0}'),
    ).not.toBeInTheDocument()
  })

  it('makes the review path reachable: start review shows the queued node with approve/reject and prev/next', () => {
    const reviewedNode = makeNode('image-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.character,
      characterName: '黛西',
      mediaUrl: 'https://cdn.example.com/daisy.png',
      mediaReview: {
        'https://cdn.example.com/daisy.png': {
          state: NODE_REVIEW_STATE_IDS.awaitingReview,
        },
      },
    })
    flowState.nodes = [reviewedNode]
    const queueItem = {
      nodeId: 'image-1',
      url: 'https://cdn.example.com/daisy.png',
    }
    actions.reviewMode = makeReviewMode({
      queue: [queueItem],
      remaining: 1,
    })

    const { rerender } = renderDefault()

    const startButton = screen.getByText('topbar.startReview {"count":1}')
    fireEvent.click(startButton)
    expect(actions.reviewMode!.enter).toHaveBeenCalled()

    // enter() 是 mock，不会真的把 active/current 置位——用 rerender 模拟它生效
    // 后的下一次渲染（真实 hook 里 enter() 会让 active/current 同步跟上，context
    // 值一变，同一棵树重渲染就会读到新值——不是重新挂载一棵新树）。
    actions.reviewMode = makeReviewMode({
      queue: [queueItem],
      remaining: 1,
      active: true,
      current: queueItem,
      currentNode: reviewedNode,
      hasNext: false,
      hasPrev: false,
    })
    rerender(
      <CanvasMobileView
        peeking={false}
        onEnterPeek={vi.fn()}
        onExitPeek={vi.fn()}
      />,
    )

    const preview = screen.getByTestId('canvas-mobile-node-preview')
    expect(within(preview).getByText('黛西')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'approve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'reject' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'previous' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'next' })).toBeInTheDocument()
  })

  it('approve/reject in the preview call the same updateNodeData channel review uses everywhere else', () => {
    flowState.nodes = [
      makeNode('image-1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.character,
        characterName: '黛西',
        mediaUrl: 'https://cdn.example.com/daisy.png',
        mediaReview: {
          'https://cdn.example.com/daisy.png': {
            state: NODE_REVIEW_STATE_IDS.awaitingReview,
          },
        },
      }),
    ]

    renderDefault()
    fireEvent.click(
      screen.getByRole('button', { name: 'locateNode {"name":"黛西"}' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'approve' }))

    expect(mockUpdateNodeData).toHaveBeenCalledWith(
      'image-1',
      expect.objectContaining({
        mediaReview: expect.objectContaining({
          'https://cdn.example.com/daisy.png': expect.objectContaining({
            state: NODE_REVIEW_STATE_IDS.approved,
          }),
        }),
      }),
    )
  })

  it('back from a plain preview returns to the list; back during review exits review mode', () => {
    flowState.nodes = [
      makeNode('image-1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.character,
        characterName: '黛西',
      }),
    ]
    const { rerender } = renderDefault()
    fireEvent.click(
      screen.getByRole('button', { name: 'locateNode {"name":"黛西"}' }),
    )
    expect(screen.getByTestId('canvas-mobile-node-preview')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'backToList' }))
    expect(screen.getByTestId('canvas-node-locator')).toBeInTheDocument()
    expect(
      screen.queryByTestId('canvas-mobile-node-preview'),
    ).not.toBeInTheDocument()

    // 审阅进行中时同一颗返回键退出的是审阅模式，不只是清本地预览指针。
    const reviewedNode = flowState.nodes[0]!
    const queueItem = {
      nodeId: 'image-1',
      url: 'x',
    }
    actions.reviewMode = makeReviewMode({
      active: true,
      current: queueItem,
      currentNode: reviewedNode,
      queue: [queueItem],
      remaining: 1,
    })
    rerender(
      <CanvasMobileView
        peeking={false}
        onEnterPeek={vi.fn()}
        onExitPeek={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'backToList' }))
    expect(actions.reviewMode!.exit).toHaveBeenCalled()
  })

  it('shows a graceful notice instead of crashing when the previewed node was removed mid-session', () => {
    flowState.nodes = [
      makeNode('image-1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.character,
        characterName: '黛西',
      }),
    ]
    const { rerender } = renderDefault()
    fireEvent.click(
      screen.getByRole('button', { name: 'locateNode {"name":"黛西"}' }),
    )
    expect(screen.getByTestId('canvas-mobile-node-preview')).toBeInTheDocument()

    // 节点在预览打开之后被删掉——同一棵树重渲染，不是换一棵。
    flowState.nodes = []
    rerender(
      <CanvasMobileView
        peeking={false}
        onEnterPeek={vi.fn()}
        onExitPeek={vi.fn()}
      />,
    )
    expect(
      screen.queryByTestId('canvas-mobile-node-preview'),
    ).not.toBeInTheDocument()
    expect(screen.getByText('removedNotice')).toBeInTheDocument()
  })

  it('view-canvas opens the explicit peek entry; peeking renders only a back affordance', () => {
    const onEnterPeek = vi.fn()
    render(
      <CanvasMobileView
        peeking={false}
        onEnterPeek={onEnterPeek}
        onExitPeek={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'viewCanvas' }))
    expect(onEnterPeek).toHaveBeenCalled()
  })

  it('while peeking, exposes only a back-to-list control and nothing else from the mobile shell', () => {
    const onExitPeek = vi.fn()
    render(
      <CanvasMobileView
        peeking
        onEnterPeek={vi.fn()}
        onExitPeek={onExitPeek}
      />,
    )
    expect(screen.queryByTestId('canvas-mobile-view')).not.toBeInTheDocument()
    expect(screen.queryByTestId('canvas-node-locator')).not.toBeInTheDocument()
    const back = screen.getByRole('button', { name: 'backToList' })
    fireEvent.click(back)
    expect(onExitPeek).toHaveBeenCalled()
  })
})
