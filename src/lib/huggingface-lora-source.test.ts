import { describe, expect, it } from 'vitest'

import { parseHuggingFaceLoraSourceUrl } from './huggingface-lora-source'

describe('parseHuggingFaceLoraSourceUrl', () => {
  it('parses repoId + revision out of a standard resolve URL', () => {
    expect(
      parseHuggingFaceLoraSourceUrl(
        'https://huggingface.co/lrzjason/Anything2Real/resolve/main/f2k_anything2real.safetensors',
      ),
    ).toEqual({ repoId: 'lrzjason/Anything2Real', revision: 'main' })
  })

  it('decodes a percent-encoded revision (e.g. a sha with special chars)', () => {
    expect(
      parseHuggingFaceLoraSourceUrl(
        'https://huggingface.co/author/repo/resolve/abc%2Fdef/weights/file.safetensors',
      ),
    ).toEqual({ repoId: 'author/repo', revision: 'abc/def' })
  })

  it('handles a nested filename path after the revision', () => {
    expect(
      parseHuggingFaceLoraSourceUrl(
        'https://huggingface.co/author/repo/resolve/main/weights/v2/adapter.safetensors',
      ),
    ).toEqual({ repoId: 'author/repo', revision: 'main' })
  })

  it('returns null for a non-Hugging-Face URL (e.g. a Civitai download link)', () => {
    expect(
      parseHuggingFaceLoraSourceUrl(
        'https://civitai.com/api/download/models/135867',
      ),
    ).toBeNull()
  })

  it('returns null for a Hugging Face URL that is not a resolve link', () => {
    expect(
      parseHuggingFaceLoraSourceUrl('https://huggingface.co/author/repo'),
    ).toBeNull()
  })

  it('returns null for an unparseable URL', () => {
    expect(parseHuggingFaceLoraSourceUrl('not a url')).toBeNull()
  })
})
