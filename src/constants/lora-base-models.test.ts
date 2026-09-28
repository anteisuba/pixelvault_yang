import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

import { getModelById } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getRunnerCheckpointById } from '@/constants/runner-checkpoints'
import {
  LORA_BASE_FAMILIES,
  LORA_BASE_MODELS,
  LORA_BASE_ONLY_DEFAULT_ID,
  LORA_STACK_WEIGHT_BUDGET,
  getBaseOnlyGenerationBases,
  getCompatibleBases,
  getDefaultBaseOnlyGenerationBase,
  getDefaultBase,
  getLoraBaseArchitectureGroup,
  normalizeToLoraBaseFamily,
  resolveLoraStackWeightBudget,
} from '@/constants/lora-base-models'

describe('normalizeToLoraBaseFamily', () => {
  it('maps Civitai display names to fine-grained families', () => {
    expect(normalizeToLoraBaseFamily('Illustrious')).toBe('illustrious')
    expect(normalizeToLoraBaseFamily('NoobAI')).toBe('illustrious')
    expect(normalizeToLoraBaseFamily('Pony')).toBe('pony')
    expect(normalizeToLoraBaseFamily('Flux.1 D')).toBe('flux')
    expect(normalizeToLoraBaseFamily('SDXL 1.0')).toBe('sdxl')
    expect(normalizeToLoraBaseFamily('SD 1.5')).toBe('sd15')
  })

  it('keeps SDXL-derived families distinct from generic sdxl', () => {
    // Illustrious/Pony are SDXL-based but must resolve to their own family,
    // not the catch-all sdxl (xl substring).
    expect(normalizeToLoraBaseFamily('Illustrious XL')).toBe('illustrious')
    expect(normalizeToLoraBaseFamily('Pony XL')).toBe('pony')
  })

  it('routes DiT "Anima" to its own anima-dit family, distinct from SDXL anima_pencil / Animagine', () => {
    // baseModel 值 "Anima" = Cosmos-Predict2 DiT → 独立家族 'anima-dit'（走 Qwen-Image
    // 工作流）。用精确值判，别碰 "anima" 子串，免误判 Animagine 这类 SDXL。
    expect(normalizeToLoraBaseFamily('Anima')).toBe('anima-dit')
    expect(normalizeToLoraBaseFamily('anima')).toBe('anima-dit')
    expect(normalizeToLoraBaseFamily('anima-dit')).toBe('anima-dit')
    expect(normalizeToLoraBaseFamily('  ANIMA ')).toBe('anima-dit')
    // 名字含 "anima" 但架构是 SDXL 的仍归 'anima'（走 anima_pencil）。
    expect(normalizeToLoraBaseFamily('anima_pencil-XL')).toBe('anima')
    expect(normalizeToLoraBaseFamily('Animagine XL v3')).toBe('anima')
  })

  it('keeps Pony V7 (AuraFlow arch) out of the SDXL-based pony family', () => {
    expect(normalizeToLoraBaseFamily('Pony V7')).toBeNull()
    expect(normalizeToLoraBaseFamily('Pony Diffusion V7')).toBeNull()
  })

  it('returns null for empty or unknown input', () => {
    expect(normalizeToLoraBaseFamily('')).toBeNull()
    expect(normalizeToLoraBaseFamily('   ')).toBeNull()
    expect(normalizeToLoraBaseFamily('whatever')).toBeNull()
  })
})

describe('getCompatibleBases', () => {
  it('returns only same-family bases', () => {
    const bases = getCompatibleBases('Illustrious')
    expect(bases.length).toBeGreaterThan(0)
    expect(bases.every((b) => b.family === 'illustrious')).toBe(true)
  })

  it('retired hosted families (flux, sd15) have no base to pick', () => {
    // 09-17 托管通道退役、SD 1.5 07-07 定过不进 Runner：只剩归类，没有「即将」占位。
    expect(getCompatibleBases('Flux.1 D')).toEqual([])
    expect(getCompatibleBases('SD 1.5')).toEqual([])
  })

  it('returns empty for an unknown family', () => {
    expect(getCompatibleBases('totally-unknown')).toEqual([])
  })

  it('offers the anima-dit runner base for DiT "Anima"', () => {
    const bases = getCompatibleBases('Anima')
    expect(bases.length).toBeGreaterThan(0)
    expect(bases.every((b) => b.family === 'anima-dit')).toBe(true)
    expect(bases.some((b) => b.id === 'anima-dit-runner')).toBe(true)
    expect(bases.map((b) => b.id)).toEqual([
      'anima-dit-runner',
      'anima-dit-base-v10-runner',
      'anima-dit-turbo-v11-runner',
    ])
    expect(bases.map((b) => b.recipeCheckpointMode)).toEqual([
      'source',
      'fixed',
      'fixed',
    ])
  })
})

describe('getDefaultBase', () => {
  it('has no default for flux (retired 2026-09-17, no runner successor)', () => {
    expect(getDefaultBase('Flux.1 D')).toBeNull()
  })

  it('surfaces the pony runner base even when the runner flag gates it', () => {
    const base = getDefaultBase('Pony')
    expect(base?.family).toBe('pony')
    expect(base?.id).toBe('pony-runner')
  })

  it('defaults a mounted DiT "Anima" LoRA to the source-checkpoint base, not Turbo', () => {
    const base = getDefaultBase('Anima')
    expect(base?.family).toBe('anima-dit')
    expect(base?.id).toBe('anima-dit-runner')
  })

  it('returns null when no family matches', () => {
    expect(getDefaultBase('nonsense')).toBeNull()
  })
})

describe('pure-base generation catalog', () => {
  it('defaults to the fixed Anima Turbo v1.1 runner entry', () => {
    const base = getDefaultBaseOnlyGenerationBase()
    expect(base?.id).toBe(LORA_BASE_ONLY_DEFAULT_ID)
    expect(base?.id).toBe('anima-dit-turbo-v11-runner')
    expect(base?.family).toBe('anima-dit')
    expect(base?.recipeCheckpointMode).toBe('fixed')
    expect(base?.distilled).toBe(true)
  })

  it('excludes bases that depend on a source recipe', () => {
    const bases = getBaseOnlyGenerationBases()
    expect(bases.length).toBeGreaterThan(0)
    expect(bases.every((base) => base.recipeCheckpointMode !== 'source')).toBe(
      true,
    )
    expect(bases.some((base) => base.id === 'anima-dit-runner')).toBe(false)
  })
})

describe('getLoraBaseArchitectureGroup', () => {
  it('routes anima-dit to the DiT group', () => {
    expect(getLoraBaseArchitectureGroup('anima-dit')).toBe('dit')
  })

  it('routes every other known family to the SDXL group', () => {
    // §4.4 底模 Select 分组：anima-dit 是唯一的 DiT 家族，其余（含 SDXL 系的
    // "anima" = Anima Pencil XL）全部落 SDXL 桶——新增架构默认也走这条路，
    // 除非显式加进 LORA_BASE_DIT_FAMILIES。
    const nonDit = LORA_BASE_FAMILIES.filter((f) => f !== 'anima-dit')
    expect(nonDit.length).toBeGreaterThan(0)
    for (const family of nonDit) {
      expect(getLoraBaseArchitectureGroup(family)).toBe('sdxl')
    }
  })
})

describe('LORA_BASE_MODELS catalog', () => {
  it('has unique ids', () => {
    const ids = LORA_BASE_MODELS.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every entry points at a Runner model whose checkpoint is in the manifest', () => {
    // LoraWorkbench.tsx submits `selectedBase.providerModelId`; the Worker
    // resolves that model's externalModelId against RUNNER_CHECKPOINTS.
    for (const base of LORA_BASE_MODELS) {
      const model = getModelById(base.providerModelId)
      expect(model?.adapterType).toBe(AI_ADAPTER_TYPES.RUNNER)
      expect(getRunnerCheckpointById(base.runnerCheckpointId)?.id).toBe(
        base.runnerCheckpointId,
      )
      if (base.recipeCheckpointMode === 'fixed') {
        expect(model?.externalModelId).toBe(base.runnerCheckpointId)
      }
    }
  })

  it('gives every base a local model thumbnail shared with the homepage catalog', () => {
    const publicDir = join(process.cwd(), 'public')
    const missing = LORA_BASE_MODELS.filter(
      (base) =>
        !base.coverImage.startsWith('/homepage/') ||
        !existsSync(join(publicDir, base.coverImage.replace(/^\//, ''))),
    ).map((base) => base.id)

    expect(missing).toEqual([])
    expect(
      LORA_BASE_MODELS.find((base) => base.id === 'pony-runner')?.coverImage,
    ).toBe('/homepage/production/models/image/pony-diffusion-v6.webp')
  })

  it('marks exactly the step-distilled entries (CFG 1 checkpoints) as distilled', () => {
    // 蒸馏档的权重护栏走 1.0；判据与清单里的 CFG 默认同源，两处不能各说各话。
    for (const base of LORA_BASE_MODELS) {
      expect(base.distilled).toBe(
        getRunnerCheckpointById(base.runnerCheckpointId)?.recommendedCfg === 1,
      )
    }
    expect(
      LORA_BASE_MODELS.filter((base) => base.distilled).map((base) => base.id),
    ).toEqual(['anima-dit-turbo-v11-runner'])
  })
})

describe('resolveLoraStackWeightBudget', () => {
  it('resolves the non-distilled budget (2.0)', () => {
    expect(LORA_STACK_WEIGHT_BUDGET.default).toBe(2)
    expect(resolveLoraStackWeightBudget({ distilled: false })).toBe(
      LORA_STACK_WEIGHT_BUDGET.default,
    )
  })

  it('resolves the distilled budget (1.0) for a constructed distilled base', () => {
    expect(resolveLoraStackWeightBudget({ distilled: true })).toBe(
      LORA_STACK_WEIGHT_BUDGET.distilled,
    )
  })

  it('does not judge when the base is undetermined (null)', () => {
    expect(resolveLoraStackWeightBudget(null)).toBeNull()
  })
})
