import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const db = vi.hoisted(() => ({
  assistantSkill: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
}))
vi.mock('@/lib/db', () => ({ db }))
vi.mock('@/services/user.service', () => ({
  ensureUser: async (clerkId: string) => ({ id: `user-of-${clerkId}` }),
}))

import {
  AssistantSkillError,
  createAssistantSkillForClerkId,
  deleteAssistantSkillForClerkId,
  updateAssistantSkillForClerkId,
  updateBuiltinSkillForClerkId,
} from './assistant-skill.service'

/** 每人一份（owner 10-23「助手每个人只有自己看的到」）：每一条查询都按本人 userId 收敛。 */
describe('assistant-skill.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.assistantSkill.findMany.mockResolvedValue([])
    db.assistantSkill.count.mockResolvedValue(0)
    db.assistantSkill.findFirst.mockResolvedValue(null)
  })

  it('读、改、删都只碰本人的行', async () => {
    expect(
      await updateAssistantSkillForClerkId('clerk-b', 'skill-of-a', {
        body: '改',
      }),
    ).toBeNull()
    expect(db.assistantSkill.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'skill-of-a', userId: 'user-of-clerk-b' },
      }),
    )
    expect(db.assistantSkill.update).not.toHaveBeenCalled()

    db.assistantSkill.deleteMany.mockResolvedValue({ count: 0 })
    expect(await deleteAssistantSkillForClerkId('clerk-b', 'skill-of-a')).toBe(
      false,
    )
    expect(db.assistantSkill.deleteMany).toHaveBeenCalledWith({
      where: { id: 'skill-of-a', userId: 'user-of-clerk-b' },
    })
  })

  it('新建：名字不能和内置撞；到 200 份不收', async () => {
    await expect(
      createAssistantSkillForClerkId('clerk-a', {
        name: '参考图分工',
        description: 'x',
        body: 'y',
      }),
    ).rejects.toEqual(new AssistantSkillError('nameTaken'))
    db.assistantSkill.count.mockResolvedValue(200)
    await expect(
      createAssistantSkillForClerkId('clerk-a', {
        name: '新的',
        description: 'x',
        body: 'y',
      }),
    ).rejects.toEqual(new AssistantSkillError('limit'))
    expect(db.assistantSkill.create).not.toHaveBeenCalled()
  })

  it('改成我的版本：本人名下多一行，带上内置的参考文件', async () => {
    await updateBuiltinSkillForClerkId('clerk-a', {
      slug: 'video-shots-and-dialogue',
      body: '我的版本',
    })
    const data = db.assistantSkill.create.mock.calls[0]![0].data
    expect(data).toMatchObject({
      userId: 'user-of-clerk-a',
      builtinSlug: 'video-shots-and-dialogue',
      body: '我的版本',
      enabled: true,
    })
    expect(Object.keys(data.references).length).toBeGreaterThan(0)
    await expect(
      updateBuiltinSkillForClerkId('clerk-a', { slug: 'nope', enabled: false }),
    ).rejects.toEqual(new AssistantSkillError('unknownBuiltin'))
  })
})
