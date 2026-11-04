import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { BUILTIN_SKILLS } from '@/features/assistant/skills'

import {
  AssistantSkillError,
  createAssistantSkillForClerkId,
  deleteAssistantSkillForClerkId,
  listAssistantSkillsForClerkId,
  updateAssistantSkillForClerkId,
  updateBuiltinSkillForClerkId,
} from './assistant-skill.service'

/**
 * 真库（L2a）：唯一约束、并发重复写、本人隔离只有真库才测得出来。
 * 10-28 线上 500 就是 (userId, name) 唯一约束——当时的单测把数据库换成了假的，拦不住。
 */
const builtin = BUILTIN_SKILLS[0]!

describe('assistant-skill.service（真库）', () => {
  beforeEach(resetDatabase)

  it('自己早先存过和内置同名的技能，再打开内置那份不撞唯一约束', async () => {
    const user = await createTestUser()
    await db.assistantSkill.create({
      data: {
        userId: user.id,
        name: builtin.name,
        description: '我自己写的同名技能',
      },
    })

    await expect(
      updateBuiltinSkillForClerkId(user.clerkId, {
        slug: builtin.slug,
        enabled: false,
      }),
    ).resolves.toBeDefined()

    const rows = await db.assistantSkill.findMany({
      where: { userId: user.id },
    })
    expect(rows).toHaveLength(2)
    expect(rows.find((row) => row.builtinSlug === builtin.slug)?.enabled).toBe(
      false,
    )
  })

  it('连点两下（两个请求同时到）只落一行', async () => {
    const user = await createTestUser()
    await Promise.all([
      updateBuiltinSkillForClerkId(user.clerkId, {
        slug: builtin.slug,
        enabled: false,
      }),
      updateBuiltinSkillForClerkId(user.clerkId, {
        slug: builtin.slug,
        enabled: false,
      }),
    ]).catch(() => undefined)

    expect(
      await db.assistantSkill.count({
        where: { userId: user.id, builtinSlug: builtin.slug },
      }),
    ).toBe(1)
  })

  it('只改本人的：别人看到的内置技能不受影响', async () => {
    const me = await createTestUser()
    const other = await createTestUser()
    await updateBuiltinSkillForClerkId(me.clerkId, {
      slug: builtin.slug,
      enabled: false,
    })

    const mine = await listAssistantSkillsForClerkId(me.clerkId)
    const theirs = await listAssistantSkillsForClerkId(other.clerkId)
    expect(mine.find((s) => s.slug === builtin.slug)?.enabled).toBe(false)
    expect(theirs.find((s) => s.slug === builtin.slug)?.enabled).toBe(true)
  })
})

/** 每人一份（owner 10-23「助手每个人只有自己看的到」）：读、改、删都只碰本人的行。 */
describe('assistant-skill.service：本人隔离 / 新建闸 / 改成我的版本（真库）', () => {
  beforeEach(resetDatabase)

  it('别人的技能改不了、删不掉，那一行原样还在', async () => {
    const owner = await createTestUser()
    const stranger = await createTestUser()
    const skill = await db.assistantSkill.create({
      data: { userId: owner.id, name: '我的', description: 'x', body: '原文' },
    })

    expect(
      await updateAssistantSkillForClerkId(stranger.clerkId, skill.id, {
        body: '改',
      }),
    ).toBeNull()
    expect(
      await deleteAssistantSkillForClerkId(stranger.clerkId, skill.id),
    ).toBe(false)

    const row = await db.assistantSkill.findUniqueOrThrow({
      where: { id: skill.id },
    })
    expect(row.body).toBe('原文')
  })

  it('新建：名字不能和内置撞；到上限不收，库里不多一行', async () => {
    const user = await createTestUser()
    await expect(
      createAssistantSkillForClerkId(user.clerkId, {
        name: '参考图分工',
        description: 'x',
        body: 'y',
      }),
    ).rejects.toEqual(new AssistantSkillError('nameTaken'))

    await db.assistantSkill.createMany({
      data: Array.from({ length: 200 }, (_, i) => ({
        userId: user.id,
        name: `skill ${i}`,
        description: 'x',
      })),
    })
    await expect(
      createAssistantSkillForClerkId(user.clerkId, {
        name: '新的',
        description: 'x',
        body: 'y',
      }),
    ).rejects.toEqual(new AssistantSkillError('limit'))
    expect(await db.assistantSkill.count({ where: { userId: user.id } })).toBe(
      200,
    )
  })

  it('改成我的版本：本人名下多一行，带上内置的参考文件；不认识的内置报错', async () => {
    const user = await createTestUser()
    await updateBuiltinSkillForClerkId(user.clerkId, {
      slug: 'video-shots-and-dialogue',
      body: '我的版本',
    })

    const row = await db.assistantSkill.findFirstOrThrow({
      where: { userId: user.id, builtinSlug: 'video-shots-and-dialogue' },
    })
    expect(row).toMatchObject({ body: '我的版本', enabled: true })
    // 名字带 `/`：用户起的名字不许带，撞不上 (userId, name) 唯一约束（10-28 线上 500）。
    expect(row.name).toBe('builtin/video-shots-and-dialogue')
    expect(
      Object.keys(row.references as Record<string, unknown>).length,
    ).toBeGreaterThan(0)

    await expect(
      updateBuiltinSkillForClerkId(user.clerkId, {
        slug: 'nope',
        enabled: false,
      }),
    ).rejects.toEqual(new AssistantSkillError('unknownBuiltin'))
  })
})
