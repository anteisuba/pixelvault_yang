import { describe, expect, it } from 'vitest'

import {
  ASSISTANT_SKILLS,
  findSkill,
  renderSkill,
  skillBlocksIn,
  skillsSection,
} from './skills'

/** 内置技能（第 7a 步）：名字认得出、正文里点名的别的技能都真有、清旧结果时认得出整段。 */
describe('内置技能', () => {
  it('名字不重复，每份都有一句和正文', () => {
    const names = ASSISTANT_SKILLS.map((skill) => skill.name)
    expect(new Set(names).size).toBe(names.length)
    for (const skill of ASSISTANT_SKILLS) {
      expect(skill.when.length).toBeGreaterThan(10)
      expect(skill.body.length).toBeGreaterThan(200)
    }
  })

  it('正文里点名的「技能·…」都找得到', () => {
    let named = 0
    for (const skill of ASSISTANT_SKILLS)
      for (const match of skill.body.matchAll(/技能·/g)) {
        const after = skill.body.slice(match.index + 3)
        named += 1
        expect(
          ASSISTANT_SKILLS.some((other) => after.startsWith(other.name)),
          after.slice(0, 20),
        ).toBe(true)
      }
    expect(named).toBeGreaterThan(0)
  })

  it('找名字不管空格和大小写', () => {
    expect(findSkill('lora搭配与复刻')?.name).toBe('LoRA 搭配与复刻')
    expect(findSkill(' 参考图分工 ')?.name).toBe('参考图分工')
    expect(findSkill('不存在')).toBeNull()
  })

  it('读出来的全文能从一段工具结果里原样认回来', () => {
    const a = renderSkill('参考图分工')
    const b = renderSkill('Seedance 写法')
    expect(skillBlocksIn(`前面\n\n${a}\n\n中间\n${b}\n\nTHE BENCH`)).toEqual([
      a,
      b,
    ])
    expect(skillBlocksIn(renderSkill('不存在'))).toEqual([])
  })

  it('系统提示里只有名字和一句，没有正文', () => {
    const section = skillsSection()
    for (const skill of ASSISTANT_SKILLS) {
      expect(section).toContain(`技能·${skill.name}: ${skill.when}`)
      expect(section).not.toContain(skill.body.slice(0, 80))
    }
  })
})
