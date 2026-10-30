/**
 * Fish 念一段话：按行分段生成、再拼成一条（owner 10-30「一口气说不完就分段说」）。
 *
 * 为什么：Fish 每段最多生成 `max_new_tokens`（默认 1024 ≈ 47 秒）个音频单位；模型偶尔收不住，前两句念完后面
 * 一直喘气、出语气声，直到撞上限（10-30 那条 47 秒的回复就是这样）。分段后每段短、按字数给上限，失控也只
 * 坏一小段；撞到上限的那段重念一次。纯函数，Worker 与测试共用。
 */

export const FISH_SEGMENTS = {
  /** 一段最多多少字（Fish 自己按 300 字切块，我们切得更短）。 */
  maxChars: 120,
  /** 最多几段：再多就把相邻的并起来（每段一个请求）。 */
  maxSegments: 12,
  /** 一个字（中日文）/ 一个西文词大约念多久的上限，秒 —— 正常约 0.25 秒，留两倍多的余量。 */
  secondsPerUnit: 0.6,
  /** 每个方括号提示（停顿、笑）额外给的秒数。 */
  secondsPerCue: 1.5,
  /** 每段至少给的秒数。 */
  minSeconds: 5,
  /** Fish 每秒约生成多少个音频单位（1024 ≈ 47.6 秒）。 */
  tokensPerSecond: 21.5,
  /** Fish 的默认上限：不超过它。 */
  maxTokens: 1024,
  /** 一起念几段。 */
  concurrency: 3,
} as const

const CUE = /\[[^\]\n]{1,40}\]/g
const TAG = /<\/?[a-z]+>/gi
const SENTENCE_END = /(?<=[。！？!?…~～.])/

/** 按行分段；一行太长就在句末断开；段数太多就把相邻的并起来。 */
export function splitFishSegments(text: string): string[] {
  const pieces: string[] = []
  for (const line of text.split(/\n+/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.length <= FISH_SEGMENTS.maxChars) {
      pieces.push(trimmed)
      continue
    }
    let current = ''
    for (const sentence of trimmed.split(SENTENCE_END)) {
      if (
        current &&
        current.length + sentence.length > FISH_SEGMENTS.maxChars
      ) {
        pieces.push(current.trim())
        current = ''
      }
      current += sentence
    }
    if (current.trim()) pieces.push(current.trim())
  }
  while (pieces.length > FISH_SEGMENTS.maxSegments) {
    // 把最短的相邻两段并起来，直到段数够少。
    let best = 0
    for (let i = 1; i < pieces.length - 1; i += 1)
      if (
        pieces[i]!.length + pieces[i + 1]!.length <
        pieces[best]!.length + pieces[best + 1]!.length
      )
        best = i
    pieces.splice(best, 2, `${pieces[best]}\n${pieces[best + 1]}`)
  }
  return pieces
}

/** 这一段正常念完最多该多少秒（中日文一字一单位，西文一词一单位，提示另加）。 */
export function fishSegmentMaxSeconds(segment: string): number {
  const cues = segment.match(CUE)?.length ?? 0
  const spoken = segment.replace(CUE, ' ').replace(TAG, ' ')
  const cjk = spoken.match(/[぀-ヿ㐀-鿿가-힯]/g)?.length ?? 0
  const words =
    spoken.replace(/[぀-ヿ㐀-鿿가-힯]/g, ' ').match(/[A-Za-z0-9']+/g)?.length ?? 0
  return Math.max(
    FISH_SEGMENTS.minSeconds,
    (cjk + words) * FISH_SEGMENTS.secondsPerUnit +
      cues * FISH_SEGMENTS.secondsPerCue,
  )
}

/** 给 Fish 的 `max_new_tokens`：按这段该念多久折算，不超过它的默认上限。 */
export function fishSegmentMaxTokens(segment: string): number {
  return Math.min(
    FISH_SEGMENTS.maxTokens,
    Math.ceil(fishSegmentMaxSeconds(segment) * FISH_SEGMENTS.tokensPerSecond),
  )
}

/** 念出来的这段是不是撞到了上限（= 没收住）：时长到了上限的九成就算。 */
export function fishSegmentRanAway(segment: string, seconds: number): boolean {
  const capSeconds =
    fishSegmentMaxTokens(segment) / FISH_SEGMENTS.tokensPerSecond
  return seconds >= capSeconds * 0.9
}
