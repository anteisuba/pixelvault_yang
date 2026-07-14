import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  NODE_GENERATION_STATUS_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import type {
  NodeWorkflowEdge,
  NodeWorkflowNode,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'

const mocks = vi.hoisted(() => ({
  edges: [] as Array<Record<string, unknown>>,
  mergeVideosAPI: vi.fn(),
  nodes: [] as Array<Record<string, unknown>>,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  updateNodeData: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}))

vi.mock('@xyflow/react', () => ({
  useEdges: () => mocks.edges,
  useNodes: () => mocks.nodes,
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}))

vi.mock('@/lib/api-client', () => ({
  mergeVideosAPI: mocks.mergeVideosAPI,
}))

vi.mock('../NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({
    updateNodeData: mocks.updateNodeData,
  }),
}))

import { VideoMergeInspector } from './VideoMergeInspector'

const FIRST_URL = 'https://cdn.example.com/first.mp4'
const SECOND_URL = 'https://cdn.example.com/second.mp4'

function makeNode(
  id: string,
  type: NodeWorkflowNode['type'],
  data: Partial<NodeWorkflowNodeData> = {},
): NodeWorkflowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
      ...data,
    },
  }
}

function renderMerge(data: Partial<NodeWorkflowNodeData> = {}) {
  const mergeNode = makeNode('merge-1', NODE_TYPE_IDS.videoMerge, data)
  const first = makeNode('video-1', NODE_TYPE_IDS.videoReference, {
    mediaUrl: FIRST_URL,
  })
  const second = makeNode('video-2', NODE_TYPE_IDS.seedance, {
    mediaUrl: SECOND_URL,
  })
  mocks.nodes = [mergeNode, first, second]
  mocks.edges = [
    { id: 'edge-1', source: first.id, target: mergeNode.id },
    { id: 'edge-2', source: second.id, target: mergeNode.id },
  ] satisfies NodeWorkflowEdge[]

  render(<VideoMergeInspector node={mergeNode} />)
  return mergeNode
}

describe('VideoMergeInspector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.nodes = []
    mocks.edges = []
    mocks.mergeVideosAPI.mockResolvedValue({
      success: true,
      data: { url: 'https://cdn.example.com/merged.mp4' },
    })
  })

  it('merges two upstream clips in their displayed order', async () => {
    renderMerge()

    fireEvent.click(screen.getByRole('button', { name: 'merge.run' }))

    await waitFor(() =>
      expect(mocks.mergeVideosAPI).toHaveBeenCalledWith({
        videoUrls: [FIRST_URL, SECOND_URL],
      }),
    )
    expect(mocks.updateNodeData).toHaveBeenLastCalledWith('merge-1', {
      mediaUrl: 'https://cdn.example.com/merged.mp4',
      mediaLabel: 'mediaLabel {"count":2}',
      generationStatus: NODE_GENERATION_STATUS_IDS.success,
      status: NODE_STATUS_IDS.done,
      generationError: undefined,
    })
  })

  it('routes valid trim settings through the clips payload', async () => {
    renderMerge({
      mergeSettings: {
        clips: [{ url: FIRST_URL, startSec: 1, endSec: 3 }],
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'merge.run' }))

    await waitFor(() =>
      expect(mocks.mergeVideosAPI).toHaveBeenCalledWith({
        clips: [
          { url: FIRST_URL, startSec: 1, endSec: 3 },
          { url: SECOND_URL, startSec: undefined, endSec: undefined },
        ],
      }),
    )
  })

  it('blocks submission when an end time is not after its start time', () => {
    renderMerge({
      mergeSettings: {
        clips: [{ url: FIRST_URL, startSec: 4, endSec: 2 }],
      },
    })

    expect(screen.getByRole('button', { name: 'merge.run' })).toBeDisabled()
    expect(screen.getAllByText('trim.rangeWarning').length).toBeGreaterThan(0)
    expect(mocks.mergeVideosAPI).not.toHaveBeenCalled()
  })

  it('turns a thrown network failure into a recoverable node error', async () => {
    mocks.mergeVideosAPI.mockRejectedValueOnce(new Error('network down'))
    renderMerge()

    fireEvent.click(screen.getByRole('button', { name: 'merge.run' }))

    await waitFor(() =>
      expect(mocks.updateNodeData).toHaveBeenCalledWith('merge-1', {
        generationStatus: NODE_GENERATION_STATUS_IDS.error,
        status: NODE_STATUS_IDS.failed,
        generationError: 'errors.mergeFailed',
      }),
    )
    expect(mocks.toastError).toHaveBeenCalledWith(
      'errors.mergeFailed',
      expect.any(Object),
    )
  })
})
