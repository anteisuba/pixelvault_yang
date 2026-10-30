import {
  generateProtectedResourceMetadata,
  metadataCorsOptionsRequestHandler,
} from 'mcp-handler'
import { NextResponse } from 'next/server'

import { mcpOAuthIssuer } from '@/services/mcp/mcp-oauth.service'
import { API_ENDPOINTS, getAppOrigin } from '@/constants/config'

// ─── /api/mcp/oauth-protected-resource ──────────────────────────
//
// RFC 9728 受保护资源元数据（docs/references/mcp.md §3.2）：告诉 Claude.ai / ChatGPT
// 这类 OAuth 客户端「去哪登录」。⚠ `resource` 必须与用户粘贴的地址逐字相同（含 /api/mcp）；
// `authorization_servers` 只写本站 Clerk 的 issuer（Claude 只读第一项）。
// 公开、无会话：在 `src/proxy.ts` 公开表里。

export function GET() {
  const issuer = mcpOAuthIssuer()
  if (!issuer)
    return NextResponse.json(
      { error: 'OAuth is not configured' },
      { status: 503 },
    )
  return NextResponse.json(
    generateProtectedResourceMetadata({
      authServerUrls: [issuer],
      resourceUrl: `${getAppOrigin()}${API_ENDPOINTS.MCP}`,
    }),
    { headers: { 'Access-Control-Allow-Origin': '*' } },
  )
}

export const OPTIONS = metadataCorsOptionsRequestHandler()
