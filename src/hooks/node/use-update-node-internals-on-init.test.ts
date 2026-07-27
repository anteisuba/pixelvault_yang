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

/** Appends a `g.react-flow__edge` element to the document, mirroring what
 * React Flow renders per visible edge (`<svg><g className="react-flow__edge
 * react-flow__edge-<type> …">`). Namespaced as real SVG (not
 * `document.createElement('g')`) so it matches the real shape exactly
 * instead of relying on jsdom's case-insensitive HTML tag matching. The hook
 * under test counts these via `document.querySelectorAll('g.react-flow__edge')`
 * — this is the v4 success signal itself, so the fake DOM shape matters. */
function mountFakeReactFlowEdge(): SVGGElement {
  const element = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'g',
  ) as SVGGElement
  element.setAttribute('class', 'react-flow__edge')
  document.body.appendChild(element)
  return element
}

describe('useUpdateNodeInternalsOnInit', () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame
  const originalCancelAnimationFrame = window.cancelAnimationFrame
  // Every test gets tick-count visibility for free via this counter — the
  // v2 regression (retry loop that never actually retries) is invisible if
  // a test can only see whether a callback fired, not how many ticks it
  // took to get there.
  let rafCallCount = 0
  // The retry budget is wall-clock time now (v4), not a frame count, so
  // tests need a controllable clock. This stub advances it by a fixed
  // ~60Hz-frame amount on every simulated tick, matching how the real
  // budget would be consumed by real animation frames — no actual delay
  // occurs, so the budget-exhaustion tests below still run instantly.
  let mockNowMs = 0

  beforeEach(() => {
    rafCallCount = 0
    mockNowMs = 0
    vi.spyOn(performance, 'now').mockImplementation(() => mockNowMs)
    // Run each deferred frame synchronously — same stub pattern as
    // use-overlay-focus-return.test.ts — but still count invocations so a
    // test that needs multiple ticks (retry-until-edges-catch-up, or
    // retry-until-budget-exhausted) can assert on that, not just on the
    // eventual call/no-call outcome.
    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      rafCallCount += 1
      mockNowMs += 16
      callback(mockNowMs)
      return rafCallCount
    })
    window.cancelAnimationFrame = vi.fn()
  })

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame
    window.cancelAnimationFrame = originalCancelAnimationFrame
    vi.restoreAllMocks()
    document.body.replaceChildren()
  })

  it('does not call getExpectedVisibleEdgeCount or applyForcedNodeInternals while nodes stays empty', () => {
    const getExpectedVisibleEdgeCount = vi.fn(() => 0)
    const applyForcedNodeInternals = vi.fn()

    const { rerender } = renderHook(
      ({ nodes }: { nodes: FakeNode[] }) =>
        useUpdateNodeInternalsOnInit(
          nodes,
          getExpectedVisibleEdgeCount,
          applyForcedNodeInternals,
        ),
      { initialProps: { nodes: [] } },
    )

    rerender({ nodes: [] })
    expect(getExpectedVisibleEdgeCount).not.toHaveBeenCalled()
    expect(applyForcedNodeInternals).not.toHaveBeenCalled()
  })

  it('stops on the first tick without forcing anything when the expected visible edge count is already 0 (empty canvas must not spin)', () => {
    const getExpectedVisibleEdgeCount = vi.fn(() => 0)
    const applyForcedNodeInternals = vi.fn()
    const nodes: FakeNode[] = [{ id: 'node-1' }]

    const { rerender } = renderHook(
      ({ nodes }: { nodes: FakeNode[] }) =>
        useUpdateNodeInternalsOnInit(
          nodes,
          getExpectedVisibleEdgeCount,
          applyForcedNodeInternals,
        ),
      { initialProps: { nodes: [] as FakeNode[] } },
    )

    rerender({ nodes })

    expect(rafCallCount).toBe(1)
    expect(getExpectedVisibleEdgeCount).toHaveBeenCalledTimes(1)
    expect(applyForcedNodeInternals).not.toHaveBeenCalled()
  })

  it('stops on the first tick without forcing anything when the actual rendered edge count already matches the expected count', () => {
    mountFakeReactFlowEdge()
    mountFakeReactFlowEdge()
    const getExpectedVisibleEdgeCount = vi.fn(() => 2)
    const applyForcedNodeInternals = vi.fn()
    const nodes: FakeNode[] = [{ id: 'node-1' }]

    const { rerender } = renderHook(
      ({ nodes }: { nodes: FakeNode[] }) =>
        useUpdateNodeInternalsOnInit(
          nodes,
          getExpectedVisibleEdgeCount,
          applyForcedNodeInternals,
        ),
      { initialProps: { nodes: [] as FakeNode[] } },
    )

    rerender({ nodes })

    expect(rafCallCount).toBe(1)
    // Nothing was wrong, so nothing should have been forced — v3 forced
    // unconditionally once resolved; v4 only forces on an actual miss.
    expect(applyForcedNodeInternals).not.toHaveBeenCalled()
  })

  // v2 regression, restated for v4's judgment criterion: an early miss must
  // retry (not consume the one-shot guard), and each miss must force a
  // fresh internals pass — the poll only stops once the real target (edge
  // count) is actually met.
  it('forces on every miss until the rendered edge count catches up to the expected count, then stops (and stops forcing)', () => {
    const el1 = mountFakeReactFlowNode('node-1')
    const getExpectedVisibleEdgeCount = vi.fn(() => 2)
    const applyForcedNodeInternals = vi.fn()
    const nodes: FakeNode[] = [{ id: 'node-1' }]

    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      rafCallCount += 1
      mockNowMs += 16
      if (rafCallCount === 3) {
        // Simulate React Flow's own edge render pass finally committing to
        // the DOM a couple of frames after the node DOM already existed —
        // mirrors the real-device timing gap that motivated v3, except the
        // thing arriving late is now edges, which is what v4 actually
        // watches for.
        mountFakeReactFlowEdge()
        mountFakeReactFlowEdge()
      }
      callback(mockNowMs)
      return rafCallCount
    })

    const { rerender } = renderHook(
      ({ nodes }: { nodes: FakeNode[] }) =>
        useUpdateNodeInternalsOnInit(
          nodes,
          getExpectedVisibleEdgeCount,
          applyForcedNodeInternals,
        ),
      { initialProps: { nodes: [] as FakeNode[] } },
    )

    rerender({ nodes })

    expect(rafCallCount).toBe(3)
    // Ticks 1 and 2 missed (0 rendered edges vs. 2 expected) and each must
    // have forced; tick 3 found the match and must not force again.
    expect(applyForcedNodeInternals).toHaveBeenCalledTimes(2)
    for (const call of applyForcedNodeInternals.mock.calls) {
      const updates = call[0] as Map<string, ForceNodeInternalsUpdate>
      expect(updates.size).toBe(1)
      expect(updates.get('node-1')).toEqual({
        id: 'node-1',
        nodeElement: el1,
        force: true,
      })
    }

    // And it really is one-shot from here.
    applyForcedNodeInternals.mockClear()
    getExpectedVisibleEdgeCount.mockClear()
    rerender({ nodes: [{ id: 'node-1' }] })
    expect(getExpectedVisibleEdgeCount).not.toHaveBeenCalled()
    expect(applyForcedNodeInternals).not.toHaveBeenCalled()
  })

  it('reads getExpectedVisibleEdgeCount fresh on every tick instead of trusting a value captured when the poll started', () => {
    mountFakeReactFlowEdge()
    let calls = 0
    // First tick answers "5" (nothing can match that — only 1 real edge
    // exists), second tick answers "1" (matches). If the hook cached the
    // first read instead of calling this fresh every tick, it would keep
    // polling against a stale target of 5 and never resolve until the
    // budget ran out.
    const getExpectedVisibleEdgeCount = vi.fn(() => {
      calls += 1
      return calls === 1 ? 5 : 1
    })
    const applyForcedNodeInternals = vi.fn()
    const nodes: FakeNode[] = [{ id: 'node-1' }]

    const { rerender } = renderHook(
      ({ nodes }: { nodes: FakeNode[] }) =>
        useUpdateNodeInternalsOnInit(
          nodes,
          getExpectedVisibleEdgeCount,
          applyForcedNodeInternals,
        ),
      { initialProps: { nodes: [] as FakeNode[] } },
    )

    rerender({ nodes })

    expect(rafCallCount).toBe(2)
    expect(getExpectedVisibleEdgeCount).toHaveBeenCalledTimes(2)
  })

  it('never calls either callback again after resolving, even as the node array keeps getting a new identity (drag)', () => {
    const getExpectedVisibleEdgeCount = vi.fn(() => 0)
    const applyForcedNodeInternals = vi.fn()

    const { rerender } = renderHook(
      ({ nodes }: { nodes: FakeNode[] }) =>
        useUpdateNodeInternalsOnInit(
          nodes,
          getExpectedVisibleEdgeCount,
          applyForcedNodeInternals,
        ),
      { initialProps: { nodes: [{ id: 'node-1' }] } },
    )

    expect(rafCallCount).toBe(1)
    getExpectedVisibleEdgeCount.mockClear()
    applyForcedNodeInternals.mockClear()

    // Every drag frame hands the workbench a brand-new array reference for
    // the same logical nodes — must not retrigger a recompute.
    rerender({ nodes: [{ id: 'node-1' }] })
    rerender({ nodes: [{ id: 'node-1' }] })
    rerender({ nodes: [{ id: 'node-1' }, { id: 'node-2' }] })

    expect(getExpectedVisibleEdgeCount).not.toHaveBeenCalled()
    expect(applyForcedNodeInternals).not.toHaveBeenCalled()
  })

  it('gives up after the ~5s time budget when the edge count never catches up, forcing on every miss along the way, and never retries again afterwards', () => {
    // Deliberately never mount a single `g.react-flow__edge` — the expected
    // count can never be met.
    const el1 = mountFakeReactFlowNode('node-1')
    const getExpectedVisibleEdgeCount = vi.fn(() => 5)
    const applyForcedNodeInternals = vi.fn()
    const nodes: FakeNode[] = [{ id: 'node-1' }]

    const { rerender } = renderHook(
      ({ nodes }: { nodes: FakeNode[] }) =>
        useUpdateNodeInternalsOnInit(
          nodes,
          getExpectedVisibleEdgeCount,
          applyForcedNodeInternals,
        ),
      { initialProps: { nodes: [] as FakeNode[] } },
    )

    rerender({ nodes })

    // Bounded retry by wall-clock time (~5s budget, ~16ms simulated frames
    // => low hundreds of ticks), not a single miss-and-give-up (that was
    // the v2 bug) and not an unbounded scan loop either.
    expect(rafCallCount).toBeGreaterThan(100)
    expect(rafCallCount).toBeLessThan(1000)
    // v4 forces on every miss, not just the final attempt (unlike v3) — in
    // this scenario every single tick is a miss.
    expect(applyForcedNodeInternals).toHaveBeenCalledTimes(rafCallCount)
    const lastUpdates = applyForcedNodeInternals.mock.calls.at(-1)?.[0] as Map<
      string,
      ForceNodeInternalsUpdate
    >
    expect(lastUpdates.get('node-1')).toEqual({
      id: 'node-1',
      nodeElement: el1,
      force: true,
    })

    // The one-shot is consumed once the budget is spent — a later render
    // (new node list identity, edge count still unmet) must not start a
    // fresh retry sequence.
    const rafCallCountAfterGivingUp = rafCallCount
    getExpectedVisibleEdgeCount.mockClear()
    applyForcedNodeInternals.mockClear()
    rerender({ nodes: [{ id: 'node-1' }] })
    expect(rafCallCount).toBe(rafCallCountAfterGivingUp)
    expect(getExpectedVisibleEdgeCount).not.toHaveBeenCalled()
    expect(applyForcedNodeInternals).not.toHaveBeenCalled()
  })

  // v5 regression. Chrome freezes `requestAnimationFrame` entirely while a
  // tab is hidden, so a canvas opened in a background tab can have its first
  // frame arrive long after the wall-clock budget would already have expired.
  // On a pure wall-clock budget that first tick is also the last one — a
  // single attempt, then give up — which is precisely the "one shot at the
  // wrong moment" shape of the v2 bug. The attempt floor is what stops that.
  it('still retries a real number of times when the first frame only arrives long after the wall-clock budget expired (hidden tab)', () => {
    mountFakeReactFlowNode('node-1')
    const getExpectedVisibleEdgeCount = vi.fn(() => 4)
    const applyForcedNodeInternals = vi.fn()
    const nodes: FakeNode[] = [{ id: 'node-1' }]

    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      rafCallCount += 1
      // The tab stayed hidden for a minute: the poll was scheduled at t=0 but
      // frame 1 only runs at t=60s, already 12× past the 5s budget.
      mockNowMs += rafCallCount === 1 ? 60_000 : 16
      callback(mockNowMs)
      return rafCallCount
    })

    const { rerender } = renderHook(
      ({ nodes }: { nodes: FakeNode[] }) =>
        useUpdateNodeInternalsOnInit(
          nodes,
          getExpectedVisibleEdgeCount,
          applyForcedNodeInternals,
        ),
      { initialProps: { nodes: [] as FakeNode[] } },
    )

    rerender({ nodes })

    // Not 1. The floor is the whole point — the budget may only end the poll
    // once the loop has actually had frames to work with.
    expect(rafCallCount).toBe(30)
    expect(applyForcedNodeInternals).toHaveBeenCalledTimes(30)
  })

  it('applies whatever it found on every forced attempt if only some nodes ever land in the DOM, even after the time budget runs out', () => {
    // 'node-1' is there from the start; 'node-2' never mounts — e.g. its own
    // subtree never settles. The expected edge count can never be met
    // either (0 edges ever mounted), so this must run out the retry budget
    // — but it must still keep handing over whatever partial map it found
    // on every attempt, not silently discard the one node it did resolve.
    const el1 = mountFakeReactFlowNode('node-1')
    const getExpectedVisibleEdgeCount = vi.fn(() => 3)
    const applyForcedNodeInternals = vi.fn()
    const nodes: FakeNode[] = [{ id: 'node-1' }, { id: 'node-2' }]

    const { rerender } = renderHook(
      ({ nodes }: { nodes: FakeNode[] }) =>
        useUpdateNodeInternalsOnInit(
          nodes,
          getExpectedVisibleEdgeCount,
          applyForcedNodeInternals,
        ),
      { initialProps: { nodes: [] as FakeNode[] } },
    )

    rerender({ nodes })

    expect(rafCallCount).toBeGreaterThan(100)
    expect(applyForcedNodeInternals).toHaveBeenCalledTimes(rafCallCount)
    for (const call of applyForcedNodeInternals.mock.calls) {
      const updates = call[0] as Map<string, ForceNodeInternalsUpdate>
      expect(updates.size).toBe(1)
      expect(updates.get('node-1')).toEqual({
        id: 'node-1',
        nodeElement: el1,
        force: true,
      })
      expect(updates.has('node-2')).toBe(false)
    }
  })
})
