'use client'

import { useEffect, useRef } from 'react'

/**
 * Map-entry shape required by React Flow's **store-level**
 * `updateNodeInternals` action (`useStoreApi().getState().updateNodeInternals`)
 * — see the warning in the hook doc below for why it has to be the store
 * action and not the `useUpdateNodeInternals()` hook.
 *
 * Declared locally instead of importing `InternalNodeUpdate` from
 * `@xyflow/system` (a transitive dependency of `@xyflow/react`, not a direct
 * one in package.json). Field-for-field this is the same shape
 * (`id`/`nodeElement`/`force?`, `HTMLDivElement` matching exactly — React
 * Flow's node wrapper is always a `<div>`), so a
 * `Map<string, ForceNodeInternalsUpdate>` type-checks wherever the real
 * store action is called.
 */
export interface ForceNodeInternalsUpdate {
  id: string
  nodeElement: HTMLDivElement
  force?: boolean
}

/**
 * Retry budget for the edge-catch-up poll below, in wall-clock
 * milliseconds — NOT a frame count (see "v4"). An implementation detail of
 * this one hook, not a cross-cutting config value, so it stays local
 * instead of in `src/constants/` (`node-studio.ts` is mid-edit by a
 * parallel session as of 2026-07-27, and out of scope for this fix
 * regardless). 5s is generous headroom for React Flow's post-hydration
 * internals pass to actually land, while still giving up long before a real
 * user would read it as a hang.
 */
const MAX_EDGE_CATCH_UP_DURATION_MS = 5_000

/**
 * Floor on how many *actual* retry attempts must happen before the wall-clock
 * budget above is allowed to end the poll.
 *
 * Wall-clock alone is not a safe budget for an rAF-driven loop, because
 * `requestAnimationFrame` does not run at all while the tab is hidden —
 * Chrome freezes it completely (verified 2026-07-27: two frames scheduled in
 * a `visibilityState: 'hidden'` tab stayed unexecuted until the tab was
 * forced to paint, at which point both fired at once). If the canvas is
 * opened in a background tab and only focused a minute later, the very first
 * tick would find `now() - startedAt` already far past the budget and give
 * up after a single attempt. This floor guarantees the loop always gets a
 * real chance to retry once frames actually start flowing, whatever the wall
 * clock says.
 *
 * ~30 frames ≈ half a second of *rendered* time at 60Hz.
 */
const MIN_EDGE_CATCH_UP_ATTEMPTS = 30

/** Same guarded-`performance.now()` pattern already used in
 * `StudioGeneratingProgress.tsx` — kept local instead of extracted to a
 * shared util for the same "single-caller, hook-local detail" reason
 * `MAX_EDGE_CATCH_UP_DURATION_MS` stays local. */
function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

/**
 * React Flow bug workaround (canvas). Real-device root-caused four times —
 * history kept below because each version fixed a real, distinct layer of
 * the same symptom (edges silently not rendering on a hard refresh) and a
 * future edit that "simplifies" one of these guards back out will
 * reintroduce that version's failure mode.
 *
 * ## v1 (2026-07-27): the `nodesInitialized` deadlock
 *
 * The original version gated on `useNodesInitialized()`, then nudged the
 * id-only `useUpdateNodeInternals()` hook. On a hard refresh, real-device
 * inspection of the xyflow store found handle bounds simply never getting
 * computed, so `nodesInitialized` never flips true, so a hook gated on it
 * never fires — a closed loop. Do not reintroduce a `nodesInitialized` (or
 * anything derived from it) gate here.
 *
 * ## v2 (2026-07-27): fixed the gate, missed the timing
 *
 * v2 dropped `nodesInitialized` and instead fired once `nodes` went
 * non-empty, waiting one `requestAnimationFrame`, then reading the real DOM
 * elements and calling React Flow's **store-level** `updateNodeInternals(Map)`
 * action with `force: true` (confirmed on real device to be the right
 * mechanism — manually running it from devtools flips edges 0 → 6
 * immediately). This part remains correct and is unchanged below.
 *
 * What v2 got wrong: it assumed the DOM was already there by the frame
 * after `nodes` went non-empty. Real-device trace showed otherwise —
 * `workflow.nodes` going non-empty is a React state update; React Flow's own
 * node wrapper DOM lands one of ITS render passes later, which can still be
 * in flight when v2's single rAF fired. Result: the DOM scan found 0
 * elements, the Map was empty, nothing was applied — and because
 * `hasRunRef.current = true` was set unconditionally at the top of that one
 * callback, the one-shot guard was already consumed on that empty scan.
 * `nodesInitialized` never rescued it (see v1), so the hook simply never
 * tried again. v2's own test suite was 100% green because it asserted this
 * exact failure as the expected behavior — a reminder that this hook cannot
 * be judged green by its unit tests; only a real hard refresh can.
 *
 * ## v3 (2026-07-27): poll for DOM catch-up, don't assume one frame is enough
 *
 * Same trigger (`nodes` non-empty) and same fix mechanism (store-level
 * `updateNodeInternals(Map)` with real elements + `force: true`), but now
 * the one-shot guard was only consumed once the DOM scan accounted for
 * every node in `nodes` (`updates.size === nodes.length`) — or once a
 * frame-count budget was spent trying. An empty or partial scan rescheduled
 * another tick and returned *without* touching `hasRunRef`, so the guard
 * could never be burned on a miss.
 *
 * What v3 got wrong: real-device trace still showed 0 edges after this
 * shipped. Store inspection at the failure point: `edgeCount` 6 (edges were
 * always in the store — never a data problem), `hiddenEdges` 0 (none
 * deliberately hidden), `nodeCount` 10, `measured` 10/10 (every node's size
 * WAS known) — but `internals` `{}`, `handleBounds` `undefined`, and yet
 * `document.querySelectorAll('.react-flow__node[data-id]')` already found
 * every node element (all 19 real `<handle>`s were in the DOM too). v3's
 * success signal — "every node's DOM wrapper exists" — was already true,
 * or had already been true for a while, without edges ever rendering: it
 * was polling a PROXY for a question it never actually asked ("have the
 * edges rendered?"). Manually pulling the same
 * `{ id, nodeElement, force: true }` Map from devtools and calling
 * `store.getState().updateNodeInternals(map)` at that exact point flipped
 * edges 0 → 6 immediately — so the fix mechanism was always right; only the
 * stopping condition was wrong.
 *
 * ⚠ An earlier revision of this comment claimed clicking "fit view" also
 * fixed it. It does not — measured 2026-07-27 with the canvas in the broken
 * state: clicking 适应画布 left the edge count at 0. `fitView` only changes
 * the viewport transform; it never re-measures the DOM, so it cannot
 * populate `handleBounds`. Only `updateNodeInternals` can.
 *
 * ## v4 (2026-07-27): judge the target itself (edge count), not a proxy
 *
 * Keeps v3's mechanism (store-level `updateNodeInternals(Map)` with real
 * elements + `force: true`) and its retry skeleton (a miss reschedules
 * without burning the one-shot guard; resolving — success OR budget
 * exhausted — consumes it exactly once, so a later `nodes` identity change,
 * e.g. a node drag, never restarts the poll). What changes is the
 * definition of "resolved": every tick now compares the *expected visible
 * edge count* against the *actual rendered edge count*
 * (`document.querySelectorAll('g.react-flow__edge').length`) — the thing
 * this hook actually exists to fix, not `handleBounds`, not
 * `nodesInitialized`, not a DOM node count.
 *
 * `getExpectedVisibleEdgeCount` is a caller-supplied accessor, called fresh
 * on *every* tick rather than a value captured once when the poll started —
 * edge visibility (`edge.hidden`) can change for reasons that have nothing
 * to do with `nodes` (selection, fold state, …), so a stale snapshot could
 * end up comparing against a target that already moved on. Keeping it as a
 * small accessor (instead of, say, this hook reaching into
 * `@xyflow/react`'s `useStoreApi()` itself) also keeps the hook decoupled
 * from the store's shape and trivially testable with a plain `vi.fn()` — no
 * `ReactFlowProvider` needed in the test file.
 *
 * An expected count of 0 (empty canvas, or every edge legitimately hidden)
 * stops immediately without ever forcing anything — there is nothing to
 * catch up to, so nothing should spin.
 *
 * Unlike v3 — which only ever called `applyForcedNodeInternals` once, right
 * when the poll resolved — v4 forces on *every* miss, not just the last
 * one: the real-device trace above shows a fully-populated Map is not
 * always enough on the first attempt, so this keeps nudging every tick
 * until the edge count actually catches up or the budget runs out.
 *
 * The retry budget is wall-clock time (`MAX_EDGE_CATCH_UP_DURATION_MS`), not
 * a frame count, so it behaves the same regardless of the display's refresh
 * rate — a suggestion this rewrite adopts on top of the v3 postmortem.
 *
 * ⚠ `node.internals.handleBounds` was observed *still empty* on real device
 * right after edges rendered correctly — whatever unblocks edge rendering
 * isn't 1:1 with `handleBounds` getting populated. Don't assert
 * `handleBounds` non-empty as a success signal, here or in a test — it
 * produces a false failure. **The only real judge is whether edges render
 * on an actual hard refresh; this hook's unit tests can prove the retry
 * mechanics work, never that the bug is fixed.**
 *
 * ## v5 (2026-07-27): v4 was already correct — the *test environment* wasn't
 *
 * v4 was declared broken on real device ("hard refresh, 10 nodes, 0 edges,
 * still 0 after 45s"). That verdict was wrong, and so was the instinct to
 * rewrite the logic a fifth time. Instrumenting the loop itself (temporary
 * `window.__edgeFixTrace`, since removed) showed the effect running, the
 * poll being scheduled — and **`tick` never executing once**. Cause:
 * `document.visibilityState === 'hidden'`. The verification tab was driven
 * over CDP and was never the foreground tab, and Chrome freezes
 * `requestAnimationFrame` outright in hidden tabs. Forcing a paint (a CDP
 * screenshot) unfroze it; a single tick then ran — `expected: 6, actual: 0`
 * — forced, and `handleBounds` went 0/10 → 10/10 with edges 0 → 6. Since
 * nothing but `updateNodeInternals` writes `handleBounds`, that force is
 * provably what fixed it: v4's mechanism *and* its stopping condition both
 * work, first try.
 *
 * **Rule this leaves behind: never judge an rAF/timer-driven fix from a
 * background tab.** Check `document.visibilityState` before trusting any
 * "it didn't fire" observation. The same blind spot invalidates the v2/v3
 * postmortems above wherever they rest on "shipped it and real device still
 * showed 0 edges" — their *reasoning* about proxies-vs-goals still stands on
 * its own merits, but their real-device evidence does not.
 *
 * The only behavioural change in v5 is `MIN_EDGE_CATCH_UP_ATTEMPTS` (see its
 * doc): a hidden tab that gets focused late would otherwise blow the entire
 * wall-clock budget before the first frame ever ran, leaving exactly one
 * attempt.
 *
 * MUST stay one-shot once it actually resolves (success or exhausted
 * budget): re-running on every render (e.g. during a node drag, where the
 * node array gets a new identity every frame) would force a continuous
 * recompute instead of a single startup nudge.
 */
export function useUpdateNodeInternalsOnInit<NodeType extends { id: string }>(
  nodes: readonly NodeType[],
  /**
   * Live read of "how many edges should currently be visible" — e.g.
   * `() => storeApi.getState().edges.filter((e) => !e.hidden).length`.
   * Called fresh every tick; must not be a value memoized from render time.
   */
  getExpectedVisibleEdgeCount: () => number,
  applyForcedNodeInternals: (
    updates: Map<string, ForceNodeInternalsUpdate>,
  ) => void,
): void {
  const hasRunRef = useRef(false)

  useEffect(() => {
    if (hasRunRef.current || nodes.length === 0) return

    let cancelled = false
    let frameId = 0
    let attempts = 0
    const startedAt = now()

    const finish = () => {
      hasRunRef.current = true
    }

    const tick = () => {
      if (cancelled) return

      // The target itself, read live (see the v4 doc above for why this
      // can't be a value closed over when the poll started).
      const expectedVisibleEdgeCount = getExpectedVisibleEdgeCount()

      // Nothing should be visible — there's no catch-up to wait for.
      // Stopping here, before ever touching the DOM or forcing anything, is
      // what keeps an edge-free canvas from spinning.
      if (expectedVisibleEdgeCount === 0) {
        finish()
        return
      }

      const actualRenderedEdgeCount =
        document.querySelectorAll('g.react-flow__edge').length

      // THE success signal — see the v4 doc above for why this, and only
      // this, is trustworthy. Not `handleBounds`, not `nodesInitialized`,
      // not a DOM *node* count (that was v3's mistake).
      if (actualRenderedEdgeCount === expectedVisibleEdgeCount) {
        finish()
        return
      }

      // Miss — force a fresh internals pass on every node element currently
      // findable in the DOM. Unconditional on every miss, not just the
      // final attempt (unlike v3): a single force call was not reliably
      // enough on the device that motivated this rewrite.
      const elementById = new Map<string, HTMLDivElement>()
      document
        .querySelectorAll<HTMLDivElement>('.react-flow__node[data-id]')
        .forEach((element) => {
          const id = element.getAttribute('data-id')
          if (id) elementById.set(id, element)
        })

      const updates = new Map<string, ForceNodeInternalsUpdate>()
      for (const node of nodes) {
        const nodeElement = elementById.get(node.id)
        if (nodeElement) {
          updates.set(node.id, { id: node.id, nodeElement, force: true })
        }
      }
      if (updates.size > 0) {
        applyForcedNodeInternals(updates)
      }
      attempts += 1

      if (
        attempts >= MIN_EDGE_CATCH_UP_ATTEMPTS &&
        now() - startedAt >= MAX_EDGE_CATCH_UP_DURATION_MS
      ) {
        // Budget exhausted. The force above was the last attempt — stop
        // cleanly instead of polling forever. Guard is consumed here too:
        // burning it only on a *miss that also blew the budget* (not on
        // every miss) is what keeps this from reintroducing the v2 bug.
        finish()
        return
      }

      // Guard deliberately NOT touched here — an ordinary miss with budget
      // remaining must retry, not consume the one-shot (the v2 bug).
      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)

    return () => {
      cancelled = true
      window.cancelAnimationFrame(frameId)
    }
  }, [nodes, getExpectedVisibleEdgeCount, applyForcedNodeInternals])
}
