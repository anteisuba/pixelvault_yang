/**
 * L4 端到端用的**假大模型**（docs/references/testing.md「测试标准」）：只替掉边界——DeepSeek。
 * 测试账号存一把 DeepSeek key、`baseUrl` 指到这里；应用这一侧（选路、拼提示词、流式解析、
 * 助手主循环、界面显示）全是真代码。
 *
 * 两个口都接（助手先走 Anthropic 兼容口，被拒才退回 chat 口，两条都得能跑）：
 * - `POST /chat/completions`（OpenAI 兼容，流式 / 缓冲）
 * - `POST /anthropic/v1/messages`（Anthropic 兼容，流式 / 缓冲）
 * 回的永远是纯文本 `FAKE_LLM_REPLY`（不调工具）；`GET /requests` 给测试核对模型收到了什么。
 *
 * ⚠ 只能是 https（key 的 baseUrl 规则）：CI 现签一张 localhost 证书，Next 用
 * `NODE_EXTRA_CA_CERTS` 信任它。
 *   FAKE_LLM_CERT=... FAKE_LLM_KEY=... node --experimental-strip-types e2e/fake-llm/server.ts
 */
import { readFileSync } from 'node:fs'
import { createServer, type ServerResponse } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'

const PORT = Number(process.env.FAKE_LLM_PORT ?? 4011)
export const FAKE_LLM_REPLY =
  process.env.FAKE_LLM_REPLY ?? '（假模型）你好，我收到了。'

const requests: Array<{ path: string; model: string; lastUser: string }> = []

type Message = { role: string; content: unknown }

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content))
    return content
      .map((part) =>
        typeof part === 'object' && part && 'text' in part
          ? String((part as { text: unknown }).text)
          : '',
      )
      .join('')
  return ''
}

function record(path: string, body: { model?: string; messages?: Message[] }) {
  const lastUser = [...(body.messages ?? [])]
    .reverse()
    .find((message) => message.role === 'user')
  requests.push({
    path,
    model: body.model ?? '',
    lastUser: textOf(lastUser?.content),
  })
}

function sse(
  response: ServerResponse,
  events: Array<[string | null, unknown]>,
) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
  })
  for (const [event, data] of events) {
    if (event) response.write(`event: ${event}\n`)
    response.write(
      `data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`,
    )
  }
  response.end()
}

function openAi(response: ServerResponse, model: string, stream: boolean) {
  const id = `chatcmpl-e2e-${requests.length}`
  const created = Math.floor(Date.now() / 1000)
  const usage = { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
  if (!stream) {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(
      JSON.stringify({
        id,
        object: 'chat.completion',
        created,
        model,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: FAKE_LLM_REPLY },
            finish_reason: 'stop',
          },
        ],
        usage,
      }),
    )
    return
  }
  const chunk = (delta: object, finish: string | null) => ({
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{ index: 0, delta, finish_reason: finish }],
  })
  sse(response, [
    [null, chunk({ role: 'assistant', content: '' }, null)],
    [null, chunk({ content: FAKE_LLM_REPLY }, null)],
    [null, { ...chunk({}, 'stop'), usage }],
    [null, '[DONE]'],
  ])
}

function anthropic(response: ServerResponse, model: string, stream: boolean) {
  const id = `msg_e2e_${requests.length}`
  const usage = { input_tokens: 10, output_tokens: 10 }
  if (!stream) {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(
      JSON.stringify({
        id,
        type: 'message',
        role: 'assistant',
        model,
        content: [{ type: 'text', text: FAKE_LLM_REPLY }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage,
      }),
    )
    return
  }
  sse(response, [
    [
      'message_start',
      {
        type: 'message_start',
        message: {
          id,
          type: 'message',
          role: 'assistant',
          model,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 0 },
        },
      },
    ],
    [
      'content_block_start',
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      },
    ],
    [
      'content_block_delta',
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: FAKE_LLM_REPLY },
      },
    ],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    [
      'message_delta',
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 10 },
      },
    ],
    ['message_stop', { type: 'message_stop' }],
  ])
}

const handler = async (
  incoming: import('node:http').IncomingMessage,
  outgoing: ServerResponse,
) => {
  const path = new URL(incoming.url ?? '/', 'https://localhost').pathname
  if (incoming.method === 'GET') {
    outgoing.writeHead(200, { 'Content-Type': 'application/json' })
    outgoing.end(JSON.stringify(path === '/requests' ? requests : { ok: true }))
    return
  }
  const chunks: Buffer[] = []
  for await (const chunk of incoming) chunks.push(chunk as Buffer)
  let body: { model?: string; messages?: Message[]; stream?: boolean } = {}
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    // 不是 JSON 就当空请求记下
  }
  record(path, body)
  const model = body.model ?? 'fake'
  if (path.endsWith('/chat/completions'))
    return openAi(outgoing, model, body.stream === true)
  if (path.endsWith('/messages'))
    return anthropic(outgoing, model, body.stream === true)
  outgoing.writeHead(404, { 'Content-Type': 'application/json' })
  outgoing.end(JSON.stringify({ error: { message: `no route ${path}` } }))
}

const cert = process.env.FAKE_LLM_CERT
const key = process.env.FAKE_LLM_KEY
const server =
  cert && key
    ? createHttpsServer(
        { cert: readFileSync(cert), key: readFileSync(key) },
        (req, res) => void handler(req, res),
      )
    : createServer((req, res) => void handler(req, res))

server.listen(PORT, () =>
  console.log(
    `[fake-llm] listening on ${cert ? 'https' : 'http'}://localhost:${PORT}`,
  ),
)
