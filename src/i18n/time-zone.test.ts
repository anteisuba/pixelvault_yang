import { describe, expect, it } from 'vitest'

import { validTimeZone } from './time-zone'

describe('validTimeZone', () => {
  it('认得的时区原样收下，乱写的不收', () => {
    expect(validTimeZone('Asia/Tokyo')).toBe('Asia/Tokyo')
    expect(validTimeZone('Not/AZone')).toBeUndefined()
    expect(validTimeZone(undefined)).toBeUndefined()
  })
})
