import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFindInWorkspace = vi.fn()
const mockOpen = vi.fn()
vi.mock('@/features/assistant/workspace.service', async (importOriginal) => ({
  // ⚠ 认编号用真的；只替换会查库的两个。
  parseWorkspaceHandle: (
    await importOriginal<
      typeof import('@/features/assistant/workspace.service')
    >()
  ).parseWorkspaceHandle,
  findInWorkspace: (...args: unknown[]) => mockFindInWorkspace(...args),
  openWorkspaceHandle: (...args: unknown[]) => mockOpen(...args),
}))

const mockFetchFrame = vi.fn()
vi.mock('@/services/video-frames/edge-frame.service', () => ({
  fetchEdgeFrame: (...args: unknown[]) => mockFetchFrame(...args),
}))

vi.mock('@/lib/video-poster', () => ({
  getImagePreviewUrl: (url: string, width: number) => `${url}?w=${width}`,
}))

import { findForMcp, lookForMcp } from '@/services/mcp/mcp-library.service'
import { MCP_FIND_KINDS, MCP_LOOK_MAX_PICTURES } from '@/constants/mcp'
import { ASSISTANT_NEXT_FIND_KINDS } from '@/features/assistant/constants'

const OWNER = {
  tokenId: 'tok_1',
  userId: 'db_user_1',
  clerkId: 'clerk_1',
  access: 'generate' as const,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchFrame.mockImplementation(async (plan: { label: string }) => ({
    label: plan.label,
    ok: true,
    mimeType: 'image/jpeg',
    base64: 'AAA',
  }))
})

describe('MCP find', () => {
  it('only offers kinds the in-app find knows', () => {
    for (const kind of MCP_FIND_KINDS)
      expect(ASSISTANT_NEXT_FIND_KINDS).toContain(kind)
  })

  it('searches their own kinds by default, never incognito', async () => {
    mockFindInWorkspace.mockResolvedValue({ text: 'PICTURES: none found' })

    const text = await findForMcp(OWNER, { query: 'Mio' })

    expect(mockFindInWorkspace).toHaveBeenCalledWith(
      { userId: 'db_user_1', clerkId: 'clerk_1', incognito: false },
      'Mio',
      expect.arrayContaining(['pictures', 'characters', 'loras', 'prompts']),
    )
    expect(mockFindInWorkspace.mock.calls[0]![2]).not.toContain('tags')
    expect(text).toContain('PICTURES: none found')
  })
})

describe('MCP look', () => {
  it('opens each name on its own and says which could not be found', async () => {
    mockOpen.mockResolvedValueOnce({
      text: '角色·Mio · looks: 默认',
      pictures: [{ url: 'https://cdn.test.com/a.png', label: '角色·Mio' }],
    })

    const parts = await lookForMcp(OWNER, {
      names: ['角色·Mio', 'ref-1'],
    })

    expect(mockOpen).toHaveBeenCalledTimes(1)
    expect(parts[0]!.text).toContain('角色·Mio')
    expect(mockFetchFrame).toHaveBeenCalledWith({
      label: '角色·Mio',
      url: 'https://cdn.test.com/a.png?w=512',
    })
    expect(parts[1]!.text).toMatch(/ref-1: not found/)
    expect(parts[1]!.frames).toEqual([])
  })

  it('caps how many pictures come back across names', async () => {
    const many = Array.from({ length: MCP_LOOK_MAX_PICTURES }, (_, i) => ({
      url: `https://cdn.test.com/${i}.png`,
      label: `图_${i}`,
    }))
    mockOpen.mockResolvedValue({ text: 'x', pictures: many })

    const parts = await lookForMcp(OWNER, { names: ['图_1', '图_2'] })

    expect(parts[0]!.frames).toHaveLength(MCP_LOOK_MAX_PICTURES)
    expect(parts[1]!.frames).toHaveLength(0)
  })
})
