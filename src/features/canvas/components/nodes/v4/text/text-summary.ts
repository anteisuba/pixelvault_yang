/**
 * 文本节点的**分段算术**——**纯函数，无 React**。
 *
 * ⚠ 「N 字 · M 段」的读数随 640 画中框一起退役（owner 2026-09-11 全屏文档定稿，
 * spec §2）：全屏文档的顶栏只有 文件图标 · 名字.md · 下载 · ×，没有读数那一行。
 * 留下的只有「拆成多段」要的这一条。
 */

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
