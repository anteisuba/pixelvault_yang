import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useUpdateNodeInternalsOnInit } from '@/hooks/node/use-update-node-internals-on-init'

interface FakeNode {
  id: string
}

describe('useUpdateNodeInternalsOnInit', () => {
  it('calls updateNodeInternals once per node when nodesInitialized flips false→true, and never again on later renders', () => {
    const updateNodeInternals = vi.fn()
    const nodes: FakeNode[] = [
      { id: 'node-1' },
      { id: 'node-2' },
      { id: 'node-3' },
    ]

    const { rerender } = renderHook(
      ({ nodesInitialized }: { nodesInitialized: boolean }) =>
        useUpdateNodeInternalsOnInit(
          nodesInitialized,
          nodes,
          updateNodeInternals,
        ),
      { initialProps: { nodesInitialized: false } },
    )

    expect(updateNodeInternals).not.toHaveBeenCalled()

    rerender({ nodesInitialized: true })

    expect(updateNodeInternals).toHaveBeenCalledTimes(nodes.length)
    expect(updateNodeInternals).toHaveBeenNthCalledWith(1, 'node-1')
    expect(updateNodeInternals).toHaveBeenNthCalledWith(2, 'node-2')
    expect(updateNodeInternals).toHaveBeenNthCalledWith(3, 'node-3')

    // Re-renders afterwards (e.g. a node drag re-rendering the workbench)
    // must never re-fire the sync.
    updateNodeInternals.mockClear()
    rerender({ nodesInitialized: true })
    rerender({ nodesInitialized: true })
    expect(updateNodeInternals).not.toHaveBeenCalled()
  })

  it('does not call updateNodeInternals while nodesInitialized stays false', () => {
    const updateNodeInternals = vi.fn()
    const nodes: FakeNode[] = [{ id: 'node-1' }]

    const { rerender } = renderHook(
      ({ nodesInitialized }: { nodesInitialized: boolean }) =>
        useUpdateNodeInternalsOnInit(
          nodesInitialized,
          nodes,
          updateNodeInternals,
        ),
      { initialProps: { nodesInitialized: false } },
    )

    rerender({ nodesInitialized: false })
    expect(updateNodeInternals).not.toHaveBeenCalled()
  })

  it('runs once immediately when nodesInitialized is already true on mount', () => {
    const updateNodeInternals = vi.fn()
    const nodes: FakeNode[] = [{ id: 'only-node' }]

    renderHook(() =>
      useUpdateNodeInternalsOnInit(true, nodes, updateNodeInternals),
    )

    expect(updateNodeInternals).toHaveBeenCalledTimes(1)
    expect(updateNodeInternals).toHaveBeenCalledWith('only-node')
  })

  it('does not re-run when the node list changes after the initial sync', () => {
    const updateNodeInternals = vi.fn()
    const initialNodes: FakeNode[] = [{ id: 'node-1' }]

    const { rerender } = renderHook(
      ({ nodes }: { nodes: FakeNode[] }) =>
        useUpdateNodeInternalsOnInit(true, nodes, updateNodeInternals),
      { initialProps: { nodes: initialNodes } },
    )

    expect(updateNodeInternals).toHaveBeenCalledTimes(1)
    updateNodeInternals.mockClear()

    rerender({ nodes: [{ id: 'node-1' }, { id: 'node-2' }] })
    expect(updateNodeInternals).not.toHaveBeenCalled()
  })
})
