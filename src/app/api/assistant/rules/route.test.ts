import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  createGET,
  createPOST,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { PROJECT_RULE_SOURCE_IDS } from '@/constants/assistant-operator'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockList = vi.fn()
const mockAdd = vi.fn()

vi.mock('@/services/project-rule.service', async () => {
  const actual = await vi.importActual<
    typeof import('@/services/project-rule.service')
  >('@/services/project-rule.service')
  return {
    ProjectRuleLimitError: actual.ProjectRuleLimitError,
    listProjectRulesForClerkId: (...args: unknown[]) => mockList(...args),
    addProjectRuleForClerkId: (...args: unknown[]) => mockAdd(...args),
  }
})

import { GET, POST } from '@/app/api/assistant/rules/route'
import { ProjectRuleLimitError } from '@/services/project-rule.service'

const RULE = {
  id: 'rule-1',
  scope: null,
  text: 'Never put text inside the picture.',
  source: PROJECT_RULE_SOURCE_IDS.creator,
  createdAt: '2026-09-01T10:00:00.000Z',
}

describe('GET /api/assistant/rules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockList.mockResolvedValue([RULE])
  })

  it('未登录时 401', async () => {
    mockUnauthenticated()
    const res = await GET(createGET('/api/assistant/rules'))
    expect(res.status).toBe(401)
    expect(mockList).not.toHaveBeenCalled()
  })

  it('不带 scope 时取全部', async () => {
    const res = await GET(createGET('/api/assistant/rules'))
    expect(res.status).toBe(200)
    await expect(parseJSON(res)).resolves.toEqual({
      success: true,
      data: [RULE],
    })
    expect(mockList).toHaveBeenCalledWith('clerk_test_user', { scope: null })
  })

  it('带 scope 时透传给 service', async () => {
    await GET(createGET('/api/assistant/rules', { scope: 'image' }))
    expect(mockList).toHaveBeenCalledWith('clerk_test_user', { scope: 'image' })
  })

  /** ⚠ `canvas` 2026-09-19 进了域词表（进度表 22），举例换成真的在表外的值。 */
  it('词表外的 scope 400', async () => {
    const res = await GET(createGET('/api/assistant/rules', { scope: 'audio' }))
    expect(res.status).toBe(400)
    expect(mockList).not.toHaveBeenCalled()
  })

  it('canvas 是词表里的域 —— 照样透传给 service', async () => {
    await GET(createGET('/api/assistant/rules', { scope: 'canvas' }))
    expect(mockList).toHaveBeenCalledWith('clerk_test_user', {
      scope: 'canvas',
    })
  })
})

describe('POST /api/assistant/rules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockAdd.mockResolvedValue(RULE)
  })

  it('未登录时 401', async () => {
    mockUnauthenticated()
    const res = await POST(createPOST('/api/assistant/rules', { text: 'x' }))
    expect(res.status).toBe(401)
    expect(mockAdd).not.toHaveBeenCalled()
  })

  it('空规则 400', async () => {
    const res = await POST(createPOST('/api/assistant/rules', { text: '   ' }))
    expect(res.status).toBe(400)
    expect(mockAdd).not.toHaveBeenCalled()
  })

  it('合法载荷落到 service 上', async () => {
    const res = await POST(
      createPOST('/api/assistant/rules', { text: RULE.text }),
    )
    expect(res.status).toBe(200)
    expect(mockAdd).toHaveBeenCalledWith('clerk_test_user', {
      text: RULE.text,
      // 缺省是普通规则（v2 §9.3）。
      kind: 'note',
    })
  })

  /** 来源名单那两种（v2 §9.3）——`text` 收成域名，⛔ 一句话 400。 */
  it('来源类规则把地址收成域名；一句话 400', async () => {
    const res = await POST(
      createPOST('/api/assistant/rules', {
        text: 'https://WWW.Danbooru.donmai.us/posts',
        kind: 'sourceAllow',
      }),
    )
    expect(res.status).toBe(200)
    expect(mockAdd).toHaveBeenCalledWith('clerk_test_user', {
      text: 'danbooru.donmai.us',
      kind: 'sourceAllow',
    })

    mockAdd.mockClear()
    const bad = await POST(
      createPOST('/api/assistant/rules', {
        text: '只信官方设定集',
        kind: 'sourceDeny',
      }),
    )
    expect(bad.status).toBe(400)
    expect(mockAdd).not.toHaveBeenCalled()
  })

  /** 上限是一条真的会拒的闸 —— 用户读得到一句话，⛔ 不静默丢弃。 */
  it('撞上限时 409 且带 i18n 键', async () => {
    mockAdd.mockRejectedValue(new ProjectRuleLimitError(50))

    const res = await POST(
      createPOST('/api/assistant/rules', { text: 'one more' }),
    )
    expect(res.status).toBe(409)
    await expect(parseJSON(res)).resolves.toMatchObject({
      success: false,
      errorCode: 'PROJECT_RULE_LIMIT_REACHED',
      i18nKey: 'errors.projectRule.limitReached',
    })
  })
})
