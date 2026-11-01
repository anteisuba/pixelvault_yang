/**
 * Extract the «activation segment» for a specific LoRA from a Stable
 * Diffusion prompt the way SD WebUI authors actually write them.
 *
 * Real-world example (the wuthering-waves Denia LoRA — see
 * `/api/v1/images?modelId=2649729`):
 *
 *   official style,anime coloring,...,
 *   maiden,slim figure,medium breasts,<lora:detailed-hand:0.8>,
 *   <lora:DeniaV1-Nuclear1811-IL:0.9>,purple eyes,pink pupils,pink hair,
 *   multicolored hair,...,c1,white hair ribbon,...,2d style,
 *   full body,on stomach,legs up,...
 *
 * The tokens that actually activate `DeniaV1-Nuclear1811-IL` are the
 * ones immediately following its `<lora:...>` tag, up until either the
 * next `<lora:` tag or a hard newline (authors use `\n` to group
 * unrelated prompt sections — composition vs character tokens).
 *
 * Used by `mineCivitaiUserPrompts` to reverse-engineer real activation
 * prompts from the 34 % of Civitai LoRAs that ship neither trainedWords
 * nor description code blocks.
 */

import { cleanRecommendedPrompt } from './lora-trigger-clean'

/**
 * Find the activation segment immediately following `<lora:loraName:WEIGHT>`
 * in `prompt`. Returns `null` if the LoRA is not referenced.
 *
 * Matching of `loraName` is case-insensitive (Civitai WebUI normalises
 * file casing in metadata).
 */
export function extractActivationSegment(
  prompt: string,
  loraName: string,
): string | null {
  if (!prompt || !loraName) return null

  // Build a tolerant regex: `<lora:NAME:WEIGHT>` with anything between
  // colon and `>`. Escape regex specials in the name.
  const escaped = loraName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const startRe = new RegExp(`<lora:${escaped}:[^>]*>`, 'i')
  const startMatch = startRe.exec(prompt)
  if (!startMatch) return null

  const sliceStart = startMatch.index + startMatch[0].length

  // Find the nearest delimiter ahead: next `<lora:` tag (any name) OR
  // a `\n` newline. SD prompts use newlines as soft section breaks —
  // authors put the LoRA's character tokens together and composition /
  // pose tokens on a separate line.
  const remainder = prompt.slice(sliceStart)
  const nextLoraIdx = remainder.search(/<lora:/i)
  const nextNlIdx = remainder.indexOf('\n')
  const candidates = [nextLoraIdx, nextNlIdx].filter((i) => i !== -1)
  const sliceEnd =
    candidates.length > 0 ? sliceStart + Math.min(...candidates) : prompt.length

  // cleanRecommendedPrompt normalises commas / whitespace / strips any
  // stray escape sequences. Leading comma is common ("..>,purple eyes,..").
  const raw = prompt.slice(sliceStart, sliceEnd).replace(/^[,\s]+|[,\s]+$/g, '')
  const cleaned = cleanRecommendedPrompt(raw)
  return cleaned || null
}

/**
 * Internal helper: pick a stable cluster key from the first few tokens
 * of an activation segment. Two slightly different segments that share
 * the same first ~3 tokens almost always belong to the same outfit /
 * variant (authors copy/paste then tweak the tail).
 */
function clusterKey(prompt: string): string {
  return prompt
    .split(',')
    .slice(0, 3)
    .map((t) => t.trim().toLowerCase())
    .join('|')
}

export interface SummarisedSegment {
  /** Representative full prompt for this outfit cluster (longest seen). */
  prompt: string
  /** How many input segments collapsed into this cluster. */
  sampleCount: number
}

/**
 * Collapse a list of activation segments (one per generation image)
 * into deduplicated outfit clusters, sorted by popularity (sampleCount
 * desc).
 *
 * Cluster key: first 3 comma-separated tokens. Within a cluster, the
 * longest segment wins — gives users the richest prompt to copy.
 */
export function summariseActivationSegments(
  segments: readonly string[],
): SummarisedSegment[] {
  const clusters = new Map<string, { prompt: string; sampleCount: number }>()
  for (const seg of segments) {
    const cleaned = seg.trim()
    if (!cleaned) continue
    const key = clusterKey(cleaned)
    if (!key) continue
    const existing = clusters.get(key)
    if (!existing) {
      clusters.set(key, { prompt: cleaned, sampleCount: 1 })
    } else {
      existing.sampleCount += 1
      // Keep the longer segment as the cluster representative — authors
      // sometimes truncate tail tokens; the longest variant gives the
      // user the richest starting prompt to copy.
      if (cleaned.length > existing.prompt.length) existing.prompt = cleaned
    }
  }
  return Array.from(clusters.values()).sort(
    (a, b) =>
      b.sampleCount - a.sampleCount || b.prompt.length - a.prompt.length,
  )
}
