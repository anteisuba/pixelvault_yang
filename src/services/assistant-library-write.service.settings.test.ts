import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_PERSONA_DEFAULTS } from '@/constants/assistant-persona'
import type { AssistantPersona } from '@/types/assistant-persona'

/**
 * 新内核改设置（第 4c 步）：渠道、助手设置、搜图来源名单。形状同改库那份：**做 → 撤 → 回到原状**。
 */

interface FakeKey {
  id: string
  userId: string
  label: string
  adapterType: string
  isActive: boolean
  encryptedKey: string
}

interface FakeRule {
  id: string
  userId: string
  text: string
  kind: 'sourceAllow' | 'sourceDeny'
  scope: string | null
  source: 'assistant' | 'creator'
}

const store = {
  keys: [] as FakeKey[],
  persona: { ...ASSISTANT_PERSONA_DEFAULTS } as AssistantPersona,
  rules: [] as FakeRule[],
}

const keySelects: unknown[] = []

function initial() {
  store.keys = [
    {
      id: 'key-1',
      userId: 'user-1',
      label: 'OpenAI',
      adapterType: 'openai',
      isActive: true,
      encryptedKey: 'secret',
    },
    {
      id: 'key-2',
      userId: 'user-2',
      label: 'Gemini',
      adapterType: 'gemini',
      isActive: true,
      encryptedKey: 'secret',
    },
  ]
  store.persona = { ...ASSISTANT_PERSONA_DEFAULTS, characterCardId: null }
  store.rules = [
    {
      id: 'rule-1',
      userId: 'user-1',
      text: 'pinterest.com',
      kind: 'sourceDeny',
      scope: null,
      source: 'creator',
    },
  ]
  keySelects.length = 0
}

function snapshot() {
  return JSON.parse(
    JSON.stringify({
      keys: store.keys,
      persona: store.persona,
      rules: store.rules.map(({ id: _id, ...rule }) => rule),
    }),
  ) as unknown
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  db: {
    user: {
      findUnique: vi.fn(async () => ({ clerkId: 'clerk-1' })),
    },
    userApiKey: {
      findMany: vi.fn(
        async ({
          where,
          select,
        }: {
          where: { userId: string }
          select: Record<string, boolean>
        }) => {
          keySelects.push(select)
          return structuredClone(
            store.keys.filter((key) => key.userId === where.userId),
          )
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string }
          data: Partial<FakeKey>
        }) => {
          Object.assign(store.keys.find((key) => key.id === where.id)!, data)
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; userId: string }
          data: Partial<FakeKey>
        }) => {
          const key = store.keys.find(
            (item) => item.id === where.id && item.userId === where.userId,
          )
          if (key) Object.assign(key, data)
          return { count: key ? 1 : 0 }
        },
      ),
    },
    projectRule: {
      deleteMany: vi.fn(
        async ({ where }: { where: { id: string; userId: string } }) => {
          const before = store.rules.length
          store.rules = store.rules.filter(
            (rule) => rule.id !== where.id || rule.userId !== where.userId,
          )
          return { count: before - store.rules.length }
        },
      ),
    },
  },
}))
vi.mock('@/services/assistant-persona.service', () => ({
  getAssistantPersona: vi.fn(async () => structuredClone(store.persona)),
  upsertAssistantPersona: vi.fn(
    async (_clerkId: string, input: Partial<AssistantPersona>) => {
      store.persona = { ...store.persona, ...structuredClone(input) }
      return store.persona
    },
  ),
}))
vi.mock('@/services/project-rule.service', () => ({
  ProjectRuleLimitError: class extends Error {},
  listProjectSourceRules: vi.fn(async (userId: string) =>
    structuredClone(store.rules.filter((rule) => rule.userId === userId)),
  ),
  addProjectRule: vi.fn(
    async (userId: string, input: Omit<FakeRule, 'id' | 'userId'>) => {
      const rule = {
        id: `rule-${store.rules.length + 2}`,
        userId,
        ...input,
        scope: input.scope ?? null,
      }
      store.rules.push(rule)
      return rule
    },
  ),
}))
vi.mock('@/services/cards/character-card.service', () => ({
  createCharacterCard: vi.fn(),
  updateCharacterCard: vi.fn(),
}))
vi.mock('@/services/cards/character-look.service', () => ({
  createCharacterLook: vi.fn(),
  updateCharacterLook: vi.fn(),
}))
vi.mock('@/services/prompts/recipe.service', () => ({
  createRecipe: vi.fn(),
  updateRecipe: vi.fn(),
}))
vi.mock('@/services/storage/r2', () => ({ isOwnedStorageUrl: () => true }))

import {
  addSearchSource,
  removeSearchSource,
  revertLibraryWrite,
  setChannel,
  writeAssistantSetting,
} from './assistant-library-write.service'

const owner = { userId: 'user-1', clerkId: 'clerk-1' }

beforeEach(() => initial())

describe('新内核改设置：做 → 撤 → 回到原状', () => {
  it('渠道关掉并改名，撤销原样回来；⛔ 从不读 key', async () => {
    const before = snapshot()
    const outcome = await setChannel(owner, {
      channel: 'openai',
      on: false,
      name: '主力',
    })
    expect(outcome.ok).toBe(true)
    expect(store.keys[0]).toMatchObject({ label: '主力', isActive: false })
    for (const select of keySelects) {
      expect(select).not.toHaveProperty('encryptedKey')
      expect(select).not.toHaveProperty('maskedKey')
    }
    if (!outcome.ok) return
    await revertLibraryWrite(owner.userId, outcome.inverse)
    expect(snapshot()).toEqual(before)
  })

  it('别人的渠道认不出', async () => {
    const outcome = await setChannel(owner, {
      channel: 'Gemini',
      on: false,
      name: null,
    })
    expect(outcome.ok).toBe(false)
    expect(store.keys[1]!.isActive).toBe(true)
  })

  it('助手设置改一格（模型按名字认），撤销整份写回', async () => {
    const before = snapshot()
    const outcome = await writeAssistantSetting(owner, {
      key: 'verbosity',
      value: 'concise',
    })
    expect(outcome.ok).toBe(true)
    expect(store.persona.verbosity).toBe('concise')
    if (!outcome.ok) return
    await revertLibraryWrite(owner.userId, outcome.inverse)
    expect(snapshot()).toEqual(before)

    const model = await writeAssistantSetting(owner, {
      key: 'model',
      value: 'deepseek v4 pro',
    })
    expect(model.ok && model.payload.summary).toContain('DeepSeek V4 Pro')
  })

  it('语气写一句话 = 自定义；认不出的值回一句可选项', async () => {
    const custom = await writeAssistantSetting(owner, {
      key: 'tone',
      value: '像老朋友一样说话',
    })
    expect(custom.ok).toBe(true)
    expect(store.persona).toMatchObject({
      tone: 'custom',
      toneCustom: '像老朋友一样说话',
    })
    const bad = await writeAssistantSetting(owner, {
      key: 'verbosity',
      value: 'huge',
    })
    expect(bad.ok === false && bad.error).toContain('concise')
  })

  it('搜图来源：加进屏蔽名单 / 从名单拿掉，各自撤销回原状', async () => {
    const before = snapshot()
    const added = await addSearchSource(owner, {
      site: 'https://www.zerochan.net/foo',
      list: 'sourceDeny',
    })
    expect(added.ok).toBe(true)
    expect(store.rules.map((rule) => rule.text)).toContain('zerochan.net')
    if (!added.ok) return
    await revertLibraryWrite(owner.userId, added.inverse)
    expect(snapshot()).toEqual(before)

    const removed = await removeSearchSource(owner, { site: 'pinterest.com' })
    expect(removed.ok).toBe(true)
    expect(store.rules).toHaveLength(0)
    if (!removed.ok) return
    await revertLibraryWrite(owner.userId, removed.inverse)
    expect(snapshot()).toEqual(before)
  })
})
