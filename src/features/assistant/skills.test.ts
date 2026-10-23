import { describe, expect, it } from 'vitest'

import { readBuiltinSkills } from '../../../scripts/generate-assistant-skills.mjs'
import { parseSkillMd } from '@/lib/skill-md'
import {
  ASSISTANT_SKILL_NAMES,
  BUILTIN_SKILLS,
  findSkill,
  calledSkillsIn,
  renderCalledSkill,
  renderSkill,
  resolveSkills,
  skillBlocksIn,
  skillsSection,
  skillsSettingsNote,
  type AssistantSkillRow,
} from './skills'
import { BUILTIN_SKILL_FILES } from './skills/builtin.generated'

function row(overrides: Partial<AssistantSkillRow>): AssistantSkillRow {
  return {
    id: '0f3c1d2e-0000-4000-8000-000000000000',
    name: '我的技能',
    description: '我自己写的一份',
    body: '照我说的做。',
    references: {},
    builtinSlug: null,
    enabled: true,
    ...overrides,
  }
}

/** 内置技能（第 7a 步）：名字认得出、正文里点名的别的技能都真有、清旧结果时认得出整段。 */
describe('内置技能', () => {
  it('生成的模块和 builtin/ 下的文件一致（改了文件要跑 npm run skills:generate）', () => {
    expect(readBuiltinSkills()).toEqual(BUILTIN_SKILL_FILES)
  })

  it('每份都是合规的 SKILL.md：name 等于目录名、有中文名和描述', () => {
    for (const entry of BUILTIN_SKILL_FILES) {
      const parsed = parseSkillMd(entry.files['SKILL.md'] ?? '')
      expect(parsed?.name, entry.dir).toBe(entry.dir)
      expect(parsed?.description.length ?? 0).toBeLessThanOrEqual(1024)
    }
  })

  it('名字不重复，每份都有描述和正文；代码里点名的都在', () => {
    const names = BUILTIN_SKILLS.map((skill) => skill.name)
    expect(new Set(names).size).toBe(names.length)
    for (const skill of BUILTIN_SKILLS) {
      expect(skill.description.length).toBeGreaterThan(10)
      expect(skill.body.length).toBeGreaterThan(200)
    }
    for (const name of Object.values(ASSISTANT_SKILL_NAMES))
      expect(findSkill(name)?.name).toBe(name)
  })

  it('正文里点名的「技能·…」都找得到，参考文件也都在', () => {
    let named = 0
    for (const skill of BUILTIN_SKILLS) {
      const texts = [skill.body, ...Object.values(skill.references)]
      for (const text of texts)
        for (const match of text.matchAll(/技能·/g)) {
          const after = text.slice(match.index + 3)
          named += 1
          const other = BUILTIN_SKILLS.find((candidate) =>
            after.startsWith(candidate.name),
          )
          expect(other, after.slice(0, 20)).toBeDefined()
          const path = /^\/(references\/[\w.-]+\.md)/.exec(
            after.slice(other!.name.length),
          )?.[1]
          if (path)
            expect(other!.references[path], after.slice(0, 60)).toBeDefined()
        }
    }
    expect(named).toBeGreaterThan(0)
  })

  it('找名字不管空格和大小写，目录名也认', () => {
    expect(findSkill('lora搭配与复刻')?.name).toBe('LoRA 搭配与复刻')
    expect(findSkill(' 参考图分工 ')?.name).toBe('参考图分工')
    expect(findSkill('reference-roles')?.name).toBe('参考图分工')
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

  it('参考文件一次读一份；正文末尾列出能读的', () => {
    const skill = findSkill('视频分镜与台词')!
    const [path] = Object.keys(skill.references)
    expect(renderSkill('视频分镜与台词')).toContain(
      `look "技能·视频分镜与台词/${path}"`,
    )
    const ref = renderSkill(`视频分镜与台词/${path}`)
    expect(ref).toContain(skill.references[path!]!.slice(0, 80))
    expect(skillBlocksIn(ref)).toEqual([ref])
    expect(renderSkill('视频分镜与台词/references/nope.md')).toContain(
      'no such file',
    )
  })

  it('系统提示里只有名字和描述，没有正文', () => {
    const section = skillsSection()
    for (const skill of BUILTIN_SKILLS) {
      expect(section).toContain(`技能·${skill.name}: ${skill.description}`)
      expect(section).not.toContain(skill.body.slice(0, 80))
    }
  })
})

/** 你的技能（第 7b 步）：改版顶替内置、关掉的读不到、自己写的只许「/」。 */
describe('你的技能', () => {
  it('改成我的版本：位置和名字不变，读到的是你那份', () => {
    const skills = resolveSkills([
      row({
        name: '参考图分工',
        builtinSlug: 'reference-roles',
        body: '我的参考图规矩。',
      }),
    ])
    const skill = findSkill('参考图分工', skills)!
    expect(skill.origin).toBe('override')
    expect(skill.autoRead).toBe(true)
    expect(skills.length).toBe(BUILTIN_SKILLS.length)
    expect(renderSkill('参考图分工', skills)).toContain('我的参考图规矩。')
  })

  it('只关不改：读不到，设置那段点名', () => {
    const skills = resolveSkills([
      row({
        name: '参考图分工',
        builtinSlug: 'reference-roles',
        body: null,
        enabled: false,
      }),
    ])
    expect(findSkill('参考图分工', skills)?.origin).toBe('builtin')
    expect(renderSkill('参考图分工', skills)).toContain('turned this skill off')
    expect(skillsSettingsNote(skills)).toContain('技能·参考图分工')
    expect(skillsSettingsNote(resolveSkills([]))).toBe('')
  })

  it('自己写的：不进名单、look 打不开，「/」能叫', () => {
    const skills = resolveSkills([row({})])
    const mine = findSkill('我的技能', skills)!
    expect(mine.origin).toBe('mine')
    expect(mine.autoRead).toBe(false)
    expect(renderSkill('我的技能', skills)).toContain('only the creator')
    expect(skillsSettingsNote(skills)).toBe('')
    const called = renderCalledSkill(mine, ' 马尔福 ')
    expect(called).toContain('/我的技能')
    expect(called).toContain('马尔福')
    expect(called).toContain('照我说的做。')
    expect(skillBlocksIn(called)).toHaveLength(1)
  })

  it('「/」认名字：开头或空白后才算、长名字先认、最多 3 份', () => {
    const skills = resolveSkills([
      row({ name: 'LoRA' }),
      row({ id: 'x2', name: '三视图' }),
    ])
    const called = calledSkillsIn(
      '看 a/三视图 再 /LoRA 搭配与复刻 /三视图 马尔福',
      skills,
    )
    expect(called.skills.map((skill) => skill.name)).toEqual([
      'LoRA 搭配与复刻',
      '三视图',
    ])
    expect(called.args).toBe('看 a/三视图 再 马尔福')
    const many = calledSkillsIn(
      '/参考图分工 /复刻与反推 /画面比例与档位 /Seedance 写法',
      BUILTIN_SKILLS,
    )
    expect(many.skills).toHaveLength(3)
    expect(many.dropped.map((skill) => skill.name)).toEqual(['Seedance 写法'])
  })
})
