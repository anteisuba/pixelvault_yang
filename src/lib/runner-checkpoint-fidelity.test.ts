import { describe, expect, it, vi } from 'vitest'

import type { CivitaiCheckpointResolution } from '@/services/civitai-lora.service'

import { determineRunnerCheckpointFidelity } from './runner-checkpoint-fidelity'

function ckpt(
  overrides: Partial<CivitaiCheckpointResolution> = {},
): CivitaiCheckpointResolution {
  return {
    modelVersionId: 597138,
    name: 'v5.0.0',
    // anima_pencil-XL 的真实 baseModel 是 "SDXL 1.0"（不是 DiT 的 "Anima"）。
    baseModel: 'SDXL 1.0',
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
      family: 'sdxl',
    })
  })

  it('T1 faithful: DiT "Anima" checkpoint routes to the anima-dit family (Qwen-Image workflow)', async () => {
    // baseModel 值 "Anima" = Cosmos-Predict2 DiT → 独立家族 'anima-dit'，走 runner 的
    // Qwen-Image 工作流下载 + 生成（不再错当 anima_pencil 近似出紫图）。
    const resolved = ckpt({ baseModel: 'Anima', name: 'turbo-v1.0' })
    const result = await determineRunnerCheckpointFidelity(
      { checkpointVersionId: 3108589, checkpointName: 'Anima turbo' },
      async () => resolved,
    )
    expect(result).toEqual({
      tier: 'faithful',
      checkpoint: resolved,
      family: 'anima-dit',
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

  it('T2 name fallback: no loraBaseModel → guess architecture from checkpoint name', async () => {
    // 没有权威 loraBaseModel 时只能按名字兜底猜（"anima" 子串 → anima_pencil 近似）。
    // 这是退化路径；有 loraBaseModel 时以它为准（见下面 DiT 拦截用例）。
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

  it('T2 approximate: loraBaseModel "Anima" (DiT) routes to anima-dit even when the checkpoint is private', async () => {
    // 心月狐场景：配方精确底模 BSSANIRLANIMASemi 私有下不到，但 LoRA 声明 baseModel
    // "Anima" = DiT → 归 'anima-dit'，用 anima-base 默认档近似（LoRA 本就在 Base 上训）。
    const result = await determineRunnerCheckpointFidelity(
      {
        checkpointName: 'BSSANIRLANIMASemi_v10',
        loraBaseModel: 'Anima',
      },
      async () => null,
    )
    expect(result).toEqual({
      tier: 'approximate',
      family: 'anima-dit',
      requestedName: 'BSSANIRLANIMASemi_v10',
    })
  })

  it('T2 approximate: loraBaseModel "Illustrious" protects an SDXL LoRA whose name contains "anima"', async () => {
    // 防误杀：checkpoint 名字含 "anima"（如 Animagine 系）但 LoRA 其实是 SDXL 系——
    // 以 loraBaseModel 为准判成可近似，别被名字误拦。
    const result = await determineRunnerCheckpointFidelity(
      {
        checkpointName: 'someAnimagineMix_v3',
        loraBaseModel: 'Illustrious',
      },
      async () => null,
    )
    expect(result).toEqual({
      tier: 'approximate',
      family: 'illustrious',
      requestedName: 'someAnimagineMix_v3',
    })
  })

  it('T2 approximate: loraBaseModel used when there is no checkpoint name', async () => {
    const result = await determineRunnerCheckpointFidelity(
      { loraBaseModel: 'Pony' },
      async () => null,
    )
    expect(result).toEqual({
      tier: 'approximate',
      family: 'pony',
      requestedName: null,
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
