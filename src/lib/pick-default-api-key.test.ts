import { describe, expect, it } from 'vitest'

import { pickDefaultApiKey } from '@/lib/pick-default-api-key'

const key = (id: string, day: number, isDefault = false) => ({
  id,
  isDefault,
  createdAt: new Date(Date.UTC(2026, 10, day)),
})

describe('pickDefaultApiKey', () => {
  it('标过默认的那把优先，哪怕它更旧', () => {
    expect(pickDefaultApiKey([key('new', 10), key('old', 1, true)])?.id).toBe(
      'old',
    )
  })

  it('没人标过：最新的那把', () => {
    expect(pickDefaultApiKey([key('old', 1), key('new', 10)])?.id).toBe('new')
  })

  it('接口回来的日期是字符串也照样比', () => {
    const fromJson = [
      { id: 'old', isDefault: false, createdAt: '2026-11-01T00:00:00Z' },
      { id: 'new', isDefault: false, createdAt: '2026-11-10T00:00:00Z' },
    ] as unknown as ReturnType<typeof key>[]
    expect(pickDefaultApiKey(fromJson)?.id).toBe('new')
  })

  it('空组：没有默认', () => {
    expect(pickDefaultApiKey([])).toBeUndefined()
  })
})
