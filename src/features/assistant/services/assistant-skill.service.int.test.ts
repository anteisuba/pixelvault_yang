import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { BUILTIN_SKILLS } from '@/features/assistant/skills'

import {
  listAssistantSkillsForClerkId,
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
