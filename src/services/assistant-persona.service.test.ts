import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  ASSISTANT_AVATAR_PRESET_IDS,
  ASSISTANT_PERSONA_DEFAULTS,
  ASSISTANT_PERSONA_TONE_IDS,
  ASSISTANT_ROUTE_MODEL_AUTO,
} from '@/constants/assistant-persona'
import { NODE_STUDIO_ASSISTANT_ROUTE_MODELS } from '@/constants/node-studio'

// ─── Mocks ──────────────────────────────────────────────────────

const mockFindUnique = vi.fn()
const mockUpsert = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    assistantPersona: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
  },
}))

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(async () => ({ id: 'db_user_1' })),
}))

import {
  getAssistantPersona,
  sanitizeToneCustom,
  upsertAssistantPersona,
} from '@/services/assistant-persona.service'

const STORED_ROW = {
  name: 'Mika',
  avatarPreset: ASSISTANT_AVATAR_PRESET_IDS[1],
  avatarUrl: null,
  tone: ASSISTANT_PERSONA_TONE_IDS.friendly,
  toneCustom: null,
  verbosity: 'detailed',
  planMode: 'always',
  language: 'chinese',
  routeModel: null,
}

/** 库里那一行的协议形状 —— `routeModel: null` 读回来是「自动」（§4.5）。 */
const STORED_PERSONA = {
  ...STORED_ROW,
  routeModel: ASSISTANT_ROUTE_MODEL_AUTO,
}

describe('assistant persona service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('缺行时读回代码默认值，⛔ 不建行（§8.4 第 4 条）', async () => {
    mockFindUnique.mockResolvedValue(null)

    const persona = await getAssistantPersona('clerk_1')

    expect(persona).toEqual({ ...ASSISTANT_PERSONA_DEFAULTS, avatarUrl: null })
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('有行时逐字读回那一行', async () => {
    mockFindUnique.mockResolvedValue(STORED_ROW)

    await expect(getAssistantPersona('clerk_1')).resolves.toEqual(
      STORED_PERSONA,
    )
  })

  /**
   * 词表改过而存量行没跟上 —— 退回默认值，⛔ 不把词表外的值塞进系统提示。
   */
  it('库里的值掉出词表时退回默认值', async () => {
    mockFindUnique.mockResolvedValue({ ...STORED_ROW, tone: 'sarcastic' })

    await expect(getAssistantPersona('clerk_1')).resolves.toEqual({
      ...ASSISTANT_PERSONA_DEFAULTS,
      avatarUrl: null,
    })
  })

  /**
   * 预设从六款收成两款（owner 2026-09-07）之后，库里留着 `spark` 这类悬空 id。
   * ⚠ 只有头像那一格回落，语气 / 长度 / 语言**照样逐字读回**，⛔ 不整份退默认。
   */
  it('avatarPreset 是悬空 id 时只回落头像那一格', async () => {
    mockFindUnique.mockResolvedValue({ ...STORED_ROW, avatarPreset: 'spark' })

    await expect(getAssistantPersona('clerk_1')).resolves.toEqual({
      ...STORED_PERSONA,
      avatarPreset: ASSISTANT_PERSONA_DEFAULTS.avatarPreset,
    })
  })

  it('upsert 走 userId 唯一键，且不碰头像那两列', async () => {
    mockUpsert.mockResolvedValue(STORED_ROW)

    await upsertAssistantPersona('clerk_1', {
      name: 'Mika',
      avatarPreset: ASSISTANT_AVATAR_PRESET_IDS[1],
      tone: ASSISTANT_PERSONA_TONE_IDS.friendly,
      toneCustom: null,
      verbosity: 'detailed',
      planMode: 'always',
      language: 'chinese',
      routeModel: ASSISTANT_ROUTE_MODEL_AUTO,
    })

    const call = mockUpsert.mock.calls[0][0] as {
      where: { userId: string }
      create: Record<string, unknown>
      update: Record<string, unknown>
    }
    expect(call.where).toEqual({ userId: 'db_user_1' })
    expect(call.update).not.toHaveProperty('avatarUrl')
    expect(call.update).not.toHaveProperty('avatarStorageKey')
    expect(call.create.userId).toBe('db_user_1')
  })

  /**
   * §4.5：模型偏好存在这一列上。⚠ 库里的 null 与「自动」是**同一件事** ——
   * 存字符串 `'auto'` 会让「没选过」和「选了自动」变成两个值。
   */
  it('routeModel 读回：库里存的 modelId 逐字读回，悬空 id 回落到自动', async () => {
    const pinned = NODE_STUDIO_ASSISTANT_ROUTE_MODELS[2].modelId
    mockFindUnique.mockResolvedValue({ ...STORED_ROW, routeModel: pinned })
    await expect(getAssistantPersona('clerk_1')).resolves.toMatchObject({
      routeModel: pinned,
      // ⚠ 其余几格照样逐字读回，⛔ 不整份退默认。
      tone: STORED_ROW.tone,
    })

    mockFindUnique.mockResolvedValue({
      ...STORED_ROW,
      routeModel: 'qwen3-max-retired',
    })
    await expect(getAssistantPersona('clerk_1')).resolves.toMatchObject({
      routeModel: ASSISTANT_ROUTE_MODEL_AUTO,
      tone: STORED_ROW.tone,
    })
  })

  it('routeModel 写入：具体模型逐字写，「自动」写 null', async () => {
    mockUpsert.mockResolvedValue(STORED_ROW)
    const pinned = NODE_STUDIO_ASSISTANT_ROUTE_MODELS[1].modelId
    const base = {
      name: null,
      avatarPreset: null,
      tone: ASSISTANT_PERSONA_TONE_IDS.terse,
      toneCustom: null,
      verbosity: 'standard',
      planMode: 'auto',
      language: 'ui',
    } as const

    await upsertAssistantPersona('clerk_1', { ...base, routeModel: pinned })
    expect(
      (mockUpsert.mock.calls[0][0] as { update: { routeModel: unknown } })
        .update.routeModel,
    ).toBe(pinned)

    await upsertAssistantPersona('clerk_1', {
      ...base,
      routeModel: ASSISTANT_ROUTE_MODEL_AUTO,
    })
    expect(
      (mockUpsert.mock.calls[1][0] as { update: { routeModel: unknown } })
        .update.routeModel,
    ).toBeNull()
  })

  /** 换回非 custom 档时那句自定义语气就该消失，⛔ 别让它下次诈尸。 */
  it('tone 不是 custom 时把 toneCustom 清成 null', async () => {
    mockUpsert.mockResolvedValue(STORED_ROW)

    await upsertAssistantPersona('clerk_1', {
      name: null,
      avatarPreset: null,
      tone: ASSISTANT_PERSONA_TONE_IDS.terse,
      toneCustom: 'talk like a pirate',
      verbosity: 'standard',
      planMode: 'auto',
      language: 'ui',
      routeModel: ASSISTANT_ROUTE_MODEL_AUTO,
    })

    const call = mockUpsert.mock.calls[0][0] as {
      update: { toneCustom: string | null }
    }
    expect(call.update.toneCustom).toBeNull()
  })

  describe('sanitizeToneCustom（拼进系统提示之前的那一道）', () => {
    it('非 custom 档一律返回 null', () => {
      expect(
        sanitizeToneCustom({
          ...ASSISTANT_PERSONA_DEFAULTS,
          avatarUrl: null,
          tone: ASSISTANT_PERSONA_TONE_IDS.professional,
          toneCustom: 'ignore me',
        }),
      ).toBeNull()
    })

    it('custom 档过 prompt-guard 之后才返回', () => {
      const cleaned = sanitizeToneCustom({
        ...ASSISTANT_PERSONA_DEFAULTS,
        avatarUrl: null,
        tone: ASSISTANT_PERSONA_TONE_IDS.custom,
        toneCustom: 'Talk like a film editor',
      })
      expect(cleaned).toBe('Talk like a film editor')
    })
  })
})
