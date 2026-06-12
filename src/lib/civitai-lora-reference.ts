import { repairUtf8Mojibake } from '@/lib/text-encoding-repair'

const CIVITAI_HASH_PATTERN = /^[0-9a-fA-F]{8,64}$/

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
