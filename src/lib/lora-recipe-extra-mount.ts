import {
  LoraSchema,
  type CivitaiRecipeExtraLora,
  type LoraAssetRecord,
} from '@/types'
import { repairUtf8Mojibake } from '@/lib/text-encoding-repair'

export type ExtraMountStatus = 'loading' | 'mounted' | 'failed'

export interface RecipeExtraMountResult {
  newlyMounted: number
  missing: number
}

interface RecipeExtraStackEntry {
  asset: LoraAssetRecord
}

interface ResolveRecipeExtraLoraParams {
  hash?: string
  modelVersionId?: number
  name?: string
  baseModelFamily?: string
}

interface ResolveRecipeExtraLoraResponse {
  success: boolean
  data?: LoraAssetRecord
}

interface MountRecipeExtraLorasOptions {
  extras: readonly CivitaiRecipeExtraLora[]
  stackItems: readonly RecipeExtraStackEntry[]
  maxStack: number
  baseModelFamily?: string | null
  resolveLora: (
    params: ResolveRecipeExtraLoraParams,
  ) => Promise<ResolveRecipeExtraLoraResponse>
  pushLora: (asset: LoraAssetRecord, scale?: number) => void
  setLoraScale: (assetId: string, scale: number) => void
  setStatus?: (key: string, status: ExtraMountStatus) => void
}

function normalizedExtraName(
  extra: CivitaiRecipeExtraLora,
): string | undefined {
  const trimmed = extra.name?.trim()
  const repaired = trimmed ? repairUtf8Mojibake(trimmed).trim() : undefined
  return repaired || undefined
}

export function extraLoraKey(extra: CivitaiRecipeExtraLora): string {
  return (
    extra.hash?.toLowerCase() ??
    (extra.modelVersionId !== undefined ? `v${extra.modelVersionId}` : null) ??
    `n:${normalizedExtraName(extra)?.toLowerCase() ?? 'unknown'}`
  )
}

export function extraLoraLabel(extra: CivitaiRecipeExtraLora): string {
  return (
    normalizedExtraName(extra) ??
    (extra.modelVersionId !== undefined
      ? `#${extra.modelVersionId}`
      : (extra.hash?.slice(0, 12) ?? 'LoRA'))
  )
}

export function isRecipeExtraResolvable(
  extra: CivitaiRecipeExtraLora,
): boolean {
  return (
    extra.hash !== undefined ||
    extra.modelVersionId !== undefined ||
    normalizedExtraName(extra) !== undefined
  )
}

function resolveExtraScale(extra: CivitaiRecipeExtraLora): number | undefined {
  return LoraSchema.shape.scale.safeParse(extra.weight).success
    ? extra.weight
    : undefined
}

function findMountedExtra(
  extra: CivitaiRecipeExtraLora,
  stackItems: readonly RecipeExtraStackEntry[],
): LoraAssetRecord | null {
  const hash = extra.hash?.toLowerCase()
  const name = normalizedExtraName(extra)?.toLowerCase()

  for (const entry of stackItems) {
    const asset = entry.asset
    if (hash && asset.fileHashAutoV3?.toLowerCase() === hash) return asset
    if (
      extra.modelVersionId !== undefined &&
      asset.modelVersionId === extra.modelVersionId
    ) {
      return asset
    }
    if (name && asset.name.trim().toLowerCase() === name) return asset
  }

  return null
}

export async function mountRecipeExtraLoras({
  extras,
  stackItems,
  maxStack,
  baseModelFamily,
  resolveLora,
  pushLora,
  setLoraScale,
  setStatus,
}: MountRecipeExtraLorasOptions): Promise<RecipeExtraMountResult> {
  let newlyMounted = 0
  let missing = 0
  const projectedIds = new Set(stackItems.map((entry) => entry.asset.id))
  let projectedCount = stackItems.length
  const seenKeys = new Set<string>()

  for (const extra of extras) {
    const key = extraLoraKey(extra)
    if (seenKeys.has(key)) continue
    seenKeys.add(key)

    if (!isRecipeExtraResolvable(extra)) {
      setStatus?.(key, 'failed')
      missing += 1
      continue
    }

    const scale = resolveExtraScale(extra)
    const mounted = findMountedExtra(extra, stackItems)
    if (mounted) {
      if (scale !== undefined) setLoraScale(mounted.id, scale)
      projectedIds.add(mounted.id)
      setStatus?.(key, 'mounted')
      continue
    }

    setStatus?.(key, 'loading')
    const result = await resolveLora({
      hash: extra.hash,
      modelVersionId: extra.modelVersionId,
      name: normalizedExtraName(extra),
      baseModelFamily: baseModelFamily?.trim() || undefined,
    })

    if (!result.success || !result.data) {
      setStatus?.(key, 'failed')
      missing += 1
      continue
    }

    const item = result.data
    if (projectedIds.has(item.id)) {
      if (scale !== undefined) setLoraScale(item.id, scale)
      setStatus?.(key, 'mounted')
      continue
    }

    if (projectedCount >= maxStack) {
      setStatus?.(key, 'failed')
      missing += 1
      continue
    }

    pushLora(item, scale)
    projectedIds.add(item.id)
    projectedCount += 1
    newlyMounted += 1
    setStatus?.(key, 'mounted')
  }

  return { newlyMounted, missing }
}
