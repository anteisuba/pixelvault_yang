import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const store = vi.hoisted(() => ({
  grantAggregate: vi.fn(),
  grantUpsert: vi.fn(),
  grantCreate: vi.fn(),
  ledgerAggregate: vi.fn(),
  userFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  isAdmin: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    creditGrant: {
      aggregate: store.grantAggregate,
      upsert: store.grantUpsert,
      create: store.grantCreate,
    },
    apiUsageLedger: { aggregate: store.ledgerAggregate },
    user: {
      findUnique: store.userFindUnique,
      findFirst: store.userFindFirst,
    },
  },
}))

vi.mock('@/lib/admin', () => ({ isAdmin: store.isAdmin }))

import { CREDIT_LIMITS, USAGE_FUNDING } from '@/constants/credits'
import { Prisma } from '@/lib/generated/prisma/client'
import {
  assertCreditsLeft,
  CreditsExhaustedError,
  getCreditBalance,
  grantCredits,
} from '@/services/credits.service'

function seed(granted: number | null, spent: number | null) {
  store.grantAggregate.mockResolvedValue({
    _sum: { points: granted === null ? null : new Prisma.Decimal(granted) },
  })
  store.ledgerAggregate.mockResolvedValue({
    _sum: { points: spent === null ? null : new Prisma.Decimal(spent) },
  })
}

describe('credits.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    store.userFindUnique.mockResolvedValue({ clerkId: 'clerk_1' })
    store.isAdmin.mockReturnValue(false)
  })

  it('余额 = 送的 − 平台出钱花掉的；只数 funding=platform（自己 key 只记不扣）', async () => {
    seed(100, 12.345)

    const balance = await getCreditBalance('u1')

    expect(balance).toEqual({
      grantedPoints: 100,
      spentPoints: 12.345,
      balancePoints: 87.655,
      exempt: false,
    })
    expect(store.ledgerAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', funding: USAGE_FUNDING.platform },
      }),
    )
  })

  it('读余额顺手补注册礼：每人一次，靠 dedupeKey 去重', async () => {
    seed(null, null)

    await getCreditBalance('u1')

    expect(store.grantUpsert).toHaveBeenCalledWith({
      where: { dedupeKey: 'signup:u1' },
      create: expect.objectContaining({
        userId: 'u1',
        points: CREDIT_LIMITS.signupGrantPoints,
        dedupeKey: 'signup:u1',
      }),
      update: {},
    })
  })

  it('花光了 → CreditsExhaustedError（402），admin 照样放行', async () => {
    seed(100, 100.4)
    await expect(assertCreditsLeft('u1')).rejects.toBeInstanceOf(
      CreditsExhaustedError,
    )
    await expect(assertCreditsLeft('u1')).rejects.toMatchObject({
      httpStatus: 402,
    })

    store.isAdmin.mockReturnValue(true)
    await expect(assertCreditsLeft('u1')).resolves.toBeUndefined()
  })

  it('admin 送点：按邮箱或用户名找人（不分大小写），记 owner_gift', async () => {
    seed(150, 0)
    store.userFindFirst.mockResolvedValue({
      id: 'u2',
      displayName: null,
      username: 'friend',
    })

    const result = await grantCredits({
      recipient: '  Friend@Example.com ',
      points: 50,
      note: 'trial',
      grantedByUserId: 'owner',
    })

    expect(store.userFindFirst.mock.calls[0]?.[0]).toMatchObject({
      where: {
        OR: [
          { email: { equals: 'Friend@Example.com', mode: 'insensitive' } },
          { username: { equals: 'Friend@Example.com', mode: 'insensitive' } },
        ],
      },
    })
    expect(store.grantCreate).toHaveBeenCalledWith({
      data: {
        userId: 'u2',
        points: 50,
        reason: 'owner_gift',
        note: 'trial',
        grantedBy: 'owner',
      },
    })
    expect(result).toMatchObject({
      userId: 'u2',
      displayName: 'friend',
      balance: { balancePoints: 150 },
    })
  })

  it('找不到人 → 404，⛔ 不建 grant', async () => {
    store.userFindFirst.mockResolvedValue(null)

    await expect(
      grantCredits({ recipient: 'nobody', points: 5, grantedByUserId: 'o' }),
    ).rejects.toMatchObject({ httpStatus: 404 })
    expect(store.grantCreate).not.toHaveBeenCalled()
  })
})
