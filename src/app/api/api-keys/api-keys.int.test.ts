/**
 * L2a 真库：key 的整套接口（存 → 列 → 改 → 验 → 删）。只假边界：Clerk 登录、
 * 服务商那一头的网络（`fetch` + DNS）。服务、加解密、数据库全真。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('node:dns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:dns')>()
  return {
    ...actual,
    promises: {
      ...actual.promises,
      lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    },
  }
})

import {
  createDELETE,
  createGET,
  createPOST,
  createPUT,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { GET, POST } from '@/app/api/api-keys/route'
import { DELETE, PUT } from '@/app/api/api-keys/[id]/route'
import { POST as VERIFY } from '@/app/api/api-keys/[id]/verify/route'
import { decryptApiKey } from '@/lib/crypto'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'

type Envelope<T> = { success: boolean; data?: T; error?: string }
type KeyRow = {
  id: string
  label: string
  maskedKey: string
  isActive: boolean
}

const KEY_VALUE = 'sk-int-test-1234567890'
const BODY = {
  adapterType: 'deepseek',
  providerConfig: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com' },
  modelId: 'deepseek',
  label: '我的 DeepSeek',
  keyValue: KEY_VALUE,
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  vi.unstubAllGlobals()
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  mockAuthenticated(me.clerkId)
})

async function createKey(): Promise<KeyRow> {
  const res = await POST(createPOST('/api/api-keys', BODY))
  const body = await parseJSON<Envelope<KeyRow>>(res)
  expect(body.success, body.error).toBe(true)
  return body.data!
}

describe('key 接口（真库）', () => {
  it('没登录一律 401，库里什么都不写', async () => {
    mockUnauthenticated()
    expect((await GET(createGET('/api/api-keys'))).status).toBe(401)
    expect((await POST(createPOST('/api/api-keys', BODY))).status).toBe(401)
    expect(await db.userApiKey.count()).toBe(0)
  })

  it('缺字段 400，库里什么都不写', async () => {
    const res = await POST(createPOST('/api/api-keys', { label: 'x' }))
    expect(res.status).toBe(400)
    expect(await db.userApiKey.count()).toBe(0)
  })

  it('存进去是加密的；列出来只给打码，不给原文', async () => {
    const created = await createKey()

    const row = await db.userApiKey.findUniqueOrThrow({
      where: { id: created.id },
    })
    expect(row.userId).toBe(me.id)
    expect(row.encryptedKey).not.toContain(KEY_VALUE)
    expect(decryptApiKey(row.encryptedKey)).toBe(KEY_VALUE)

    const listed = await parseJSON<Envelope<KeyRow[]>>(
      await GET(createGET('/api/api-keys')),
    )
    expect(listed.data?.map((key) => key.id)).toEqual([created.id])
    expect(JSON.stringify(listed)).not.toContain(KEY_VALUE)
  })

  it('同一家同一型号再存一次是覆盖，不多一行', async () => {
    await createKey()
    await POST(
      createPOST('/api/api-keys', {
        ...BODY,
        keyValue: 'sk-int-new-0987654321',
      }),
    )
    const rows = await db.userApiKey.findMany({ where: { userId: me.id } })
    expect(rows).toHaveLength(1)
    expect(decryptApiKey(rows[0].encryptedKey)).toBe('sk-int-new-0987654321')
  })

  it('改名、停用落库；别人的 key 改不动', async () => {
    const created = await createKey()
    const res = await PUT(
      createPUT(`/api/api-keys/${created.id}`, {
        label: '换个名',
        isActive: false,
      }),
      params(created.id),
    )
    expect(res.status).toBe(200)
    const row = await db.userApiKey.findUniqueOrThrow({
      where: { id: created.id },
    })
    expect(row).toMatchObject({ label: '换个名', isActive: false })

    mockAuthenticated(other.clerkId)
    const stolen = await PUT(
      createPUT(`/api/api-keys/${created.id}`, { label: '偷改' }),
      params(created.id),
    )
    expect(stolen.status).toBeGreaterThanOrEqual(400)
    expect(
      (await db.userApiKey.findUniqueOrThrow({ where: { id: created.id } }))
        .label,
    ).toBe('换个名')
  })

  it('删掉就没了；别人的 key 删不掉', async () => {
    const created = await createKey()

    mockAuthenticated(other.clerkId)
    const stolen = await DELETE(
      createDELETE(`/api/api-keys/${created.id}`),
      params(created.id),
    )
    expect(stolen.status).toBeGreaterThanOrEqual(400)
    expect(await db.userApiKey.count({ where: { id: created.id } })).toBe(1)

    mockAuthenticated(me.clerkId)
    const res = await DELETE(
      createDELETE(`/api/api-keys/${created.id}`),
      params(created.id),
    )
    expect(res.status).toBe(200)
    expect(
      await db.userApiKey.count({ where: { id: created.id, isActive: true } }),
    ).toBe(0)
  })

  it('验 key：真解密后带着原文去问服务商；服务商拒了就报失败', async () => {
    const created = await createKey()
    const seen: Array<{ url: string; auth: string | null }> = []
    let status = 200
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        seen.push({
          url,
          auth: new Headers(init?.headers).get('authorization'),
        })
        return new Response('{}', { status })
      }),
    )

    const ok = await parseJSON<Envelope<{ status: string }>>(
      await VERIFY(
        createPOST(`/api/api-keys/${created.id}/verify`, {}),
        params(created.id),
      ),
    )
    expect(ok.data?.status).toBe('available')
    expect(seen[0]).toEqual({
      url: 'https://api.deepseek.com/models',
      auth: `Bearer ${KEY_VALUE}`,
    })

    status = 401
    const rejected = await parseJSON<Envelope<{ status: string }>>(
      await VERIFY(
        createPOST(`/api/api-keys/${created.id}/verify`, {}),
        params(created.id),
      ),
    )
    expect(rejected.data?.status).toBe('failed')

    mockAuthenticated(other.clerkId)
    const stolen = await VERIFY(
      createPOST(`/api/api-keys/${created.id}/verify`, {}),
      params(created.id),
    )
    expect(stolen.status).toBe(403)
  })
})
