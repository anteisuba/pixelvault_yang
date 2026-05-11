import { describe, expect, it } from 'vitest'
import { ownedBy, ownedByClerk } from './db-scope'

describe('db-scope', () => {
  it('ownedBy returns a where fragment keyed by userId', () => {
    expect(ownedBy('user_1')).toEqual({ userId: 'user_1' })
  })

  it('ownedBy can be spread into a larger where clause', () => {
    const where = { ...ownedBy('user_2'), isDeleted: false }
    expect(where).toEqual({ userId: 'user_2', isDeleted: false })
  })

  it('ownedByClerk uses the clerkId key', () => {
    expect(ownedByClerk('clerk_42')).toEqual({ clerkId: 'clerk_42' })
  })
})
