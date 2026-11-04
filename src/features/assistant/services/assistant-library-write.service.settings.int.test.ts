import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { encryptApiKey } from '@/lib/crypto'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'

import {
  addSearchSource,
  removeSearchSource,
  revertLibraryWrite,
  setChannel,
  writeAssistantSetting,
} from './assistant-library-write.service'

/**
 * 新内核改设置（第 4c 步）：渠道、助手设置、搜图来源名单。形状同改库那份：**做 → 撤 → 回到原状**。
 * 真库（L2a）：key、人设、来源名单都是库里的行。
 */
let owner = { userId: '', clerkId: '' }
let strangerId = ''

function apiKey(userId: string, adapterType: AI_ADAPTER_TYPES, label: string) {
  return db.userApiKey.create({
    data: {
      userId,
      adapterType,
      modelId: adapterType,
      providerConfig: {},
      label,
      encryptedKey: encryptApiKey(`sk-test-${adapterType}`),
    },
  })
}

/** 这位用户在库里的那几样（⛔ 不含时间戳与 id）。 */
async function snapshot() {
  const [keys, persona, rules] = await Promise.all([
    db.userApiKey.findMany({
      orderBy: { label: 'asc' },
      select: { userId: true, label: true, isActive: true, adapterType: true },
    }),
    db.assistantPersona.findUnique({
      where: { userId: owner.userId },
      select: {
        tone: true,
        toneCustom: true,
        verbosity: true,
        routeModel: true,
        language: true,
      },
    }),
    db.projectRule.findMany({
      where: { userId: owner.userId },
      orderBy: { text: 'asc' },
      select: { text: true, kind: true, scope: true, source: true },
    }),
  ])
  return { keys, persona, rules }
}

function persona() {
  return db.assistantPersona.findUniqueOrThrow({
    where: { userId: owner.userId },
  })
}

beforeEach(async () => {
  await resetDatabase()
  const user = await createTestUser()
  owner = { userId: user.id, clerkId: user.clerkId }
  strangerId = (await createTestUser()).id
  await apiKey(owner.userId, AI_ADAPTER_TYPES.OPENAI, 'OpenAI')
  await apiKey(strangerId, AI_ADAPTER_TYPES.GEMINI, 'Gemini')
  await db.projectRule.create({
    data: {
      userId: owner.userId,
      text: 'pinterest.com',
      kind: 'SOURCE_DENY',
      source: 'CREATOR',
    },
  })
})

describe('新内核改设置：做 → 撤 → 回到原状（真库）', () => {
  it('渠道关掉并改名，撤销原样回来；⛔ 从不读 key', async () => {
    const reads = vi.spyOn(db.userApiKey, 'findMany')
    const before = await snapshot()
    reads.mockClear()

    const outcome = await setChannel(owner, {
      channel: 'openai',
      on: false,
      name: '主力',
    })

    expect(outcome.ok).toBe(true)
    expect(
      await db.userApiKey.findFirst({ where: { userId: owner.userId } }),
    ).toMatchObject({ label: '主力', isActive: false })
    expect(reads).toHaveBeenCalled()
    for (const [args] of reads.mock.calls) {
      expect(args?.select).toBeDefined()
      expect(args?.select).not.toHaveProperty('encryptedKey')
      expect(args?.select).not.toHaveProperty('maskedKey')
    }
    reads.mockRestore()
    if (!outcome.ok) return
    await revertLibraryWrite(owner.userId, outcome.inverse)
    expect(await snapshot()).toEqual(before)
  })

  it('别人的渠道认不出', async () => {
    const outcome = await setChannel(owner, {
      channel: 'Gemini',
      on: false,
      name: null,
    })
    expect(outcome.ok).toBe(false)
    expect(
      (await db.userApiKey.findFirstOrThrow({ where: { userId: strangerId } }))
        .isActive,
    ).toBe(true)
  })

  it('助手设置改一格（模型按名字认），撤销整份写回', async () => {
    const outcome = await writeAssistantSetting(owner, {
      key: 'verbosity',
      value: 'concise',
    })
    expect(outcome.ok).toBe(true)
    expect((await persona()).verbosity).toBe('concise')
    if (!outcome.ok) return
    await revertLibraryWrite(owner.userId, outcome.inverse)
    // 改之前没有那一行 = 默认值；撤销写回的就是那份默认值。
    expect((await persona()).verbosity).toBe('standard')

    const model = await writeAssistantSetting(owner, {
      key: 'model',
      value: 'deepseek v4 pro',
    })
    expect(model.ok && model.payload.summary).toContain('DeepSeek V4 Pro')
    expect((await persona()).routeModel).toContain('deepseek')
  })

  it('改过的设置撤销后逐格回到原状', async () => {
    await writeAssistantSetting(owner, { key: 'verbosity', value: 'detailed' })
    const before = await snapshot()
    const outcome = await writeAssistantSetting(owner, {
      key: 'tone',
      value: '像老朋友一样说话',
    })
    if (!outcome.ok) throw new Error('expected ok')
    await revertLibraryWrite(owner.userId, outcome.inverse)
    expect(await snapshot()).toEqual(before)
  })

  it('语气写一句话 = 自定义；认不出的值回一句可选项', async () => {
    const custom = await writeAssistantSetting(owner, {
      key: 'tone',
      value: '像老朋友一样说话',
    })
    expect(custom.ok).toBe(true)
    expect(await persona()).toMatchObject({
      tone: 'custom',
      toneCustom: '像老朋友一样说话',
    })
    const bad = await writeAssistantSetting(owner, {
      key: 'verbosity',
      value: 'huge',
    })
    expect(bad.ok === false && bad.error).toContain('concise')
    expect((await persona()).verbosity).not.toBe('huge')
  })

  it('搜图来源：加进屏蔽名单 / 从名单拿掉，各自撤销回原状', async () => {
    const before = await snapshot()
    const added = await addSearchSource(owner, {
      site: 'https://www.zerochan.net/foo',
      list: 'sourceDeny',
    })
    expect(added.ok).toBe(true)
    expect((await snapshot()).rules.map((rule) => rule.text)).toContain(
      'zerochan.net',
    )
    if (!added.ok) return
    await revertLibraryWrite(owner.userId, added.inverse)
    expect(await snapshot()).toEqual(before)

    const removed = await removeSearchSource(owner, { site: 'pinterest.com' })
    expect(removed.ok).toBe(true)
    expect((await snapshot()).rules).toHaveLength(0)
    if (!removed.ok) return
    await revertLibraryWrite(owner.userId, removed.inverse)
    expect(await snapshot()).toEqual(before)
  })
})
