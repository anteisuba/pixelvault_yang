import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/node/use-reference-video-upload', () => ({
  useReferenceVideoUpload: () => ({
    uploadFile: vi.fn(),
    isUploading: false,
  }),
}))

vi.mock('../NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({
    updateNodeData: vi.fn(),
  }),
}))

import { VideoReferenceInspector } from './VideoReferenceInspector'

describe('VideoReferenceInspector', () => {
  it('separates reference preview from upload controls', () => {
    const node: NodeWorkflowNode = {
      id: 'video-reference-1',
      type: NODE_TYPE_IDS.videoReference,
      position: { x: 0, y: 0 },
      data: {
        prompt: '',
        status: NODE_STATUS_IDS.idle,
      },
    }

    render(<VideoReferenceInspector node={node} />)

    const studio = screen.getByTestId('video-reference-object-studio')
    expect(studio).toHaveClass(
      'canvas-object-studio-grid',
      'canvas-object-studio-grid--balanced',
    )
    expect(
      studio.querySelector('.canvas-object-studio-media-rail'),
    ).toBeInTheDocument()
    expect(
      studio.querySelector('.canvas-object-studio-task-rail'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'upload' })).toBeInTheDocument()
  })
})
