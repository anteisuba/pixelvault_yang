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
 * Retry budget for the DOM-catch-up poll below — an implementation detail of
 * this one hook, not a cross-cutting config value, so it stays local instead
 * of in `src/constants/` (`node-studio.ts` is mid-edit by a parallel session
 * as of 2026-07-27, and out of scope for this fix regardless). ~90
 * `requestAnimationFrame` ticks is generous headroom (≈1.5s at 60Hz, more at
 * lower refresh rates) for React Flow's post-hydration extra render pass to
 * actually commit node DOM — see "v3" below for why this exists at all.
 */
const MAX_DOM_CATCH_UP_ATTEMPTS = 90

/**
 * React Flow bug workaround (canvas). Real-device root-caused twice —
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
 * the one-shot guard is only consumed once the DOM scan actually accounts
 * for every node in `nodes` (`updates.size === nodes.length`) — or once
 * `MAX_DOM_CATCH_UP_ATTEMPTS` rAF ticks have been spent trying. An empty or
 * partial scan reschedules another tick and returns *without* touching
 * `hasRunRef`, so the guard can never be burned on a miss.
 *
 * This must still go through the store action directly — not the
 * `useUpdateNodeInternals()` hook, which only takes a node id and asks
 * React Flow to look the element up itself; that internal lookup is exactly
 * what never resolves in the v1 deadlocked state.
 *
 * ⚠ `node.internals.handleBounds` was observed *still empty* on real device
 * right after edges rendered correctly — whatever unblocks edge rendering
 * isn't 1:1 with `handleBounds` getting populated. Don't assert
 * `handleBounds` non-empty as a success signal, here or in a test — it
 * produces a false failure. **The only real judge is whether edges render
 * on an actual hard refresh; this hook's unit tests can prove the retry
 * mechanics work, never that the bug is fixed.**
 *
 * MUST stay one-shot once it actually resolves (success or exhausted
 * budget): re-running on every render (e.g. during a node drag, where the
 * node array gets a new identity every frame) would force a continuous
 * recompute instead of a single startup nudge.
 */
export function useUpdateNodeInternalsOnInit<NodeType extends { id: string }>(
  nodes: readonly NodeType[],
  applyForcedNodeInternals: (
    updates: Map<string, ForceNodeInternalsUpdate>,
  ) => void,
): void {
  const hasRunRef = useRef(false)

  useEffect(() => {
    if (hasRunRef.current || nodes.length === 0) return

    let cancelled = false
    let frameId = 0
    let attempt = 0

    const tick = () => {
      if (cancelled) return
      attempt += 1

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

      const caughtUp = updates.size === nodes.length
      if (!caughtUp && attempt < MAX_DOM_CATCH_UP_ATTEMPTS) {
        // Miss — the DOM hasn't caught up with `nodes` yet. Try again next
        // frame WITHOUT touching `hasRunRef`: burning the one-shot guard on
        // an empty/partial scan is exactly the v2 bug.
        frameId = window.requestAnimationFrame(tick)
        return
      }

      // Either every node resolved, or the retry budget is spent. Either
      // way this IS the one shot now: consume the guard so a later
      // nodes-identity change (e.g. a node drag) never restarts the poll.
      hasRunRef.current = true
      if (updates.size > 0) {
        applyForcedNodeInternals(updates)
      }
    }

    frameId = window.requestAnimationFrame(tick)

    return () => {
      cancelled = true
      window.cancelAnimationFrame(frameId)
    }
  }, [nodes, applyForcedNodeInternals])
}
