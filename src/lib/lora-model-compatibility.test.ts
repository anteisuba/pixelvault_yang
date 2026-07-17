import { describe, expect, it } from 'vitest'

import {
  isLoraBaseModelMountCompatible,
  summarizeLoraStackCompatibility,
} from './lora-model-compatibility'

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

describe('summarizeLoraStackCompatibility', () => {
  it('reports nothing when no base is selected (unjudged, not a warning)', () => {
    expect(summarizeLoraStackCompatibility(['Illustrious'], null)).toEqual({
      incompatibleCount: 0,
      mutuallyExclusive: false,
    })
  })

  it('reports zero incompatible when every mount shares the selected base bucket', () => {
    expect(
      summarizeLoraStackCompatibility(
        ['Illustrious', 'Pony', 'SDXL 1.0'],
        'illustrious',
      ),
    ).toEqual({ incompatibleCount: 0, mutuallyExclusive: false })
  })

  // §4.1 acceptance scenario: a single mounted LoRA whose family doesn't
  // match the selected base, with no second mount to force a bucket clash —
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

  it('flags mutual exclusion when two mounts sit in different architecture buckets', () => {
    // The reachable live-UI trigger: mount LoRA A (primary, sets the base
    // dropdown's scope), then mount LoRA B from the library via the
    // ungated stack.push path — B's bucket differs from A's.
    expect(
      summarizeLoraStackCompatibility(
        ['Illustrious', 'Flux.1 D'],
        'illustrious',
      ),
    ).toEqual({ incompatibleCount: 1, mutuallyExclusive: true })
  })

  it('does not let an "other"-bucket mount alone trigger mutual exclusion', () => {
    // 'other' buckets (unrecognized / sd1.5) are excluded from the bucket
    // count — they're never compatible with anything, but a lone 'other'
    // mount shouldn't misreport as "families fighting each other".
    expect(summarizeLoraStackCompatibility(['SD 1.5'], 'illustrious')).toEqual({
      incompatibleCount: 1,
      mutuallyExclusive: false,
    })
  })

  it('counts three-plus distinct buckets as mutually exclusive, not just a pair', () => {
    expect(
      summarizeLoraStackCompatibility(
        ['Illustrious', 'Flux.1 D', 'Anima'],
        'illustrious',
      ),
    ).toEqual({ incompatibleCount: 2, mutuallyExclusive: true })
  })
})
