/**
 * 助手按编号打开 / 在库里查（`workspace.service`）。
 * 真库（L2a）：图、对话、角色、LoRA、提示词、渠道、来源名单都是库里的行；
 * 只假网络（Danbooru、Civitai 索引、语义检索都在 `fetch` 上替）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { RESEARCH_SOURCE_IDS } from '@/constants/research'
import { encryptApiKey } from '@/lib/crypto'
import { db } from '@/lib/db'
import type { Prisma } from '@/lib/generated/prisma/client'
import { resetResearchBreakers } from '@/services/research/connector-runtime'
import { resetDanbooruCatalogCache } from '@/services/research/danbooru.connector'
import { clearSearchExpansionCache } from '@/services/search-expansion.service'
import { createTestUser, resetDatabase } from '@/test/int/db'

import {
  benchAliases,
  findInWorkspace,
  openWorkspaceHandle,
  parseWorkspaceHandle,
} from './workspace.service'

let owner = { userId: '', clerkId: '', incognito: false }

/** 没登记的网络请求一律报错：哪一类不该出网，出了就红。 */
const network = vi.fn(async (url: string): Promise<Response> => {
  throw new Error(`unexpected fetch ${url}`)
})

beforeEach(async () => {
  await resetDatabase()
  const user = await createTestUser()
  owner = { userId: user.id, clerkId: user.clerkId, incognito: false }
  clearSearchExpansionCache()
  resetResearchBreakers([RESEARCH_SOURCE_IDS.danbooru])
  resetDanbooruCatalogCache()
  network.mockClear()
  vi.stubGlobal('fetch', (input: string | URL) => network(String(input)))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function picture(
  data: Partial<Omit<Prisma.GenerationUncheckedCreateInput, 'userId'>> = {},
  userId = owner.userId,
) {
  return db.generation.create({
    data: {
      userId,
      seq: 1624,
      outputType: 'IMAGE',
      status: 'COMPLETED',
      url: 'https://cdn.test/1624.png',
      thumbnailUrl: 'https://cdn.test/1624-thumb.png',
      storageKey: '1624.png',
      prompt: '1girl, malfoid, platinum blonde hair, slytherin uniform',
      negativePrompt: 'lowres',
      model: 'anima',
      provider: 'fal',
      width: 832,
      height: 1216,
      seed: BigInt(42),
      createdAt: new Date('2026-10-21T10:00:00Z'),
      snapshot: {
        advancedParams: {
          steps: 28,
          guidanceScale: 4.5,
          loras: [{ url: 'https://lora.test/malfoid.safetensors', scale: 0.8 }],
        },
        referenceImages: ['https://cdn.test/1588.png'],
      },
      ...data,
    },
  })
}

function lora(name: string, data: Partial<Prisma.LoraAssetCreateInput> = {}) {
  return db.loraAsset.create({
    data: {
      user: { connect: { id: owner.userId } },
      name,
      styleCode: `pv-${name}`,
      triggerWord: '',
      loraUrl: `https://lora.test/${name}.safetensors`,
      ...data,
    },
  })
}

function recipe(name: string, compiledPrompt: string, modelId = 'anima') {
  return db.recipe.create({
    data: {
      userId: owner.userId,
      name,
      compiledPrompt,
      modelId,
      provider: 'fal',
    },
  })
}

describe('编号认法', () => {
  it.each([
    ['图_1624', { kind: 'picture', prefix: '图', serial: 1624 }],
    ['@图_012·银发少女', { kind: 'picture', prefix: '图', serial: 12 }],
    ['视频_007', { kind: 'picture', prefix: '视频', serial: 7 }],
    ['角色·马尔福/冬装', { kind: 'character', name: '马尔福', look: '冬装' }],
    ['LoRA·malfoid', { kind: 'lora', name: 'malfoid' }],
    ['提示词·白底立绘', { kind: 'prompt', name: '白底立绘' }],
    ['对话·3F2a91bc', { kind: 'conversation', id: '3f2a91bc' }],
    ['技能·参考图分工', { kind: 'skill', name: '参考图分工' }],
    ['标签·watercolor_(medium)', { kind: 'tag', name: 'watercolor_(medium)' }],
    ['音色·少女音', { kind: 'voice', name: '少女音' }],
    ['画廊·cmh3k2x9a0001', { kind: 'gallery', id: 'cmh3k2x9a0001' }],
    ['设置', { kind: 'settings' }],
  ])('%s', (raw, expected) => {
    expect(parseWorkspaceHandle(raw)).toEqual(expected)
  })

  it('台上的叫法交给台上那一套', () => {
    expect(parseWorkspaceHandle('ref-1')).toBeNull()
    expect(parseWorkspaceHandle('result-2')).toBeNull()
    expect(parseWorkspaceHandle('sample')).toBeNull()
    // 画廊编号只收 id 的样子，⛔ 随便一句话不当编号去查库。
    expect(parseWorkspaceHandle('画廊·那张粉头发的')).toBeNull()
  })
})

describe('按编号打开', () => {
  it('图：图本身 + 完整配方（LoRA 写名字与权重、参考图写编号）', async () => {
    const row = await picture()
    await picture({
      seq: 1588,
      url: 'https://cdn.test/1588.png',
      thumbnailUrl: null,
      storageKey: '1588.png',
      snapshot: {},
    })
    await lora('malfoid', {
      loraUrl: 'https://lora.test/malfoid.safetensors',
    })
    const opened = await openWorkspaceHandle(
      owner,
      parseWorkspaceHandle('图_1624')!,
    )
    expect(opened?.pictures).toEqual([
      {
        url: 'https://cdn.test/1624-thumb.png',
        label: '图_1624',
        generationId: row.id,
      },
    ])
    expect(opened?.text).toContain('1girl, malfoid')
    expect(opened?.text).toContain('Negative prompt: lowres')
    expect(opened?.text).toContain('CFG scale: 4.5')
    expect(opened?.text).toContain('LoRA·malfoid @ 0.8')
    expect(opened?.text).toContain('@Image1 = 图_1588')
  })

  it('画廊里别人的公开图：只读，写作者，⛔ 不给 generationId（不能当自己的图挂）', async () => {
    const someone = await db.user.create({
      data: {
        clerkId: 'clerk_mika',
        email: 'mika@example.test',
        username: 'mika',
        displayName: 'Mika',
      },
    })
    const theirs = await picture({ isPublic: true }, someone.id)
    const opened = await openWorkspaceHandle(
      owner,
      parseWorkspaceHandle(`画廊·${theirs.id}`)!,
    )
    expect(opened?.pictures).toEqual([
      { url: 'https://cdn.test/1624-thumb.png', label: `画廊·${theirs.id}` },
    ])
    expect(opened?.text).toContain(`画廊·${theirs.id} · by Mika`)
    expect(opened?.text).toContain('1girl, malfoid')
  })

  it('画廊里不公开、也不是她的：打不开', async () => {
    const stranger = await createTestUser()
    const secret = await picture({ isPublic: false }, stranger.id)
    expect(
      await openWorkspaceHandle(
        owner,
        parseWorkspaceHandle(`画廊·${secret.id}`)!,
      ),
    ).toBeNull()
  })

  it('她传上来的图：明说没有配方，⛔ 不让模型再翻', async () => {
    await picture({
      seq: 1610,
      prompt: '',
      negativePrompt: null,
      model: 'user-upload',
      snapshot: {},
    })
    const opened = await openWorkspaceHandle(
      owner,
      parseWorkspaceHandle('图_1610')!,
    )
    expect(opened?.text).toContain('Uploaded by the creator')
    expect(opened?.text).toContain('no recipe was recorded')
  })

  it('不存在的编号、别人的编号都回 null（look 说清没找到）', async () => {
    const stranger = await createTestUser()
    await picture({ seq: 9999 }, stranger.id)
    expect(
      await openWorkspaceHandle(owner, parseWorkspaceHandle('图_9999')!),
    ).toBeNull()
  })

  it('设置：只说配了哪些渠道和设置，⛔ 不带密文与掩码', async () => {
    await db.userApiKey.create({
      data: {
        userId: owner.userId,
        adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
        modelId: '',
        providerConfig: {},
        label: 'Claude',
        encryptedKey: encryptApiKey('sk-ant-secret-value'),
        maskedKey: 'sk-ant-****alue',
      },
    })
    await db.assistantPersona.create({
      data: { userId: owner.userId, verbosity: 'concise' },
    })
    await db.projectRule.create({
      data: {
        userId: owner.userId,
        text: 'pinterest.com',
        kind: 'SOURCE_DENY',
        source: 'CREATOR',
      },
    })
    const opened = await openWorkspaceHandle(owner, { kind: 'settings' })
    expect(opened?.text).toContain('Claude · anthropic')
    expect(opened?.text).toContain('verbosity: concise')
    expect(opened?.text).toContain('block: pinterest.com')
    expect(opened?.text).not.toContain('secret')
    expect(opened?.text).not.toContain('****')
  })

  it('技能按名字打开全文；没有这份就列出有哪些', async () => {
    const opened = await openWorkspaceHandle(
      owner,
      parseWorkspaceHandle('技能·标签模型写提示词')!,
    )
    expect(opened?.text).toMatch(/^SKILL 技能·标签模型写提示词/)
    expect(opened?.text).toContain('weight::tags::')
    const missing = await openWorkspaceHandle(owner, {
      kind: 'skill',
      name: '不存在',
    })
    expect(missing?.text).toContain('no such skill')
    expect(missing?.text).toContain('技能·参考图分工')
  })

  it('隐身时不打开以前的对话', async () => {
    const conversation = await db.assistantConversation.create({
      data: {
        userId: owner.userId,
        surface: 'LORA',
        title: '画风尝试',
        messages: [{ role: 'user', content: '秘密的一句' }],
      },
    })
    const opened = await openWorkspaceHandle(
      { ...owner, incognito: true },
      { kind: 'conversation', id: conversation.id.slice(0, 8) },
    )
    expect(opened?.text).toContain('Incognito')
    expect(opened?.text).not.toContain('秘密的一句')
  })
})

describe('查', () => {
  it('一类一段，带编号；对话标出哪个台、哪天，命中那一句带出来', async () => {
    const row = await picture()
    await db.assistantConversation.create({
      data: {
        id: '3f2a91bc-0000-4000-8000-000000000000',
        userId: owner.userId,
        surface: 'LORA',
        title: '画风尝试',
        updatedAt: new Date('2026-10-21T08:00:00Z'),
        messages: [
          { role: 'user', content: '画风不对，试一下 malfoid 的画风' },
        ],
      },
    })
    const found = await findInWorkspace(owner, 'malfoid', [
      'pictures',
      'conversations',
    ])
    expect(found.text).toContain('PICTURES\n图_1624 · 2026-10-21 · anima')
    expect(found.text).toContain('对话·3f2a91bc · LoRA bench · 2026-10-21')
    expect(found.text).toContain('试一下 malfoid 的画风')
    expect(found.pictures[0]?.generationId).toBe(row.id)
  })

  it('多个词任意命中就算，命中多的排前；LoRA 全量查（不截 100）', async () => {
    // 名字对上 malfoid、触发词对上 malfoy：两个词，排在只对上一个词的前面。
    await lora('Malfoid', { type: 'subject', triggerWord: 'malfoy' })
    await lora('Slytherin uniform', { type: 'clothing' })
    await lora('无关', { type: 'style' })
    // 比 100 把还多：最早收的那把也查得到。
    const oldest = new Date('2026-01-01T00:00:00Z')
    await db.loraAsset.update({
      where: { styleCode: 'pv-Malfoid' },
      data: { createdAt: oldest },
    })
    await db.loraAsset.createMany({
      data: Array.from({ length: 101 }, (_, index) => ({
        userId: owner.userId,
        name: `filler ${index}`,
        styleCode: `pv-filler-${index}`,
        triggerWord: '',
        loraUrl: `https://lora.test/filler-${index}.safetensors`,
      })),
    })
    const found = await findInWorkspace(
      owner,
      'malfoy slytherin 马尔福 malfoid',
      ['loras'],
    )
    expect(found.text).toContain('LoRA·Malfoid')
    expect(found.text).toContain('LoRA·Slytherin uniform')
    expect(found.text).not.toContain('无关')
    expect(found.text.indexOf('Malfoid')).toBeLessThan(
      found.text.indexOf('Slytherin'),
    )
  })

  it('角色连设定一起搜（马尔福写在女德拉科的设定里）', async () => {
    await db.characterCard.create({
      data: {
        userId: owner.userId,
        name: '女德拉科',
        persona: { identity: '性转的德拉科·马尔福，斯莱特林' },
      },
    })
    const found = await findInWorkspace(owner, '马尔福 性转', ['characters'])
    expect(found.text).toContain('角色·女德拉科')
  })

  it('字面不够时把搜索词翻成标签再整词对一遍，接在后面（下雨 → rain，⛔ training）', async () => {
    await db.danbooruTagName.create({
      data: {
        tag: 'rain',
        category: 0,
        count: 100_000,
        zh: '下雨',
        searchText: '下雨',
      },
    })
    await recipe('下雨的街', 'street')
    await recipe('雨夜', '1girl, rain, night')
    await recipe('训练', 'training ground')
    const found = await findInWorkspace(owner, '下雨', ['prompts'])
    expect(found.text).toContain('提示词·下雨的街')
    expect(found.text).toContain('提示词·雨夜')
    expect(found.text).not.toContain('训练')
    expect(found.text.indexOf('下雨的街')).toBeLessThan(
      found.text.indexOf('雨夜'),
    )
  })

  it('图：字面不够时按翻出来的词再查一批，整词筛过才要', async () => {
    await db.danbooruTagName.create({
      data: {
        tag: 'cat_ears',
        category: 0,
        count: 100_000,
        zh: '猫耳',
        searchText: '猫耳',
      },
    })
    const ears = await picture({ seq: 1, prompt: '1girl, cat_ears' })
    await picture({ seq: 2, prompt: 'bobcat earsplitting' })
    const found = await findInWorkspace(owner, '猫耳', ['pictures'])
    expect(found.pictures.map((item) => item.generationId)).toEqual([ears.id])
  })

  it('不点名不查外面的库；点名了才查标签 / LoRA 大库', async () => {
    vi.stubEnv('CIVITAI_INDEX_URL', 'https://civitai-index.test')
    vi.stubEnv('CIVITAI_INDEX_TOKEN', 'index-token')
    network.mockImplementation(async (url: string) => {
      if (url.startsWith('https://civitai-index.test/search'))
        return Response.json({
          rows: [
            {
              modelId: 1,
              versionId: 2,
              versionName: 'v1',
              name: 'civitai one',
              creator: null,
              creatorImage: null,
              nsfw: false,
              baseModel: 'Illustrious',
              tags: ['style'],
              trainedWords: [],
              hashAutoV3: null,
              downloadCount: 10,
              thumbsUpCount: 1,
              images: [],
              permissions: {
                allowCommercialUse: [],
                allowDerivatives: true,
                allowNoCredit: true,
              },
              createdAt: 0,
            },
          ],
          total: 1,
        })
      if (url.includes('/tags.json'))
        return Response.json([
          { name: 'watercolor_(medium)', post_count: 5000, category: 5 },
        ])
      if (url.includes('danbooru')) return Response.json([])
      throw new Error(`unexpected fetch ${url}`)
    })

    await findInWorkspace(owner, 'watercolor', ['pictures', 'prompts'])
    expect(network).not.toHaveBeenCalled()

    const found = await findInWorkspace(owner, 'watercolor', [
      'tags',
      'lora_library',
    ])
    expect(found.text).toContain('watercolor')
    expect(found.text).toContain('TAGS — Danbooru')
    expect(found.text).toContain('LoRA·civitai one')
  })

  it('一类查失败不拖垮其他几类', async () => {
    // Civitai 索引没配：那一类查不了，提示词那一类照常。
    vi.stubEnv('CIVITAI_INDEX_URL', '')
    await recipe('白底立绘', '1girl, white background')
    const found = await findInWorkspace(owner, '白底', [
      'lora_library',
      'prompts',
    ])
    expect(found.text).toContain(
      'LORA_LIBRARY: could not be searched right now.',
    )
    expect(found.text).toContain('提示词·白底立绘')
  })
})

describe('台上的编号', () => {
  it('ref-N / result-N 各自是哪一张（认不出的不写）', async () => {
    await picture({
      seq: 1588,
      url: 'https://cdn.test/1588.png',
      thumbnailUrl: null,
      storageKey: '1588.png',
    })
    const line = await benchAliases(owner.userId, {
      prompt: '',
      availableModels: [],
      references: { items: [{ url: 'https://cdn.test/1588.png' }], limit: 4 },
      results: [{ url: 'https://cdn.test/upload.png' }],
    } as never)
    expect(line).toBe('PICTURE NUMBERS ON THE BENCH: ref-1 = 图_1588')
  })
})
