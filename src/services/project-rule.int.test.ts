/**
 * L2a 真库：项目规则服务（project-rule.service）。不假任何自有模块，核库里的行与返回值。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { ASSISTANT_PROJECT_RULE_LIMITS } from '@/constants/assistant-operator'
import { db } from '@/lib/db'
import {
  addProjectRule,
  addProjectRuleForClerkId,
  deleteProjectRule,
  listProjectSourceRules,
  listProjectSourceRulesForClerkId,
  ProjectRuleLimitError,
} from '@/services/project-rule.service'
import { createTestUser, resetDatabase } from '@/test/int/db'

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
})

describe('project-rule.service（真库）', () => {
  it('写一条落库：没写来源记成 creator，读回来的形状对', async () => {
    const rule = await addProjectRuleForClerkId(me.clerkId, {
      kind: 'sourceDeny',
      text: 'pixiv.net',
    })
    expect(rule).toMatchObject({
      kind: 'sourceDeny',
      text: 'pixiv.net',
      source: 'creator',
      scope: null,
    })
    expect(
      await db.projectRule.findUniqueOrThrow({ where: { id: rule.id } }),
    ).toMatchObject({
      userId: me.id,
      kind: 'SOURCE_DENY',
      source: 'CREATOR',
    })
  })

  it('来源规则列表：只列我的、只列来源类、按 scope 带上全局的', async () => {
    // 旧的普通规则（NOTE）已并进记忆，库里残留的也不算来源规则
    await db.projectRule.create({
      data: {
        userId: me.id,
        text: '一直用暖色',
        kind: 'NOTE',
        source: 'CREATOR',
      },
    })
    await addProjectRule(me.id, { kind: 'sourceAllow', text: 'danbooru' })
    await addProjectRule(me.id, {
      kind: 'sourceDeny',
      text: 'x.com',
      scope: 'image',
      source: 'assistant',
    })
    await addProjectRule(me.id, {
      kind: 'sourceDeny',
      text: 'y.com',
      scope: 'video',
    })
    await addProjectRule(other.id, { kind: 'sourceAllow', text: 'theirs' })

    const all = await listProjectSourceRulesForClerkId(me.clerkId)
    expect(all.map((r) => r.text).sort()).toEqual([
      'danbooru',
      'x.com',
      'y.com',
    ])

    const scoped = await listProjectSourceRules(me.id, { scope: 'image' })
    expect(scoped.map((r) => r.text).sort()).toEqual(['danbooru', 'x.com'])
    expect(scoped.find((r) => r.text === 'x.com')!.source).toBe('assistant')
  })

  it('满了再写抛 ProjectRuleLimitError，不多落行', async () => {
    await db.projectRule.createMany({
      data: Array.from(
        { length: ASSISTANT_PROJECT_RULE_LIMITS.maxPerUser },
        (_, i) => ({
          userId: me.id,
          text: `r${i}`,
          kind: 'NOTE' as const,
          source: 'CREATOR' as const,
        }),
      ),
    })
    await expect(
      addProjectRule(me.id, { kind: 'sourceAllow', text: 'wiki' }),
    ).rejects.toBeInstanceOf(ProjectRuleLimitError)
    expect(await db.projectRule.count({ where: { userId: me.id } })).toBe(
      ASSISTANT_PROJECT_RULE_LIMITS.maxPerUser,
    )
    // 别人的上限各算各的
    await expect(
      addProjectRule(other.id, { kind: 'sourceAllow', text: 'ok.com' }),
    ).resolves.toMatchObject({ text: 'ok.com' })
  })

  it('删：只删得掉自己的', async () => {
    const mine = await addProjectRule(me.id, {
      kind: 'sourceAllow',
      text: 'mine.com',
    })
    const theirs = await addProjectRule(other.id, {
      kind: 'sourceAllow',
      text: 'x.com',
    })
    expect(await deleteProjectRule(me.clerkId, theirs.id)).toBe(false)
    expect(await deleteProjectRule(me.clerkId, mine.id)).toBe(true)
    expect(await deleteProjectRule(me.clerkId, mine.id)).toBe(false)
    expect(
      (await db.projectRule.findMany({ select: { id: true } })).map(
        (r) => r.id,
      ),
    ).toEqual([theirs.id])
  })
})
