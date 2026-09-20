import { describe, it, expect } from 'vitest'

import { getHealthDotClass, getHealthLabelKey } from '@/lib/health-status-utils'

describe('getHealthDotClass', () => {
  it('returns transparent for undefined status', () => {
    expect(getHealthDotClass(undefined)).toBe('bg-transparent')
    expect(getHealthDotClass(undefined, 'default')).toBe('bg-transparent')
    expect(getHealthDotClass(undefined, 'node')).toBe('bg-transparent')
  })

  it('returns default theme status tokens', () => {
    expect(getHealthDotClass('available')).toBe('bg-status-applied')
    expect(getHealthDotClass('no_key')).toBe('bg-status-warning')
    expect(getHealthDotClass('failed')).toBe('bg-status-risk')
    expect(getHealthDotClass('unknown')).toBe('bg-muted-foreground/40')
  })

  it('returns node theme status tokens + node-muted', () => {
    expect(getHealthDotClass('available', 'node')).toBe('bg-status-applied')
    expect(getHealthDotClass('no_key', 'node')).toBe('bg-status-warning')
    expect(getHealthDotClass('failed', 'node')).toBe('bg-status-risk')
    expect(getHealthDotClass('unknown', 'node')).toBe('bg-node-muted/45')
  })

  it('default theme matches the key health dot HEALTH_COLORS contract', () => {
    // 守护：default theme must stay byte-identical with
    // the key health dot rendered by /settings/keys.
    // If you change either, change both.
    expect(getHealthDotClass('available')).toBe('bg-status-applied')
    expect(getHealthDotClass('no_key')).toBe('bg-status-warning')
    expect(getHealthDotClass('failed')).toBe('bg-status-risk')
    expect(getHealthDotClass('unknown')).toBe('bg-muted-foreground/40')
  })

  it('node theme matches CanvasAssistantRouteSelector contract', () => {
    // 守护：node theme must stay byte-identical with the local
    // getHealthDotClass implementation CanvasAssistantRouteSelector used to carry.
    expect(getHealthDotClass('available', 'node')).toBe('bg-status-applied')
    expect(getHealthDotClass('no_key', 'node')).toBe('bg-status-warning')
    expect(getHealthDotClass('failed', 'node')).toBe('bg-status-risk')
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
