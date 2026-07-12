import { describe, expect, it, vi } from 'vitest'

import type { CivitaiCheckpointResolution } from '@/services/civitai-lora.service'

import { determineRunnerCheckpointFidelity } from './runner-checkpoint-fidelity'

function ckpt(
  overrides: Partial<CivitaiCheckpointResolution> = {},
): CivitaiCheckpointResolution {
  return {
    modelVersionId: 597138,
    name: 'v5.0.0',
    baseModel: 'Anima',
    downloadUrl: 'https://civitai.com/api/download/models/597138',
    sizeKB: 6944000,
    fileHashAutoV3: 'abcdef012345',
    ...overrides,
  }
}

describe('determineRunnerCheckpointFidelity', () => {
  it('T1 faithful: exact version resolves to a supported architecture', async () => {
    const resolve = vi.fn(async () => ckpt())
    const result = await determineRunnerCheckpointFidelity(
      { checkpointVersionId: 597138, checkpointName: 'Anima Pencil-XL' },
      resolve,
    )
    expect(resolve).toHaveBeenCalledWith(597138)
    expect(result).toEqual({
      tier: 'faithful',
      checkpoint: ckpt(),
      family: 'anima',
    })
  })

  it('T1 faithful: Illustrious checkpoint', async () => {
    const resolved = ckpt({ baseModel: 'Illustrious', name: 'v1.0' })
    const result = await determineRunnerCheckpointFidelity(
      { checkpointVersionId: 1 },
      async () => resolved,
    )
    expect(result).toEqual({
      tier: 'faithful',
      checkpoint: resolved,
      family: 'illustrious',
    })
  })

  it('T3 unsupported: resolves but the architecture is not self-hostable (Flux)', async () => {
    const result = await determineRunnerCheckpointFidelity(
      { checkpointVersionId: 2, checkpointName: 'Some Flux Model' },
      async () => ckpt({ baseModel: 'Flux.1 D' }),
    )
    expect(result).toEqual({
      tier: 'unsupported',
      requestedName: 'Some Flux Model',
      baseModelRaw: 'Flux.1 D',
    })
  })

  it('T2 approximate: exact version unresolvable but the name reveals a supported family', async () => {
    const result = await determineRunnerCheckpointFidelity(
      { checkpointVersionId: 999, checkpointName: 'BSSANIRLANIMASemi_v10' },
      async () => null, // gated / deleted / blip
    )
    expect(result).toEqual({
      tier: 'approximate',
      family: 'anima',
      requestedName: 'BSSANIRLANIMASemi_v10',
    })
  })

  it('T2 approximate: no version id, classify by name', async () => {
    const resolve = vi.fn()
    const result = await determineRunnerCheckpointFidelity(
      { checkpointName: 'rinFlanimeIllustrious_v30' },
      resolve,
    )
    expect(resolve).not.toHaveBeenCalled()
    expect(result).toEqual({
      tier: 'approximate',
      family: 'illustrious',
      requestedName: 'rinFlanimeIllustrious_v30',
    })
  })

  it('T3 unsupported: unknown / unclassifiable name', async () => {
    const result = await determineRunnerCheckpointFidelity(
      { checkpointName: 'Krea2 Turbo' },
      async () => null,
    )
    expect(result).toEqual({
      tier: 'unsupported',
      requestedName: 'Krea2 Turbo',
      baseModelRaw: null,
    })
  })

  it('T3 unsupported: no reference at all', async () => {
    const result = await determineRunnerCheckpointFidelity({}, async () => null)
    expect(result).toEqual({
      tier: 'unsupported',
      requestedName: null,
      baseModelRaw: null,
    })
  })
})
