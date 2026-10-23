import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createDELETE,
  createGET,
  createPATCH,
  createPOST,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/services/assistant-skill.service', async () => {
  const actual = await vi.importActual<
    typeof import('@/services/assistant-skill.service')
  >('@/services/assistant-skill.service')
  return {
    AssistantSkillError: actual.AssistantSkillError,
    listAssistantSkillsForClerkId: vi.fn(),
    createAssistantSkillForClerkId: vi.fn(),
    updateAssistantSkillForClerkId: vi.fn(),
    deleteAssistantSkillForClerkId: vi.fn(),
    updateBuiltinSkillForClerkId: vi.fn(),
  }
})

import { GET, POST } from './route'
import { DELETE, PATCH } from './[id]/route'
import { POST as POST_BUILTIN } from './builtin/route'
import {
  AssistantSkillError,
  createAssistantSkillForClerkId,
  deleteAssistantSkillForClerkId,
  listAssistantSkillsForClerkId,
  updateAssistantSkillForClerkId,
  updateBuiltinSkillForClerkId,
} from '@/services/assistant-skill.service'

const PATH = '/api/assistant-skills'
const SKILL = {
  id: 'skill-1',
  slug: 'skill-skill-1',
  name: '冬装三视图',
  description: '冬装角色出三视图',
  body: '三视图一律白底。',
  references: {},
  origin: 'mine' as const,
  enabled: true,
  autoRead: false,
}
const routeParams = { params: Promise.resolve({ id: SKILL.id }) }

/** 「你的技能」（第 7b 步）：只读写本人的；名字撞了 / 到上限说人话。 */
describe('/api/assistant-skills', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    vi.mocked(listAssistantSkillsForClerkId).mockResolvedValue([SKILL])
    vi.mocked(createAssistantSkillForClerkId).mockResolvedValue([SKILL])
  })

  it('未登录 401，谁的都不读', async () => {
    mockUnauthenticated()
    expect((await GET(createGET(PATH))).status).toBe(401)
    expect(listAssistantSkillsForClerkId).not.toHaveBeenCalled()
  })

  it('读本人那一整套', async () => {
    const res = await GET(createGET(PATH))
    expect(res.status).toBe(200)
    expect(listAssistantSkillsForClerkId).toHaveBeenCalledWith(
      'clerk_test_user',
    )
    expect(await parseJSON(res)).toMatchObject({ data: [SKILL] })
  })

  it('新建：名字里不能有 /', async () => {
    const bad = await POST(
      createPOST(PATH, { name: 'a/b', description: 'x', body: 'y' }),
    )
    expect(bad.status).toBe(400)
    const ok = await POST(
      createPOST(PATH, {
        name: ' 冬装三视图 ',
        description: '冬装角色出三视图',
        body: '三视图一律白底。',
      }),
    )
    expect(ok.status).toBe(200)
    expect(createAssistantSkillForClerkId).toHaveBeenCalledWith(
      'clerk_test_user',
      {
        name: '冬装三视图',
        description: '冬装角色出三视图',
        body: '三视图一律白底。',
      },
    )
  })

  it('名字撞了 409，带 i18n 键', async () => {
    vi.mocked(createAssistantSkillForClerkId).mockRejectedValue(
      new AssistantSkillError('nameTaken'),
    )
    const res = await POST(
      createPOST(PATH, { name: '参考图分工', description: 'x', body: 'y' }),
    )
    expect(res.status).toBe(409)
    expect(await parseJSON(res)).toMatchObject({
      i18nKey: 'errors.assistantSkill.nameTaken',
    })
  })

  it('改 / 删别人的 404', async () => {
    vi.mocked(updateAssistantSkillForClerkId).mockResolvedValue(null)
    vi.mocked(deleteAssistantSkillForClerkId).mockResolvedValue(false)
    expect(
      (
        await PATCH(
          createPATCH(`${PATH}/skill-1`, { enabled: false }),
          routeParams,
        )
      ).status,
    ).toBe(404)
    expect(
      (await DELETE(createDELETE(`${PATH}/skill-1`), routeParams)).status,
    ).toBe(404)
  })

  it('内置：开关或改成我的版本，什么都不给 400', async () => {
    vi.mocked(updateBuiltinSkillForClerkId).mockResolvedValue([SKILL])
    expect(
      (
        await POST_BUILTIN(
          createPOST(`${PATH}/builtin`, { slug: 'lora-mixing' }),
        )
      ).status,
    ).toBe(400)
    const res = await POST_BUILTIN(
      createPOST(`${PATH}/builtin`, { slug: 'lora-mixing', enabled: false }),
    )
    expect(res.status).toBe(200)
    expect(updateBuiltinSkillForClerkId).toHaveBeenCalledWith(
      'clerk_test_user',
      { slug: 'lora-mixing', enabled: false },
    )
  })
})
