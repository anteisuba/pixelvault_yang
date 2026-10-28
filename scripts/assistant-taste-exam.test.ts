import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ db: {} }))

import { parseCliArgs } from './assistant-taste-exam'

describe('assistant-taste-exam CLI', () => {
  it('reads --clerk and --limit', () => {
    expect(parseCliArgs(['--clerk', 'user_1', '--limit', '6'])).toEqual({
      clerkId: 'user_1',
      limit: 6,
    })
  })

  it('defaults the limit and requires a clerk id', () => {
    expect(parseCliArgs(['--clerk', 'user_1']).limit).toBe(20)
    expect(() => parseCliArgs([])).toThrow('--clerk')
  })

  it('refuses unknown flags and out-of-range limits', () => {
    expect(() => parseCliArgs(['--clerk', 'u', '--apply'])).toThrow(
      'Unknown argument',
    )
    expect(() => parseCliArgs(['--clerk', 'u', '--limit', '500'])).toThrow(
      '--limit',
    )
  })
})
