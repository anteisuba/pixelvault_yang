/**
 * L2a 真库：外部 AI 的查（find）、看（look）、改库（edit / undo）。
 * 走站内助手同一层工作区与写库函数；只假边界：看图时经 CDN 取缩略图那一跳（fetch）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { ASSISTANT_NEXT_EDIT_OPS } from '@/features/assistant/server'
import { ASSISTANT_NEXT_FIND_KINDS } from '@/features/assistant/server'
import {
  MCP_EDIT_OPS,
  MCP_FIND_KINDS,
  MCP_LOOK_MAX_PICTURES,
} from '@/constants/mcp'
import { db } from '@/lib/db'
import { buildGenerationTag } from '@/lib/generation-name'
import { editForMcp, undoForMcp } from '@/services/mcp/mcp-edit.service'
import { findForMcp, lookForMcp } from '@/services/mcp/mcp-library.service'
import type { McpTokenOwner } from '@/services/mcp/mcp-token.service'
import { createTestUser, resetDatabase } from '@/test/int/db'

const CDN = 'https://cdn.test.example'
let owner: McpTokenOwner
let fetched: string[]

async function seedPicture(userId: string, seq: number, prompt = 'a fox') {
  const row = await db.generation.create({
    data: {
      userId,
      seq,
      url: `${CDN}/${seq}.png`,
      storageKey: `${seq}.png`,
      prompt,
      model: 'seedream-5.0-lite',
      provider: 'fal',
      snapshot: {},
    },
  })
  return { row, tag: buildGenerationTag({ seq, outputType: 'IMAGE' })! }
}

async function tagsOf(id: string): Promise<unknown> {
  const row = await db.generation.findUniqueOrThrow({ where: { id } })
  return (row.snapshot as { tags?: unknown } | null)?.tags ?? []
}

beforeEach(async () => {
  await resetDatabase()
  vi.stubEnv('NEXT_PUBLIC_STORAGE_BASE_URL', CDN)
  fetched = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      fetched.push(String(url))
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'image/jpeg' },
      })
    }),
  )
  const user = await createTestUser()
  owner = {
    tokenId: 'tok_1',
    userId: user.id,
    clerkId: user.clerkId,
    access: 'generate',
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('MCP edit', () => {
  it('只开放站内 edit 认得的改法', () => {
    for (const op of MCP_EDIT_OPS) expect(ASSISTANT_NEXT_EDIT_OPS).toContain(op)
  })

  it('给她的图打标签，回一个撤销码；撤销后标签摘掉', async () => {
    const { row, tag } = await seedPicture(owner.userId, 1)

    const [result] = await editForMcp(owner, {
      changes: [{ op: 'tag_pictures', pictures: [tag], tags: ['rain'] }],
    })

    expect(result).toMatchObject({ op: 'tag_pictures', ok: true })
    expect(await tagsOf(row.id)).toEqual(['rain'])

    expect(await undoForMcp(owner, { undo: result!.undo! })).toBe('Undone.')
    expect(await tagsOf(row.id)).toEqual([])
  })

  it('⛔ 一次超过 5 个标签：拒并说上限，一个都不打（与站内同一条，11-10）', async () => {
    const { row, tag } = await seedPicture(owner.userId, 2)

    const [result] = await editForMcp(owner, {
      changes: [
        {
          op: 'tag_pictures',
          pictures: [tag],
          tags: ['a', 'b', 'c', 'd', 'e', 'f'],
        },
      ],
    })

    expect(result).toMatchObject({ op: 'tag_pictures', ok: false })
    expect(result!.said).toContain('At most 5 tags at a time')
    expect(await tagsOf(row.id)).toEqual([])
  })

  it('不是她的图：拒，库里不动', async () => {
    const stranger = await createTestUser()
    const { row, tag } = await seedPicture(stranger.id, 9)

    const [result] = await editForMcp(owner, {
      changes: [{ op: 'tag_pictures', pictures: [tag], tags: ['x'] }],
    })

    expect(result).toMatchObject({ ok: false })
    expect(result!.said).toContain(`${tag}: not pictures of theirs`)
    expect(await tagsOf(row.id)).toEqual([])
  })

  it('每条各自成败：一条找不到角色，另一条照样改上', async () => {
    const rin = await db.characterCard.create({
      data: { userId: owner.userId, name: 'Rin' },
    })

    const results = await editForMcp(owner, {
      changes: [
        { op: 'character_profile', character: '角色·Nobody', name: 'X' },
        { op: 'character_profile', character: '角色·Rin/冬装', tags: ['a'] },
      ],
    })

    expect(results.map((result) => result.ok)).toEqual([false, true])
    expect(
      (await db.characterCard.findUniqueOrThrow({ where: { id: rin.id } }))
        .tags,
    ).toEqual(['a'])
  })

  it('不是它发的撤销码：拒', async () => {
    expect(await undoForMcp(owner, { undo: 'not-a-code' })).toMatch(
      /not an undo code/,
    )
  })
})

describe('MCP find', () => {
  it('只开放站内 find 认得的种类', () => {
    for (const kind of MCP_FIND_KINDS)
      expect(ASSISTANT_NEXT_FIND_KINDS).toContain(kind)
  })

  it('默认搜她自己的图与角色，别人的搜不到', async () => {
    const { tag } = await seedPicture(owner.userId, 1, 'Mio walking in rain')
    await db.characterCard.create({
      data: { userId: owner.userId, name: 'Mio' },
    })
    const stranger = await createTestUser()
    await db.characterCard.create({
      data: { userId: stranger.id, name: 'Mio Stranger' },
    })

    const text = await findForMcp(owner, { query: 'Mio' })

    expect(text).toContain(tag)
    expect(text).toContain('角色·Mio')
    expect(text).not.toContain('Mio Stranger')
  })
})

describe('MCP look', () => {
  it('逐个打开，图按缩略宽度经 CDN 取；认不出的说找不到', async () => {
    const { tag } = await seedPicture(owner.userId, 1)

    const parts = await lookForMcp(owner, { names: [tag, 'ref-1'] })

    expect(parts[0]!.text).toContain(tag)
    expect(parts[0]!.frames).toEqual([
      { label: tag, ok: true, mimeType: 'image/jpeg', base64: 'AQID' },
    ])
    expect(fetched).toHaveLength(1)
    expect(fetched[0]).toContain('width=512')
    expect(fetched[0]).toContain(`${CDN}/1.png`)
    expect(parts[1]!.text).toMatch(/ref-1: not found/)
    expect(parts[1]!.frames).toEqual([])
  })

  it('跨名字合计最多回几张图', async () => {
    const tags: string[] = []
    for (let seq = 1; seq <= MCP_LOOK_MAX_PICTURES + 1; seq++)
      tags.push((await seedPicture(owner.userId, seq)).tag)

    const parts = await lookForMcp(owner, { names: tags })

    expect(parts.flatMap((part) => part.frames)).toHaveLength(
      MCP_LOOK_MAX_PICTURES,
    )
    expect(parts.at(-1)!.frames).toHaveLength(0)
  })
})
