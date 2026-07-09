# 模板 · API route 五段测试

> 抽样来源：`src/app/api/admin/models/route.test.ts`（api-helpers + vi.mock 模式）。五段一个不少：**401 → 400 → service mock → success → 500**。

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createPOST,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/services/<domain>/thing.service', () => ({
  createThing: vi.fn(),
}))

import { POST } from './route'
import { createThing } from '@/services/<domain>/thing.service'

const mockCreateThing = vi.mocked(createThing)
const VALID_BODY = { name: 'x' } // 满足 Zod schema 的最小合法体

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/things', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const res = await POST(createPOST('/api/things', VALID_BODY))
    expect(res.status).toBe(401)
  })

  it('returns 400 on invalid body', async () => {
    mockAuthenticated()
    const res = await POST(createPOST('/api/things', { name: 123 }))
    expect(res.status).toBe(400)
  })

  it('calls service with validated data', async () => {
    mockAuthenticated('clerk_user_1')
    mockCreateThing.mockResolvedValue({ id: 't1' } as never)
    await POST(createPOST('/api/things', VALID_BODY))
    expect(mockCreateThing).toHaveBeenCalledWith('clerk_user_1', VALID_BODY)
  })

  it('returns success payload', async () => {
    mockAuthenticated()
    mockCreateThing.mockResolvedValue({ id: 't1' } as never)
    const res = await POST(createPOST('/api/things', VALID_BODY))
    const json = await parseJSON(res)
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ success: true, data: { id: 't1' } })
  })

  it('returns 500 when service throws', async () => {
    mockAuthenticated()
    mockCreateThing.mockRejectedValue(new Error('boom'))
    const res = await POST(createPOST('/api/things', VALID_BODY))
    expect(res.status).toBe(500)
  })
})
```

要点：mock 放 import 前（vi.mock 提升）· 固定时间/seed 反 flaky · Zod 边界（有效/无效/边界值）在 400 段展开 · service/hook/component 各自的测法见 `references/testing.md`。
