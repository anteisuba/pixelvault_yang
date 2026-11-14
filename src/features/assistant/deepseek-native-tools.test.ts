import { describe, expect, it } from 'vitest'

import {
  toDeepSeekRequestBody,
  toSdkStreamEvent,
  withDeepSeekNativeTools,
} from './deepseek-native-tools'

/** 形状取自 2026-11-14 用真 key 探到的返回（`deepseek-flash`，Messages 入口）。 */
describe('DeepSeek 自带联网 / 读链接的转换', () => {
  it('请求：两种工具声明换成 DeepSeek 的，我们自己的工具原样', () => {
    const body = JSON.parse(
      toDeepSeekRequestBody(
        JSON.stringify({
          model: 'deepseek-flash',
          tools: [
            { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
            { type: 'web_fetch_20250910', name: 'web_fetch' },
            {
              name: 'edit',
              description: 'x',
              input_schema: { type: 'object' },
            },
          ],
          messages: [{ role: 'user', content: '搜一下' }],
        }),
      ),
    )
    expect(body.tools).toEqual([
      { type: 'deepseek_web_search', name: 'deepseek_web_search' },
      { type: 'deepseek_read_url', name: 'deepseek_read_url' },
      { name: 'edit', description: 'x', input_schema: { type: 'object' } },
    ])
    expect(body.messages).toEqual([{ role: 'user', content: '搜一下' }])
  })

  it('请求：历史里助手消息的联网块与正文引用拿掉，思考与我们的工具调用留着', () => {
    const body = JSON.parse(
      toDeepSeekRequestBody(
        JSON.stringify({
          tools: [],
          messages: [
            { role: 'user', content: '搜一下' },
            {
              role: 'assistant',
              content: [
                { type: 'thinking', thinking: '…', signature: 'sig' },
                { type: 'server_tool_use', id: 's1', name: 'web_search' },
                { type: 'web_search_tool_result', tool_use_id: 's1' },
                { type: 'web_fetch_tool_result', tool_use_id: 's2' },
                { type: 'text', text: '查到了', citations: [{ url: 'u' }] },
                { type: 'tool_use', id: 't1', name: 'edit', input: {} },
              ],
            },
            // 只剩联网块的那条整条不发。
            {
              role: 'assistant',
              content: [{ type: 'server_tool_use', id: 's3', name: 'x' }],
            },
          ],
        }),
      ),
    )
    expect(body.messages).toEqual([
      { role: 'user', content: '搜一下' },
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: '…', signature: 'sig' },
          { type: 'text', text: '查到了' },
          { type: 'tool_use', id: 't1', name: 'edit', input: {} },
        ],
      },
    ])
  })

  it('请求：撞保留名的工具（find / open）在声明、历史调用、指定工具三处都换成别名', () => {
    const body = JSON.parse(
      toDeepSeekRequestBody(
        JSON.stringify({
          tools: [
            { type: 'web_search_20250305', name: 'web_search' },
            { name: 'find', description: 'f', input_schema: {} },
            { type: 'custom', name: 'open', input_schema: {} },
            { name: 'look', input_schema: {} },
          ],
          tool_choice: { type: 'tool', name: 'find' },
          messages: [
            {
              role: 'assistant',
              content: [
                { type: 'tool_use', id: 't1', name: 'find', input: { q: 'a' } },
                { type: 'tool_use', id: 't2', name: 'look', input: {} },
              ],
            },
            {
              role: 'user',
              content: [
                { type: 'tool_result', tool_use_id: 't1', content: 'ok' },
              ],
            },
          ],
        }),
      ),
    )
    expect(body.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'deepseek_web_search',
      'studio_find',
      'studio_open',
      'look',
    ])
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'studio_find' })
    expect(
      body.messages[0].content.map((block: { name: string }) => block.name),
    ).toEqual(['studio_find', 'look'])
    expect(body.messages[1].content[0].tool_use_id).toBe('t1')
  })

  it('回流：模型调别名工具，名字换回我们自己的', () => {
    expect(
      toSdkStreamEvent({
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'tool_use',
          id: 't1',
          name: 'studio_open',
          input: {},
        },
      }),
    ).toEqual({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: 't1', name: 'open', input: {} },
    })
  })

  it('请求体不是 JSON：原样放行', () => {
    expect(toDeepSeekRequestBody('not json')).toBe('not json')
  })

  it('回流：搜 → web_search（几个词并成一句）；打开页面 / 读链接 → web_fetch', () => {
    const start = (content_block: unknown) => ({
      type: 'content_block_start',
      index: 1,
      content_block,
    })
    expect(
      toSdkStreamEvent(
        start({
          type: 'server_tool_use',
          id: 'srvtoolu_1',
          name: 'deepseek_web_search',
          input: { action: 'search', queries: ['DeepSeek API', '应用 API'] },
          caller: { type: 'direct' },
          kind: 'deep_search',
        }),
      ),
    ).toEqual(
      start({
        type: 'server_tool_use',
        id: 'srvtoolu_1',
        name: 'web_search',
        input: { query: 'DeepSeek API · 应用 API' },
      }),
    )
    for (const [name, action] of [
      ['deepseek_web_search', 'open_page'],
      ['deepseek_read_url', 'read_link'],
    ])
      expect(
        toSdkStreamEvent(
          start({
            type: 'server_tool_use',
            id: 'srvtoolu_2',
            name,
            input: { action, url: 'https://example.com/a' },
          }),
        ),
      ).toEqual(
        start({
          type: 'server_tool_use',
          id: 'srvtoolu_2',
          name: 'web_fetch',
          input: { url: 'https://example.com/a' },
        }),
      )
  })

  it('回流：读页面的结果补成 SDK 校验认的形状（正文不随结果回来，留空）；失败照实', () => {
    expect(
      toSdkStreamEvent({
        type: 'content_block_start',
        index: 2,
        content_block: {
          type: 'web_fetch_tool_result',
          tool_use_id: 'srvtoolu_2',
          kind: 'read_link',
          content: {
            type: 'web_fetch_result',
            url: 'https://example.com/a',
            content: { type: 'document', source: { data: '' } },
            published_at: '2026-11-13',
          },
        },
      }),
    ).toEqual({
      type: 'content_block_start',
      index: 2,
      content_block: {
        type: 'web_fetch_tool_result',
        tool_use_id: 'srvtoolu_2',
        content: {
          type: 'web_fetch_result',
          url: 'https://example.com/a',
          retrieved_at: '2026-11-13',
          content: {
            type: 'document',
            title: null,
            source: { type: 'text', media_type: 'text/plain', data: '' },
          },
        },
      },
    })
    expect(
      toSdkStreamEvent({
        type: 'content_block_start',
        index: 2,
        content_block: {
          type: 'web_fetch_tool_result',
          tool_use_id: 'srvtoolu_2',
          content: {
            type: 'web_fetch_tool_result_error',
            error_code: 'url_not_accessible',
          },
        },
      }),
    ).toMatchObject({
      content_block: {
        content: {
          type: 'web_fetch_tool_result_error',
          error_code: 'url_not_accessible',
        },
      },
    })
  })

  it('别的帧（正文、我们的工具调用、搜索结果）原样', () => {
    for (const event of [
      {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: '字' },
      },
      {
        type: 'content_block_start',
        content_block: { type: 'tool_use', id: 't', name: 'edit', input: {} },
      },
      {
        type: 'content_block_start',
        content_block: { type: 'web_search_tool_result', tool_use_id: 's' },
      },
    ])
      expect(toSdkStreamEvent(event)).toBe(event)
  })

  it('包住的 fetch：请求体改写、去掉 beta 头；流按帧改写，帧被切在分片中间也认', async () => {
    const seen: { body?: string; beta: string | null }[] = []
    const frame = (event: unknown) =>
      `event: x\ndata: ${JSON.stringify(event)}\n\n`
    const sse =
      frame({
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'server_tool_use',
          id: 's1',
          name: 'deepseek_web_search',
          input: { action: 'search', queries: ['猫'] },
        },
      }) + frame({ type: 'message_stop' })
    const baseFetch: typeof fetch = async (_input, init) => {
      seen.push({
        body: typeof init?.body === 'string' ? init.body : undefined,
        beta: new Headers(init?.headers).get('anthropic-beta'),
      })
      const half = Math.floor(sse.length / 2)
      const encoder = new TextEncoder()
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(sse.slice(0, half)))
            controller.enqueue(encoder.encode(sse.slice(half)))
            controller.close()
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      )
    }
    const response = await withDeepSeekNativeTools(baseFetch)(
      'https://api.deepseek.com/anthropic/v1/messages',
      {
        method: 'POST',
        headers: { 'anthropic-beta': 'web-fetch-2025-09-10', 'x-api-key': 'k' },
        body: JSON.stringify({
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [],
        }),
      },
    )
    expect(seen[0]?.beta).toBeNull()
    expect(JSON.parse(seen[0]!.body!).tools).toEqual([
      { type: 'deepseek_web_search', name: 'deepseek_web_search' },
    ])
    const text = await response.text()
    expect(text).toContain('"name":"web_search"')
    expect(text).toContain('"query":"猫"')
    expect(text).not.toContain('deepseek_web_search')
    expect(text).toContain('"type":"message_stop"')
  })

  it('出错的响应、不是流的响应：原样交回', async () => {
    const error = new Response('{"error":"bad"}', {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
    const result = await withDeepSeekNativeTools(async () => error)(
      'https://api.deepseek.com/anthropic/v1/messages',
      { method: 'POST', body: '{}' },
    )
    expect(result).toBe(error)
  })
})
