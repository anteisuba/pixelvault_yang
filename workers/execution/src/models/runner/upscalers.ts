export const RUNNER_UPSCALERS = ['4x-AnimeSharp'] as const

export type RunnerUpscaler = (typeof RUNNER_UPSCALERS)[number]

export interface RunnerUpscalerManifestEntry {
  id: RunnerUpscaler
  filename: string
  downloadUrl: string
  sha256: string
  sizeBytes: number
  scale: number
  license: string
}

/**
 * Fixed, hash-pinned post-processing assets. 4x-AnimeSharp is published by
 * its author under a non-commercial license; PixelVault's current project
 * scope is explicitly non-commercial.
 */
export const RUNNER_UPSCALER_MANIFEST: Record<
  RunnerUpscaler,
  RunnerUpscalerManifestEntry
> = {
  '4x-AnimeSharp': {
    id: '4x-AnimeSharp',
    filename: '4x-AnimeSharp.pth',
    downloadUrl:
      'https://huggingface.co/Kim2091/AnimeSharp/resolve/7696d95ced82b0c1f2a41f6ac73336133f0a90e1/4x-AnimeSharp.pth',
    sha256: 'e7a7de2dafd7331c1992862bbbcd9e9712a9f9f8e6303f0aaa59b4341d359bab',
    sizeBytes: 67_010_245,
    scale: 4,
    license: 'CC-BY-NC-SA-4.0',
  },
}

export function isRunnerUpscaler(value: string): value is RunnerUpscaler {
  return (RUNNER_UPSCALERS as readonly string[]).includes(value)
}
