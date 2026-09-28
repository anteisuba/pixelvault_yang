import 'server-only'

import { createMcpHandler, withMcpAuth } from 'mcp-handler'

import { registerMcpTools, verifyMcpBearer } from '@/services/mcp/mcp-server'
import { MCP_SERVER_INFO, MCP_SERVER_INSTRUCTIONS } from '@/constants/mcp'

export const runtime = 'nodejs'

// ─── /api/mcp ────────────────────────────────────────────────────
//
// 外部 Claude 的 MCP 端点（docs/references/mcp.md）。Streamable HTTP、无状态；
// ⚠ 调用方没有 Clerk 会话，靠 `Authorization: Bearer <令牌>` 自己验身份，所以
// 这条在 `src/proxy.ts` 的公开表里（漏了 = 100% 被拦成 404）。
// 手写而不走 api-route-factory：MCP 的请求体是 JSON-RPC、回包可能是流，工厂
// 那套「一个 Zod schema + 一个 JSON 回包」装不下。

const handler = createMcpHandler(registerMcpTools, {
  serverInfo: { ...MCP_SERVER_INFO },
  instructions: MCP_SERVER_INSTRUCTIONS,
})

const authed = withMcpAuth(handler, verifyMcpBearer, { required: true })

export { authed as GET, authed as POST, authed as DELETE }
