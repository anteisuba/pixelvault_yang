import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  createGET,
  createPUT,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import {
  ASSISTANT_AVATAR_PRESET_IDS,
  ASSISTANT_PERSONA_DEFAULTS,
  ASSISTANT_ROUTE_MODEL_AUTO,
  ASSISTANT_PERSONA_TONE_IDS,
} from '@/constants/assistant-persona'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockGet = vi.fn()
const mockUpsert = vi.fn()

vi.mock('@/services/assistant-persona.service', () => ({
  getAssistantPersona: (...args: unknown[]) => mockGet(...args),
  upsertAssistantPersona: (...args: unknown[]) => mockUpsert(...args),
}))

import { GET, PUT } from '@/app/api/assistant/persona/route'

const PERSONA = { ...ASSISTANT_PERSONA_DEFAULTS, avatarUrl: null }

const VALID_BODY = {
  name: 'Mika',
  avatarPreset: ASSISTANT_AVATAR_PRESET_IDS[0],
  tone: ASSISTANT_PERSONA_TONE_IDS.professional,
  toneCustom: null,
  verbosity: 'standard',
  planMode: 'auto',
  language: 'ui',
  routeModel: ASSISTANT_ROUTE_MODEL_AUTO,
}

describe('GET /api/assistant/persona', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockGet.mockResolvedValue(PERSONA)
  })

  it('未登录时 401', async () => {
    mockUnauthenticated()
    const res = await GET(createGET('/api/assistant/persona'))
    expect(res.status).toBe(401)
    expect(mockGet).not.toHaveBeenCalled()
  })

  /** 库里没有那一行照样是 200 —— 服务返回代码默认值（§8.4 第 4 条）。 */
  it('缺行时也返回 200 与默认 persona', async () => {
    const res = await GET(createGET('/api/assistant/persona'))
    expect(res.status).toBe(200)
    await expect(parseJSON(res)).resolves.toMatchObject({
      success: true,
      data: PERSONA,
    })
  })
})

describe('PUT /api/assistant/persona', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockUpsert.mockResolvedValue(PERSONA)
  })

  it('未登录时 401', async () => {
    mockUnauthenticated()
    const res = await PUT(createPUT('/api/assistant/persona', VALID_BODY))
    expect(res.status).toBe(401)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('词表外的语气档 400', async () => {
    const res = await PUT(
      createPUT('/api/assistant/persona', { ...VALID_BODY, tone: 'sarcastic' }),
    )
    expect(res.status).toBe(400)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  /** 选了 custom 却没写那句话 —— schema 层就拒，⛔ 不静默退回 professional。 */
  it('tone=custom 而 toneCustom 空时 400', async () => {
    const res = await PUT(
      createPUT('/api/assistant/persona', {
        ...VALID_BODY,
        tone: ASSISTANT_PERSONA_TONE_IDS.custom,
        toneCustom: null,
      }),
    )
    expect(res.status).toBe(400)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('合法载荷落到 service 上', async () => {
    const res = await PUT(createPUT('/api/assistant/persona', VALID_BODY))
    expect(res.status).toBe(200)
    expect(mockUpsert).toHaveBeenCalledWith(
      'clerk_test_user',
      expect.objectContaining({ name: 'Mika' }),
    )
  })

  /** 头像地址由上传那条路写 —— 客户端递进来的会被 schema 剥掉。 */
  it('载荷里的 avatarUrl 不会流到 service', async () => {
    await PUT(
      createPUT('/api/assistant/persona', {
        ...VALID_BODY,
        avatarUrl: 'https://evil.example/pic.png',
      }),
    )
    expect(mockUpsert.mock.calls[0][1]).not.toHaveProperty('avatarUrl')
  })
})
