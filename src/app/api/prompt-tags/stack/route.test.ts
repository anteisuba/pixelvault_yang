import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(async () => ({ success: true, remaining: 10 })),
}))
vi.mock('@/services/prompts/prompt-tag-stack.service', () => ({
  getPromptTagStack: vi.fn(),
  savePromptTagStack: vi.fn(),
}))

import { auth } from '@clerk/nextjs/server'
import {
  getPromptTagStack,
  savePromptTagStack,
} from '@/services/prompts/prompt-tag-stack.service'

import { GET, PUT } from './route'

const URL = 'http://localhost/api/prompt-tags/stack'
const put = (body: unknown) =>
  new NextRequest(URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
const selection = {
  id: 's1',
  tagId: 'danbooru:smile',
  promptText: 'smile',
  label: 'smile',
  polarity: 'positive',
  source: 'danbooru',
  type: 'character_trait',
  enabled: true,
  orderIndex: 0,
  insertedAt: '2026-10-01T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ userId: 'user-1' } as Awaited<
    ReturnType<typeof auth>
  >)
})

describe('prompt tag stack API', () => {
  it('rejects anonymous requests', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as Awaited<
      ReturnType<typeof auth>
    >)
    expect((await GET(new NextRequest(URL))).status).toBe(401)
    expect((await PUT(put({ positive: [], negative: [] }))).status).toBe(401)
    expect(getPromptTagStack).not.toHaveBeenCalled()
    expect(savePromptTagStack).not.toHaveBeenCalled()
  })

  it('returns null when the account has never saved one', async () => {
    vi.mocked(getPromptTagStack).mockResolvedValue(null)
    const res = await GET(new NextRequest(URL))
    expect(await res.json()).toMatchObject({
      success: true,
      data: { stack: null },
    })
  })

  it('saves the whole stack for the signed-in user', async () => {
    const res = await PUT(put({ positive: [selection], negative: [] }))
    expect(res.status).toBe(200)
    expect(savePromptTagStack).toHaveBeenCalledWith('user-1', {
      positive: [selection],
      negative: [],
    })
  })

  it('rejects a stack over the size limit or with a bad entry', async () => {
    const many = Array.from({ length: 201 }, (_, i) => ({
      ...selection,
      id: `s${i}`,
    }))
    expect((await PUT(put({ positive: many, negative: [] }))).status).toBe(400)
    expect(
      (
        await PUT(
          put({ positive: [{ ...selection, polarity: 'x' }], negative: [] }),
        )
      ).status,
    ).toBe(400)
    expect(savePromptTagStack).not.toHaveBeenCalled()
  })
})
