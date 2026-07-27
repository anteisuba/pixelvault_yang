import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  useUpdateNodeInternalsOnInit,
  type ForceNodeInternalsUpdate,
} from '@/hooks/node/use-update-node-internals-on-init'

interface FakeNode {
  id: string
}

/** Appends a `.react-flow__node[data-id]` element to the document, mirroring
 * what React Flow's real node wrapper renders — the hook under test reads
 * these via `document.querySelectorAll`, not via any xyflow API, so the test
 * only needs to fake the DOM shape, never xyflow itself. */
function mountFakeReactFlowNode(id: string): HTMLDivElement {
  const element = document.createElement('div')
  element.className = 'react-flow__node'
  element.setAttribute('data-id', id)
  document.body.appendChild(element)
  return element
}

describe('useUpdateNodeInternalsOnInit', () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame
  const originalCancelAnimationFrame = window.cancelAnimationFrame
  // Every test gets tick-count visibility for free via this counter — the
  // v2 regression (retry loop that never actually retries) is invisible if
  // a test can only see whether the callback fired, not how many ticks it
  // took to get there.
  let rafCallCount = 0

  beforeEach(() => {
    rafCallCount = 0
    // Run each deferred frame synchronously — same stub pattern as
    // use-overlay-focus-return.test.ts — but still count invocations so a
    // test that needs multiple ticks (retry-until-DOM-catches-up, or
    // retry-until-budget-exhausted) can assert on that, not just on the
    // eventual call/no-call outcome.
    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      rafCallCount += 1
      callback(0)
      return rafCallCount
    })
    window.cancelAnimationFrame = vi.fn()
  })

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame
    window.cancelAnimationFrame = originalCancelAnimationFrame
    document.body.replaceChildren()
  })

  it('does not call applyForcedNodeInternals while nodes stays empty', () => {
    const applyForcedNodeInternals = vi.fn()

    const { rerender } = renderHook(
      ({ nodes }: { nodes: FakeNode[] }) =>
        useUpdateNodeInternalsOnInit(nodes, applyForcedNodeInternals),
      { initialProps: { nodes: [] } },
    )

    rerender({ nodes: [] })
    expect(applyForcedNodeInternals).not.toHaveBeenCalled()
  })

  it('fires once nodes go non-empty and the DOM already has every element, passing a Map with force:true', () => {
    const el1 = mountFakeReactFlowNode('node-1')
    const el2 = mountFakeReactFlowNode('node-2')
    const applyForcedNodeInternals = vi.fn()
    const nodes: FakeNode[] = [{ id: 'node-1' }, { id: 'node-2' }]

    const { rerender } = renderHook(
      ({ nodes }: { nodes: FakeNode[] }) =>
        useUpdateNodeInternalsOnInit(nodes, applyForcedNodeInternals),
      { initialProps: { nodes: [] as FakeNode[] } },
    )

    expect(applyForcedNodeInternals).not.toHaveBeenCalled()

    rerender({ nodes })

    expect(applyForcedNodeInternals).toHaveBeenCalledTimes(1)
    expect(rafCallCount).toBe(1) // fully caught up on the first tick already
    const updates = applyForcedNodeInternals.mock.calls[0][0] as Map<
      string,
      ForceNodeInternalsUpdate
    >
    expect(updates.size).toBe(2)
    expect(updates.get('node-1')).toEqual({
      id: 'node-1',
      nodeElement: el1,
      force: true,
    })
    expect(updates.get('node-2')).toEqual({
      id: 'node-2',
      nodeElement: el2,
      force: true,
    })
  })

  it('runs once immediately when nodes is already non-empty and the DOM is already there on mount', () => {
    mountFakeReactFlowNode('only-node')
    const applyForcedNodeInternals = vi.fn()
    const nodes: FakeNode[] = [{ id: 'only-node' }]

    renderHook(() =>
      useUpdateNodeInternalsOnInit(nodes, applyForcedNodeInternals),
    )

    expect(applyForcedNodeInternals).toHaveBeenCalledTimes(1)
    const updates = applyForcedNodeInternals.mock.calls[0][0] as Map<
      string,
      ForceNodeInternalsUpdate
    >
    expect(updates.size).toBe(1)
    expect(updates.has('only-node')).toBe(true)
  })

  it('never fires again after the first run, even as the node array keeps getting a new identity (drag)', () => {
    mountFakeReactFlowNode('node-1')
    const applyForcedNodeInternals = vi.fn()

    const { rerender } = renderHook(
      ({ nodes }: { nodes: FakeNode[] }) =>
        useUpdateNodeInternalsOnInit(nodes, applyForcedNodeInternals),
      { initialProps: { nodes: [{ id: 'node-1' }] } },
    )

    expect(applyForcedNodeInternals).toHaveBeenCalledTimes(1)
    applyForcedNodeInternals.mockClear()

    // Every drag frame hands the workbench a brand-new array reference for
    // the same logical nodes — must not retrigger a recompute.
    rerender({ nodes: [{ id: 'node-1' }] })
    rerender({ nodes: [{ id: 'node-1' }] })
    rerender({ nodes: [{ id: 'node-1' }, { id: 'node-2' }] })

    expect(applyForcedNodeInternals).not.toHaveBeenCalled()
  })

  // v2 regression test (real device, 2026-07-27): `nodes` going non-empty
  // does NOT mean React Flow's own node-wrapper DOM has landed yet — it's a
  // separate, later render pass. v2 scanned once, found nothing, and
  // (wrongly) burned the one-shot guard on that empty scan, so it never got
  // a second chance. This is the corrected shape of that scenario: a miss
  // must retry, not consume the guard.
  it('does not call and does not consume the one-shot on an empty first scan, then fires once the DOM catches up on a later tick', () => {
    const applyForcedNodeInternals = vi.fn()
    let mountedElement: HTMLDivElement | undefined
    let localCallCount = 0
    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      localCallCount += 1
      if (localCallCount === 3) {
        // Simulate React Flow's own extra render pass finally committing the
        // node DOM a couple of frames after `nodes` went non-empty.
        mountedElement = mountFakeReactFlowNode('node-1')
      }
      callback(0)
      return localCallCount
    })

    const nodes: FakeNode[] = [{ id: 'node-1' }]
    const { rerender } = renderHook(
      ({ nodes }: { nodes: FakeNode[] }) =>
        useUpdateNodeInternalsOnInit(nodes, applyForcedNodeInternals),
      { initialProps: { nodes: [] as FakeNode[] } },
    )

    expect(applyForcedNodeInternals).not.toHaveBeenCalled()

    rerender({ nodes })

    // Took more than one tick — the first (at least) scan(s) missed.
    expect(localCallCount).toBeGreaterThanOrEqual(3)
    expect(applyForcedNodeInternals).toHaveBeenCalledTimes(1)
    const updates = applyForcedNodeInternals.mock.calls[0][0] as Map<
      string,
      ForceNodeInternalsUpdate
    >
    expect(updates.get('node-1')).toEqual({
      id: 'node-1',
      nodeElement: mountedElement,
      force: true,
    })

    // And, as ever, the one-shot really is spent now.
    applyForcedNodeInternals.mockClear()
    rerender({ nodes: [{ id: 'node-1' }] })
    expect(applyForcedNodeInternals).not.toHaveBeenCalled()
  })

  it('gives up after the retry budget when the DOM never catches up, without ever calling applyForcedNodeInternals, and never retries again afterwards', () => {
    // Deliberately no DOM element mounted for 'ghost-node', ever.
    const applyForcedNodeInternals = vi.fn()
    const nodes: FakeNode[] = [{ id: 'ghost-node' }]

    const { rerender } = renderHook(
      ({ nodes }: { nodes: FakeNode[] }) =>
        useUpdateNodeInternalsOnInit(nodes, applyForcedNodeInternals),
      { initialProps: { nodes: [] as FakeNode[] } },
    )

    rerender({ nodes })

    // Bounded retry, not a single miss-and-give-up (that was the v2 bug)
    // and not an unbounded scan loop either.
    expect(rafCallCount).toBeGreaterThan(10)
    expect(rafCallCount).toBeLessThan(1000)
    expect(applyForcedNodeInternals).not.toHaveBeenCalled()

    // The one-shot is consumed once the budget is spent — a later render
    // (new node list identity, same missing node) must not start a fresh
    // retry sequence.
    const rafCallCountAfterGivingUp = rafCallCount
    rerender({ nodes: [{ id: 'ghost-node' }] })
    expect(rafCallCount).toBe(rafCallCountAfterGivingUp)
    expect(applyForcedNodeInternals).not.toHaveBeenCalled()
  })

  it('applies whatever it found if only some nodes catch up before the retry budget runs out', () => {
    // 'node-1' is there from the start; 'node-2' never mounts — e.g. its own
    // subtree never settles. The poll can't ever call this "caught up"
    // (updates.size can only reach 1, never nodes.length === 2), so it must
    // run out the retry budget and then hand over the partial map rather
    // than silently discarding the one node it did resolve.
    const el1 = mountFakeReactFlowNode('node-1')
    const applyForcedNodeInternals = vi.fn()
    const nodes: FakeNode[] = [{ id: 'node-1' }, { id: 'node-2' }]

    const { rerender } = renderHook(
      ({ nodes }: { nodes: FakeNode[] }) =>
        useUpdateNodeInternalsOnInit(nodes, applyForcedNodeInternals),
      { initialProps: { nodes: [] as FakeNode[] } },
    )

    rerender({ nodes })

    expect(rafCallCount).toBeGreaterThan(10)
    expect(applyForcedNodeInternals).toHaveBeenCalledTimes(1)
    const updates = applyForcedNodeInternals.mock.calls[0][0] as Map<
      string,
      ForceNodeInternalsUpdate
    >
    expect(updates.size).toBe(1)
    expect(updates.get('node-1')).toEqual({
      id: 'node-1',
      nodeElement: el1,
      force: true,
    })
    expect(updates.has('node-2')).toBe(false)
  })
})
