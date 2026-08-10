/**
 * 正文引用胶囊 —— 契约 `references/pages/canvas-slot-rack.md` §5.2。
 *
 * ── 它解决的是「位置即拼接顺序」 ─────────────────────────────────────
 * 今天上游文本走 `mergePromptWithUpstreamText`，先后**写死在代码里**
 * （`${upstream}\n\n${base}`，上游永远在前）。用户无从决定「我的话在前，还是
 * 分镜文本在前」。胶囊把这个顺序交还给他：胶囊在句子里的位置，就是那段文字
 * 展开后所在的位置。
 *
 * ── 为什么文本不进腰带 ───────────────────────────────────────────────
 * 判据是**物种**不是惯例：图 / 音 / 视频是二进制素材，除了当槽没有别的去处；
 * 文本与提示词**同质**，最终合成同一个字符串。把文本做成槽是「为统一而统一」。
 *
 * ── 存储形态 ─────────────────────────────────────────────────────────
 * 正文仍是**纯字符串**（`data.prompt`），胶囊以 `▤名字` 的形式内嵌 —— 与素材的
 * `@` 分开，因为阶段 1 之后正文里的 `@xxx` 已经是**用户自己打的字**，两者混用
 * 会互相误伤。名字查不到对应节点时**降级成字面文字**，不是错误：这与契约给胶囊
 * 定的第二个动作「展开为文字（脱钩）」是同一个终态。
 */

/** 胶囊前缀。与契约 §5.2 的形态示例 `▤ 深夜便利店-吧台` 同一个字。 */
export const TEXT_CAPSULE_PREFIX = '▤'

/**
 * 名字允许的字符：不含空白、不含另一个前缀。
 * ⚠ 刻意**不允许空白** —— 「▤ 深夜便利店 吧台」这种写法没法在纯文本里划出边界，
 * 而正文是用户随便打字的地方，边界不清就会把后面的句子一起吃进胶囊。
 */
const CAPSULE_PATTERN = new RegExp(
  `${TEXT_CAPSULE_PREFIX}([^\\s${TEXT_CAPSULE_PREFIX}]+)`,
  'g',
)

export interface TextCapsuleRef {
  /** 被引用的文本节点名字（正文里写的那个）。 */
  name: string
  /** 在正文里的起止位置，供 UI 定位与替换。 */
  start: number
  end: number
}

/** 扫出正文里全部胶囊，按出现顺序。 */
export function parseTextCapsules(prompt: string): TextCapsuleRef[] {
  const out: TextCapsuleRef[] = []
  CAPSULE_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = CAPSULE_PATTERN.exec(prompt)) !== null) {
    out.push({
      name: match[1],
      start: match.index,
      end: match.index + match[0].length,
    })
  }
  return out
}

/**
 * 名字在胶囊里的规范形 —— **去掉全部空白**。
 *
 * ⚠ 这是唯一的规范化处，四处必须问同一个函数：写字面量（`formatTextCapsule`）、
 * 建查找表（`composePromptWithTextNodes`）、编辑器认字面量的名单（`capsuleNames`）、
 * 插入时给 `insertToken` 的名字。任一处自己写一遍 `replace(/\s+/g,'')`，
 * 「开场 设定」这种带空格的名字就会在某一处对不上 —— 表现是胶囊变成一段裸文字，
 * 或者发送时展不开。
 */
export function normalizeTextCapsuleName(name: string): string {
  return name.trim().replace(/\s+/g, '')
}

/**
 * 把一个名字写成胶囊字面量。
 *
 * ⚠ **调用方不要自己拼前缀，也不要把它的返回值再交给会拼前缀的 API**。
 * `MentionInput.insertToken(name, kind)` 就是按 kind 自己拼前缀的那种 ——
 * 把这里的返回值喂给它会得到 `▤▤名字`（2026-08-10 真机撞到过：正文里多一个裸
 * `▤`，编辑器也不再认它是胶囊）。给 `insertToken` 的应当是
 * `normalizeTextCapsuleName(name)`。
 */
export function formatTextCapsule(name: string): string {
  return `${TEXT_CAPSULE_PREFIX}${normalizeTextCapsuleName(name)}`
}

export interface TextCapsuleExpansion {
  /** 展开后的正文。 */
  prompt: string
  /** 真正被展开掉的名字（用于让调用方从「上游文本前置」里排除它们）。 */
  expandedNames: string[]
  /**
   * 遇到环而停下的名字。**不静默丢**：调用方要能把这件事说出来。
   * 环里的那一处胶囊在输出里保持字面量（`▤名字`），用户看得见是哪一个。
   */
  cycleNames: string[]
}

/**
 * 按位置展开正文里的全部胶囊。
 *
 * ⚠ **循环引用要挡住**（owner 2026-08-10 定「文本可以 @ 文本」时同批拍的）：
 * A 引 B、B 又引 A 会无限展开。这里带着一条**引用链**递归，遇到链上已有的名字
 * 就停在那儿、把该处留成字面量，并记进 `cycleNames`。
 * 停在环上而不是整体报错，是因为正文的其余部分仍然是好的 —— 用户要的是「把能
 * 展的展了，告诉我哪一处成环」，不是「整段拒绝」。
 */
export function expandTextCapsules(
  prompt: string,
  resolveText: (name: string) => string | undefined,
  chain: readonly string[] = [],
): TextCapsuleExpansion {
  const capsules = parseTextCapsules(prompt)
  if (capsules.length === 0) {
    return { prompt, expandedNames: [], cycleNames: [] }
  }

  const expandedNames: string[] = []
  const cycleNames: string[] = []
  let out = ''
  let cursor = 0

  for (const capsule of capsules) {
    out += prompt.slice(cursor, capsule.start)
    cursor = capsule.end

    if (chain.includes(capsule.name)) {
      // 环：原样留字面量，让用户看得见是哪一个。
      cycleNames.push(capsule.name)
      out += prompt.slice(capsule.start, capsule.end)
      continue
    }

    const text = resolveText(capsule.name)
    if (text === undefined) {
      // 名字查不到 —— 降级成字面文字（同「展开为文字」的终态），不是错误。
      out += prompt.slice(capsule.start, capsule.end)
      continue
    }

    const nested = expandTextCapsules(text, resolveText, [
      ...chain,
      capsule.name,
    ])
    out += nested.prompt
    expandedNames.push(capsule.name, ...nested.expandedNames)
    cycleNames.push(...nested.cycleNames)
  }

  out += prompt.slice(cursor)
  return { prompt: out, expandedNames, cycleNames }
}

export interface TextNodeEntry {
  name: string
  text: string
}

export interface ComposedPrompt {
  prompt: string
  /** 成环而没能展开的名字 —— 调用方要能把这件事说出来（不许静默）。 */
  cycleNames: string[]
}

/**
 * 把「正文 + 上游文本」合成最终提示词 —— **胶囊优先，其余才前置**。
 *
 * 这是 `mergePromptWithUpstreamText` 的上位替代。旧函数把顺序写死成
 * `${upstream}\n\n${base}`（上游永远在前），用户无从决定「我的话在前还是分镜
 * 文本在前」。现在：
 *   · 正文里被 `▤` 引用到的文本，在**胶囊所在位置**展开；
 *   · 没被引用的上游文本，仍按旧规则前置 —— 存量图不写胶囊也照常工作。
 *
 * ⚠ **已展开的必须从前置里排除**，否则同一段文字会发两遍：用户明明只想把它放在
 * 句中，结果句首又来了一份。`expandedNames` 就是为这件事存在的。
 *
 * ⚠ 解析器看的是**全图的文本节点**而不是上游 —— 胶囊本身就是引用，不需要先连线。
 * 这正是「位置即拼接顺序」能成立的前提：连线只能表达「有关系」，表达不了「在哪」。
 */
export function composePromptWithTextNodes({
  ownPrompt,
  upstreamTexts,
  allTexts,
}: {
  ownPrompt: string
  upstreamTexts: readonly TextNodeEntry[]
  allTexts: readonly TextNodeEntry[]
}): ComposedPrompt {
  const byName = new Map<string, string>()
  for (const entry of allTexts) {
    const name = normalizeTextCapsuleName(entry.name)
    if (!name || byName.has(name)) continue
    byName.set(name, entry.text)
  }

  const expanded = expandTextCapsules(ownPrompt, (name) => byName.get(name))
  const usedNames = new Set(expanded.expandedNames)

  const prefix = upstreamTexts
    .filter((entry) => !usedNames.has(entry.name.trim().replace(/\s+/g, '')))
    .map((entry) => entry.text.trim())
    .filter(Boolean)
    .join('\n\n')

  const base = expanded.prompt.trim()
  const prompt = !prefix ? base : !base ? prefix : `${prefix}\n\n${base}`
  return { prompt, cycleNames: expanded.cycleNames }
}
