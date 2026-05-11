import 'server-only'

import { revalidateTag, unstable_cache } from 'next/cache'

export const CACHE_TAGS = {
  modelsAvailable: 'models:available',
  galleryPublic: 'gallery:public',
} as const

const IS_TEST = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true'

/**
 * Wrap a function with `unstable_cache`, but pass through unmodified in test
 * environments where Next.js's incremental cache context is not initialized.
 * Same signature as `unstable_cache`.
 */
export function cacheableFn<TArgs extends readonly unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  keyParts: string[],
  options: { tags: string[]; revalidate: number },
): (...args: TArgs) => Promise<TResult> {
  if (IS_TEST) return fn
  return unstable_cache(fn, keyParts, options)
}

export function invalidateModelsCache(): void {
  if (IS_TEST) return
  revalidateTag(CACHE_TAGS.modelsAvailable, 'minutes')
}

export function invalidatePublicGalleryCache(): void {
  if (IS_TEST) return
  revalidateTag(CACHE_TAGS.galleryPublic, 'seconds')
}
