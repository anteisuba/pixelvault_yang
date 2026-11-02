import { describe, expect, it } from 'vitest'

import { parseCivitaiVersionIdFromDownloadUrl } from './civitai-lora-url'

describe('parseCivitaiVersionIdFromDownloadUrl', () => {
  it('extracts the version id from a standard download URL', () => {
    expect(
      parseCivitaiVersionIdFromDownloadUrl(
        'https://civitai.com/api/download/models/135867',
      ),
    ).toBe(135867)
  })

  it('tolerates query strings and trailing segments', () => {
    expect(
      parseCivitaiVersionIdFromDownloadUrl(
        'https://civitai.com/api/download/models/135867?type=Model&format=SafeTensor',
      ),
    ).toBe(135867)
  })

  it('rejects non-civitai hosts', () => {
    expect(
      parseCivitaiVersionIdFromDownloadUrl(
        'https://example.com/api/download/models/135867',
      ),
    ).toBeNull()
  })

  it('rejects malformed and non-download URLs', () => {
    expect(parseCivitaiVersionIdFromDownloadUrl('')).toBeNull()
    expect(parseCivitaiVersionIdFromDownloadUrl('not a url')).toBeNull()
    expect(
      parseCivitaiVersionIdFromDownloadUrl('https://civitai.com/models/122359'),
    ).toBeNull()
  })
})
