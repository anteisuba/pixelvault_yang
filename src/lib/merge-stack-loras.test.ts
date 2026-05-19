import { describe, it, expect } from 'vitest'

import { mergeStackLoras } from './merge-stack-loras'
import type { AdvancedParams, ActiveLora } from '@/types'

const URL_A = 'https://r2.example.com/a.safetensors'
const URL_B = 'https://r2.example.com/b.safetensors'
const URL_C = 'https://r2.example.com/c.safetensors'

function stackEntry(
  assetId: string,
  scale = 1,
  styleCode = `code-${assetId}`,
): ActiveLora {
  return { assetId, styleCode, scale }
}

function urlResolver(map: Record<string, string>) {
  return (assetId: string) => map[assetId]
}

describe('mergeStackLoras', () => {
  it('returns the same advancedParams reference when stack is empty', () => {
    const ap: AdvancedParams = { steps: 30 }
    const out = mergeStackLoras(ap, [], () => undefined)
    expect(out).toBe(ap) // identity preserved → no needless re-render
  })

  it('returns undefined unchanged when stack is empty and no params', () => {
    expect(mergeStackLoras(undefined, [], () => undefined)).toBeUndefined()
  })

  it('prepends stack loras to the form list', () => {
    const ap: AdvancedParams = {
      loras: [{ url: URL_B, scale: 0.7 }],
    }
    const stack = [stackEntry('a1', 0.9)]
    const out = mergeStackLoras(ap, stack, urlResolver({ a1: URL_A }))
    expect(out?.loras).toEqual([
      { url: URL_A, scale: 0.9 },
      { url: URL_B, scale: 0.7 },
    ])
  })

  it('dedupes by URL — stack entry wins over form entry on same URL', () => {
    const ap: AdvancedParams = {
      loras: [{ url: URL_A, scale: 0.5 }], // user-set form value
    }
    const stack = [stackEntry('a1', 1.2)] // stack value
    const out = mergeStackLoras(ap, stack, urlResolver({ a1: URL_A }))
    expect(out?.loras).toEqual([{ url: URL_A, scale: 1.2 }])
  })

  it('caps the merged list at 5 entries (FAL limit)', () => {
    const ap: AdvancedParams = {
      loras: [
        { url: 'https://x/1.safetensors', scale: 1 },
        { url: 'https://x/2.safetensors', scale: 1 },
        { url: 'https://x/3.safetensors', scale: 1 },
      ],
    }
    const stack = [
      stackEntry('s1', 0.8),
      stackEntry('s2', 0.8),
      stackEntry('s3', 0.8),
    ]
    const out = mergeStackLoras(
      ap,
      stack,
      urlResolver({ s1: URL_A, s2: URL_B, s3: URL_C }),
    )
    expect(out?.loras).toHaveLength(5)
    // Stack entries kept (come first); form list truncated at the end
    expect(out?.loras?.slice(0, 3).map((l) => l.url)).toEqual([
      URL_A,
      URL_B,
      URL_C,
    ])
  })

  it('skips stack entries whose asset is no longer resolvable', () => {
    const ap: AdvancedParams = { loras: [{ url: URL_B, scale: 1 }] }
    const stack = [stackEntry('missing', 0.8), stackEntry('a1', 0.9)]
    const out = mergeStackLoras(ap, stack, urlResolver({ a1: URL_A }))
    expect(out?.loras).toEqual([
      { url: URL_A, scale: 0.9 },
      { url: URL_B, scale: 1 },
    ])
  })

  it('returns the original params if every stack entry fails to resolve', () => {
    const ap: AdvancedParams = { steps: 30 }
    const stack = [stackEntry('missing', 0.8)]
    const out = mergeStackLoras(ap, stack, () => undefined)
    expect(out).toBe(ap)
  })

  it('preserves other advancedParams fields untouched', () => {
    const ap: AdvancedParams = {
      steps: 28,
      guidanceScale: 7.5,
      seed: 12345,
    }
    const stack = [stackEntry('a1', 0.9)]
    const out = mergeStackLoras(ap, stack, urlResolver({ a1: URL_A }))
    expect(out).toMatchObject({
      steps: 28,
      guidanceScale: 7.5,
      seed: 12345,
      loras: [{ url: URL_A, scale: 0.9 }],
    })
  })

  it('handles undefined advancedParams with a non-empty stack', () => {
    const stack = [stackEntry('a1', 0.9)]
    const out = mergeStackLoras(undefined, stack, urlResolver({ a1: URL_A }))
    expect(out).toEqual({ loras: [{ url: URL_A, scale: 0.9 }] })
  })
})
