import 'server-only'

import {
  DOWNLOAD_PROXY_ALLOWED_PROVIDER_HOST_SUFFIXES,
  DOWNLOAD_URL_TTL_SECONDS,
} from '@/constants/config'
import { createPresignedR2GetUrl } from '@/services/storage/r2'

/**
 * How `/api/download` should serve one asset URL.
 *
 * - `owned` — the object lives in our own R2 bucket, so the browser can pull
 *   it straight from R2 through a presigned GET. No Vercel bandwidth at all.
 * - `proxy` — a provider's temporary CDN asset (fal / replicate). Those hosts
 *   send no permissive CORS headers and we can't sign their URLs, so the
 *   bytes still have to pass through the function to gain an attachment
 *   disposition.
 * - `forbidden` — anything else. Arbitrary URLs must never become
 *   downloadable through an authenticated endpoint of ours.
 */
export type DownloadTarget =
  | { kind: 'owned'; storageKey: string }
  | { kind: 'proxy' }
  | { kind: 'forbidden' }

function matchesHostSuffix(hostname: string, suffix: string): boolean {
  return hostname === suffix || hostname.endsWith(`.${suffix}`)
}

function resolveOwnedStorageKey(assetUrl: string): string | null {
  const storageBaseUrl = process.env.NEXT_PUBLIC_STORAGE_BASE_URL
  if (!storageBaseUrl) return null

  let parsedAssetUrl: URL
  let parsedStorageBaseUrl: URL
  try {
    parsedAssetUrl = new URL(assetUrl)
    parsedStorageBaseUrl = new URL(storageBaseUrl)
  } catch {
    return null
  }

  if (parsedAssetUrl.origin !== parsedStorageBaseUrl.origin) return null

  const basePath = parsedStorageBaseUrl.pathname.replace(/\/+$/, '')
  if (!parsedAssetUrl.pathname.startsWith(`${basePath}/`)) return null

  let storageKey: string
  try {
    storageKey = decodeURIComponent(
      parsedAssetUrl.pathname.slice(basePath.length + 1),
    )
  } catch {
    return null
  }

  if (!storageKey || storageKey.includes('..')) return null
  return storageKey
}

function isAllowedProviderAssetUrl(assetUrl: string): boolean {
  try {
    const parsedAssetUrl = new URL(assetUrl)
    if (parsedAssetUrl.protocol !== 'https:') return false

    const hostname = parsedAssetUrl.hostname.toLowerCase()
    return DOWNLOAD_PROXY_ALLOWED_PROVIDER_HOST_SUFFIXES.some((suffix) =>
      matchesHostSuffix(hostname, suffix),
    )
  } catch {
    return false
  }
}

export function resolveDownloadTarget(assetUrl: string): DownloadTarget {
  const storageKey = resolveOwnedStorageKey(assetUrl)
  if (storageKey) return { kind: 'owned', storageKey }
  if (isAllowedProviderAssetUrl(assetUrl)) return { kind: 'proxy' }
  return { kind: 'forbidden' }
}

export function buildContentDisposition(filename?: string): string {
  const safeFilename = (filename ?? 'download')
    .replace(/[\r\n"]/g, '')
    .replace(/[\\/]/g, '-')
    .trim()

  return `attachment; filename="${safeFilename || 'download'}"`
}

/**
 * Sign a short-lived GET for one of our own objects, carrying the attachment
 * disposition in the signature. The URL points at the R2 S3 endpoint rather
 * than the public custom domain on purpose: a public bucket / custom domain
 * ignores `response-content-disposition`, a presigned S3 request honours it.
 */
export async function createOwnedAssetDownloadUrl(params: {
  storageKey: string
  filename?: string
}): Promise<string> {
  return await createPresignedR2GetUrl({
    key: params.storageKey,
    expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
    contentDisposition: buildContentDisposition(params.filename),
  })
}
