import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

import { cn, invertReferenceStrength } from '@/lib/utils'

describe('cn · named durations', () => {
  // `--transition-duration-*` is the only namespace Tailwind's `duration-*`
  // resolves names from; before these lines existed `duration-fast` & co.
  // generated no CSS at all.
  const globalsCss = readFileSync(
    join(process.cwd(), 'src/app/globals.css'),
    'utf8',
  )
  const names = [
    ...globalsCss.matchAll(/--transition-duration-([a-z-]+):/g),
  ].map((match) => match[1])

  it('globals.css registers the four steps and the three springs', () => {
    expect(names).toEqual(
      expect.arrayContaining([
        'fast',
        'base',
        'slow',
        'reveal',
        'spring-expand',
        'spring-slot',
        'spring-press',
      ]),
    )
  })

  it.each(names)('dedupes duration-%s against numeric steps', (name) => {
    expect(cn('duration-150', `duration-${name}`)).toBe(`duration-${name}`)
    expect(cn(`duration-${name}`, 'duration-150')).toBe('duration-150')
    expect(
      cn(
        'data-[state=open]:duration-150',
        `data-[state=open]:duration-${name}`,
      ),
    ).toBe(`data-[state=open]:duration-${name}`)
  })
})

describe('cn · spec shadows and radii', () => {
  const globalsCss = readFileSync(
    join(process.cwd(), 'src/app/globals.css'),
    'utf8',
  )
  // Only the theme-wired names (`--shadow-x: var(--elevation-x)`); the domain
  // shadows (`--shadow-node-*` …) are not part of the nine.
  const shadows = [
    ...globalsCss.matchAll(/--shadow-([a-z-]+): var\(--elevation-/g),
  ].map((match) => match[1])
  const radii = [...globalsCss.matchAll(/--radius-(\d+):/g)].map(
    (match) => match[1],
  )

  it('globals.css wires the nine shadows and the four numeric radii', () => {
    expect(shadows).toEqual(
      expect.arrayContaining([
        'ring',
        'soft',
        'seg',
        'card',
        'lift',
        'pop',
        'bar',
        'media-action',
        'focus',
      ]),
    )
    expect(radii).toEqual(['12', '16', '20', '24'])
  })

  it.each(shadows)('dedupes shadow-%s against T-shirt shadows', (name) => {
    expect(cn('shadow-sm', `shadow-${name}`)).toBe(`shadow-${name}`)
    expect(cn(`shadow-${name}`, 'shadow-none')).toBe('shadow-none')
  })

  it.each(radii)('dedupes rounded-%s against T-shirt radii', (name) => {
    expect(cn('rounded-lg', `rounded-${name}`)).toBe(`rounded-${name}`)
    expect(cn(`rounded-${name}`, 'rounded-full')).toBe('rounded-full')
  })
})

describe('invertReferenceStrength', () => {
  it('inverts the reference strength value', () => {
    expect(invertReferenceStrength(0.7)).toBeCloseTo(0.3)
    expect(invertReferenceStrength(0.5)).toBeCloseTo(0.5)
    expect(invertReferenceStrength(0.3)).toBeCloseTo(0.7)
  })

  it('clamps result to [0.01, 0.99]', () => {
    // At boundaries
    expect(invertReferenceStrength(0.01)).toBeCloseTo(0.99)
    expect(invertReferenceStrength(0.99)).toBeCloseTo(0.01)
  })

  it('clamps when input would produce out-of-range result', () => {
    // Input 0 would give 1.0, clamped to 0.99
    expect(invertReferenceStrength(0)).toBe(0.99)
    // Input 1 would give 0.0, clamped to 0.01
    expect(invertReferenceStrength(1)).toBe(0.01)
    // Negative input clamped to 0.99
    expect(invertReferenceStrength(-0.5)).toBe(0.99)
    // Input > 1 clamped to 0.01
    expect(invertReferenceStrength(1.5)).toBe(0.01)
  })
})
