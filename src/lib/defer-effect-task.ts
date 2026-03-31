/**
 * Schedule follow-up work outside the effect body.
 *
 * React 19's lint rules disallow synchronously kicking off state-updating work
 * directly inside an effect callback. Deferring by one macrotask keeps the
 * effect pure while preserving the existing behavior.
 */
export function deferEffectTask(task: () => void): () => void {
  const timeoutId = window.setTimeout(task, 0)

  return () => {
    window.clearTimeout(timeoutId)
  }
}
