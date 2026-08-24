/**
 * Server-Sent Events 的帧编解码 —— **服务端与客户端共用一份**。
 *
 * 两个用处，同一份解析：
 *  1. 读 **provider** 的流（OpenAI / Gemini / Anthropic 的 SSE）。它们只发 `data:`
 *     行，没有 `event:` 名，于是落到默认事件名 `message`。
 *  2. 读 / 写 **我们自己**的助手流（`event: text` / `research` / `lora` / …）。
 *
 * ⚠ **不加 `server-only`**：客户端要用同一份解析。两头各写一份的下场，
 * `lora-candidate-receipt.ts` 的注释里已经写过了——「漂移的表现是某一档解出来是
 * 半条数据」。
 *
 * ── 为什么助手流值得换成 SSE ────────────────────────────────────────
 * 裸 `text/plain` 流**没有帧**，于是「一个结构化单元到齐了没有」这个问题在协议层
 * 无解，只能在别处补：结构化载荷挤进响应头（还得为响应头上限做降级阶梯）、协议
 * 块夹在正文里靠客户端边收边抽（四条规则全是真机事故换来的）、零内容字节时响应
 * 头压根不 flush（于是超时表现为 504 而不是一条截断的 200）。
 * 有帧之后这些都消失：一个事件要么完整到达，要么没到达。
 */

/** SSE 规范：没有 `event:` 行的帧，事件名就是 `message`。 */
export const SSE_DEFAULT_EVENT = 'message'

export interface SseFrame {
  /** 事件名；provider 的流基本都是默认的 `message`。 */
  event: string
  /** `data:` 行拼起来的原文（多行按规范用 `\n` 连接）。 */
  data: string
}

/**
 * 编一帧。
 *
 * ⚠ `data` 必须是**单行**——换行在 SSE 里是分隔符。所以载荷一律 JSON 序列化，
 * 而不是直接把助手正文往里塞：正文满是换行，裸塞进去会被拆成好几帧。
 */
export function encodeSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

/**
 * 逐帧读一条 SSE。
 *
 * chunk 边界可以落在一行中间，甚至落在一帧中间，所以必须留 buffer——不能按 chunk
 * 直接 split，也不能假设一个 chunk 就是一帧。
 */
export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<SseFrame> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let event = SSE_DEFAULT_EVENT
  let dataLines: string[] = []

  /** 一帧读完了就吐出去并重置——事件名不跨帧继承（SSE 规范）。 */
  function takeFrame(): SseFrame | null {
    if (dataLines.length === 0) {
      event = SSE_DEFAULT_EVENT
      return null
    }
    const frame: SseFrame = { event, data: dataLines.join('\n') }
    event = SSE_DEFAULT_EVENT
    dataLines = []
    return frame
  }

  function consumeLine(rawLine: string): SseFrame | null {
    // ⚠ 只剥行尾的 `\r`，不做 trim：`data:` 载荷里的前后空格是内容的一部分。
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine

    // 空行 = 帧边界。
    if (line === '') return takeFrame()
    // `:` 开头是注释（心跳常用），整行丢掉。
    if (line.startsWith(':')) return null

    const colonIndex = line.indexOf(':')
    const field = colonIndex === -1 ? line : line.slice(0, colonIndex)
    const rawValue = colonIndex === -1 ? '' : line.slice(colonIndex + 1)
    // 规范：只去掉**一个**前导空格。
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue

    if (field === 'event') event = value || SSE_DEFAULT_EVENT
    else if (field === 'data') dataLines.push(value)
    // `id` / `retry` 本项目用不到，静默忽略。
    return null
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let newlineIndex: number
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex)
        buffer = buffer.slice(newlineIndex + 1)
        const frame = consumeLine(line)
        if (frame) yield frame
      }
    }

    // 流结束时缓冲里还剩东西 = 最后一帧没有以空行收尾。按帧吐出去而不是丢掉：
    // 丢掉的表现是「最后一句话有时候会少」，比多吐一帧难查得多。
    const tail = buffer + decoder.decode()
    if (tail) {
      const frame = consumeLine(tail)
      if (frame) yield frame
    }
    const last = takeFrame()
    if (last) yield last
  } finally {
    reader.releaseLock()
  }
}

/**
 * 只要 `data` 原文 —— 读 provider 流时用这个，它们没有事件名可分。
 */
export async function* readSseData(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<string> {
  for await (const frame of parseSseStream(body)) {
    if (frame.data) yield frame.data
  }
}
