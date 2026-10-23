import { ASSISTANT_SKILL_LIMITS } from '@/constants/assistant-skills'
import { parseSkillMd } from '@/lib/skill-md'
import { ASSISTANT_NEXT_HANDLE_PREFIXES as PREFIX } from '@/features/assistant/constants'
import { BUILTIN_SKILL_FILES } from '@/features/assistant/skills/builtin.generated'

/**
 * 助手的技能（第 7a 步内置、第 7b 步「你的技能」；方案 /mnt/project-files/assistant-reliability/step7b-plan.md）。
 *
 * ⭐ 一律是标准 SKILL.md（Agent Skills 开放格式）：内置的放在 `skills/builtin/<目录>/`，改了跑
 *   `npm run skills:generate`；你的存在 `AssistantSkill` 表里，导出也是同一个格式。
 * ⭐ 名字（`metadata.title`，中文）是模型看到的编号后半段：`技能·名字`、`/名字`。目录名是标准里的 `name`。
 * ⭐ 谁能读（owner 10-23）：内置的助手用到自己读（系统提示列名字 + 描述）；你自己写的只能用「/」叫，
 *   ⛔ 不进名单、`look` 也打不开。「改成我的版本」的那几份照旧是内置的位置，读到的是你那份。
 * ⚠ 改名 = 旧对话里的「技能·旧名」打不开；要改先想清楚。
 */

export const ASSISTANT_SKILL_NAMES = {
  tagPrompts: '标签模型写提示词',
  danbooruTags: '查角色 Danbooru 标签',
  references: '参考图分工',
  reproduce: '复刻与反推',
  tagBenchPeople: '标签台多人与画面文字',
  framing: '画面比例与档位',
  safetyBlock: '被安全过滤拦了',
  videoShots: '视频分镜与台词',
  seedance: 'Seedance 写法',
  loraMix: 'LoRA 搭配与复刻',
  characterProfile: '角色设定怎么查怎么写',
} as const

export type AssistantSkillOrigin = 'builtin' | 'override' | 'mine'

export interface AssistantSkill {
  /** 标准里的 `name`（目录名 / 导出文件夹名）。 */
  readonly slug: string
  /** 显示名，也是编号的后半段（`技能·<name>`、`/<name>`）。 */
  readonly name: string
  /** 做什么 + 什么时候用（标准里的 `description`）。 */
  readonly description: string
  readonly body: string
  /** 参考文件：路径 → 全文（如 `references/shot-grammar.md`）。 */
  readonly references: Readonly<Record<string, string>>
  readonly origin: AssistantSkillOrigin
  readonly enabled: boolean
  /** 助手能不能自己读：内置（含改过的）能；你自己写的只能「/」。 */
  readonly autoRead: boolean
}

function builtinOf(
  entry: (typeof BUILTIN_SKILL_FILES)[number],
): AssistantSkill {
  const parsed = parseSkillMd(entry.files['SKILL.md'] ?? '')
  if (!parsed || !parsed.metadata.title)
    throw new Error(
      `built-in skill ${entry.dir}: SKILL.md needs name, description and metadata.title`,
    )
  return {
    slug: entry.dir,
    name: parsed.metadata.title,
    description: parsed.description,
    body: parsed.body,
    references: Object.fromEntries(
      Object.entries(entry.files).filter(([path]) => path !== 'SKILL.md'),
    ),
    origin: 'builtin',
    enabled: true,
    autoRead: true,
  }
}

export const BUILTIN_SKILLS: readonly AssistantSkill[] =
  BUILTIN_SKILL_FILES.map(builtinOf)

/** 表里那一行（服务端读出来的样子）。 */
export interface AssistantSkillRow {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly body: string | null
  readonly references: Readonly<Record<string, string>>
  readonly builtinSlug: string | null
  readonly enabled: boolean
}

/** 你自己写的那份导出时的目录名：名字里的英文数字连起来，没有就用 id 前 8 位。 */
export function skillSlugOf(name: string, id: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '')
  return ascii || `skill-${id.slice(0, 8).toLowerCase()}`
}

/** 内置的 + 你改过 / 关掉的 + 你自己写的 → 这个人眼前的一整套。 */
export function resolveSkills(
  rows: readonly AssistantSkillRow[],
): AssistantSkill[] {
  const overrides = new Map(
    rows.flatMap((row) => (row.builtinSlug ? [[row.builtinSlug, row]] : [])),
  )
  const builtins = BUILTIN_SKILLS.map((skill): AssistantSkill => {
    const row = overrides.get(skill.slug)
    if (!row) return skill
    return {
      ...skill,
      ...(row.body !== null
        ? {
            body: row.body,
            description: row.description || skill.description,
            references: row.references,
            origin: 'override' as const,
          }
        : {}),
      enabled: row.enabled,
    }
  })
  const mine = rows
    .filter((row) => !row.builtinSlug && row.body !== null)
    .map(
      (row): AssistantSkill => ({
        slug: skillSlugOf(row.name, row.id),
        name: row.name,
        description: row.description,
        body: row.body ?? '',
        references: row.references,
        origin: 'mine',
        enabled: row.enabled,
        autoRead: false,
      }),
    )
  return [...builtins, ...mine]
}
/** 技能的编号：`技能·标签模型写提示词`。 */
export function skillHandle(skill: AssistantSkill): string {
  return `${PREFIX.skill}${skill.name}`
}

/** 一份正文前后的记号：清旧工具结果时认得出来、原样留着（读过的这一轮一直在）。 */
const SKILL_OPEN = 'SKILL '
const SKILL_CLOSE = 'END OF SKILL'
const SKILL_BLOCK = new RegExp(
  `${SKILL_OPEN}${PREFIX.skill}[\\s\\S]*?\\n${SKILL_CLOSE}`,
  'g',
)

function normalizeName(name: string): string {
  return name.replace(/[\s·・]/g, '').toLowerCase()
}

/** 按名字（或目录名）找一份（不分大小写、不管空格）；找不到回 null。 */
export function findSkill(
  name: string,
  skills: readonly AssistantSkill[] = BUILTIN_SKILLS,
): AssistantSkill | null {
  const wanted = normalizeName(name)
  return (
    skills.find(
      (skill) =>
        normalizeName(skill.name) === wanted ||
        normalizeName(skill.slug) === wanted,
    ) ?? null
  )
}

/** 一份技能全文的那一块（进这一轮的消息 / look 的回话），前后带记号。 */
function skillBlock(skill: AssistantSkill, text: string, label: string) {
  return `${SKILL_OPEN}${label} — ${skill.description} Follow it for the rest of this turn.\n${text}\n${SKILL_CLOSE}`
}

function referenceList(skill: AssistantSkill): string {
  const paths = Object.keys(skill.references)
  return paths.length
    ? `\n(Reference files, read one when the text above points to it: ${paths
        .map((path) => `look "${skillHandle(skill)}/${path}"`)
        .join(', ')})`
    : ''
}

/**
 * look 打开一份技能（`技能·名字`）或它的一份参考文件（`技能·名字/references/x.md`）。
 * 关掉的、只许「/」叫的（你自己写的）打不开；找不到就列出能读的那些。
 */
export function renderSkill(
  ref: string,
  skills: readonly AssistantSkill[] = BUILTIN_SKILLS,
): string {
  const slash = ref.indexOf('/')
  const name = slash < 0 ? ref : ref.slice(0, slash)
  const path = slash < 0 ? null : ref.slice(slash + 1).trim()
  const readable = skills.filter((skill) => skill.enabled && skill.autoRead)
  const skill = findSkill(name, skills)
  if (!skill || !skill.enabled || !skill.autoRead) {
    const why = !skill
      ? 'no such skill'
      : !skill.enabled
        ? 'the creator turned this skill off'
        : 'only the creator can call this skill, with /'
    return `${PREFIX.skill}${name}: ${why}. The skills you can read are: ${readable.map(skillHandle).join(', ')}.`
  }
  if (path) {
    const text = skill.references[path]
    return text === undefined
      ? `${skillHandle(skill)}/${path}: no such file.${referenceList(skill)}`
      : skillBlock(skill, text, `${skillHandle(skill)}/${path}`)
  }
  return skillBlock(
    skill,
    `${skill.body}${referenceList(skill)}`,
    skillHandle(skill),
  )
}

/**
 * 「/」点名的那几份（第 7b 步）：全文直接进这一轮的消息，不等模型自己去读。
 * 谁都能这样叫（你自己写的也行），关掉的不行。`args` 是胶囊后面那段话。
 */
export function renderCalledSkill(skill: AssistantSkill, args: string): string {
  return `THE CREATOR CALLED THIS SKILL WITH /${skill.name} — do what it says for this message${
    args.trim() ? `; what they wrote after it: ${args.trim()}` : ''
  }.\n${skillBlock(skill, `${skill.body}${referenceList(skill)}`, skillHandle(skill))}`
}

/**
 * 这条消息里「/」点了哪几份（第 7b 步）：`/名字` 前面是开头或空白才算（⛔ 认网址里的斜杠）。
 * 长名字先认（`/LoRA 搭配与复刻` 不被一份叫「LoRA」的抢走）；关掉的不算。
 * 最多 3 份、合计 3 万字，多出来的进 `dropped`（回一句给模型说）。`args` = 去掉这些记号的原话。
 */
export function calledSkillsIn(
  text: string,
  skills: readonly AssistantSkill[],
): {
  skills: AssistantSkill[]
  dropped: AssistantSkill[]
  args: string
} {
  const enabled = skills
    .filter((skill) => skill.enabled)
    .sort((a, b) => b.name.length - a.name.length)
  const found: { skill: AssistantSkill; at: number }[] = []
  let rest = text
  for (const skill of enabled) {
    const lower = rest.toLowerCase()
    const token = `/${skill.name.toLowerCase()}`
    let at = -1
    for (let from = 0; ; from = at + 1) {
      at = lower.indexOf(token, from)
      if (at < 0 || at === 0 || /\s/.test(rest[at - 1]!)) break
    }
    if (at < 0) continue
    found.push({ skill, at })
    rest = `${rest.slice(0, at)}${' '.repeat(token.length)}${rest.slice(at + token.length)}`
  }
  found.sort((a, b) => a.at - b.at)
  const kept: AssistantSkill[] = []
  const dropped: AssistantSkill[] = []
  let chars = 0
  for (const { skill } of found) {
    const size = skill.body.length
    if (
      kept.length >= ASSISTANT_SKILL_LIMITS.maxCalledPerMessage ||
      chars + size > ASSISTANT_SKILL_LIMITS.maxCalledChars
    )
      dropped.push(skill)
    else {
      kept.push(skill)
      chars += size
    }
  }
  return { skills: kept, dropped, args: rest.replace(/\s+/g, ' ').trim() }
}

/** 「/」点名的那几份拼成这一轮消息里的那一段；没有就是空串。 */
export function renderCalledSkills(
  text: string,
  skills: readonly AssistantSkill[],
): string {
  const called = calledSkillsIn(text, skills)
  if (!called.skills.length) return ''
  const blocks = called.skills.map((skill) =>
    renderCalledSkill(skill, called.args),
  )
  if (called.dropped.length)
    blocks.push(
      `(Too many skills in one message; these were NOT loaded, tell the creator to call them in a later message: ${called.dropped
        .map((skill) => `/${skill.name}`)
        .join(', ')})`,
    )
  return blocks.join('\n\n')
}

/** 一段工具结果里读过的技能全文（清旧结果时留下它们）。 */
export function skillBlocksIn(text: string): string[] {
  return text.match(SKILL_BLOCK) ?? []
}

/**
 * 系统提示里那一段（稳定段，对谁都一样）：只有内置技能的名字和描述。
 * 你关掉的那几份由 `skillsSettingsNote` 在「你的设置」那段说，名单本身不变（缓存吃得到）。
 */
export function skillsSection(): string {
  return `SKILLS — short guides for craft that goes wrong without them. Read one with look "${PREFIX.skill}<name>" whenever its line fits what you are about to do, BEFORE you write; it stays in front of you for the rest of the turn. Skip the ones that do not fit.
${BUILTIN_SKILLS.map((skill) => `- ${skillHandle(skill)}: ${skill.description}`).join('\n')}`
}

/** 「你的设置」那段里关于技能的一句（关掉了哪几份）；没关就没有。 */
export function skillsSettingsNote(skills: readonly AssistantSkill[]): string {
  const off = skills.filter((skill) => skill.autoRead && !skill.enabled)
  return off.length
    ? `\n\nSKILLS THE CREATOR TURNED OFF — do not read these: ${off.map(skillHandle).join(', ')}.`
    : ''
}
