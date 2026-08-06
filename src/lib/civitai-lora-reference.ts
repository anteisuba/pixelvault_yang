import { repairUtf8Mojibake } from '@/lib/text-encoding-repair'

const CIVITAI_HASH_PATTERN = /^[0-9a-fA-F]{8,64}$/

/** Cap multi-query name resolve so one mount attempt cannot fan out unboundedly. */
export const CIVITAI_LORA_NAME_SEARCH_QUERY_MAX = 4

export function normalizeOptionalCivitaiHash(
  hash: string | null | undefined,
): string | undefined {
  const trimmed = hash?.trim()
  if (!trimmed || !CIVITAI_HASH_PATTERN.test(trimmed)) return undefined
  return trimmed.toLowerCase()
}

export function toCivitaiModelSearchQuery(name: string): string {
  return repairUtf8Mojibake(name)
    .trim()
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
}

/**
 * Build ordered Civitai search queries for a local LoRA file/tag name.
 *
 * Full local stems (e.g. `illus01_style_collection_elpe_v0.22`) often miss
 * the public / meilisearch index; progressive stripping of version tokens and
 * pack prefixes recovers models whose published title is broader
 * ("Style Collection [IL]") while still starting from the most specific form.
 */
export function buildCivitaiLoraNameSearchQueries(name: string): string[] {
  const primary = toCivitaiModelSearchQuery(name)
  const queries: string[] = []
  const push = (raw: string) => {
    const q = raw.trim().replace(/\s+/g, ' ')
    if (q.length > 0 && !queries.includes(q)) queries.push(q)
  }

  push(primary)

  // Drop version-ish tokens: v0.22 / v1 / 0.22 / v1.198
  const withoutVersion = primary
    .replace(/\bv\d+(?:\.\d+)*\b/gi, ' ')
    .replace(/\b\d+\.\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  push(withoutVersion)

  const tokens = withoutVersion
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)

  // Drop leading pack/local prefixes like "illus01", "noobai01"
  const withoutLeadPack = tokens.filter(
    (token, index) =>
      !(
        index === 0 && /^(?:[a-z]{1,8}\d{1,4}|\d{1,4}[a-z]{1,8})$/i.test(token)
      ),
  )
  if (withoutLeadPack.length >= 2) {
    push(withoutLeadPack.join(' '))
  }

  // Progressive: keep the most contentful head when still long
  if (tokens.length >= 3) {
    push(tokens.slice(0, Math.max(2, tokens.length - 1)).join(' '))
  }
  if (withoutLeadPack.length >= 3) {
    push(
      withoutLeadPack
        .slice(0, Math.max(2, withoutLeadPack.length - 1))
        .join(' '),
    )
  }

  return queries.slice(0, CIVITAI_LORA_NAME_SEARCH_QUERY_MAX)
}
