import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NODE_STATUS_IDS } from '@/constants/node-types'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

import {
  canOfferCanvasImageEdit,
  CanvasImageSelectionToolbar,
} from './CanvasImageSelectionToolbar'

const mocks = vi.hoisted(() => ({
  setExpandedNodeId: vi.fn(),
  deleteNode: vi.fn(),
  placeDerivedImages: vi.fn(),
  focusNode: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
}))

vi.mock('./NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => mocks,
}))

vi.mock('./CanvasImageEditWorkspace', () => ({
  CanvasImageEditWorkspace: ({
    defaultTask,
    open,
  }: {
    defaultTask: string
    open: boolean
  }) =>
    open ? <div data-testid="image-edit-workspace">{defaultTask}</div> : null,
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
}))

const IMAGE_DATA = {
  mediaUrl: 'https://cdn.example.com/source.png',
  status: NODE_STATUS_IDS.done,
} as NodeWorkflowNodeData

describe('CanvasImageSelectionToolbar', () => {
  it('detects image sources for the object toolbar', () => {
    expect(canOfferCanvasImageEdit(IMAGE_DATA)).toBe(true)
    expect(
      canOfferCanvasImageEdit({
        status: NODE_STATUS_IDS.idle,
      } as NodeWorkflowNodeData),
    ).toBe(false)
  })

  it('opens AI edit tools from the more menu into the workspace dialog', () => {
    render(<CanvasImageSelectionToolbar nodeId="node-1" data={IMAGE_DATA} />)

    // Primary chrome is rename/category/expand/download/quick-edit; AI suite
    // lives under "more" (always rendered in this mock dropdown).
    expect(
      screen.getByRole('button', { name: 'quickEdit' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /upscale.label/ }))
    expect(screen.getByTestId('image-edit-workspace')).toHaveTextContent(
      'upscale',
    )
  })

  it('toggles quick-edit without opening the heavy dialog', () => {
    const onQuickEditOpenChange = vi.fn()
    render(
      <CanvasImageSelectionToolbar
        nodeId="node-1"
        data={IMAGE_DATA}
        quickEditOpen={false}
        onQuickEditOpenChange={onQuickEditOpenChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'quickEdit' }))
    expect(onQuickEditOpenChange).toHaveBeenCalledWith(true)
    expect(screen.queryByTestId('image-edit-workspace')).not.toBeInTheDocument()
  })
})
