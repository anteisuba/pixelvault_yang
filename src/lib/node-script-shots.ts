/**
 * 剧本正文 → 分镜列表（进度表 24，画板 `DesignD7Script.dc.html`）。
 *
 * ── 为什么先做确定性拆镜 ────────────────────────────────────────────────
 * 投影是**结构性改动**：一次能长出一整排节点和一批边。它的 diff（哪一镜是新的、
 * 哪一镜变了、哪一镜没了）靠的是每一段的**稳定键**——同一份正文拆两次必须得到
 * 同一批键，否则「改了第三镜」会被读成「删了三镜又新建了三镜」。LLM 拆镜给不了
 * 这个保证（同一段文字两次调用可以断在不同的地方），所以它是后话：⛔ 本片不接。
 *
 * ── 三档判据（按顺序选一档，⛔ 不混用）────────────────────────────────
 * ① **编号标记**：任意一行形如 `S01` / `镜3` / `第 3 镜` / `## S02 递伞` ——
 *    键取编号（`s3`），换序、插段都不改已有段的键。这是最稳的一档。
 * ② **Markdown 小标题**：没有编号标记但有 `#` 开头的行 —— 键取标题文字
 *    （`h:递伞`），改标题算改一段的身份（这与用户的直觉一致：标题就是它的名字）。
 * ③ **空行分段**：两者都没有 —— 键取序号（`p1`）。⚠ 这一档最弱：在中间插一段
 *    会让后面每一段都换键。给它的代价是 UI 上那句「加上镜号更稳」，⛔ 不在这里
 *    靠文本相似度猜配对（猜错的表现是把用户已经出片的那一镜标成「删了」）。
 *
 * 第一个分段标记**之前**的内容是大纲（卡面正文那一段），不算一面镜。
 *
 * ⛔ 纯函数：不读时钟、不铸 id、不碰 DOM。
 */

import { NODE_SCRIPT_PROJECTION } from '@/constants/node-script'

export interface ScriptShotDraft {
  /**
   * 这一段的稳定键 —— **diff 唯一的配对判据**。同一份正文拆两次必须相同。
   * ⛔ 不是显示用的东西：镜号显示走节点的 `shotNo`。
   */
  readonly key: string
  /** 编号档拆出来的镜号（`S02` → 2）。其余两档没有。 */
  readonly no?: number
  /** 卡面那一行显示的一句话（已截断）。 */
  readonly title: string
  /** 这一段的完整正文 —— 投影时写进镜头节点、重投影时逐字比对。 */
  readonly text: string
  /** 标记行里读到的时长（`4s` / `4秒`）。 */
  readonly durationSec?: number
  /** 这一段里 `@` 到的角色名 —— 镜头卡上那几个空角色槽（35 未落，只留空位）。 */
  readonly roles: readonly string[]
}

export interface ScriptBreakdown {
  /** 第一个分段标记之前的正文（卡面那一段大纲）。没有就是空串。 */
  readonly outline: string
  readonly shots: readonly ScriptShotDraft[]
  /** 不是分镜标记的那些 `#` 小标题 —— 卡头「N 幕」那一格。 */
  readonly actCount: number
}

/**
 * 编号标记：`S01` / `s2` / `镜3` / `第 3 镜` / `Shot 4`，前面允许 `#`、`-`、`*`。
 * ⚠ 捕获组 1 是编号，组 2 是同一行剩下的话（`S02 · 递伞 · 5s` 的「递伞 · 5s」）。
 * ⚠ 编号后面那个**零宽边界**不是装饰：没有它 `s3cret …` 会被读成第 3 镜，而一行
 * 被误判成镜头标记的后果是整张剧本的键全错位（diff 于是把没改的镜报成「删了」）。
 */
const NUMBERED_MARKER =
  /^[ \t]{0,3}(?:#{1,6}[ \t]*|[-*][ \t]+)?(?:SHOT|Shot|shot|S|s|镜|第)[ \t]*0*(\d{1,3})[ \t]*(?:镜|号)?(?=$|[\s·．.、:：\-—|])[ \t]*(?:[·．.、:：\-—|]+[ \t]*)?(.*)$/

/** Markdown 小标题（第二档，也是「幕」的判据）。 */
const HEADING_MARKER = /^[ \t]{0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*$/

/** 时长：`4s` / `4 秒` / `4sec`。⚠ 只在标记行上找 —— 正文里的「5 秒后」不算。 */
const DURATION = /(\d{1,4}(?:\.\d)?)[ \t]*(?:s\b|sec\b|秒)/

/** `@角色名` —— 到空白或标点为止。 */
const ROLE_MENTION = /@([^\s@·、,，。.:：;；!！?？()（）[\]【】]{1,40})/g

/**
 * 卡面那一行不重复写时长 —— 时长在行尾自己有一格（画板 `DesignD7Script` §1）。
 * ⚠ 只从**标题**里拿掉，⛔ 不从 `text` 里拿：那一段正文要原样进 diff 与镜头节点。
 */
function stripDuration(value: string): string {
  return value
    .replace(DURATION, '')
    .replace(/[ \t]*[·．.、:：\-—|]+[ \t]*$/, '')
}

function clampTitle(value: string): string {
  const flat = stripDuration(value).replace(/\s+/g, ' ').trim()
  return flat.length > NODE_SCRIPT_PROJECTION.maxTitleChars
    ? `${flat.slice(0, NODE_SCRIPT_PROJECTION.maxTitleChars)}…`
    : flat
}

function readRoles(text: string): readonly string[] {
  const seen: string[] = []
  for (const match of text.matchAll(ROLE_MENTION)) {
    const name = match[1]?.trim()
    if (!name || seen.includes(name)) continue
    seen.push(name)
    if (seen.length >= NODE_SCRIPT_PROJECTION.maxRolesPerShot) break
  }
  return seen
}

/** 把同键的第二次出现改成 `key#2` —— ⛔ 不静默丢掉重复的那一段。 */
function uniqueKey(key: string, taken: Set<string>): string {
  if (!taken.has(key)) {
    taken.add(key)
    return key
  }
  let index = 2
  while (taken.has(`${key}#${index}`)) index += 1
  const next = `${key}#${index}`
  taken.add(next)
  return next
}

interface RawBlock {
  readonly key: string
  readonly no?: number
  /** 标记行上剩下的那半句（编号档才有）。 */
  readonly headline: string
  readonly lines: string[]
  readonly durationSec?: number
}

function isHeading(line: string): boolean {
  return HEADING_MARKER.test(line)
}

function numberedOf(
  line: string,
): { no: number; headline: string } | undefined {
  const match = NUMBERED_MARKER.exec(line)
  if (!match) return undefined
  const no = Number(match[1])
  if (!Number.isInteger(no) || no < 1 || no > 999) return undefined
  return { no, headline: (match[2] ?? '').trim() }
}

function finishBlock(
  block: RawBlock,
  shots: ScriptShotDraft[],
  taken: Set<string>,
): void {
  if (shots.length >= NODE_SCRIPT_PROJECTION.maxShots) return
  const body = [block.headline, ...block.lines].join('\n').trim()
  if (body.length === 0) return
  const firstLine = body.split('\n')[0] ?? ''
  shots.push({
    key: uniqueKey(block.key, taken),
    ...(block.no === undefined ? {} : { no: block.no }),
    title: clampTitle(block.headline || firstLine),
    text: body,
    ...(block.durationSec === undefined
      ? {}
      : { durationSec: block.durationSec }),
    roles: readRoles(body),
  })
}

function readDuration(line: string): number | undefined {
  const match = DURATION.exec(line)
  if (!match) return undefined
  const value = Number(match[1])
  return Number.isFinite(value) && value > 0 ? value : undefined
}

export function parseScriptShots(body: string): ScriptBreakdown {
  const lines = body.split(/\r?\n/)
  const numbered = lines.some((line) => numberedOf(line) !== undefined)
  const headed = !numbered && lines.some(isHeading)

  const shots: ScriptShotDraft[] = []
  const taken = new Set<string>()
  const outline: string[] = []
  let current: RawBlock | null = null
  let actCount = 0

  const flush = (): void => {
    if (!current) return
    finishBlock(current, shots, taken)
    current = null
  }

  for (const line of lines) {
    if (numbered) {
      const marker = numberedOf(line)
      if (marker) {
        flush()
        const duration = readDuration(line)
        current = {
          key: `s${marker.no}`,
          no: marker.no,
          headline: marker.headline,
          lines: [],
          ...(duration === undefined ? {} : { durationSec: duration }),
        }
        continue
      }
      // ⚠ 编号档里的 `#` 小标题是「幕」，不是镜 —— 它归大纲那一侧。
      if (isHeading(line)) actCount += 1
    } else if (headed) {
      const heading = HEADING_MARKER.exec(line)
      if (heading) {
        flush()
        const title = (heading[2] ?? '').trim()
        const duration = readDuration(line)
        current = {
          key: `h:${title}`,
          headline: title,
          lines: [],
          ...(duration === undefined ? {} : { durationSec: duration }),
        }
        continue
      }
    } else if (line.trim().length === 0) {
      flush()
      continue
    } else if (!current) {
      current = { key: `p${shots.length + 1}`, headline: '', lines: [] }
    }

    if (current) current.lines.push(line)
    else outline.push(line)
  }
  flush()

  return {
    outline: outline.join('\n').trim(),
    shots,
    actCount,
  }
}
