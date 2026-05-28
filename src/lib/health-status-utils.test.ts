import { describe, it, expect } from 'vitest'

import { getHealthDotClass, getHealthLabelKey } from '@/lib/health-status-utils'

describe('getHealthDotClass', () => {
  it('returns transparent for undefined status', () => {
    expect(getHealthDotClass(undefined)).toBe('bg-transparent')
    expect(getHealthDotClass(undefined, 'default')).toBe('bg-transparent')
    expect(getHealthDotClass(undefined, 'node')).toBe('bg-transparent')
  })

  it('returns default theme 500-tier colors', () => {
    expect(getHealthDotClass('available')).toBe('bg-emerald-500')
    expect(getHealthDotClass('no_key')).toBe('bg-amber-500')
    expect(getHealthDotClass('failed')).toBe('bg-red-500')
    expect(getHealthDotClass('unknown')).toBe('bg-muted-foreground/40')
  })

  it('returns node theme 400-tier + node-muted colors', () => {
    expect(getHealthDotClass('available', 'node')).toBe('bg-emerald-400')
    expect(getHealthDotClass('no_key', 'node')).toBe('bg-amber-400')
    expect(getHealthDotClass('failed', 'node')).toBe('bg-red-400')
    expect(getHealthDotClass('unknown', 'node')).toBe('bg-node-muted/45')
  })

  it('default theme matches ApiKeyHealthDot HEALTH_COLORS contract', () => {
    // 守护：default theme must stay byte-identical with
    // src/components/business/ApiKeyHealthDot.tsx HEALTH_COLORS.
    // If you change either, change both.
    expect(getHealthDotClass('available')).toBe('bg-emerald-500')
    expect(getHealthDotClass('no_key')).toBe('bg-amber-500')
    expect(getHealthDotClass('failed')).toBe('bg-red-500')
    expect(getHealthDotClass('unknown')).toBe('bg-muted-foreground/40')
  })

  it('node theme matches CanvasPlannerRouteSelector / CanvasAssistantRouteSelector contract', () => {
    // 守护：node theme must stay byte-identical with the local
    // getHealthDotClass implementations these two pickers used to carry.
    expect(getHealthDotClass('available', 'node')).toBe('bg-emerald-400')
    expect(getHealthDotClass('no_key', 'node')).toBe('bg-amber-400')
    expect(getHealthDotClass('failed', 'node')).toBe('bg-red-400')
    expect(getHealthDotClass('unknown', 'node')).toBe('bg-node-muted/45')
  })
})

describe('getHealthLabelKey', () => {
  it('returns null for undefined status', () => {
    expect(getHealthLabelKey(undefined)).toBeNull()
  })

  it('maps each ApiKeyHealthStatus to its i18n key (no_key → noKey)', () => {
    expect(getHealthLabelKey('available')).toBe('available')
    expect(getHealthLabelKey('failed')).toBe('failed')
    expect(getHealthLabelKey('no_key')).toBe('noKey')
    expect(getHealthLabelKey('unknown')).toBe('unknown')
  })
})
