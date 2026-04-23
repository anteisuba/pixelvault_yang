/**
 * Defer a task until the browser is idle, to avoid competing with
 * first-paint work (image requests, RSC streaming, hydration).
 *
 * Use this for non-critical fetches triggered by component mount
 * (e.g. navbar credits badge, profile avatar, API key list) so they
 * do not saturate the HTTP/1.1 connection pool during initial load.
 *
 * Falls back to a delayed setTimeout on browsers without
 * requestIdleCallback (Safari < 18).
 */
export function deferToIdle(task: () => void, timeoutMs = 2000): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const win = window as typeof window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
    cancelIdleCallback?: (id: number) => void
  }

  if (typeof win.requestIdleCallback === 'function') {
    const id = win.requestIdleCallback(task, { timeout: timeoutMs })
    return () => {
      if (typeof win.cancelIdleCallback === 'function') {
        win.cancelIdleCallback(id)
      }
    }
  }

  // Fallback: Safari < 18 etc. Give first paint ~1s head start.
  const timeoutId = window.setTimeout(task, 1000)
  return () => window.clearTimeout(timeoutId)
}
