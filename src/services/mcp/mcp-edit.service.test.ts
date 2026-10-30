import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockResolvePicture = vi.fn()
vi.mock('@/features/assistant/workspace.service', () => ({
  resolvePicture: (...args: unknown[]) => mockResolvePicture(...args),
}))

const mockTag = vi.fn()
const mockRevert = vi.fn()
vi.mock('@/services/asset-library-write.service', () => ({
  AssetFolderLimitError: class AssetFolderLimitError extends Error {},
  addAssetsToFolder: vi.fn(),
  createAssetFolder: vi.fn(),
  setAssetFavorites: vi.fn(),
  tagAssets: (...args: unknown[]) => mockTag(...args),
  revertAssistantAssetWrite: (...args: unknown[]) => mockRevert(...args),
}))

const mockProfile = vi.fn()
vi.mock('@/services/assistant-library-write.service', () => ({
  createCharacter: vi.fn(),
  createLook: vi.fn(),
  favoriteLora: vi.fn(),
  findOwnFolder: vi.fn(),
  linkLoraToCharacter: vi.fn(),
  savePrompt: vi.fn(),
  setLoraCover: vi.fn(),
  updatePrompt: vi.fn(),
  writeCharacterProfile: (...args: unknown[]) => mockProfile(...args),
  writeLook: vi.fn(),
}))

import { editForMcp, undoForMcp } from '@/services/mcp/mcp-edit.service'
import { ASSISTANT_NEXT_EDIT_OPS } from '@/features/assistant/constants'
import { MCP_EDIT_OPS } from '@/constants/mcp'

const OWNER = { tokenId: 'tok_1', userId: 'db_user_1', clerkId: 'clerk_1' }

beforeEach(() => vi.clearAllMocks())

describe('MCP edit', () => {
  it('only offers ops the in-app edit knows', () => {
    for (const op of MCP_EDIT_OPS) expect(ASSISTANT_NEXT_EDIT_OPS).toContain(op)
  })

  it('tags their pictures and hands back an undo code that takes it back', async () => {
    mockResolvePicture.mockResolvedValue({
      generationId: 'gen_1',
      url: 'https://cdn.test.com/1.png',
      label: '图_1',
    })
    mockTag.mockResolvedValue({
      entries: [{ assetId: 'gen_1', tags: ['rain'] }],
      skipped: 0,
    })

    const [result] = await editForMcp(OWNER, {
      changes: [{ op: 'tag_pictures', pictures: ['图_1'], tags: ['rain'] }],
    })

    expect(mockTag).toHaveBeenCalledWith('db_user_1', ['gen_1'], ['rain'])
    expect(result).toMatchObject({ op: 'tag_pictures', ok: true })

    mockRevert.mockResolvedValue({ revertedCount: 1, skipped: 0 })
    expect(await undoForMcp(OWNER, { undo: result!.undo! })).toBe('Undone.')
    expect(mockRevert).toHaveBeenCalledWith('db_user_1', {
      tool: 'tag_asset',
      entries: [{ assetId: 'gen_1', tags: ['rain'] }],
    })
  })

  it('refuses pictures that are not theirs without writing', async () => {
    mockResolvePicture.mockResolvedValue(null)

    const [result] = await editForMcp(OWNER, {
      changes: [{ op: 'tag_pictures', pictures: ['图_9'], tags: ['x'] }],
    })

    expect(result).toMatchObject({ ok: false })
    expect(result!.said).toMatch(/图_9: not pictures of theirs/)
    expect(mockTag).not.toHaveBeenCalled()
  })

  it('runs each change on its own', async () => {
    mockProfile.mockResolvedValueOnce({
      ok: false,
      error: 'look of 角色·Mio is pinned',
    })
    mockProfile.mockResolvedValueOnce({
      ok: true,
      payload: {},
      inverse: { kind: 'character_profile', characterId: 'c1' },
      observation: 'Changed 角色·Rin.',
    })

    const results = await editForMcp(OWNER, {
      changes: [
        { op: 'character_profile', character: '角色·Mio', name: 'Mio2' },
        { op: 'character_profile', character: '角色·Rin/冬装', tags: ['a'] },
      ],
    })

    expect(results.map((result) => result.ok)).toEqual([false, true])
    expect(mockProfile.mock.calls[1]![1]).toMatchObject({ character: 'Rin' })
  })

  it('rejects an undo code it did not make', async () => {
    expect(await undoForMcp(OWNER, { undo: 'not-a-code' })).toMatch(
      /not an undo code/,
    )
    expect(mockRevert).not.toHaveBeenCalled()
  })
})
