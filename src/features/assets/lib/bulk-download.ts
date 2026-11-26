import { API_ENDPOINTS } from '@/constants/config'
import { apiFetch } from '@/lib/api-client/api-fetch'
import { downloadRemoteAsset } from '@/lib/api-client/shared'
import { triggerDirectAssetDownload } from '@/lib/asset-links'
import {
  isIosDevice,
  photoMimeForFileName,
  saveFilesToPhotos,
  toPhotoFile,
} from '@/lib/save-to-photos'
import { fileExtensionForMime } from '@/lib/svg-image'
import type { GenerationRecord } from '@/types'

const BATCH_FETCH_CONCURRENCY = 4
const OBJECT_URL_REVOKE_DELAY_MS = 10_000

export interface AssetDownloadDescriptor {
  url: string
  fileName: string
}

export interface BulkDownloadResult {
  kind: 'empty' | 'single' | 'photos' | 'zip' | 'failed'
  downloaded: number
  failed: number
}

export function getAssetDownloadDescriptor(
  generation: GenerationRecord,
): AssetDownloadDescriptor {
  if (generation.outputType === 'MODEL_3D' && generation.modelUrl) {
    return {
      url: generation.modelUrl,
      fileName: `antei-${generation.id.slice(0, 8)}.glb`,
    }
  }
  const ext = fileExtensionForMime(generation.mimeType)
  return {
    url: generation.url,
    fileName: `antei-${generation.id.slice(0, 8)}.${ext}`,
  }
}

/** 保证同一个 ZIP 包里没有重名文件（如 id 前缀偶发冲突时补 `-2`）。 */
function deduplicateFileName(fileName: string, used: Set<string>): string {
  if (!used.has(fileName)) {
    used.add(fileName)
    return fileName
  }
  const dotIndex = fileName.lastIndexOf('.')
  const stem = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName
  const ext = dotIndex > 0 ? fileName.slice(dotIndex) : ''
  let suffix = 2
  while (used.has(`${stem}-${suffix}${ext}`)) suffix += 1
  const candidate = `${stem}-${suffix}${ext}`
  used.add(candidate)
  return candidate
}

function buildArchiveFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  return `antei-assets-${stamp}.zip`
}

function triggerZipDownload(blob: Blob, fileName: string) {
  const blobUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.setTimeout(
    () => URL.revokeObjectURL(blobUrl),
    OBJECT_URL_REVOKE_DELAY_MS,
  )
}

/**
 * 拉单个素材的二进制：先直连自家 R2 CDN（带 `pv-cors=1` 绕开 `<img>` 无头缓存，不占
 * 服务端带宽也不消耗 `/api/download` 限流），失败再退回 `/api/download` 代理或预签名链接。
 */
async function fetchAssetBlob(
  url: string,
  fileName: string,
): Promise<Blob | null> {
  try {
    const corsUrl = new URL(url)
    corsUrl.searchParams.set('pv-cors', '1')
    const direct = await fetch(corsUrl.toString(), {
      mode: 'cors',
      credentials: 'omit',
    })
    if (direct.ok) return await direct.blob()
  } catch {
    // 跨域不允许或外链临时地址：退回鉴权下载端点。
  }

  try {
    const response = await apiFetch(
      `${API_ENDPOINTS.DOWNLOAD}?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(fileName)}`,
    )
    if (!response.ok) return null

    if (
      response.headers.get('content-type')?.includes('application/json') ===
      true
    ) {
      const envelope = (await response.json()) as {
        data?: { downloadUrl?: string }
      }
      const signedUrl = envelope.data?.downloadUrl
      if (!signedUrl) return null
      const signedResponse = await fetch(signedUrl, {
        mode: 'cors',
        credentials: 'omit',
      })
      return signedResponse.ok ? await signedResponse.blob() : null
    }

    return await response.blob()
  } catch {
    return null
  }
}

/**
 * 批量下载素材：
 * - 选中 1 项：直接走现有单文件下载（iPhone 自动弹系统相册保存、桌面直接落原文件）。
 * - 选中多项：限并发拉取字节；iPhone/iPad 且全是图片/视频时优先用系统分享面板一次存入相册，
 *   其余平台或含音频/3D 时打包成无损 STORE 压缩的 `.zip` 一次下载（不触发浏览器多文件拦截）。
 */
export async function downloadAssetBatch(
  generations: readonly GenerationRecord[],
  options?: {
    onProgress?: (done: number, total: number) => void
  },
): Promise<BulkDownloadResult> {
  const total = generations.length
  if (total === 0) return { kind: 'empty', downloaded: 0, failed: 0 }

  if (total === 1) {
    const { url, fileName } = getAssetDownloadDescriptor(generations[0])
    options?.onProgress?.(0, 1)
    const response = await downloadRemoteAsset(url, fileName)
    if (!response.success) {
      triggerDirectAssetDownload(url, fileName)
    }
    options?.onProgress?.(1, 1)
    return { kind: 'single', downloaded: 1, failed: 0 }
  }

  const usedNames = new Set<string>()
  const descriptors = generations.map((generation) => {
    const raw = getAssetDownloadDescriptor(generation)
    return {
      url: raw.url,
      fileName: deduplicateFileName(raw.fileName, usedNames),
    }
  })

  options?.onProgress?.(0, total)
  const results: Array<{ fileName: string; blob: Blob } | null> = new Array(
    total,
  ).fill(null)
  let nextIndex = 0
  let completed = 0

  const worker = async () => {
    while (nextIndex < total) {
      const current = nextIndex
      nextIndex += 1
      const item = descriptors[current]
      const blob = await fetchAssetBlob(item.url, item.fileName)
      if (blob) results[current] = { fileName: item.fileName, blob }
      completed += 1
      options?.onProgress?.(completed, total)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(BATCH_FETCH_CONCURRENCY, total) }, () =>
      worker(),
    ),
  )

  const entries = results.filter(
    (entry): entry is { fileName: string; blob: Blob } => entry !== null,
  )
  const failed = total - entries.length
  if (entries.length === 0) {
    return { kind: 'failed', downloaded: 0, failed }
  }

  // iPhone / iPad 且本批全是相册支持的图片/视频：优先通过原生多文件分享面板一次存进相册。
  const canTryPhotosShare =
    isIosDevice() &&
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    entries.every((entry) => photoMimeForFileName(entry.fileName) !== null)

  if (canTryPhotosShare) {
    const files = entries.map((entry) =>
      toPhotoFile(entry.blob, entry.fileName),
    )
    if (await saveFilesToPhotos(files)) {
      return { kind: 'photos', downloaded: entries.length, failed }
    }
  }

  // 打包成单一 ZIP（图片/视频/音频/GLB 均已压缩，STORE 模式省内存且几乎零 CPU 耗时）。
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  for (const entry of entries) {
    zip.file(entry.fileName, entry.blob)
  }
  const archiveBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'STORE',
  })
  triggerZipDownload(archiveBlob, buildArchiveFileName())
  return { kind: 'zip', downloaded: entries.length, failed }
}
