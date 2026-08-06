import { describe, expect, it } from 'vitest'

import { API_ENDPOINTS } from '@/constants/config'
import { getLoraAssetSourceUrl } from '@/lib/lora-asset-source-url'

function makeAsset(
  overrides: Partial<Parameters<typeof getLoraAssetSourceUrl>[0]> = {},
): Parameters<typeof getLoraAssetSourceUrl>[0] {
  return {
    source: 'imported',
    loraUrl: 'https://civitai.com/api/download/models/135867',
    provider: 'civitai',
    ...overrides,
  }
}

describe('getLoraAssetSourceUrl', () => {
  it('maps Civitai download URLs to the source-page redirect endpoint', () => {
    expect(getLoraAssetSourceUrl(makeAsset())).toBe(
      `${API_ENDPOINTS.LORA_ASSETS_CIVITAI_SOURCE}?modelVersionId=135867`,
    )
  })

  it('prefers modelVersionId when present on a Civitai asset', () => {
    expect(
      getLoraAssetSourceUrl(
        makeAsset({
          modelVersionId: 2055853,
          loraUrl: 'https://civitai.com/api/download/models/999',
        }),
      ),
    ).toBe(`${API_ENDPOINTS.LORA_ASSETS_CIVITAI_SOURCE}?modelVersionId=2055853`)
  })

  it('passes through civitai.com/models/ page URLs', () => {
    const page = 'https://civitai.com/models/122359?modelVersionId=135867'
    expect(getLoraAssetSourceUrl(makeAsset({ loraUrl: page }))).toBe(page)
  })

  it('passes through non-Civitai provider URLs (e.g. Hugging Face)', () => {
    const hf =
      'https://huggingface.co/example/repo/resolve/main/style.safetensors'
    expect(
      getLoraAssetSourceUrl(
        makeAsset({ provider: 'huggingface', loraUrl: hf }),
      ),
    ).toBe(hf)
  })

  it('returns null for trained (local) assets', () => {
    expect(
      getLoraAssetSourceUrl(
        makeAsset({
          source: 'trained',
          loraUrl: 'https://cdn.example.com/trained.safetensors',
        }),
      ),
    ).toBeNull()
  })

  it('returns null for opaque Civitai URLs that are neither download nor model page', () => {
    expect(
      getLoraAssetSourceUrl(
        makeAsset({ loraUrl: 'https://civitai.com/user/foo' }),
      ),
    ).toBeNull()
  })

  it('tolerates missing provider / loraUrl without throwing (partial stack assets)', () => {
    expect(
      getLoraAssetSourceUrl({
        source: 'imported',
        loraUrl: undefined as unknown as string,
        provider: undefined as unknown as string,
      }),
    ).toBeNull()
  })
})
