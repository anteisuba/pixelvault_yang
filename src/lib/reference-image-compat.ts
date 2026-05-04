import { z } from 'zod'

import { ReferenceAssetSchema, type ReferenceAsset } from '@/types'

const ReferenceAssetArraySchema = z.array(ReferenceAssetSchema)

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

export function normalizeReferenceImages(raw: unknown): ReferenceAsset[] {
  if (raw == null) {
    return []
  }

  if (typeof raw === 'string') {
    const parsed = ReferenceAssetArraySchema.safeParse([
      { url: raw, role: 'identity' },
    ])
    return parsed.success ? parsed.data : []
  }

  if (isStringArray(raw)) {
    const migrated = raw.map((url) => ({
      url,
      role: 'identity' as const,
    }))
    const parsed = ReferenceAssetArraySchema.safeParse(migrated)
    return parsed.success ? parsed.data : []
  }

  const parsed = ReferenceAssetArraySchema.safeParse(raw)
  return parsed.success ? parsed.data : []
}
