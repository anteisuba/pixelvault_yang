import type { AdvancedParams, ActiveLora } from '@/types'

const FAL_LORA_CAP = 5

/**
 * Merge ActiveLoraStack entries into the request's advancedParams.loras,
 * preserving anything the user manually added via the Advanced drawer.
 *
 * Rules:
 *   - Stack LoRAs come first (they represent the active session style).
 *   - Form LoRAs (already on advancedParams.loras) are appended.
 *   - De-duplicated by URL (stack wins on conflict — its scale is the
 *     intent the user expressed most recently via `?style=` / picker).
 *   - Capped at 5 entries to satisfy FAL flux-lora's hard limit.
 *
 * Returns the original advancedParams reference unchanged when the
 * stack is empty (zero work for the no-LoRA path, which is the
 * common case).
 */
export function mergeStackLoras(
  advancedParams: AdvancedParams | undefined,
  stack: ActiveLora[],
  resolveUrl: (assetId: string) => string | undefined,
): AdvancedParams | undefined {
  if (stack.length === 0) return advancedParams

  const stackLoras: { url: string; scale?: number }[] = []
  for (const entry of stack) {
    const url = resolveUrl(entry.assetId)
    if (!url) continue // asset evicted from local cache; skip silently
    stackLoras.push({ url, scale: entry.scale })
  }

  if (stackLoras.length === 0) return advancedParams

  const formLoras = advancedParams?.loras ?? []
  const seen = new Set(stackLoras.map((l) => l.url))
  const merged = [
    ...stackLoras,
    ...formLoras.filter((l) => !seen.has(l.url)),
  ].slice(0, FAL_LORA_CAP)

  return { ...(advancedParams ?? {}), loras: merged }
}
