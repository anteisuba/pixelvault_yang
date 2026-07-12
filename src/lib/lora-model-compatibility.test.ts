import { describe, expect, it } from 'vitest'

import { isLoraBaseModelMountCompatible } from './lora-model-compatibility'

describe('isLoraBaseModelMountCompatible', () => {
  it('allows LoRAs that share the SDXL bucket (illustrious/pony/sdxl interload)', () => {
    // Base family strings come from LoraBaseModel.family (e.g. 'illustrious').
    expect(isLoraBaseModelMountCompatible('Illustrious', 'illustrious')).toBe(
      true,
    )
    expect(isLoraBaseModelMountCompatible('Pony', 'illustrious')).toBe(true)
    expect(isLoraBaseModelMountCompatible('SDXL 1.0', 'illustrious')).toBe(true)
    expect(isLoraBaseModelMountCompatible('NoobAI', 'sdxl')).toBe(true)
  })

  it('blocks cross-architecture LoRAs that corrupt an SDXL checkpoint', () => {
    // The exact failure the user hit: an SD1.5/Flux "hands" LoRA on the
    // WAI-Illustrious-SDXL runner base → melted output.
    expect(isLoraBaseModelMountCompatible('SD 1.5', 'illustrious')).toBe(false)
    expect(isLoraBaseModelMountCompatible('Flux.1 D', 'illustrious')).toBe(
      false,
    )
    // Anima is its own bucket (separate hosted route + runner checkpoint).
    expect(isLoraBaseModelMountCompatible('Anima', 'illustrious')).toBe(false)
    // ...and the reverse: an illustrious LoRA on an anima base.
    expect(isLoraBaseModelMountCompatible('Illustrious', 'anima')).toBe(false)
  })

  it('treats unrecognized/other families as incompatible (never risk corruption)', () => {
    // Unrecognized LoRA baseModel → 'other' bucket → never mounts.
    expect(
      isLoraBaseModelMountCompatible('something weird', 'illustrious'),
    ).toBe(false)
    // sd1.5 falls in the 'other' bucket here, so an sd15 base rejects all.
    expect(isLoraBaseModelMountCompatible('Illustrious', 'sd15')).toBe(false)
  })
})
