/**
 * 一个 Danbooru 标签拿去算向量的那段字：英文名（下划线换空格）· 中文名 · 日文名 —— 中文注释。
 *
 * 2026-10-25 实测（5000 个标签 × 30 句中日英）：带上中文注释 30/30 命中，只有名字 28/30；
 * 三种语言写在同一段里，日文、英文的问法也一样对得上。
 */
export function danbooruTagMeaningText(row: {
  tag: string
  zh: string | null
  ja: string | null
  zhNote: string | null
}): string {
  const names = [row.tag.replaceAll('_', ' '), row.zh, row.ja].filter(
    (name): name is string => Boolean(name?.trim()),
  )
  const text = names.join(' / ')
  return row.zhNote?.trim() ? `${text} — ${row.zhNote.trim()}` : text
}
