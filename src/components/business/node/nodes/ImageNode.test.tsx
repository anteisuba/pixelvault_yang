import type { NodeProps } from '@xyflow/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NODE_IMAGE_ROLE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

// S5d ③/④: ImageNode's dispatch now has four branches (starter / loose /
// identity collector / media preview). Isolate the routing from each child's
// own rendering by stubbing all four.
vi.mock('./ImageSourceStarter', () => ({
  ImageSourceStarter: ({ nodeId }: { nodeId: string }) => (
    <div>starter-{nodeId}</div>
  ),
}))

vi.mock('./LooseImageCard', () => ({
  LooseImageCard: ({ id }: { id: string }) => <div>loose-{id}</div>,
}))

vi.mock('./IdentityCollectorCard', () => ({
  IdentityCollectorCard: ({
    id,
    legacyType,
  }: {
    id: string
    legacyType: string
  }) => (
    <div>
      collector-{id}-{legacyType}
    </div>
  ),
}))

vi.mock('./NodeMediaPreview', () => ({
  NodeMediaPreview: ({ id, type }: { id: string; type: string }) => (
    <div>
      preview-{id}-{type}
    </div>
  ),
}))

import { ImageNode } from './ImageNode'

function makeProps(
  role?: string,
  mediaUrl?: string,
): NodeProps<NodeWorkflowNode> {
  return {
    id: 'img1',
    selected: false,
    data: { prompt: '', status: 'idle', role, mediaUrl },
  } as unknown as NodeProps<NodeWorkflowNode>
}

describe('ImageNode', () => {
  it('shows the upload-first starter for a role-less, media-less node (S5d ③ retires the role picker)', () => {
    render(<ImageNode {...makeProps()} />)
    expect(screen.getByText('starter-img1')).toBeInTheDocument()
  })

  it('shows the loose image card for a role-less node that already has media', () => {
    render(<ImageNode {...makeProps(undefined, 'https://cdn/x.png')} />)
    expect(screen.getByText('loose-img1')).toBeInTheDocument()
  })

  it('shows the archive collector card for character/background roles', () => {
    render(<ImageNode {...makeProps(NODE_IMAGE_ROLE_IDS.character)} />)
    expect(
      screen.getByText('collector-img1-characterImage'),
    ).toBeInTheDocument()

    render(<ImageNode {...makeProps(NODE_IMAGE_ROLE_IDS.background)} />)
    expect(
      screen.getByText('collector-img1-backgroundImage'),
    ).toBeInTheDocument()
  })

  it('falls back to the media-container preview for shot/frame/closeup roles', () => {
    render(<ImageNode {...makeProps(NODE_IMAGE_ROLE_IDS.shot)} />)
    expect(screen.getByText('preview-img1-shot')).toBeInTheDocument()
  })
})
