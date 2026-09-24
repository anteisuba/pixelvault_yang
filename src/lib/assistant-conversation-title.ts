/**
 * **会话标题怎么从第一句话里长出来**（owner 2026-09-20 真机第 4 条）。
 *
 * ── 起因 ────────────────────────────────────────────────────────
 * 头部那颗标题胶囊上写着
 * 「reference image 1 reference image 2 reference image 3 这几张图的画风抽出…」。
 * 前面那三段是**挂上去的图**在正文里的占位 —— 界面上它们渲染成 chip，进了标题
 * 就只剩一串噪音；真正说明这段对话是什么的，是后面那半句。
 *
 * 三步，顺序有理由：
 *  ① **先剥参考图提及**（chip 的两种形态：`@名字` 与「reference image N」那类
 *     短语）。⛔ 不能放到截断之后 —— 噪音会先把额度吃光。
 *  ② **再取首句**：一段对话的题目是第一件事，⛔ 不是整段。
 *  ③ **最后按视觉宽度封顶**：CJK 一个字算两格、拉丁算一格，上限
 *     `TITLE_MAX_WIDTH`（= 18 个汉字 / 36 个西文字符，同一条视觉宽度）。
 *
 * ⚠ **CSS `truncate` 只作兜底**：它按容器宽度裁，而容器宽度随面板拖宽变 ——
 * 同一条会话在两台机器上会显示成两个长度不同的名字，而这个名字是用户用来
 * 认它的。真正的上限在这里。
 * ⚠ **存量标题在渲染时才过这条规则**（库里那一列是几个月前按 80 字存下的），
 * ⛔ 不写数据迁移：派生函数是幂等的，渲染时跑一遍就对。
 * ⚠ 头部胶囊、历史行、以及服务端新建会话时的那一次派生**共用这一个函数** ——
 * ⛔ 三处各写一遍必然漂成三种长度。
 */

/**
 * 上限，单位是**半角格**：CJK 一个字占两格。
 * 36 格 = 18 个汉字 = 36 个西文字符，两种语言下是同一条视觉宽度。
 */
export const TITLE_MAX_WIDTH = 36

/**
 * chip 在正文里的两种形态。
 *
 * ⚠ `@名字` 是 `mention-input` 的序列化字面量（`serializeEditor` 写的就是它）：
 * `@Image1` · `@Attachment[...]` · `@莫宁`。它在界面上从来不是这串字，而是一枚
 * 胶囊 —— 所以它进标题是纯噪音。
 * ⚠ 短语那一支收的是用户 / 助手用自然语言写出来的同一件事，三语各一种说法。
 * ⛔ 不做更聪明的识别：剥错一个词的代价是标题少一个词，而漏剥一串的代价是
 * 标题整条读不出内容。
 */
const MENTION_PATTERN = /@[^\s@]+/g
/** 未命名参考图发出去的样子（「图1」「画像1」「Image 1」，2026-09-24 起）。 */
const BRACKETED_REFERENCE_PATTERN = /「\s*(?:图|画像|Image\s*)\d+\s*」/gi
const REFERENCE_PHRASE_PATTERN =
  /(reference\s+images?|参考图片|参考图|参考画像|リファレンス画像)\s*[#＃]?\s*\d*/gi

/** 首句的收尾符号（三语）。⚠ 换行也算 —— 用户按回车就是换了一件事。 */
const SENTENCE_END_PATTERN = /[。．！？!?\n]/

/**
 * 这个字占两格吗。
 *
 * 覆盖 CJK 统一表意文字（含扩展 A）· 假名 · 谚文 · 全角标点与全角字母 ——
 * 也就是在等宽视觉上占两格的那几段。⛔ 不引第三方宽度库：这张表就是全部需要。
 */
function isWide(char: string): boolean {
  const code = char.codePointAt(0)
  if (code === undefined) return false
  return (
    (code >= 0x1100 && code <= 0x115f) || // 谚文字母
    (code >= 0x2e80 && code <= 0x303e) || // CJK 部首 · 标点
    (code >= 0x3041 && code <= 0x33ff) || // 假名 · 谚文兼容 · CJK 兼容
    (code >= 0x3400 && code <= 0x4dbf) || // CJK 扩展 A
    (code >= 0x4e00 && code <= 0x9fff) || // CJK 统一表意
    (code >= 0xa960 && code <= 0xa97f) ||
    (code >= 0xac00 && code <= 0xd7a3) || // 谚文音节
    (code >= 0xf900 && code <= 0xfaff) || // CJK 兼容表意
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) || // 全角形式
    (code >= 0xffe0 && code <= 0xffe6)
  )
}

/** 一串字的视觉宽度（半角格）。 */
export function visualWidth(text: string): number {
  let width = 0
  for (const char of text) width += isWide(char) ? 2 : 1
  return width
}

/**
 * 按视觉宽度截断，超出加省略号。
 *
 * ⚠ 逐 code point 走（`for…of`），⛔ 不按 `length` 切：切在代理对中间会得到
 * 一个乱码方块。
 */
function clampToWidth(text: string, maxWidth: number): string {
  if (visualWidth(text) <= maxWidth) return text
  let width = 0
  let out = ''
  for (const char of text) {
    const next = width + (isWide(char) ? 2 : 1)
    // 省略号自己占一格 —— 留给它。
    if (next > maxWidth - 1) break
    width = next
    out += char
  }
  return `${out.trimEnd()}…`
}

/**
 * 一段原文 → 一个标题。读不出内容时回 `null`（调用方画「未命名会话」）。
 *
 * @param raw 第一条用户消息的原文，或库里存着的那一列。
 */
export function deriveAssistantConversationTitle(
  raw: string | null | undefined,
): string | null {
  const source = raw?.trim()
  if (!source) return null

  /**
   * ⚠ 归并空白时**保住换行**（`[^\S\n]` = 除换行外的空白）：换行是下面
   * 「取首句」的收尾符之一 —— 先压成空格的表现是两行话粘成一条标题。
   */
  const stripped = source
    .replace(MENTION_PATTERN, ' ')
    .replace(BRACKETED_REFERENCE_PATTERN, ' ')
    .replace(REFERENCE_PHRASE_PATTERN, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .trim()

  /**
   * ⚠ 剥完只剩空 = 这条消息**整条都是提及**（「@图1 @图2 @图3」）。
   * 那就退回原文 —— 一个噪音标题仍旧好过一个空标题，用户至少认得出是哪一条。
   */
  const body = stripped || source.replace(/[^\S\n]+/g, ' ').trim()

  const firstSentence = body.split(SENTENCE_END_PATTERN)[0]?.trim() || body
  return clampToWidth(firstSentence, TITLE_MAX_WIDTH) || null
}
