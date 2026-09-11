import { describe, expect, it } from 'vitest'

import {
  isLoraBaseModelMountCompatible,
  summarizeLoraStackCompatibility,
} from './lora-model-compatibility'

describe('isLoraBaseModelMountCompatible', () => {
  it('allows LoRAs that share the SDXL architecture (sdxl/anima pencil are neutral)', () => {
    // Base family strings come from LoraBaseModel.family (e.g. 'illustrious').
    expect(isLoraBaseModelMountCompatible('Illustrious', 'illustrious')).toBe(
      true,
    )
    expect(isLoraBaseModelMountCompatible('SDXL 1.0', 'illustrious')).toBe(true)
    expect(isLoraBaseModelMountCompatible('SDXL 1.0', 'pony')).toBe(true)
    expect(isLoraBaseModelMountCompatible('NoobAI', 'sdxl')).toBe(true)
    // Base family 'anima' is Anima Pencil XL — an SDXL checkpoint; its LoRAs
    // carry baseModel "SDXL 1.0".
    expect(isLoraBaseModelMountCompatible('SDXL 1.0', 'anima')).toBe(true)
    expect(isLoraBaseModelMountCompatible('Illustrious', 'anima')).toBe(true)
  })

  it('blocks Illustrious ↔ Pony cross-mounts despite the shared SDXL architecture', () => {
    // lora.md §7.1.1: loads, but blurs / artifacts — blocked by default.
    expect(isLoraBaseModelMountCompatible('Pony', 'illustrious')).toBe(false)
    expect(isLoraBaseModelMountCompatible('Illustrious', 'pony')).toBe(false)
    expect(isLoraBaseModelMountCompatible('NoobAI', 'pony')).toBe(false)
  })

  it('allows DiT Anima LoRAs only on the DiT base', () => {
    expect(isLoraBaseModelMountCompatible('Anima', 'anima-dit')).toBe(true)
  })

  it('blocks cross-architecture LoRAs that corrupt the checkpoint', () => {
    // The exact failure the user hit: an SD1.5/Flux "hands" LoRA on the
    // WAI-Illustrious-SDXL runner base → melted output.
    expect(isLoraBaseModelMountCompatible('SD 1.5', 'illustrious')).toBe(false)
    expect(isLoraBaseModelMountCompatible('Flux.1 D', 'illustrious')).toBe(
      false,
    )
    // Raw "Anima" is DiT (Cosmos-Predict2) — not the SDXL Anima Pencil base.
    expect(isLoraBaseModelMountCompatible('Anima', 'illustrious')).toBe(false)
    expect(isLoraBaseModelMountCompatible('Anima', 'anima')).toBe(false)
    // ...and the reverse: Animagine is SDXL despite the name.
    expect(isLoraBaseModelMountCompatible('Animagine XL', 'anima-dit')).toBe(
      false,
    )
  })

  it('treats unrecognized families and sd1.5 as incompatible (never risk corruption)', () => {
    expect(
      isLoraBaseModelMountCompatible('something weird', 'illustrious'),
    ).toBe(false)
    expect(isLoraBaseModelMountCompatible('Illustrious', 'sd15')).toBe(false)
    expect(isLoraBaseModelMountCompatible('SD 1.5', 'sd15')).toBe(false)
  })
})

describe('summarizeLoraStackCompatibility', () => {
  it('reports nothing when no base is selected (unjudged, not a warning)', () => {
    expect(summarizeLoraStackCompatibility(['Illustrious'], null)).toEqual({
      incompatibleCount: 0,
      mutuallyExclusive: false,
    })
  })

  it('reports zero incompatible when every mount fits the selected base', () => {
    expect(
      summarizeLoraStackCompatibility(
        ['Illustrious', 'NoobAI', 'SDXL 1.0'],
        'illustrious',
      ),
    ).toEqual({ incompatibleCount: 0, mutuallyExclusive: false })
  })

  // §4.1 acceptance scenario: a single mounted LoRA whose family doesn't
  // match the selected base, with no second mount to force a family clash —
  // this is the "suggest a specific base" branch (LoraWorkbench.tsx computes
  // getDefaultBase() from the mount's own family when mutuallyExclusive is
  // false). NOTE: the live dropdown only ever offers bases compatible with
  // the *primary* mount (LoraSpineBar's compatibleBases prop), so this exact
  // shape — one mount, one base, mismatched — cannot be reproduced by
  // switching the base-model Select while a single LoRA stays mounted; it is
  // reachable only via a base chosen before any LoRA was mounted, or via
  // programmatic state. Covering it here (independent of that UI constraint)
  // is what actually exercises the "switch to suggested base" code path.
  it('flags a single mismatched mount without mutual exclusion', () => {
    expect(summarizeLoraStackCompatibility(['Illustrious'], 'flux')).toEqual({
      incompatibleCount: 1,
      mutuallyExclusive: false,
    })
  })

  it('flags mutual exclusion when two mounts sit in different architectures', () => {
    // The reachable live-UI trigger: mount LoRA A (primary, sets the base
    // dropdown's scope), then mount LoRA B from the library via the
    // ungated stack.push path — B's architecture differs from A's.
    expect(
      summarizeLoraStackCompatibility(
        ['Illustrious', 'Flux.1 D'],
        'illustrious',
      ),
    ).toEqual({ incompatibleCount: 1, mutuallyExclusive: true })
  })

  it('flags mutual exclusion for Illustrious + Pony (same architecture, exclusive lineages)', () => {
    expect(
      summarizeLoraStackCompatibility(['Illustrious', 'Pony'], 'illustrious'),
    ).toEqual({ incompatibleCount: 1, mutuallyExclusive: true })
  })

  it('separates an Anima Pencil (SDXL) mount from a DiT Anima mount', () => {
    expect(
      summarizeLoraStackCompatibility(['SDXL 1.0', 'Anima'], 'anima'),
    ).toEqual({ incompatibleCount: 1, mutuallyExclusive: true })
  })

  it('does not let an unrecognized/sd1.5 mount alone trigger mutual exclusion', () => {
    // Unclassified mounts are excluded from the exclusion check — they're
    // never compatible with anything, but a lone one shouldn't misreport as
    // "families fighting each other".
    expect(summarizeLoraStackCompatibility(['SD 1.5'], 'illustrious')).toEqual({
      incompatibleCount: 1,
      mutuallyExclusive: false,
    })
  })

  it('counts three-plus distinct architectures as mutually exclusive, not just a pair', () => {
    expect(
      summarizeLoraStackCompatibility(
        ['Illustrious', 'Flux.1 D', 'Anima'],
        'illustrious',
      ),
    ).toEqual({ incompatibleCount: 2, mutuallyExclusive: true })
  })
})
