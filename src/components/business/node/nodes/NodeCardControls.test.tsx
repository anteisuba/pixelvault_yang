import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// NodeCardControls re-exports NodeModelSelector → WorkflowModelPicker, whose
// model-picker chain pulls in next-intl navigation (next/navigation). We only
// test NodeExpandButton here, so stub the picker to keep the import light.
vi.mock('../WorkflowModelPicker', () => ({
  WorkflowModelPicker: () => null,
}))

const { mockState, mockSetExpandedNodeId } = vi.hoisted(() => ({
  mockState: { expandedNodeId: null as string | null },
  mockSetExpandedNodeId: vi.fn(),
}))

vi.mock('../NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({
    expandedNodeId: mockState.expandedNodeId,
    setExpandedNodeId: mockSetExpandedNodeId,
  }),
}))

import { NodeExpandButton } from './NodeCardControls'

describe('NodeExpandButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.expandedNodeId = null
  })

  it('opens the detail panel for its node when none is open', () => {
    render(<NodeExpandButton nodeId="node-1" />)
    fireEvent.click(screen.getByRole('button'))
    expect(mockSetExpandedNodeId).toHaveBeenCalledWith('node-1')
  })

  it('closes when its own node is already expanded', () => {
    mockState.expandedNodeId = 'node-1'
    render(<NodeExpandButton nodeId="node-1" />)
    fireEvent.click(screen.getByRole('button'))
    expect(mockSetExpandedNodeId).toHaveBeenCalledWith(null)
  })

  it('switches the open node when a different node is expanded', () => {
    mockState.expandedNodeId = 'other'
    render(<NodeExpandButton nodeId="node-1" />)
    fireEvent.click(screen.getByRole('button'))
    expect(mockSetExpandedNodeId).toHaveBeenCalledWith('node-1')
  })
})
