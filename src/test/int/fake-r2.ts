/**
 * L2a 提交链路测试共用的 R2 假桶：只替掉真 I/O 的那几个函数（上传 / 下载 / 签名 / 查存在），
 * 其余（`generateStorageKey`、`isOwnedStorageUrl` …）照用真的。
 *
 * 用法（`vi.mock` 写在测试文件里，工厂里动态取这个模块）：
 * ```ts
 * vi.mock('@/services/storage/r2', async (importOriginal) =>
 *   (await import('@/test/int/fake-r2')).fakeR2Module(await importOriginal()),
 * )
 * import { fakeBucket } from '@/test/int/fake-r2'
 * beforeEach(() => fakeBucket.reset())
 * ```
 */
import { vi } from 'vitest'

export const FAKE_CDN = 'https://cdn.test'

interface FakeBucket {
  /** 桶里已有的对象（key → 字节）。 */
  objects: Map<string, Buffer>
  /** 能被下载的远端地址（url → 字节 + 类型）。 */
  remote: Map<string, { buffer: Buffer; mimeType: string }>
  /** 上传过哪些 key（按先后）。 */
  uploads: string[]
  /** 从网上拉进桶（含校验的那条）时的结果：默认成功。 */
  verifiedUpload: (params: {
    sourceUrl: string
    key: string
    fetchHeaders?: Record<string, string>
  }) => Promise<{ publicUrl: string; mimeType: string; sizeBytes: number }>
  reset(): void
}

const defaultVerifiedUpload: FakeBucket['verifiedUpload'] = async ({ key }) => {
  fakeBucket.objects.set(key, Buffer.from('weights'))
  fakeBucket.uploads.push(key)
  return { publicUrl: `${FAKE_CDN}/${key}`, mimeType: 'x', sizeBytes: 7 }
}

export const fakeBucket: FakeBucket = {
  objects: new Map(),
  remote: new Map(),
  uploads: [],
  verifiedUpload: defaultVerifiedUpload,
  /** 每例开头调：清空桶，并把 CDN 域名重新登记成「自己的存储」（`unstubAllEnvs` 会清掉）。 */
  reset() {
    vi.stubEnv('NEXT_PUBLIC_STORAGE_BASE_URL', FAKE_CDN)
    this.objects.clear()
    this.remote.clear()
    this.uploads.length = 0
    this.verifiedUpload = defaultVerifiedUpload
  },
}

type R2Module = typeof import('@/services/storage/r2')

export function fakeR2Module(real: R2Module): R2Module {
  vi.stubEnv('NEXT_PUBLIC_STORAGE_BASE_URL', FAKE_CDN)
  return {
    ...real,
    uploadToR2: vi.fn(async ({ data, key }: { data: Buffer; key: string }) => {
      fakeBucket.objects.set(key, data)
      fakeBucket.uploads.push(key)
      return `${FAKE_CDN}/${key}`
    }),
    uploadFromHttpToR2: vi.fn(
      async ({ sourceUrl, key }: { sourceUrl: string; key: string }) => {
        const remote = fakeBucket.remote.get(sourceUrl)
        if (!remote) throw new Error(`Failed to fetch file for upload (404)`)
        fakeBucket.objects.set(key, remote.buffer)
        fakeBucket.uploads.push(key)
        return { publicUrl: `${FAKE_CDN}/${key}`, mimeType: remote.mimeType }
      },
    ),
    fetchAsBuffer: vi.fn(async (url: string) => {
      // data URL 不出网，真函数自己就会解（照用真的）。
      if (url.startsWith('data:')) return real.fetchAsBuffer(url)
      const remote = fakeBucket.remote.get(url)
      if (remote) return remote
      // 已经在桶里的对象（刚传上去的参考图）按 CDN 地址也读得回来。
      const stored = url.startsWith(`${FAKE_CDN}/`)
        ? fakeBucket.objects.get(url.slice(FAKE_CDN.length + 1))
        : undefined
      if (stored) return { buffer: stored, mimeType: 'image/png' }
      throw new Error(`Failed to fetch ${url} (404)`)
    }),
    r2ObjectExists: vi.fn(async (key: string) => fakeBucket.objects.has(key)),
    deleteFromR2: vi.fn(async (key: string) => {
      fakeBucket.objects.delete(key)
    }),
    createPresignedR2GetUrl: vi.fn(
      async ({ key }: { key: string }) => `${FAKE_CDN}/${key}?signed`,
    ),
    uploadVerifiedHttpToR2: vi.fn((params) =>
      fakeBucket.verifiedUpload(params),
    ),
    createImagePreviewAssets: vi.fn(
      async ({ sourceStorageKey }: { sourceStorageKey: string }) => ({
        thumbnailUrl: `${FAKE_CDN}/${sourceStorageKey}.thumb.webp`,
        thumbnailStorageKey: `${sourceStorageKey}.thumb.webp`,
        previewUrl: `${FAKE_CDN}/${sourceStorageKey}.preview.webp`,
        previewStorageKey: `${sourceStorageKey}.preview.webp`,
      }),
    ),
  } as R2Module
}
