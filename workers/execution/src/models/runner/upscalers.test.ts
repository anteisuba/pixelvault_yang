import { describe, expect, it } from 'vitest'

import { isRunnerUpscaler, RUNNER_UPSCALER_MANIFEST } from './upscalers'

describe('Runner upscaler manifest', () => {
  it('pins the author-published 4x-AnimeSharp asset by revision and digest', () => {
    const model = RUNNER_UPSCALER_MANIFEST['4x-AnimeSharp']
    expect(model.filename).toBe('4x-AnimeSharp.pth')
    expect(model.downloadUrl).toContain(
      '/Kim2091/AnimeSharp/resolve/7696d95ced82b0c1f2a41f6ac73336133f0a90e1/',
    )
    expect(model.sha256).toBe(
      'e7a7de2dafd7331c1992862bbbcd9e9712a9f9f8e6303f0aaa59b4341d359bab',
    )
    expect(model.scale).toBe(4)
    expect(model.license).toBe('CC-BY-NC-SA-4.0')
  })

  it('rejects arbitrary model names', () => {
    expect(isRunnerUpscaler('4x-AnimeSharp')).toBe(true)
    expect(isRunnerUpscaler('arbitrary.pth')).toBe(false)
  })
})
