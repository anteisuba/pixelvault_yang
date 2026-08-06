import { API_ENDPOINTS } from '@/constants/config'
import type { LoraAssetRecord } from '@/types'
import { parseCivitaiVersionIdFromDownloadUrl } from '@/lib/civitai-lora-url'

/**
 * Resolve a user-facing "open source" URL for a LoRA asset.
 *
 * Favorited/imported Civitai rows store the **download** endpoint in
 * `loraUrl` (`/api/download/models/{versionId}`). Opening that in a new tab
 * triggers a file download — not the model page. Route those through
 * `/api/lora-assets/civitai/source` which 302s to the real model page.
 *
 * Trained (local) assets have no external source. Non-Civitai providers
 * (Hugging Face, etc.) keep their stored URL as-is.
 */
export function getLoraAssetSourceUrl(
  asset: Pick<
    LoraAssetRecord,
    'source' | 'loraUrl' | 'provider' | 'modelVersionId'
  >,
): string | null {
  if (asset.source === 'trained') return null

  const provider = (asset.provider ?? '').toLowerCase()
  const loraUrl = asset.loraUrl ?? ''

  if (
    asset.modelVersionId != null &&
    Number.isSafeInteger(asset.modelVersionId) &&
    asset.modelVersionId > 0 &&
    provider === 'civitai'
  ) {
    return `${API_ENDPOINTS.LORA_ASSETS_CIVITAI_SOURCE}?modelVersionId=${asset.modelVersionId}`
  }

  const versionId = parseCivitaiVersionIdFromDownloadUrl(loraUrl)
  if (versionId != null) {
    return `${API_ENDPOINTS.LORA_ASSETS_CIVITAI_SOURCE}?modelVersionId=${versionId}`
  }

  if (loraUrl.startsWith('https://civitai.com/models/')) {
    return loraUrl
  }

  if (provider !== 'civitai' && loraUrl) {
    return loraUrl
  }

  return null
}
