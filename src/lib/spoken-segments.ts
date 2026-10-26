/**
 * 开着台时她的回复怎么念（10-26「三处怎么说话」，和「理顺助手与聊天」线程约好的格式）：回复按空行分段，
 * 第一段 = 开头、最后一段 = 结尾（都是她的口吻、可带方括号语气），中间 = 正文（只出文字，不念）。
 * 只有一两段时全念（一句短回复 / 开头加收尾）。没开台时不切，整段念——调用方自己判断开没开台。
 */
export interface SpokenSegments {
  /** 念：开头那段（只有一段时就是整段）。 */
  opening: string
  /** 不念：中间的正文，原样（段间空行保留）。 */
  body: string
  /** 念：结尾那段；没有 = 空。 */
  closing: string
}

export function splitSpokenSegments(text: string): SpokenSegments {
  const paragraphs = text
    .trim()
    .split(/\n[ \t]*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
  if (paragraphs.length <= 1)
    return { opening: paragraphs[0] ?? '', body: '', closing: '' }
  if (paragraphs.length === 2)
    return { opening: paragraphs[0], body: '', closing: paragraphs[1] }
  return {
    opening: paragraphs[0],
    body: paragraphs.slice(1, -1).join('\n\n'),
    closing: paragraphs.at(-1) ?? '',
  }
}
