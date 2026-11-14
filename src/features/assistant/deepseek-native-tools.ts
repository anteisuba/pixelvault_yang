/**
 * DeepSeek 自带的联网与读链接（2026-11-13 发布的应用 API，`deepseek_web_search` / `deepseek_read_url`）
 * 接进 Anthropic 兼容入口的那一层转换。
 *
 * ⭐ 为什么要转：`@ai-sdk/anthropic` 只认 Claude 那一套服务端工具（声明 `web_search_2025…` /
 *   `web_fetch_2025…`，回来的块叫 `web_search` / `web_fetch`），DeepSeek 的新工具声明与块名都不同。
 *   这里包一层 `fetch`，两头各改几个字，SDK 与内核照旧当它是 Claude 的联网在用。
 *
 * 🔬 2026-11-14 用真 key 实测（`deepseek-flash`，Messages 入口）：
 *  · 新工具能和我们自己的工具放在同一次请求里；模型搜完接着调我们的工具，交回结果后照常往下跑；
 *  · 服务端工具块整块随 `content_block_start` 到（入参已填好，⛔ 没有增量）；
 *  · 历史里把联网那几块拿掉（只留思考与我们的工具调用）照样收 —— 官方也写明搜到的内容不带进后面几轮；
 *  · ⚠ 带上这两样后 `find` / `open` / `search` 成了保留名，我们自己的工具叫这个名字整次请求 400。
 *
 * 所以：
 *  · 请求：工具声明换成 DeepSeek 的两种；历史里助手消息的联网块、正文上的引用一律拿掉；
 *    去掉 SDK 为 Claude 的读网页加的 beta 头；我们撞保留名的工具（声明、历史里的调用、指定工具）换成别名。
 *  · 回流：`deepseek_web_search`（搜）→ `web_search`；打开页面 / 读链接 → `web_fetch`，结果补成
 *    SDK 校验认的形状（正文本来就不随结果回来，留空）；模型调别名工具时把名字换回去。
 * ⚠ 只有 `deepseek-flash` 支持这两样（官方文档），别的型号 ⛔ 套这一层。
 */

import { ASSISTANT_DEEPSEEK_NATIVE_TOOLS as NATIVE } from '@/features/assistant/constants'

type Json = Record<string, unknown>

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const ALIAS_BACK: Record<string, string> = Object.fromEntries(
  Object.entries(NATIVE.clientAliases).map(([name, alias]) => [alias, name]),
)

/** 我们自己的工具名撞了保留名就换成别名，别的原样。 */
const aliased = (name: unknown): unknown =>
  typeof name === 'string' && Object.hasOwn(NATIVE.clientAliases, name)
    ? NATIVE.clientAliases[name]
    : name

/** 请求体：换工具声明、历史里拿掉联网块与引用、撞保留名的工具换别名。读不懂就原样放行。 */
export function toDeepSeekRequestBody(body: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return body
  }
  if (!isRecord(parsed)) return body
  const tools = Array.isArray(parsed.tools)
    ? parsed.tools.map((tool) => {
        if (!isRecord(tool)) return tool
        // 厂商自带工具带 `type`（`web_search_2025…`）；我们自己的没有，或是 `custom`。
        if (typeof tool.type !== 'string' || tool.type === 'custom')
          return { ...tool, name: aliased(tool.name) }
        if (tool.name === NATIVE.sdkSearchName)
          return { type: NATIVE.searchTool, name: NATIVE.searchTool }
        if (tool.name === NATIVE.sdkFetchName)
          return { type: NATIVE.readTool, name: NATIVE.readTool }
        return tool
      })
    : parsed.tools
  const messages = Array.isArray(parsed.messages)
    ? parsed.messages.flatMap((message) => {
        if (
          !isRecord(message) ||
          message.role !== 'assistant' ||
          !Array.isArray(message.content)
        )
          return [message]
        const content = message.content.flatMap((block) => {
          if (!isRecord(block)) return [block]
          if (NATIVE.serverBlockTypes.includes(String(block.type))) return []
          if (block.type === 'text' && 'citations' in block)
            return [
              Object.fromEntries(
                Object.entries(block).filter(([key]) => key !== 'citations'),
              ),
            ]
          if (block.type === 'tool_use')
            return [{ ...block, name: aliased(block.name) }]
          return [block]
        })
        // 只剩联网块的那条助手消息（少见）整条不发：空内容厂商不收。
        return content.length > 0 ? [{ ...message, content }] : []
      })
    : parsed.messages
  const toolChoice =
    isRecord(parsed.tool_choice) && parsed.tool_choice.type === 'tool'
      ? { ...parsed.tool_choice, name: aliased(parsed.tool_choice.name) }
      : parsed.tool_choice
  return JSON.stringify({
    ...parsed,
    tools,
    messages,
    ...(toolChoice === undefined ? {} : { tool_choice: toolChoice }),
  })
}

/** 流里的一帧：把 DeepSeek 的服务端工具块改成 SDK 认的；别的帧原样。 */
export function toSdkStreamEvent(event: unknown): unknown {
  if (
    !isRecord(event) ||
    event.type !== 'content_block_start' ||
    !isRecord(event.content_block)
  )
    return event
  const block = event.content_block
  if (
    block.type === 'tool_use' &&
    typeof block.name === 'string' &&
    Object.hasOwn(ALIAS_BACK, block.name)
  )
    return {
      ...event,
      content_block: { ...block, name: ALIAS_BACK[block.name] },
    }
  if (
    block.type === 'server_tool_use' &&
    (block.name === NATIVE.searchTool || block.name === NATIVE.readTool)
  ) {
    const input = isRecord(block.input) ? block.input : {}
    const queries = Array.isArray(input.queries)
      ? input.queries.filter((item): item is string => typeof item === 'string')
      : []
    const searching = input.action === 'search' || queries.length > 0
    return {
      ...event,
      content_block: {
        type: 'server_tool_use',
        id: block.id,
        name: searching ? NATIVE.sdkSearchName : NATIVE.sdkFetchName,
        input: searching
          ? { query: queries.join(' · ') }
          : { url: typeof input.url === 'string' ? input.url : '' },
      },
    }
  }
  if (block.type === 'web_fetch_tool_result') {
    const content = isRecord(block.content) ? block.content : {}
    const failed = content.type === 'web_fetch_tool_result_error'
    return {
      ...event,
      content_block: {
        type: 'web_fetch_tool_result',
        tool_use_id: block.tool_use_id,
        content: failed
          ? {
              type: 'web_fetch_tool_result_error',
              error_code: String(content.error_code ?? 'unavailable'),
            }
          : {
              type: 'web_fetch_result',
              url: typeof content.url === 'string' ? content.url : '',
              retrieved_at:
                typeof content.published_at === 'string'
                  ? content.published_at
                  : '',
              // 页面正文不随结果回来（官方：在签名里，只给模型自己用）。
              content: {
                type: 'document',
                title: null,
                source: { type: 'text', media_type: 'text/plain', data: '' },
              },
            },
      },
    }
  }
  return event
}

/** 把一条 SSE 流按帧改写（`data:` 行是 JSON 的才动；注释行、事件名原样）。 */
function rewriteSse(
  body: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ''
  const rewriteLine = (line: string): string => {
    if (!line.startsWith('data:')) return line
    const payload = line.slice(5).trim()
    if (!payload.startsWith('{')) return line
    try {
      return `data: ${JSON.stringify(toSdkStreamEvent(JSON.parse(payload)))}`
    } catch {
      return line
    }
  }
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        if (lines.length > 0)
          controller.enqueue(
            encoder.encode(`${lines.map(rewriteLine).join('\n')}\n`),
          )
      },
      flush(controller) {
        buffer += decoder.decode()
        if (buffer) controller.enqueue(encoder.encode(rewriteLine(buffer)))
      },
    }),
  )
}

/** 包住给 DeepSeek 的那个 `fetch`（见文件头注）。 */
export function withDeepSeekNativeTools(baseFetch: typeof fetch): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers)
    // SDK 为 Claude 的读网页加的 beta 头，DeepSeek 用不上。
    headers.delete('anthropic-beta')
    const response = await baseFetch(input, {
      ...init,
      headers,
      ...(typeof init?.body === 'string'
        ? { body: toDeepSeekRequestBody(init.body) }
        : {}),
    })
    const streaming = response.headers
      .get('content-type')
      ?.includes('text/event-stream')
    if (!response.ok || !response.body || !streaming) return response
    return new Response(rewriteSse(response.body), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }
}
