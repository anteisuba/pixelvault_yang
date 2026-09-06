import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  ASSISTANT_AVATAR_PRESET_IDS,
  ASSISTANT_PERSONA_DEFAULTS,
  ASSISTANT_PERSONA_TONE_IDS,
} from '@/constants/assistant-persona'

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

    await expect(getAssistantPersona('clerk_1')).resolves.toEqual(STORED_ROW)
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
