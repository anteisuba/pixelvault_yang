/**
 * 文本节点的读数（spec §2「框底 读数「N 字 · M 段」」）——**纯函数，无 React**。
 *
 * 字数不数空白（中日文正文里空白是排版不是内容），段数按空行切块。
 */

export interface TextSummary {
  /** 第一行非空文字，去掉 Markdown 标题号——收起卡的兜底名字。 */
  readonly title: string
  readonly chars: number
  readonly paragraphs: number
}

export function summarizeTextBody(body: string): TextSummary {
  const title = (body.split('\n').find((line) => line.trim().length > 0) ?? '')
    .replace(/^#+\s*/, '')
    .trim()
  const paragraphs = body
    .split(/\n{2,}/)
    .filter((block) => block.trim().length > 0).length
  return { title, chars: body.replace(/\s/g, '').length, paragraphs }
}

/**
 * 「拆成多段」的切法：按空行切块并去掉空块。⚠ 只有 ≥2 段才值得拆——
 * 一段的时候拆出来的是同一张卡的复制品，⛔ 不做。
 */
export function splitTextBodyIntoParagraphs(body: string): string[] {
  return body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
}
