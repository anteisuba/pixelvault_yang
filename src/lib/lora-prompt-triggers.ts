/**
 * B10 (D7④/§2②): append any mounted-LoRA trigger words missing from the prompt.
 * When a single-source recipe is applied on a multi-mount stack, the recipe's
 * prompt only carries its own LoRA's trigger — the other mounts' activation
 * words would be dropped. Case-insensitive substring check (conservative: never
 * double-appends), comma-joined, order-preserving, deduped.
 *
 * Pure/no-React so it can be unit-tested without pulling the workbench (and its
 * next/navigation deps) into the test module.
 */
export function appendMissingTriggers(
  prompt: string,
  triggerWords: readonly string[],
): { prompt: string; appendedTriggers: string[] } {
  const haystack = prompt.toLowerCase()
  const seen = new Set<string>()
  const toAppend: string[] = []
  for (const raw of triggerWords) {
    const trigger = raw.trim()
    if (!trigger) continue
    const key = trigger.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (haystack.includes(key)) continue
    toAppend.push(trigger)
  }
  if (toAppend.length === 0) return { prompt, appendedTriggers: [] }
  const separator = prompt.trim().length > 0 ? ', ' : ''
  return {
    prompt: `${prompt}${separator}${toAppend.join(', ')}`,
    appendedTriggers: toAppend,
  }
}
