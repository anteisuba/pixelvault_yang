import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api-client', () => ({
  checkAudioStatusAPI: vi.fn(),
  checkImageGenerationStatusAPI: vi.fn(),
  checkVideoStatusAPI: vi.fn(),
}))

import { NODE_TYPE_IDS } from '@/constants/node-types'
import {
  checkAudioStatusAPI,
  checkImageGenerationStatusAPI,
  checkVideoStatusAPI,
} from '@/lib/api-client'
import { useNodeGenerationReconcile } from '@/hooks/node/use-node-generation-reconcile'
import type { GenerationRecord } from '@/types'
import type {
  NodeWorkflowNode,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'

const GENERATION: GenerationRecord = {
  id: 'generation-1',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  outputType: 'IMAGE',
  status: 'COMPLETED',
  url: 'https://cdn.test/result.png',
  storageKey: 'generations/result.png',
  mimeType: 'image/png',
  width: 1024,
  height: 1024,
  prompt: 'a prompt',
  model: 'gemini-3.1-flash-image-preview',
  provider: 'Gemini',
  requestCount: 1,
  seed: 42,
  isPublic: false,
  isPromptPublic: false,
}

function makeNode(
  id: string,
  type: NodeWorkflowNode['type'],
  data: Partial<NodeWorkflowNodeData>,
): NodeWorkflowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
      prompt: '',
      status: 'running',
      ...data,
    } as NodeWorkflowNodeData,
  }
}

const updateNodeData = vi.fn()
const formatError = vi.fn(
  (payload: { error?: string }) => payload.error ?? 'generic failure',
)

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useNodeGenerationReconcile', () => {
  it('backfills a COMPLETED media image node and clears its jobId', async () => {
    vi.mocked(checkImageGenerationStatusAPI).mockResolvedValue({
      success: true,
      data: { jobId: 'job-1', status: 'COMPLETED', generation: GENERATION },
    })

    const nodes = [
      makeNode('node-1', NODE_TYPE_IDS.image, {
        generationStatus: 'pending',
        mediaJobId: 'job-1',
        mediaKind: 'image',
      }),
    ]

    renderHook(() =>
      useNodeGenerationReconcile({ nodes, updateNodeData, formatError }),
    )

    await waitFor(() => expect(updateNodeData).toHaveBeenCalledTimes(1))
    expect(checkImageGenerationStatusAPI).toHaveBeenCalledWith('job-1')
    expect(updateNodeData).toHaveBeenCalledWith(
      'node-1',
      expect.objectContaining({
        generationId: GENERATION.id,
        generationStatus: 'success',
        mediaUrl: GENERATION.url,
        mediaLabel: GENERATION.model,
        lastSeed: 42,
        mediaJobId: undefined,
        status: 'done',
      }),
    )
  })

  it('backfills a COMPLETED character image node onto imageUrl', async () => {
    vi.mocked(checkImageGenerationStatusAPI).mockResolvedValue({
      success: true,
      data: { jobId: 'job-2', status: 'COMPLETED', generation: GENERATION },
    })

    const nodes = [
      makeNode('node-2', NODE_TYPE_IDS.characterImage, {
        generationStatus: 'pending',
        mediaJobId: 'job-2',
      }),
    ]

    renderHook(() =>
      useNodeGenerationReconcile({ nodes, updateNodeData, formatError }),
    )

    await waitFor(() => expect(updateNodeData).toHaveBeenCalledTimes(1))
    expect(updateNodeData).toHaveBeenCalledWith(
      'node-2',
      expect.objectContaining({
        generationId: GENERATION.id,
        generationStatus: 'success',
        imageUrl: GENERATION.url,
        mediaJobId: undefined,
        status: 'done',
      }),
    )
  })

  it('routes video and audio nodes to their own status endpoints', async () => {
    vi.mocked(checkVideoStatusAPI).mockResolvedValue({
      success: true,
      data: { jobId: 'job-v', status: 'IN_PROGRESS' },
    })
    vi.mocked(checkAudioStatusAPI).mockResolvedValue({
      success: true,
      data: { jobId: 'job-a', status: 'IN_PROGRESS' },
    })

    const nodes = [
      makeNode('node-v', NODE_TYPE_IDS.seedance, {
        generationStatus: 'pending',
        mediaJobId: 'job-v',
        mediaKind: 'video',
      }),
      makeNode('node-a', NODE_TYPE_IDS.voice, {
        generationStatus: 'pending',
        mediaJobId: 'job-a',
        mediaKind: 'audio',
      }),
    ]

    renderHook(() =>
      useNodeGenerationReconcile({ nodes, updateNodeData, formatError }),
    )

    await waitFor(() => {
      expect(checkVideoStatusAPI).toHaveBeenCalledWith('job-v')
      expect(checkAudioStatusAPI).toHaveBeenCalledWith('job-a')
    })
    expect(checkImageGenerationStatusAPI).not.toHaveBeenCalled()
  })

  it('writes a localized error on FAILED and clears the jobId', async () => {
    vi.mocked(checkImageGenerationStatusAPI).mockResolvedValue({
      success: true,
      data: {
        jobId: 'job-3',
        status: 'FAILED',
        error: 'provider blocked the prompt',
        errorCode: 'content_filtered',
      },
    })

    const nodes = [
      makeNode('node-3', NODE_TYPE_IDS.image, {
        generationStatus: 'pending',
        mediaJobId: 'job-3',
        mediaKind: 'image',
      }),
    ]

    renderHook(() =>
      useNodeGenerationReconcile({ nodes, updateNodeData, formatError }),
    )

    await waitFor(() => expect(updateNodeData).toHaveBeenCalledTimes(1))
    expect(formatError).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'content_filtered' }),
    )
    expect(updateNodeData).toHaveBeenCalledWith(
      'node-3',
      expect.objectContaining({
        generationError: 'provider blocked the prompt',
        generationStatus: 'error',
        mediaJobId: undefined,
        status: 'failed',
      }),
    )
  })

  it('leaves an IN_PROGRESS job pending without writing back', async () => {
    vi.mocked(checkImageGenerationStatusAPI).mockResolvedValue({
      success: true,
      data: { jobId: 'job-4', status: 'IN_PROGRESS' },
    })

    const nodes = [
      makeNode('node-4', NODE_TYPE_IDS.image, {
        generationStatus: 'pending',
        mediaJobId: 'job-4',
        mediaKind: 'image',
      }),
    ]

    renderHook(() =>
      useNodeGenerationReconcile({ nodes, updateNodeData, formatError }),
    )

    await waitFor(() =>
      expect(checkImageGenerationStatusAPI).toHaveBeenCalledWith('job-4'),
    )
    await flush()
    expect(updateNodeData).not.toHaveBeenCalled()
  })

  it('ignores pending nodes that have no persisted jobId', async () => {
    const nodes = [
      makeNode('node-5', NODE_TYPE_IDS.image, {
        generationStatus: 'pending',
        mediaKind: 'image',
      }),
    ]

    renderHook(() =>
      useNodeGenerationReconcile({ nodes, updateNodeData, formatError }),
    )

    await flush()
    expect(checkImageGenerationStatusAPI).not.toHaveBeenCalled()
    expect(updateNodeData).not.toHaveBeenCalled()
  })

  it('re-reconciles when the tab regains focus', async () => {
    vi.mocked(checkImageGenerationStatusAPI).mockResolvedValue({
      success: true,
      data: { jobId: 'job-6', status: 'IN_PROGRESS' },
    })

    const nodes = [
      makeNode('node-6', NODE_TYPE_IDS.image, {
        generationStatus: 'pending',
        mediaJobId: 'job-6',
        mediaKind: 'image',
      }),
    ]

    renderHook(() =>
      useNodeGenerationReconcile({ nodes, updateNodeData, formatError }),
    )

    await waitFor(() =>
      expect(checkImageGenerationStatusAPI).toHaveBeenCalledTimes(1),
    )

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(checkImageGenerationStatusAPI).toHaveBeenCalledTimes(2)
  })
})
