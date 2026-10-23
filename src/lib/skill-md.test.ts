import { describe, expect, it } from 'vitest'

import { parseSkillMd, serializeSkillMd, SKILL_NAME_PATTERN } from './skill-md'

describe('SKILL.md 读写', () => {
  it('读：标量、单双引号、metadata 下一层、正文', () => {
    const parsed = parseSkillMd(`---
name: my-skill
description: 'It''s for: things'
license: MIT
metadata:
  title: "中文 \\"名\\""
  author: me
---

# Body

text
`)
    expect(parsed).toEqual({
      name: 'my-skill',
      description: "It's for: things",
      metadata: { title: '中文 "名"', author: 'me' },
      body: '# Body\n\ntext',
    })
  })

  it('缺开头那段或缺字段回 null', () => {
    expect(parseSkillMd('# just markdown')).toBeNull()
    expect(parseSkillMd('---\nname: x\n---\nbody')).toBeNull()
  })

  it('写出去再读回来不变', () => {
    const skill = {
      name: 'a-b',
      description: "Use when: it's late\nand dark",
      metadata: { title: '夜里' },
      body: '正文\n\n第二段',
    }
    expect(parseSkillMd(serializeSkillMd(skill))).toEqual({
      ...skill,
      description: "Use when: it's late and dark",
    })
  })

  it('标准名字规则', () => {
    expect(SKILL_NAME_PATTERN.test('lora-mixing')).toBe(true)
    expect(SKILL_NAME_PATTERN.test('-bad')).toBe(false)
    expect(SKILL_NAME_PATTERN.test('Bad')).toBe(false)
  })
})
