/**
 * 回归用例（任务包 canvas-harvest-fixes §C）：**待审项是 `referenceAssets` 里的
 * 一条时，审核按钮操作的是哪个对象？**
 *
 * 缺陷（2026-08-09 复现，同日修）：待审队列的 URL 集合**包含**
 * `referenceAssets[].url`（`node-review-queue.ts` 的 `collectLiveUrls`，注释写明
 * 是为了让助手的 `set_review_state` 能标到收集器里任意一条）；而
 * `MediaReviewButtons` 当时取 URL 用的是 `getNodeMediaUrl`（只看 `mediaUrl` /
 * `imageUrl`）。两层指向不同 URL 时后果有二：
 *   - 主媒体没有审核记录 → 祖父条款判 `approved` → **连「通过」键都不渲染**，
 *     用户从审阅队列飞过来要点的那颗键根本不存在；
 *   - 点「打回」写在主媒体上，待审那条一个字没动 → 队列的「还剩几张」减不下去。
 *
 * 修法：`resolveReviewTargetUrl`（`node-review-queue.ts`）—— 审阅模式钉住的那一条
 * 优先，幽灵（已不在这张卡上）退回主媒体。**闸在那一个函数里，不在各调用方。**
 */
import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NODE_REVIEW_STATE_IDS, NODE_STATUS_IDS } from '@/constants/node-types'
import {
  collectReviewQueue,
  type ReviewQueueItem,
} from '@/lib/node-review-queue'
import type {
  NodeWorkflowNode,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'

import { MediaReviewButtons } from './CanvasImageSelectionToolbar'

const mocks = vi.hoisted(() => ({
  setExpandedNodeId: vi.fn(),
  deleteNode: vi.fn(),
  deleteEdge: vi.fn(),
  placeDerivedImages: vi.fn(),
  focusNode: vi.fn(),
  updateNodeData: vi.fn(),
  generateMediaNode: vi.fn(),
  setImageEditWorkspaceOpen: vi.fn(),
  edges: [] as Array<{ id: string; source: string; target: string }>,
  nodes: [] as Array<{ id: string; type: string; data: NodeWorkflowNodeData }>,
  fitView: vi.fn(),
  mergeAction: { canMerge: true, isMerging: false, handleMerge: vi.fn() },
  /** 审阅模式钉住的那一条。null = 没进审阅模式（按钮按主媒体走）。 */
  reviewMode: null as { current: ReviewQueueItem | null } | null,
}))

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
}))

vi.mock('@xyflow/react', () => ({
  useEdges: () => mocks.edges,
  useNodes: () => mocks.nodes,
  useReactFlow: () => ({ fitView: mocks.fitView }),
}))

vi.mock('./NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => mocks,
}))

vi.mock('./CanvasImageEditWorkspace', () => ({
  CanvasImageEditWorkspace: () => null,
}))

vi.mock('./CharacterImageReferenceControls', () => ({
  CharacterImageReferenceControls: () => null,
}))

vi.mock('./FishVoiceLibraryDialog', () => ({
  FishVoiceLibraryDialog: () => null,
}))

vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: () => null,
}))

vi.mock('@/hooks/node/use-video-merge-action', () => ({
  useVideoMergeAction: () => mocks.mergeAction,
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => children,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: ReactNode
    onClick?: () => void
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSubTrigger: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  DropdownMenuSubContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}))

/** 节点主媒体（★ 首图）。 */
const MAIN_URL = 'https://cdn/main.png'
/** 收集器里的一条素材 —— 待审的是**它**。 */
const ASSET_URL = 'https://cdn/asset-2.png'

const collectorData = {
  status: NODE_STATUS_IDS.idle,
  mediaUrl: MAIN_URL,
  referenceAssets: [
    {
      id: 'asset-2',
      url: ASSET_URL,
      source: 'canvas',
      addedAt: '2026-08-09T00:00:00.000Z',
    },
  ],
  mediaReview: {
    [ASSET_URL]: {
      state: NODE_REVIEW_STATE_IDS.awaitingReview,
      markedAt: '2026-08-09T00:00:00.000Z',
    },
  },
} as unknown as NodeWorkflowNodeData

/** 审阅模式钉住 `url` 那一条（`nodeIndex` 不参与身份判定，给 0 即可）。 */
function pin(url: string, nodeId = 'node-1') {
  mocks.reviewMode = { current: { nodeId, url, nodeIndex: 0 } }
}

describe('待审项是 referenceAsset 时，审核按钮写回哪个对象（§C 回归）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.reviewMode = null
  })

  it('审阅队列指着 referenceAsset 那一条', () => {
    const queue = collectReviewQueue([
      { id: 'node-1', type: 'image', data: collectorData },
    ] as unknown as NodeWorkflowNode[])
    expect(queue).toHaveLength(1)
    expect(queue[0]?.url).toBe(ASSET_URL)
  })

  it('审阅模式钉着它时，按钮跟着走 —— 待审态两颗键都在', () => {
    pin(ASSET_URL)
    render(<MediaReviewButtons nodeId="node-1" data={collectorData} />)
    // 曾经的缺陷：读主媒体 → 无审核记录 → 祖父条款判 approved → 通过键消失。
    expect(screen.getByRole('button', { name: 'approve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'reject' })).toBeInTheDocument()
  })

  it('「通过」写在待审那条 referenceAsset 上，主媒体不受影响', () => {
    pin(ASSET_URL)
    render(<MediaReviewButtons nodeId="node-1" data={collectorData} />)
    fireEvent.click(screen.getByRole('button', { name: 'approve' }))

    const patch = mocks.updateNodeData.mock.calls.at(-1)?.[1]
    expect(patch.mediaReview[ASSET_URL].state).toBe(
      NODE_REVIEW_STATE_IDS.approved,
    )
    // 主媒体本来就没有记录，处置它是越权 —— 修完后不该凭空多出一条。
    expect(patch.mediaReview[MAIN_URL]).toBeUndefined()
  })

  it('「打回」同样落在那条上 —— 队列的「还剩几张」才减得下去', () => {
    pin(ASSET_URL)
    render(<MediaReviewButtons nodeId="node-1" data={collectorData} />)
    fireEvent.click(screen.getByRole('button', { name: 'reject' }))

    const patch = mocks.updateNodeData.mock.calls.at(-1)?.[1]
    expect(patch.mediaReview[ASSET_URL].state).toBe(
      NODE_REVIEW_STATE_IDS.rejected,
    )
    expect(patch.mediaReview[MAIN_URL]).toBeUndefined()
  })

  it('没进审阅模式时仍按主媒体走 —— 选中卡处置卡面那张图，是按钮的常态', () => {
    render(<MediaReviewButtons nodeId="node-1" data={collectorData} />)
    fireEvent.click(screen.getByRole('button', { name: 'reject' }))

    const patch = mocks.updateNodeData.mock.calls.at(-1)?.[1]
    expect(patch.mediaReview[MAIN_URL].state).toBe(
      NODE_REVIEW_STATE_IDS.rejected,
    )
  })

  it('钉住的是别的节点时不串台，按自己的主媒体走', () => {
    pin(ASSET_URL, 'node-99')
    render(<MediaReviewButtons nodeId="node-1" data={collectorData} />)
    fireEvent.click(screen.getByRole('button', { name: 'reject' }))

    const patch = mocks.updateNodeData.mock.calls.at(-1)?.[1]
    expect(patch.mediaReview[MAIN_URL].state).toBe(
      NODE_REVIEW_STATE_IDS.rejected,
    )
  })

  it('钉住的那条已不在卡上（幽灵）→ 退回主媒体', () => {
    pin('https://cdn/gone.png')
    render(<MediaReviewButtons nodeId="node-1" data={collectorData} />)
    fireEvent.click(screen.getByRole('button', { name: 'reject' }))

    const patch = mocks.updateNodeData.mock.calls.at(-1)?.[1]
    expect(patch.mediaReview[MAIN_URL].state).toBe(
      NODE_REVIEW_STATE_IDS.rejected,
    )
  })

  it('对照组：待审项就是主媒体时，两层指向同一个 URL，行为正确', () => {
    const data = {
      status: NODE_STATUS_IDS.idle,
      mediaUrl: MAIN_URL,
      mediaReview: {
        [MAIN_URL]: { state: NODE_REVIEW_STATE_IDS.awaitingReview },
      },
    } as unknown as NodeWorkflowNodeData

    const queue = collectReviewQueue([
      { id: 'node-1', type: 'image', data },
    ] as unknown as NodeWorkflowNode[])
    expect(queue[0]?.url).toBe(MAIN_URL)

    render(<MediaReviewButtons nodeId="node-1" data={data} />)
    fireEvent.click(screen.getByRole('button', { name: 'approve' }))
    const patch = mocks.updateNodeData.mock.calls.at(-1)?.[1]
    expect(patch.mediaReview[MAIN_URL].state).toBe(
      NODE_REVIEW_STATE_IDS.approved,
    )
  })
})
