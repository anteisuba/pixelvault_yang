/**
 * R3-6a §1 共享 payload 装配（canvas-relationship-v3-2026-07 §7 R3-6 / v4 §14.3）:
 * the "collect candidate reference-image URLs → dedupe (first-seen wins) →
 * truncate to the model's cap" step used to live inline, TWICE, inside
 * `StudioNodeWorkbench`'s two generation handlers — `handleGenerateCharacterImage`
 * (a character card's own referenceAssets) and `handleGenerateMediaNode` (a
 * shot/video node's full graph harvest). Divergent inline copies is exactly the
 * "will drift" risk v4 §14.3 called out before any R3-6 出场组 work could safely
 * land on top. This is the single source of truth both call sites now use.
 *
 * R3-6b §1 容量透明: the result is now a `{imageUrls, overflow}` pair instead of
 * a bare array — `overflow` names every deduped URL the cap cut, in payload
 * order, so a caller can render "N/9 ⚠" + per-entry "不会发送" honestly instead
 * of re-deriving truncation with its own (weaker) arithmetic. `overflow` stays
 * URL-only (no human label) — resolving a source name is the caller's job
 * (it already owns whatever name/legend map produced the candidate list),
 * keeping this pure dedup+cap step ignorant of naming concerns.
 */
export interface ReferenceImageOverflowEntry {
  url: string
}

export interface AssembleReferenceImagePayloadResult {
  /** Final deduped + capped payload — what actually ships as image_urls. */
  imageUrls: string[]
  /** Deduped candidates that did NOT make the cut, in payload order (i.e.
   *  what would have landed at position max+1, max+2, …). Empty when nothing
   *  overflowed. `imageUrls` + `overflow` together partition every deduped
   *  candidate exactly once, even for a degenerate (zero/negative) cap. */
  overflow: ReferenceImageOverflowEntry[]
}

export function assembleReferenceImagePayload(
  sources: readonly (string | undefined)[],
  maxReferenceImages: number,
): AssembleReferenceImagePayloadResult {
  const seen = new Set<string>()
  const deduped: string[] = []

  for (const url of sources) {
    if (!url) continue
    if (seen.has(url)) continue
    seen.add(url)
    deduped.push(url)
  }

  // A negative/zero cap degrades the same way `Array.prototype.slice` already
  // does, matching both call sites' prior behavior byte-for-byte — imageUrls
  // may then be shorter than `deduped.length - overflow.length` would suggest
  // for a negative cap, which is why overflow is sliced off the RESOLVED
  // imageUrls length (not off `maxReferenceImages` directly): the two arrays
  // always partition `deduped` with zero overlap and zero gap, regardless of
  // how odd the cap input is.
  const imageUrls = deduped.slice(0, maxReferenceImages)
  const overflow = deduped
    .slice(imageUrls.length)
    .map((url): ReferenceImageOverflowEntry => ({ url }))

  return { imageUrls, overflow }
}
