import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NODE_STATUS_IDS } from '@/constants/node-types'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

// LooseImageCard renders whenever an image-family node (散图 / shot / frame /
// closeup) already has media — this is the actual surface the bug report is
// about: its on-card name is a hand-rolled label (doesn't go through
// NodeShell.Header), so the near-field toolbar's rename input being deleted
// as a duplicate left it with no writable name at all. Interaction-state
// coverage (Enter/Esc/blur/empty-guard/IME) already lives in
// NodeShell.test.tsx against the shared EditableNodeLabel this card now
// reuses — these tests only check the WIRING that's unique to this file:
// does clicking the card's own label actually reach updateNodeData with the
// right fields.
const mocks = vi.hoisted(() => ({
  heavyOverlayOpen: false,
  transientLayerOpen: false,
  multiSelectActive: false,
  updateNodeData: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
}))

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={typeof src === 'string' ? src : ''} />
  ),
}))

vi.mock('@xyflow/react', () => ({
  NodeResizer: () => null,
  NodeToolbar: ({
    children,
    isVisible,
  }: {
    children: ReactNode
    isVisible?: boolean
  }) => (isVisible ? <>{children}</> : null),
  Handle: () => null,
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
  useEdges: () => [],
  useNodes: () => [],
}))

vi.mock('../NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => mocks,
}))

vi.mock('../CanvasImageSelectionToolbar', () => ({
  CanvasImageSelectionToolbar: () => null,
  canOfferCanvasImageEdit: () => false,
  NodeSelectionToolbarChrome: () => null,
  ShotGenerateButton: () => null,
}))

vi.mock('../CanvasQuickEditPrompt', () => ({
  CanvasQuickEditPrompt: () => null,
}))

import { LooseImageCard } from './LooseImageCard'

function makeData(
  overrides: Partial<NodeWorkflowNodeData> = {},
): NodeWorkflowNodeData {
  return {
    mediaUrl: 'https://cdn.example.com/source.png',
    status: NODE_STATUS_IDS.done,
    ...overrides,
  } as NodeWorkflowNodeData
}

describe('LooseImageCard — on-card rename (canvas-image-card.md §1)', () => {
  beforeEach(() => {
    mocks.updateNodeData.mockClear()
  })

  it('shows the current mediaLabel and lets it be edited in place', () => {
    render(
      <LooseImageCard id="node-1" data={makeData({ mediaLabel: '猫猫图' })} />,
    )
    const trigger = screen.getByRole('button', { name: 'rename' })
    expect(trigger).toHaveTextContent('猫猫图')

    fireEvent.click(trigger)
    const input = screen.getByRole('textbox', {
      name: 'rename',
    }) as HTMLInputElement
    expect(input.value).toBe('猫猫图')
  })

  it('commits a rename through updateNodeData with mediaLabel + sourceLabel (mirrors the deleted toolbar commitName)', () => {
    render(
      <LooseImageCard id="node-1" data={makeData({ mediaLabel: '猫猫图' })} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'rename' }))
    const input = screen.getByRole('textbox', { name: 'rename' })
    fireEvent.change(input, { target: { value: '新猫猫图' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(mocks.updateNodeData).toHaveBeenCalledTimes(1)
    expect(mocks.updateNodeData).toHaveBeenCalledWith('node-1', {
      mediaLabel: '新猫猫图',
      sourceLabel: '新猫猫图',
    })
  })

  it('an empty submit never calls updateNodeData (no silently-empty name)', () => {
    render(
      <LooseImageCard id="node-1" data={makeData({ mediaLabel: '猫猫图' })} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'rename' }))
    const input = screen.getByRole('textbox', { name: 'rename' })
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(mocks.updateNodeData).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'rename' })).toHaveTextContent(
      '猫猫图',
    )
  })

  it('Esc reverts without calling updateNodeData', () => {
    render(
      <LooseImageCard id="node-1" data={makeData({ mediaLabel: '猫猫图' })} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'rename' }))
    const input = screen.getByRole('textbox', { name: 'rename' })
    fireEvent.change(input, { target: { value: '手滑' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(mocks.updateNodeData).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'rename' })).toHaveTextContent(
      '猫猫图',
    )
  })

  it('an unnamed card shows the untitled fallback and edits from an empty raw value', () => {
    render(<LooseImageCard id="node-1" data={makeData()} />)
    const trigger = screen.getByRole('button', { name: 'rename' })
    // StudioNode.ingest.looseImage.untitled — mocked useTranslations echoes
    // the key.
    expect(trigger).toHaveTextContent('untitled')

    fireEvent.click(trigger)
    const input = screen.getByRole('textbox', {
      name: 'rename',
    }) as HTMLInputElement
    expect(input.value).toBe('')
  })
})
