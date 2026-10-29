import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  memories: vi.fn(),
  findingFirst: vi.fn(),
  findingDelete: vi.fn(),
  revert: vi.fn(),
  forget: vi.fn(),
  routeModel: vi.fn(),
  resolveRoute: vi.fn(),
  browse: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    characterCard: { findFirst: mocks.findFirst, update: mocks.update },
    assistantMemory: { findMany: mocks.memories },
    characterFinding: {
      findFirst: mocks.findingFirst,
      delete: mocks.findingDelete,
    },
  },
}))
vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(async () => ({ id: 'user-1' })),
}))
vi.mock('./character-revision.service', () => ({
  revertCharacterRevision: mocks.revert,
}))
vi.mock('./character-findings.service', () => ({
  forgetFindings: mocks.forget,
}))
vi.mock('./character-browse.service', () => ({
  browseCharacter: mocks.browse,
}))
vi.mock('@/services/assistant-persona.service', () => ({
  getAssistantRouteModelByUserId: mocks.routeModel,
}))
vi.mock('@/services/kernel/assistant-route.service', () => ({
  resolveAssistantRoute: mocks.resolveRoute,
}))

import { NODE_STUDIO_ASSISTANT_ROUTE_MODELS } from '@/constants/node-studio'
import {
  deleteCharacterFindingForClerkId,
  getCharacterGrowthForClerkId,
  goOutNowForClerkId,
  revertCharacterRevisionForClerkId,
  updateCharacterBrowseForClerkId,
} from './character-growth.service'

const AT = new Date('2026-10-26T10:00:00Z')
const MODEL = NODE_STUDIO_ASSISTANT_ROUTE_MODELS[0].modelId
const BROWSE_OFF = {
  browseEnabled: false,
  browseModel: null,
  browsePausedReason: null,
  browsedAt: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.memories.mockResolvedValue([])
})

describe('getCharacterGrowthForClerkId', () => {
  it('只读自己的卡，日期转成字符串；见闻、观点（去掉前缀）、出门设置一起回', async () => {
    mocks.findFirst.mockResolvedValue({
      ...BROWSE_OFF,
      browseEnabled: true,
      browseModel: MODEL,
      browsePausedReason: 'missing_key',
      browsedAt: AT,
      journals: [{ id: 'j1', text: '今天他画崩了', createdAt: AT }],
      revisions: [
        {
          id: 'r1',
          source: 'REFLECTION',
          fields: ['speech'],
          before: { speech: '慢吞吞' },
          after: { speech: '慢吞吞，熟了拖长音' },
          reason: '跟他熟了',
          revertedAt: null,
          createdAt: AT,
        },
      ],
      findings: [
        {
          id: 'f1',
          source: 'bilibili',
          url: 'https://www.bilibili.com/video/BV1',
          title: '水彩叠色',
          note: '先铺冷色再压暖色',
          seenAt: AT,
        },
        {
          id: 'f2',
          source: 'myspace',
          url: 'https://example.com',
          title: 'x',
          note: 'x',
          seenAt: AT,
        },
      ],
    })
    mocks.memories.mockResolvedValue([
      { id: 'm1', text: '观点：厚涂更适合画雨天。', createdAt: AT },
    ])
    const growth = await getCharacterGrowthForClerkId('clerk', 'card-1')
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'card-1', userId: 'user-1', isDeleted: false },
      }),
    )
    expect(mocks.memories).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          characterCardId: 'card-1',
          text: { startsWith: '观点：' },
        },
      }),
    )
    expect(growth?.journals[0]?.createdAt).toBe(AT.toISOString())
    expect(growth?.revisions[0]).toMatchObject({
      before: { speech: '慢吞吞' },
      revertedAt: null,
      createdAt: AT.toISOString(),
    })
    // 认不出的来源不往页面上送。
    expect(growth?.findings.map((row) => row.id)).toEqual(['f1'])
    expect(growth?.findings[0]?.seenAt).toBe(AT.toISOString())
    expect(growth?.opinions).toEqual([
      { id: 'm1', text: '厚涂更适合画雨天。', createdAt: AT.toISOString() },
    ])
    expect(growth?.browse).toEqual({
      enabled: true,
      model: MODEL,
      pausedReason: 'missing_key',
      browsedAt: AT.toISOString(),
    })
  })

  it('不是你的卡回 null', async () => {
    mocks.findFirst.mockResolvedValue(null)
    await expect(
      getCharacterGrowthForClerkId('clerk', 'card-x'),
    ).resolves.toBeNull()
  })
})

describe('updateCharacterBrowseForClerkId', () => {
  beforeEach(() => {
    mocks.findFirst.mockResolvedValue({ id: 'card-1', updatedAt: AT })
    mocks.update.mockImplementation(async ({ data }) => ({
      ...BROWSE_OFF,
      browseEnabled: data.browseEnabled,
      browseModel: data.browseModel,
    }))
  })

  it('打开没给型号：填助手当时点名的那个；清掉出不了门的原因；不顶到列表最前', async () => {
    mocks.routeModel.mockResolvedValue(MODEL)
    const state = await updateCharacterBrowseForClerkId('clerk', 'card-1', {
      enabled: true,
    })
    expect(state).toMatchObject({ enabled: true, model: MODEL })
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          browseEnabled: true,
          browseModel: MODEL,
          browsePausedReason: null,
          updatedAt: AT,
        },
      }),
    )
    expect(mocks.resolveRoute).not.toHaveBeenCalled()
  })

  it('助手是「自动」：换成自动此刻挑中的那一个；一把 key 都没有 → noModel，⛔ 开着却没型号', async () => {
    mocks.routeModel.mockResolvedValue('auto')
    mocks.resolveRoute.mockResolvedValueOnce({ modelId: MODEL })
    await expect(
      updateCharacterBrowseForClerkId('clerk', 'card-1', { enabled: true }),
    ).resolves.toMatchObject({ model: MODEL })

    mocks.resolveRoute.mockRejectedValueOnce(new Error('no keys'))
    mocks.update.mockClear()
    await expect(
      updateCharacterBrowseForClerkId('clerk', 'card-1', { enabled: true }),
    ).rejects.toMatchObject({ i18nKey: 'errors.characterBrowse.noModel' })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('关上留着型号，再打开接着用上次那个，⛔ 换成助手此刻的', async () => {
    const grok = NODE_STUDIO_ASSISTANT_ROUTE_MODELS.at(-1)!.modelId
    mocks.findFirst.mockResolvedValue({
      id: 'card-1',
      updatedAt: AT,
      browseModel: grok,
    })
    mocks.routeModel.mockResolvedValue(MODEL)
    await expect(
      updateCharacterBrowseForClerkId('clerk', 'card-1', { enabled: false }),
    ).resolves.toMatchObject({ enabled: false, model: grok })
    await expect(
      updateCharacterBrowseForClerkId('clerk', 'card-1', { enabled: true }),
    ).resolves.toMatchObject({ enabled: true, model: grok })
    expect(mocks.routeModel).not.toHaveBeenCalled()
  })

  it('点名一个型号就固定用它；不认识的型号拒', async () => {
    await expect(
      updateCharacterBrowseForClerkId('clerk', 'card-1', {
        enabled: true,
        model: MODEL,
      }),
    ).resolves.toMatchObject({ model: MODEL })
    expect(mocks.routeModel).not.toHaveBeenCalled()

    await expect(
      updateCharacterBrowseForClerkId('clerk', 'card-1', {
        enabled: true,
        model: 'gone-model',
      }),
    ).rejects.toMatchObject({ i18nKey: 'errors.characterBrowse.unknownModel' })
  })

  it('不是你的卡回 null', async () => {
    mocks.findFirst.mockResolvedValue(null)
    await expect(
      updateCharacterBrowseForClerkId('clerk', 'card-x', { enabled: false }),
    ).resolves.toBeNull()
    expect(mocks.update).not.toHaveBeenCalled()
  })
})

describe('goOutNowForClerkId', () => {
  it('开着就马上出门一趟，昨天刚出过也照去', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'card-1', browseEnabled: true })
    mocks.browse.mockResolvedValue({ seen: 6, kept: 3 })

    await expect(goOutNowForClerkId('clerk-1', 'card-1')).resolves.toEqual({
      went: true,
      kept: 3,
    })
    expect(mocks.browse).toHaveBeenCalledWith({
      userId: 'user-1',
      cardId: 'card-1',
    })
  })

  it('开关关着：不去', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'card-1', browseEnabled: false })
    await expect(goOutNowForClerkId('clerk-1', 'card-1')).resolves.toEqual({
      went: false,
      kept: 0,
    })
    expect(mocks.browse).not.toHaveBeenCalled()
  })

  it('不是你的卡回 null', async () => {
    mocks.findFirst.mockResolvedValue(null)
    await expect(goOutNowForClerkId('clerk-1', 'card-x')).resolves.toBeNull()
  })
})

describe('deleteCharacterFindingForClerkId', () => {
  it('只删自己的，连同想起用的索引；别人的回 false', async () => {
    mocks.findingFirst.mockResolvedValueOnce({
      id: 'f1',
      characterCardId: 'card-1',
    })
    await expect(deleteCharacterFindingForClerkId('clerk', 'f1')).resolves.toBe(
      true,
    )
    expect(mocks.findingFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'f1', userId: 'user-1' } }),
    )
    expect(mocks.findingDelete).toHaveBeenCalledWith({ where: { id: 'f1' } })
    expect(mocks.forget).toHaveBeenCalledWith('card-1', ['f1'])

    mocks.findingFirst.mockResolvedValueOnce(null)
    await expect(deleteCharacterFindingForClerkId('clerk', 'f9')).resolves.toBe(
      false,
    )
    expect(mocks.findingDelete).toHaveBeenCalledTimes(1)
  })
})

describe('revertCharacterRevisionForClerkId', () => {
  it('撤成了回 reverted，撤不了回 null', async () => {
    mocks.revert.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    await expect(
      revertCharacterRevisionForClerkId('clerk', 'r1'),
    ).resolves.toEqual({ reverted: true })
    expect(mocks.revert).toHaveBeenCalledWith('user-1', 'r1')
    await expect(
      revertCharacterRevisionForClerkId('clerk', 'r1'),
    ).resolves.toBeNull()
  })
})
