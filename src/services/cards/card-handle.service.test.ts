import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { allocateHandleForNewCard } from '@/services/cards/card-handle.service'
import type { Prisma } from '@/lib/generated/prisma/client'

function txWith(handles: (string | null)[]) {
  return {
    characterCard: {
      findMany: vi
        .fn()
        .mockResolvedValue(handles.map((handle) => ({ handle }))),
    },
  } as unknown as Prisma.TransactionClient
}

describe('allocateHandleForNewCard', () => {
  it('没人占用就用底子本身', async () => {
    expect(await allocateHandleForNewCard(txWith([]), 'u1', '林夏')).toBe(
      '林夏',
    )
  })

  it('⭐ 已占用（含大小写不同的写法）就加 -2', async () => {
    expect(
      await allocateHandleForNewCard(txWith(['Shiye', null]), 'u1', 'shiye'),
    ).toBe('shiye-2')
  })
})
