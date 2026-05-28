import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@xyflow/react', () => ({
  useEdges: () => [],
  useNodes: () => [],
}))

const mockUpdateNodeData = vi.fn()
const mockGenerateMediaNode = vi.fn()
vi.mock('../NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({
    updateNodeData: mockUpdateNodeData,
    generateMediaNode: mockGenerateMediaNode,
    modelOptionsByType: {},
  }),
}))

vi.mock('@/components/business/node/WorkflowModelPicker', () => ({
  WorkflowModelPicker: () => <button type="button">modelPicker</button>,
}))

import { NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { SeedanceInspector } from './SeedanceInspector'

function makeSeedanceNode(
  data: Partial<NodeWorkflowNode['data']> = {},
): NodeWorkflowNode {
  return {
    id: 'seedance-1',
    type: NODE_TYPE_IDS.seedance,
    position: { x: 0, y: 0 },
    data: {
      prompt: '',
      status: 'idle',
      ...data,
    },
  } as NodeWorkflowNode
}

describe('SeedanceInspector timeline preview', () => {
  it('renders each plan beat read-only when a timeline is present', () => {
    const node = makeSeedanceNode({
      timeline: [
        {
          startSecond: 0,
          endSecond: 4,
          action: 'Cat watches the rain trace the glass',
          camera: 'Close-up, slow push-in',
        },
        {
          startSecond: 4,
          endSecond: 8,
          action: 'Tail flicks once',
          camera: 'Static medium shot',
          composition: 'Profile against rainy blur',
        },
      ],
    })

    render(<SeedanceInspector node={node} />)

    expect(screen.getByText('timeline.title')).toBeInTheDocument()
    expect(
      screen.getByText('Cat watches the rain trace the glass'),
    ).toBeInTheDocument()
    expect(screen.getByText('Tail flicks once')).toBeInTheDocument()
    expect(screen.getByText('Profile against rainy blur')).toBeInTheDocument()
  })

  it('hides the timeline section when no timeline is present', () => {
    render(<SeedanceInspector node={makeSeedanceNode()} />)

    expect(screen.queryByText('timeline.title')).not.toBeInTheDocument()
  })
})
