import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 改库那几种改法（第 4b 步）：认编号、找夹子、交给对的那条写入，认不出就出红行。
 */

const calls = vi.hoisted(() => ({
  rememberMemory: vi.fn(),
  editMemory: vi.fn(),
  forgetMemory: vi.fn(),
  findOwnCharacter: vi.fn(),
  runOldTool: vi.fn(),
  refused: vi.fn(),
  settlePlan: vi.fn(),
  linkLoraToCharacter: vi.fn(),
  findOwnFolder: vi.fn(),
  resolvePicture: vi.fn(),
  writeAssistantSetting: vi.fn(),
  removeSearchSource: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/services/kernel/assistant-v3-bench.service', () => ({
  runOldTool: async function* (...args: unknown[]) {
    calls.runOldTool(...args)
    return { kind: 'result', output: 'Tagged via search_assets.' }
  },
  refused: async function* (...args: unknown[]) {
    calls.refused(...args)
    return { kind: 'result', output: String(args[3]) }
  },
}))
vi.mock('@/services/kernel/assistant-v3-steps.service', () => ({
  settlePlan: async function* (...args: unknown[]) {
    calls.settlePlan(...args)
    return { kind: 'result', output: 'done' }
  },
}))
vi.mock('@/services/assistant-library-write.service', () => ({
  addSearchSource: vi.fn(),
  removeSearchSource: calls.removeSearchSource,
  setChannel: vi.fn(),
  writeAssistantSetting: calls.writeAssistantSetting,
  createCharacter: vi.fn(),
  createLook: vi.fn(),
  favoriteLora: vi.fn(),
  findOwnFolder: calls.findOwnFolder,
  linkLoraToCharacter: calls.linkLoraToCharacter,
  savePrompt: vi.fn(),
  setLoraCover: vi.fn(),
  updatePrompt: vi.fn(),
  writeCharacterProfile: vi.fn(),
  writeLook: vi.fn(),
  rememberMemory: calls.rememberMemory,
  editMemory: calls.editMemory,
  forgetMemory: calls.forgetMemory,
  findOwnCharacter: calls.findOwnCharacter,
}))
vi.mock('@/features/assistant/workspace.service', () => ({
  parseWorkspaceHandle: (raw: string) => {
    const lora = /^LoRA·(.+)$/.exec(raw)
    if (lora) return { kind: 'lora', name: lora[1] }
    const character = /^角色·([^/]+)(?:\/(.+))?$/.exec(raw)
    if (character)
      return {
        kind: 'character',
        name: character[1],
        look: character[2] ?? null,
      }
    return null
  },
  resolvePicture: calls.resolvePicture,
  memoryHandle: (id: string) => `记忆·${id.slice(0, 8)}`,
  memoryIdPrefixOf: (raw: string) =>
    raw.startsWith('记忆·') ? raw.slice(3) : null,
}))

import type { V3Context } from '@/services/kernel/assistant-v3-steps.service'

import { runLibraryChange } from './library'

const context = {
  clerkId: 'clerk-1',
  language: 'chinese',
  prepared: { user: { id: 'user-1' }, persona: { memoryCapture: true } },
  request: { snapshot: {}, mentionedAssets: [] },
  handles: { idOf: () => null },
} as unknown as V3Context

async function run(
  change: Parameters<typeof runLibraryChange>[1],
  on: V3Context = context,
) {
  const steps = runLibraryChange(on, change)
  let next = await steps.next()
  while (!next.done) next = await steps.next()
  return next.value
}

beforeEach(() => {
  vi.clearAllMocks()
  calls.resolvePicture.mockImplementation(async (_owner, raw: string) =>
    /^图_\d+$/.test(raw)
      ? {
          generationId: `gen-${raw.slice(2)}`,
          url: `https://r2/${raw}`,
          label: raw,
        }
      : null,
  )
})

describe('改库：一条改动 → 对的那条写入', () => {
  it('打标签：图_N 认成图，交给旧执行器那条，话里的旧工具名换掉', async () => {
    const outcome = await run({
      op: 'tag_pictures',
      pictures: ['图_1601', '图_1602'],
      tags: ['冬装'],
    })
    expect(calls.runOldTool).toHaveBeenCalledWith(
      context,
      'tag_asset',
      '打标签 冬装',
      { assetIds: ['gen-1601', 'gen-1602'], tags: ['冬装'] },
    )
    expect(outcome).toEqual({ kind: 'result', output: 'Tagged via find.' })
  })

  it('放进文件夹：夹子按名字找到 id 再放', async () => {
    calls.findOwnFolder.mockResolvedValue({
      ok: true,
      id: 'folder-9',
      name: '冬装',
    })
    await run({ op: 'put_in_folder', pictures: ['图_1601'], folder: '冬装' })
    expect(calls.findOwnFolder).toHaveBeenCalledWith('user-1', '冬装')
    expect(calls.runOldTool).toHaveBeenCalledWith(
      context,
      'add_to_folder',
      '放进文件夹「冬装」',
      { assetIds: ['gen-1601'], targetFolderId: 'folder-9' },
    )
  })

  it('LoRA 加到角色的造型：出一步 library_write，带撤销', async () => {
    const inverse = {
      kind: 'lora_to_character',
      characterId: 'card-1',
      loraAssetId: 'lora-1',
      existed: false,
      lookId: null,
    }
    calls.linkLoraToCharacter.mockResolvedValue({
      ok: true,
      payload: {
        kind: 'lora_to_character',
        summary: 'LoRA·ink → 角色·马尔福/冬装',
      },
      inverse,
      observation: 'Added.',
    })
    await run({
      op: 'lora_to_character',
      lora: 'LoRA·ink',
      character: '角色·马尔福/冬装',
    })
    expect(calls.linkLoraToCharacter).toHaveBeenCalledWith(
      { userId: 'user-1', clerkId: 'clerk-1' },
      { lora: 'ink', character: '马尔福', look: '冬装' },
    )
    expect(calls.settlePlan).toHaveBeenCalledWith(
      context,
      'library_write',
      'LoRA 加到角色',
      expect.objectContaining({ kind: 'mutate', inverse }),
    )
  })

  it('认不出的图 / 写不进去：出红行，⛔ 不写', async () => {
    await run({ op: 'tag_pictures', pictures: ['某张图'], tags: ['x'] })
    expect(calls.runOldTool).not.toHaveBeenCalled()
    expect(calls.refused.mock.calls[0]![3]).toContain('某张图')

    calls.linkLoraToCharacter.mockResolvedValue({
      ok: false,
      error: 'not theirs',
    })
    await run({ op: 'lora_to_character', lora: 'x', character: 'y' })
    expect(calls.settlePlan).not.toHaveBeenCalled()
    expect(calls.refused).toHaveBeenLastCalledWith(
      context,
      'library_write',
      'LoRA 加到角色',
      'not theirs',
    )
  })

  it('设置：key 认大小写，来源 value false = 从名单拿掉', async () => {
    const outcome = {
      ok: true,
      payload: { kind: 'assistant', summary: '设置·助手 verbosity：concise' },
      inverse: { kind: 'source_add', ruleId: 'r' },
      observation: 'ok',
    }
    calls.writeAssistantSetting.mockResolvedValue(outcome)
    calls.removeSearchSource.mockResolvedValue(outcome)
    await run({ op: 'assistant_setting', key: 'Verbosity', value: 'concise' })
    expect(calls.writeAssistantSetting).toHaveBeenCalledWith(
      { userId: 'user-1', clerkId: 'clerk-1' },
      { key: 'verbosity', value: 'concise' },
    )
    await run({ op: 'search_source', url: 'pinterest.com', value: false })
    expect(calls.removeSearchSource).toHaveBeenCalledWith(
      { userId: 'user-1', clerkId: 'clerk-1' },
      { site: 'pinterest.com' },
    )
    await run({ op: 'assistant_setting', key: 'api_key', value: 'x' })
    expect(calls.refused.mock.calls.at(-1)![3]).toContain('needs key')
  })
})

describe('记忆（第 6 步）', () => {
  const written = {
    ok: true,
    payload: { kind: 'new_memory', summary: '记下了' },
    inverse: { kind: 'new_memory', memoryId: 'm-1' },
    observation: 'ok',
  }

  it('没给角色：记进「关于你」', async () => {
    calls.rememberMemory.mockResolvedValue(written)
    await run({ op: 'remember', text: '人物图默认 3:4' })
    const [, input] = calls.rememberMemory.mock.calls[0]!
    expect(input.text).toBe('人物图默认 3:4')
    expect(input.target).toEqual({ characterCardId: null, label: '关于你' })
    expect(calls.settlePlan).toHaveBeenCalledWith(
      context,
      'library_write',
      '记忆',
      expect.objectContaining({ kind: 'mutate', inverse: written.inverse }),
    )
  })

  it('和角色聊天时没给角色：记进正在聊的那位', async () => {
    calls.rememberMemory.mockResolvedValue(written)
    const chatting = {
      ...context,
      prepared: {
        ...context.prepared,
        persona: {
          memoryCapture: true,
          name: null,
          characterCardId: 'card-7',
          promptCharacter: {
            name: '马尔福',
            identity: '',
            behavior: '',
            speech: '',
            catchphrases: [],
            backstory: '',
          },
          roleplay: { scenario: '', opening: '', examples: [] },
        },
      },
    } as unknown as V3Context
    await run({ op: 'remember', text: '约好下周去霍格莫德' }, chatting)
    expect(calls.rememberMemory.mock.calls[0]![1].target).toEqual({
      characterCardId: 'card-7',
      label: '马尔福',
    })
  })

  it('给了角色：记进她自己那份；认不出的角色不退成「关于你」', async () => {
    calls.rememberMemory.mockResolvedValue(written)
    calls.findOwnCharacter.mockImplementation(async (_user, name: string) =>
      name === '马尔福' ? { id: 'card-7', name: '马尔福' } : null,
    )
    await run({ op: 'remember', text: '冬装', character: '角色·马尔福' })
    expect(calls.rememberMemory.mock.calls[0]![1].target).toEqual({
      characterCardId: 'card-7',
      label: '马尔福',
    })
    await run({ op: 'remember', text: '冬装', character: '角色·谁' })
    expect(calls.rememberMemory).toHaveBeenCalledTimes(1)
    expect(calls.refused).toHaveBeenCalled()
  })

  it('按编号改、value false 忘掉', async () => {
    calls.editMemory.mockResolvedValue(written)
    calls.forgetMemory.mockResolvedValue(written)
    await run({ op: 'remember', memory: '记忆·3f9a1c2b', text: '人物图 2:3' })
    expect(calls.editMemory.mock.calls[0]![1].ref).toEqual({
      idPrefix: '3f9a1c2b',
      text: '记忆·3f9a1c2b',
    })
    await run({ op: 'remember', memory: '记忆·3f9a1c2b', value: false })
    expect(calls.forgetMemory).toHaveBeenCalledTimes(1)
  })

  it('隐身一条都不碰；「让助手记住」关着不记新的、忘掉照样行', async () => {
    const incognito = {
      ...context,
      request: { ...context.request, incognito: true },
    } as unknown as V3Context
    await run({ op: 'remember', text: 'x' }, incognito)
    await run(
      { op: 'remember', memory: '记忆·3f9a1c2b', value: false },
      incognito,
    )
    expect(calls.rememberMemory).not.toHaveBeenCalled()
    expect(calls.forgetMemory).not.toHaveBeenCalled()

    const paused = {
      ...context,
      prepared: { ...context.prepared, persona: { memoryCapture: false } },
    } as unknown as V3Context
    calls.forgetMemory.mockResolvedValue(written)
    await run({ op: 'remember', text: 'x' }, paused)
    expect(calls.rememberMemory).not.toHaveBeenCalled()
    await run({ op: 'remember', memory: '记忆·3f9a1c2b', value: false }, paused)
    expect(calls.forgetMemory).toHaveBeenCalledTimes(1)
  })
})
