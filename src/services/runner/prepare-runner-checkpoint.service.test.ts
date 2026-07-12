import { describe, expect, it, vi } from 'vitest'

vi.mock('@/services/civitai-lora.service', () => ({
  resolveCivitaiCheckpointByReference: vi.fn(),
}))

import { resolveCivitaiCheckpointByReference } from '@/services/civitai-lora.service'

import {
  deriveRunnerCheckpointFilename,
  prepareRunnerCheckpoint,
  RunnerCheckpointError,
} from './prepare-runner-checkpoint.service'

const mockResolve = vi.mocked(resolveCivitaiCheckpointByReference)

describe('prepareRunnerCheckpoint', () => {
  it('T1: resolvable + supported architecture → exact checkpoint download spec', async () => {
    mockResolve.mockResolvedValueOnce({
      modelVersionId: 597138,
      name: 'v5.0.0',
      baseModel: 'Anima',
      downloadUrl: 'https://civitai.com/api/download/models/597138',
      sizeKB: 6944000,
      fileHashAutoV3: 'abc',
    })

    const res = await prepareRunnerCheckpoint({ checkpointVersionId: 597138 })

    expect(res).toEqual({
      runnerCheckpoint: {
        filename: 'civitai-ckpt-597138.safetensors',
        downloadUrl: 'https://civitai.com/api/download/models/597138',
      },
      approximate: false,
    })
  })

  it('T2: exact checkpoint unresolvable but name is a supported family → approximate', async () => {
    mockResolve.mockResolvedValueOnce(null)

    const res = await prepareRunnerCheckpoint({
      checkpointVersionId: 1,
      checkpointName: 'BSSANIRLANIMASemi_v10',
    })

    expect(res).toEqual({ approximate: true })
  })

  it('T3: resolves to an unsupported architecture → throws RunnerCheckpointError', async () => {
    mockResolve.mockResolvedValueOnce({
      modelVersionId: 2,
      name: 'x',
      baseModel: 'Flux.1 D',
      downloadUrl: 'https://civitai.com/api/download/models/2',
      sizeKB: null,
      fileHashAutoV3: null,
    })

    await expect(
      prepareRunnerCheckpoint({ checkpointVersionId: 2, checkpointName: 'x' }),
    ).rejects.toBeInstanceOf(RunnerCheckpointError)
  })

  it('T3: no reference resolvable / classifiable → throws', async () => {
    mockResolve.mockResolvedValueOnce(null)
    await expect(
      prepareRunnerCheckpoint({ checkpointName: 'Krea2 Turbo' }),
    ).rejects.toBeInstanceOf(RunnerCheckpointError)
  })
})

describe('deriveRunnerCheckpointFilename', () => {
  it('is deterministic and ckpt-prefixed (distinct from lora filenames)', () => {
    expect(deriveRunnerCheckpointFilename(597138)).toBe(
      'civitai-ckpt-597138.safetensors',
    )
  })
})
