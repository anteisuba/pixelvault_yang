import type { NodeProps } from '@xyflow/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NODE_IMAGE_ROLE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

// Isolate ImageNode's chooser/card orchestration from NodeShell / ReactFlow /
// next-intl by stubbing its two children. Each stub surfaces the callbacks
// ImageNode wires so the test can drive them.
vi.mock('./ImageRolePicker', () => ({
  ImageRolePicker: ({
    nodeId,
    currentRole,
    onPicked,
  }: {
    nodeId: string
    currentRole?: string
    onPicked?: () => void
  }) => (
    <div>
      <span>chooser-{nodeId}</span>
      <span>current-{currentRole ?? 'none'}</span>
      <button type="button" onClick={() => onPicked?.()}>
        pick
      </button>
    </div>
  ),
}))

vi.mock('./NodeMediaPreview', () => ({
  NodeMediaPreview: ({
    id,
    onReChoose,
  }: {
    id: string
    onReChoose?: () => void
  }) => (
    <div>
      <span>card-{id}</span>
      {onReChoose ? (
        <button type="button" onClick={onReChoose}>
          rechoose
        </button>
      ) : null}
    </div>
  ),
}))

import { ImageNode } from './ImageNode'

function makeProps(role?: string): NodeProps<NodeWorkflowNode> {
  return {
    id: 'img1',
    selected: false,
    data: { prompt: '', status: 'idle', role },
  } as unknown as NodeProps<NodeWorkflowNode>
}

describe('ImageNode', () => {
  it('shows the chooser (no current role) for a role-less node', () => {
    render(<ImageNode {...makeProps()} />)
    expect(screen.getByText('chooser-img1')).toBeInTheDocument()
    expect(screen.getByText('current-none')).toBeInTheDocument()
    expect(screen.queryByText('card-img1')).not.toBeInTheDocument()
  })

  it('shows the media card with a re-choose control once a role is set', () => {
    render(<ImageNode {...makeProps(NODE_IMAGE_ROLE_IDS.character)} />)
    expect(screen.getByText('card-img1')).toBeInTheDocument()
    expect(screen.getByText('rechoose')).toBeInTheDocument()
    expect(screen.queryByText('chooser-img1')).not.toBeInTheDocument()
  })

  it('re-opens the chooser carrying the current role (so re-picking it is a no-op)', () => {
    render(<ImageNode {...makeProps(NODE_IMAGE_ROLE_IDS.character)} />)

    // 返回图片 (面包屑「图片」) → chooser; the existing role rides along so the
    // body can treat re-picking it as a non-destructive back.
    fireEvent.click(screen.getByText('rechoose'))
    expect(screen.getByText('chooser-img1')).toBeInTheDocument()
    expect(
      screen.getByText(`current-${NODE_IMAGE_ROLE_IDS.character}`),
    ).toBeInTheDocument()
  })

  it('returns to the card after a role is (re-)picked', () => {
    render(<ImageNode {...makeProps(NODE_IMAGE_ROLE_IDS.character)} />)

    fireEvent.click(screen.getByText('rechoose'))
    expect(screen.getByText('chooser-img1')).toBeInTheDocument()

    fireEvent.click(screen.getByText('pick'))
    expect(screen.getByText('card-img1')).toBeInTheDocument()
  })
})
