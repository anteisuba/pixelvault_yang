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
    expect(normalizeToLoraBaseFamily('Anima')).toBe('anima')
  })

  it('keeps SDXL-derived families distinct from generic sdxl', () => {
    // Illustrious/Pony/Anima are SDXL-based but must resolve to their own
    // family, not the catch-all sdxl (xl substring).
    expect(normalizeToLoraBaseFamily('Illustrious XL')).toBe('illustrious')
    expect(normalizeToLoraBaseFamily('Pony XL')).toBe('pony')
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
