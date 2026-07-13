import { describe, it, expect } from 'vitest'

import {
  LORA_BASE_MODELS,
  getCompatibleBases,
  getDefaultBase,
  normalizeToLoraBaseFamily,
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

  it('illustrious offers both a hosted and a runner option', () => {
    const backends = getCompatibleBases('Illustrious').map((b) => b.backend)
    expect(backends).toContain('hosted')
    expect(backends).toContain('runner')
  })

  it('returns empty for an unknown family', () => {
    expect(getCompatibleBases('totally-unknown')).toEqual([])
  })

  it('offers the anima-dit runner base for DiT "Anima"', () => {
    const bases = getCompatibleBases('Anima')
    expect(bases.length).toBeGreaterThan(0)
    expect(bases.every((b) => b.family === 'anima-dit')).toBe(true)
    expect(bases.some((b) => b.id === 'anima-dit-runner')).toBe(true)
  })
})

describe('getDefaultBase', () => {
  it('prefers an available recommended base (flux hosted)', () => {
    const base = getDefaultBase('Flux.1 D')
    expect(base?.family).toBe('flux')
    expect(base?.available).toBe(true)
  })

  it('falls back to a coming-soon base when none is available (pony)', () => {
    // Pony has no hosted endpoint yet — runner is not available, but the
    // selector still surfaces it (gated) rather than returning null.
    const base = getDefaultBase('Pony')
    expect(base?.family).toBe('pony')
    expect(base?.backend).toBe('runner')
  })

  it('defaults DiT "Anima" to the anima-dit runner base', () => {
    const base = getDefaultBase('Anima')
    expect(base?.family).toBe('anima-dit')
    expect(base?.id).toBe('anima-dit-runner')
  })

  it('returns null when no family matches', () => {
    expect(getDefaultBase('nonsense')).toBeNull()
  })
})

describe('LORA_BASE_MODELS catalog', () => {
  it('has unique ids', () => {
    const ids = LORA_BASE_MODELS.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('hosted entries and implemented runner entries carry a providerModelId', () => {
    // LoraWorkbench.tsx reads `selectedBase.providerModelId` as the modelId
    // to submit regardless of backend — so any backend with a real
    // checkpoint wired up (runnerCheckpointId set) must have one too.
    // sd15-runner is explicitly out of scope (no checkpoint) and has neither.
    for (const base of LORA_BASE_MODELS) {
      if (base.backend === 'hosted' || base.runnerCheckpointId) {
        expect(base.providerModelId).toBeDefined()
      } else {
        expect(base.providerModelId).toBeUndefined()
      }
    }
  })
})
