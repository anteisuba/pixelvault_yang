import { describe, expect, it } from 'vitest'

import { composeShotSpecPrompt, resolveShotLook } from '@/lib/shot-spec-prompt'

describe('composeShotSpecPrompt', () => {
  it('returns the prompt untouched when no column is filled', () => {
    expect(composeShotSpecPrompt('她在雨里回头', undefined, undefined)).toBe(
      '她在雨里回头',
    )
    expect(composeShotSpecPrompt('她在雨里回头', {}, {})).toBe('她在雨里回头')
  })

  it('appends size, movement and look after the body', () => {
    expect(
      composeShotSpecPrompt(
        '她在雨里回头  ',
        { size: 'close_up', move: '缓慢推近' },
        { look: '冷蓝夜色，霓虹反光' },
      ),
    ).toBe(
      '她在雨里回头\n\nShot size: close-up.\nCamera movement: 缓慢推近.\nLook: 冷蓝夜色，霓虹反光.',
    )
  })

  it('prefers the shot look over the film look', () => {
    expect(resolveShotLook({ look: '暖黄' }, { look: '冷蓝' })).toBe('暖黄')
    expect(resolveShotLook({}, { look: '冷蓝' })).toBe('冷蓝')
  })

  it('still sends the columns when the body is empty', () => {
    expect(composeShotSpecPrompt('', { size: 'wide' }, undefined)).toBe(
      'Shot size: wide shot.',
    )
  })
})
