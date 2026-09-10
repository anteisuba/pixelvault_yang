/**
 * 全屏文档那条**格式工具条**背后的算术（spec §2，画板 `TextJimeng.dc.html`）——
 * **纯函数，无 React、无 DOM**。
 *
 * ⛔ **不引入富文本存储**：每一颗键都只是往正文里写 Markdown 语法
 * （`#` `-` `1.` `**` `~~` `*` `<u>`），存的仍是那一段字符串。所以这里只做两件事：
 * ① 行首标记（标题 / 列表）—— 作用在选区**碰到的每一行**，同一颗再按一次就撤掉；
 * ② 包裹标记（粗 / 删 / 斜 / 下划线）—— 包住选区，已经包着的再按一次拆掉；
 * 没有选区时插一对空标记并把光标放中间，接着打字就是在标记里。
 */

/** 行首标记档：值就是写进正文的前缀。 */
export const TEXT_MARKDOWN_LINE_FORMATS = {
  h1: '# ',
  h2: '## ',
  h3: '### ',
  bulleted: '- ',
  numbered: '1. ',
} as const

export type TextMarkdownLineFormat = keyof typeof TEXT_MARKDOWN_LINE_FORMATS

/** 包裹标记档：`[前, 后]`。 */
export const TEXT_MARKDOWN_WRAP_FORMATS = {
  bold: ['**', '**'],
  strike: ['~~', '~~'],
  italic: ['*', '*'],
  underline: ['<u>', '</u>'],
} as const

export type TextMarkdownWrapFormat = keyof typeof TEXT_MARKDOWN_WRAP_FORMATS

export type TextMarkdownFormat = TextMarkdownLineFormat | TextMarkdownWrapFormat

export interface TextMarkdownSelection {
  readonly start: number
  readonly end: number
}

export interface TextMarkdownResult {
  readonly value: string
  readonly selection: TextMarkdownSelection
}

export function isLineFormat(
  format: TextMarkdownFormat,
): format is TextMarkdownLineFormat {
  return format in TEXT_MARKDOWN_LINE_FORMATS
}

/** 这一行已经带着的行首标记（没有就是 `''`）。 */
function readLinePrefix(line: string): string {
  const match = /^(#{1,3} |- |\d+\. )/.exec(line)
  return match?.[1] ?? ''
}

function applyLineFormat(
  value: string,
  selection: TextMarkdownSelection,
  format: TextMarkdownLineFormat,
): TextMarkdownResult {
  const prefix = TEXT_MARKDOWN_LINE_FORMATS[format]
  const lineStart =
    value.lastIndexOf('\n', Math.max(0, selection.start - 1)) + 1
  const lineEndIndex = value.indexOf('\n', selection.end)
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex
  const block = value.slice(lineStart, lineEnd)
  const lines = block.split('\n')
  // 每一行都已经是这一档 = 再按一次是「撤掉」，⛔ 不是叠第二层 `## ##`。
  const removing = lines.every((line) => line.startsWith(prefix))
  const next = lines
    .map((line, index) => {
      const existing = readLinePrefix(line)
      const bare = line.slice(existing.length)
      if (removing) return bare
      // 有序列表按行递增：整段选中时 `1. 1. 1.` 读起来像没编号。
      const head =
        format === 'numbered' && lines.length > 1 ? `${index + 1}. ` : prefix
      return `${head}${bare}`
    })
    .join('\n')
  const value2 = `${value.slice(0, lineStart)}${next}${value.slice(lineEnd)}`
  return {
    value: value2,
    // 整段重排后逐字对光标没有意义 —— 把改过的这几行整段选住，用户看得见改了哪。
    selection: { start: lineStart, end: lineStart + next.length },
  }
}

function applyWrapFormat(
  value: string,
  selection: TextMarkdownSelection,
  format: TextMarkdownWrapFormat,
): TextMarkdownResult {
  const [open, close] = TEXT_MARKDOWN_WRAP_FORMATS[format]
  const inner = value.slice(selection.start, selection.end)
  const head = value.slice(0, selection.start)
  const tail = value.slice(selection.end)

  // 选区自己就带着标记 → 拆掉。
  if (inner.startsWith(open) && inner.endsWith(close) && inner.length > 0) {
    const bare = inner.slice(open.length, inner.length - close.length)
    return {
      value: `${head}${bare}${tail}`,
      selection: { start: selection.start, end: selection.start + bare.length },
    }
  }
  // 标记在选区**外面**（双击选词后按第二次）→ 也拆掉。
  if (head.endsWith(open) && tail.startsWith(close)) {
    return {
      value: `${head.slice(0, head.length - open.length)}${inner}${tail.slice(close.length)}`,
      selection: {
        start: selection.start - open.length,
        end: selection.end - open.length,
      },
    }
  }
  return {
    value: `${head}${open}${inner}${close}${tail}`,
    selection: {
      start: selection.start + open.length,
      end: selection.start + open.length + inner.length,
    },
  }
}

export function applyTextMarkdownFormat(
  value: string,
  selection: TextMarkdownSelection,
  format: TextMarkdownFormat,
): TextMarkdownResult {
  const start = Math.min(
    Math.max(0, Math.min(selection.start, selection.end)),
    value.length,
  )
  const end = Math.min(
    Math.max(0, Math.max(selection.start, selection.end)),
    value.length,
  )
  const range: TextMarkdownSelection = { start, end }
  return isLineFormat(format)
    ? applyLineFormat(value, range, format)
    : applyWrapFormat(value, range, format)
}

/**
 * 下载文件名：`名字.md`。⚠ 路径分隔符与 Windows 保留字符换成 `-` —— 节点名是用户
 * 自己打的，一个 `/` 会让浏览器把整个文件名当路径丢掉。
 */
export function textNodeFileName(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]/g, '-').trim()
  return `${safe.length > 0 ? safe : 'untitled'}.md`
}
