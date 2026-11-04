/**
 * 改库那几种改法（第 4b 步）：认编号、找夹子、交给对的那条写入，认不出就出红行。
 * 真库（L2a）：真开一轮（`prepareOperatorTurn`）→ 真 `runLibraryChange` → 断言库里的行与这一步的结果。
 * ⛔ 不调模型（这里不跑主循环）。各写入自己的「做 → 撤」在 assistant-library-write.service*.int.test.ts。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type { AssistantOperatorEvent } from '@/types/assistant-operator'
import { db } from '@/lib/db'
import type { V3Context } from '@/features/assistant/services/assistant-v3-steps.service'
import {
  drainSteps,
  openBenchTurn,
  type BenchRequest,
} from '@/test/assistant-bench/turn'
import { createTestCard, createTestGeneration } from '@/test/int/cards'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'

import { runLibraryChange } from './library'

let owner = { userId: '', clerkId: '' }

beforeEach(async () => {
  await resetDatabase()
  const user = await createTestUser()
  owner = { userId: user.id, clerkId: user.clerkId }
  await seedAssistantKey(user.id)
})

function turn(request: Partial<BenchRequest> = {}) {
  return openBenchTurn(owner.clerkId, { domain: 'image', ...request })
}

async function run(
  change: Parameters<typeof runLibraryChange>[1],
  on?: V3Context,
) {
  const context = on ?? (await turn())
  const { events, value } = await drainSteps(runLibraryChange(context, change))
  const steps = events.flatMap((event: AssistantOperatorEvent) =>
    event.type === 'step' ? [event.step] : [],
  )
  const confirms = events.flatMap((event: AssistantOperatorEvent) =>
    event.type === 'confirm' ? [event.confirm] : [],
  )
  return { value, steps, confirms, context }
}

function picture(seq: number, userId = owner.userId) {
  return createTestGeneration(userId, {
    seq,
    url: `https://cdn.test/${seq}.png`,
    outputType: 'IMAGE',
    snapshot: {},
  })
}

async function tagsOf(id: string) {
  const row = await db.generation.findUniqueOrThrow({ where: { id } })
  return (row.snapshot as { tags?: string[] } | null)?.tags ?? []
}

function memories() {
  return db.assistantMemory.findMany({
    where: { userId: owner.userId },
    orderBy: { createdAt: 'asc' },
  })
}

describe('改库：一条改动 → 对的那条写入', () => {
  it('打标签：图_N 认成图，标签真落进那两张，话里的旧工具名换掉', async () => {
    const first = await picture(1601)
    const second = await picture(1602)
    const { value, steps } = await run({
      op: 'tag_pictures',
      pictures: ['图_1601', '图_1602'],
      tags: ['冬装'],
    })
    expect(await tagsOf(first.id)).toEqual(['冬装'])
    expect(await tagsOf(second.id)).toEqual(['冬装'])
    expect(steps.at(-1)).toMatchObject({
      tool: 'tag_asset',
      title: '打标签 冬装',
      status: 'done',
    })
    expect(value.kind === 'result' && value.output).not.toMatch(
      /search_assets|search_library/,
    )
  })

  it('放进文件夹：夹子按名字找到再放', async () => {
    const pic = await picture(1601)
    const folder = await db.project.create({
      data: { userId: owner.userId, name: '冬装' },
    })
    const { steps } = await run({
      op: 'put_in_folder',
      pictures: ['图_1601'],
      folder: '冬装',
    })
    expect(steps.at(-1)).toMatchObject({
      tool: 'add_to_folder',
      title: '放进文件夹「冬装」',
      status: 'done',
    })
    expect(
      await db.projectItem.findMany({
        where: { projectId: folder.id },
        select: { generationId: true },
      }),
    ).toEqual([{ generationId: pic.id }])
  })

  it('LoRA 加到角色的造型：出一步 library_write，带撤销', async () => {
    const card = await db.characterCard.create({
      data: {
        userId: owner.userId,
        name: '马尔福',
        looks: {
          create: [
            { isDefault: true, description: 'platinum hair', sortOrder: 0 },
            { label: '冬装', description: 'scarf', sortOrder: 1 },
          ],
        },
      },
      include: { looks: { orderBy: { sortOrder: 'asc' } } },
    })
    const lora = await db.loraAsset.create({
      data: {
        userId: owner.userId,
        name: 'ink',
        styleCode: 'pv-ink-1',
        triggerWord: 'ink',
        loraUrl: 'https://cdn.example.test/ink.safetensors',
      },
    })
    const { steps } = await run({
      op: 'lora_to_character',
      lora: 'LoRA·ink',
      character: '角色·马尔福/冬装',
    })
    expect(
      await db.characterCardLora.findMany({
        select: { characterCardId: true, loraAssetId: true, lookId: true },
      }),
    ).toEqual([
      {
        characterCardId: card.id,
        loraAssetId: lora.id,
        lookId: card.looks[1]!.id,
      },
    ])
    expect(steps.at(-1)).toMatchObject({
      tool: 'library_write',
      title: 'LoRA 加到角色',
      status: 'done',
      inverse: expect.objectContaining({ kind: 'lora_to_character' }),
    })
  })

  it('认不出的图 / 写不进去：出红行，⛔ 不写', async () => {
    const pic = await picture(1601)
    const unknown = await run({
      op: 'tag_pictures',
      pictures: ['某张图'],
      tags: ['x'],
    })
    expect(unknown.value.kind === 'result' && unknown.value.output).toContain(
      '某张图',
    )
    expect(unknown.steps.at(-1)?.status).toBe('error')
    expect(await tagsOf(pic.id)).toEqual([])

    // 别人的图按编号也认不到。
    const stranger = await createTestUser()
    const theirs = await picture(1700, stranger.id)
    await run({ op: 'tag_pictures', pictures: ['图_1700'], tags: ['x'] })
    expect(await tagsOf(theirs.id)).toEqual([])

    const link = await run({
      op: 'lora_to_character',
      lora: 'x',
      character: 'y',
    })
    expect(link.steps.at(-1)).toMatchObject({
      tool: 'library_write',
      title: 'LoRA 加到角色',
      status: 'error',
    })
    expect(await db.characterCardLora.count()).toBe(0)
  })

  it('设置：key 认大小写，来源 value false = 从名单拿掉；认不出的 key 退回', async () => {
    await db.projectRule.create({
      data: {
        userId: owner.userId,
        text: 'pinterest.com',
        kind: 'SOURCE_DENY',
        source: 'CREATOR',
      },
    })
    await run({ op: 'assistant_setting', key: 'Verbosity', value: 'concise' })
    expect(
      (
        await db.assistantPersona.findUniqueOrThrow({
          where: { userId: owner.userId },
        })
      ).verbosity,
    ).toBe('concise')

    await run({ op: 'search_source', url: 'pinterest.com', value: false })
    expect(
      await db.projectRule.count({ where: { userId: owner.userId } }),
    ).toBe(0)

    const bad = await run({
      op: 'assistant_setting',
      key: 'api_key',
      value: 'x',
    })
    expect(bad.value.kind === 'result' && bad.value.output).toContain(
      'needs key',
    )
  })
})

describe('记忆（第 6 步）', () => {
  it('没给角色：记进「关于你」，出一步带撤销', async () => {
    const { steps } = await run({ op: 'remember', text: '人物图默认 3:4' })
    expect(await memories()).toEqual([
      expect.objectContaining({
        text: '人物图默认 3:4',
        characterCardId: null,
      }),
    ])
    expect(steps.at(-1)).toMatchObject({
      tool: 'library_write',
      title: '记忆',
      status: 'done',
      inverse: expect.objectContaining({ kind: 'new_memory' }),
    })
  })

  it('和角色聊天时没给角色：记进正在聊的那位', async () => {
    const card = await createTestCard(owner.userId, {
      name: '马尔福',
      persona: { identity: '斯莱特林学生', speech: '拖长腔' },
    })
    const chatting = await turn({
      domain: 'cards',
      workspaceKey: 'cards',
      chatCharacterId: card.id,
    })
    await run({ op: 'remember', text: '约好下周去霍格莫德' }, chatting)
    expect((await memories()).map((row) => row.characterCardId)).toEqual([
      card.id,
    ])
  })

  it('给了角色：记进她自己那份；认不出的角色不退成「关于你」', async () => {
    const card = await createTestCard(owner.userId, { name: '马尔福' })
    await run({ op: 'remember', text: '冬装', character: '角色·马尔福' })
    expect((await memories()).map((row) => row.characterCardId)).toEqual([
      card.id,
    ])
    const unknown = await run({
      op: 'remember',
      text: '冬装二',
      character: '角色·谁',
    })
    expect(unknown.steps.at(-1)?.status).toBe('error')
    expect(await memories()).toHaveLength(1)
  })

  it('按编号改、value false 忘掉', async () => {
    const memory = await db.assistantMemory.create({
      data: {
        userId: owner.userId,
        scope: 'GLOBAL',
        kind: 'PREFERENCE',
        source: 'ASSISTANT',
        text: '人物图 3:4',
      },
    })
    const handle = `记忆·${memory.id.slice(0, 8)}`
    await run({ op: 'remember', memory: handle, text: '人物图 2:3' })
    expect((await memories()).map((row) => row.text)).toEqual(['人物图 2:3'])
    await run({ op: 'remember', memory: handle, value: false })
    expect(await memories()).toEqual([])
  })

  it('隐身一条都不碰；「让助手记住」关着不记新的、忘掉照样行', async () => {
    const memory = await db.assistantMemory.create({
      data: {
        userId: owner.userId,
        scope: 'GLOBAL',
        kind: 'PREFERENCE',
        source: 'ASSISTANT',
        text: '旧的一条',
      },
    })
    const handle = `记忆·${memory.id.slice(0, 8)}`
    const incognito = await turn({ incognito: true })
    await run({ op: 'remember', text: 'x' }, incognito)
    await run({ op: 'remember', memory: handle, value: false }, incognito)
    expect((await memories()).map((row) => row.text)).toEqual(['旧的一条'])

    await db.assistantPersona.upsert({
      where: { userId: owner.userId },
      create: { userId: owner.userId, memoryCapture: false },
      update: { memoryCapture: false },
    })
    const paused = await turn()
    await run({ op: 'remember', text: 'x' }, paused)
    expect((await memories()).map((row) => row.text)).toEqual(['旧的一条'])
    await run({ op: 'remember', memory: handle, value: false }, paused)
    expect(await memories()).toEqual([])
  })
})

describe('角色库开着：改设定先出卡（第 ⑩ 步）', () => {
  let cardId = ''

  beforeEach(async () => {
    cardId = (
      await createTestCard(owner.userId, {
        name: 'Denia',
        persona: { speech: '原来的说法', backstory: '原来的过去' },
        extensions: { 'pv.pinnedFields': ['backstory'] },
      })
    ).id
  })

  const onCharacterPage = () => turn({ libraryView: { library: 'cards' } })

  async function personaOf() {
    return (await db.characterCard.findUniqueOrThrow({ where: { id: cardId } }))
      .persona
  }

  it('character_profile 不直接写：出一张勾选卡，来源写「按你说的」', async () => {
    const { value, confirms } = await run(
      {
        op: 'character_profile',
        character: '角色·Denia',
        fields: [
          { field: 'speech', text: '叫你「前辈」' },
          { field: 'interests', text: '雨天\n旧书店' },
        ],
      },
      await onCharacterPage(),
    )
    expect(await personaOf()).toEqual({
      speech: '原来的说法',
      backstory: '原来的过去',
    })
    expect(value.kind).toBe('stop')
    expect(confirms).toEqual([
      {
        kind: 'characterProfile',
        profile: {
          characterId: cardId,
          fields: [
            { field: 'speech', text: '叫你「前辈」', source: '按你说的' },
            { field: 'interests', text: '雨天\n旧书店', source: '按你说的' },
          ],
        },
      },
    ])
  })

  it('钉住的格照旧拦下，什么都不出', async () => {
    const { value, confirms } = await run(
      {
        op: 'character_profile',
        character: '角色·Denia',
        fields: [{ field: 'backstory', text: '改掉' }],
      },
      await onCharacterPage(),
    )
    expect(value.kind === 'result' && value.output).toContain('pinned')
    expect(confirms).toEqual([])
  })

  it('别的页照旧直接写', async () => {
    await run({
      op: 'character_profile',
      character: '角色·Denia',
      fields: [{ field: 'speech', text: '叫你「前辈」' }],
    })
    expect(await personaOf()).toMatchObject({ speech: '叫你「前辈」' })
  })

  it('找立绘：她的图按编号、网上的按 #n 出候选图卡', async () => {
    const pic = await picture(12)
    const context = await onCharacterPage()
    context.transcript.push({
      type: 'result',
      id: 'call-1',
      tool: 'search_library',
      output: '#3 · Denia',
      error: false,
      finds: [
        {
          kind: 'image',
          n: 3,
          imageUrl: 'https://img.test/denia.png',
          pageUrl: 'https://wiki.test/denia',
        },
      ],
    })
    const { confirms } = await run(
      {
        op: 'propose_images',
        character: '角色·Denia',
        images: [
          { picture: '图_12', reason: '正脸' },
          { find: '#3', reason: '全身' },
        ],
      },
      context,
    )
    expect(confirms).toHaveLength(1)
    const card = confirms[0]!
    expect(card.kind).toBe('characterImages')
    if (card.kind !== 'characterImages') return
    expect(card.proposal.images).toEqual([
      expect.objectContaining({ source: 'library', assetId: pic.id }),
      expect.objectContaining({
        source: 'web',
        url: 'https://img.test/denia.png',
        reason: '全身',
      }),
    ])
  })
})
