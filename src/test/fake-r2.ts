/**
 * 内存里的假 R2 桶（只替 `@/services/storage/r2` 这条边界，别的照真）。用法：
 *
 * ```ts
 * vi.mock('@/services/storage/r2', async (importOriginal) =>
 *   (await import('@/test/fake-r2')).fakeR2Module(await importOriginal()),
 * )
 * import { r2Bucket } from '@/test/fake-r2'
 * ```
 *
 * 读超过 `maxBytes` 抛与真实现同一句「exceeds maximum size」，读不到抛 NoSuchKey。
 */
export const r2Bucket = new Map<string, { data: Buffer; mimeType: string }>()

export const R2_PUBLIC_BASE = 'https://cdn.test'

export function fakeR2Module<T extends object>(actual: T) {
  return {
    ...actual,
    uploadToR2: async (input: {
      data: Buffer
      key: string
      mimeType: string
    }) => {
      r2Bucket.set(input.key, {
        data: Buffer.from(input.data),
        mimeType: input.mimeType,
      })
      return `${R2_PUBLIC_BASE}/${input.key}`
    },
    deleteFromR2: async (key: string) => {
      r2Bucket.delete(key)
    },
    getR2ObjectBuffer: async ({
      key,
      maxBytes,
    }: {
      key: string
      maxBytes?: number
    }) => {
      const object = r2Bucket.get(key)
      if (!object) throw new Error('NoSuchKey')
      if (maxBytes !== undefined && object.data.length > maxBytes) {
        throw new Error(
          `R2 object exceeds maximum size of ${maxBytes} bytes (declared ${object.data.length}).`,
        )
      }
      return { buffer: object.data, contentType: object.mimeType }
    },
    createPresignedR2PutUrl: async ({ key }: { key: string }) =>
      `https://r2.test/put/${encodeURIComponent(key)}`,
    /** 桶里那张（`${R2_PUBLIC_BASE}/<key>`）直接读；别的地址照真实现走。 */
    fetchAsBuffer: async (url: string, ...rest: unknown[]) => {
      if (url.startsWith(`${R2_PUBLIC_BASE}/`)) {
        const object = r2Bucket.get(url.slice(R2_PUBLIC_BASE.length + 1))
        if (!object) throw new Error(`Failed to fetch image (404): ${url}`)
        return { buffer: object.data, mimeType: object.mimeType }
      }
      const real = (
        actual as { fetchAsBuffer?: (...args: unknown[]) => unknown }
      ).fetchAsBuffer
      if (!real) throw new Error('fetchAsBuffer not available')
      return real(url, ...rest)
    },
  }
}
