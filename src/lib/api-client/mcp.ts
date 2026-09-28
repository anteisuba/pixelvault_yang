import { API_ENDPOINTS } from '@/constants/config'
import type {
  CreateMcpTokenRequest,
  CreatedMcpToken,
  McpTokenRecord,
} from '@/types/mcp'

import { getErrorMessage } from '@/lib/api-client/shared'

/**
 * 外部 Claude 连接令牌的客户端出口（`docs/references/mcp.md` §3.1）。
 * ⚠ 组件里**不许**直接 `fetch`（Hard Rule 3）。
 */

export interface McpApiResponse<TData> {
  success: boolean
  data?: TData
  error?: string
  errorCode?: string
  /** 有值 = 服务端真的回了一个响应；没有 = `fetch` 自己抛了（请求没到）。 */
  status?: number
}

function unexpected(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred'
}

async function readJson<TData>(
  response: Response,
): Promise<McpApiResponse<TData>> {
  if (!response.ok) {
    return {
      success: false,
      status: response.status,
      error: await getErrorMessage(
        response,
        `Failed with status ${response.status}`,
      ),
    }
  }
  return (await response.json()) as McpApiResponse<TData>
}

export async function listMcpTokensAPI(): Promise<
  McpApiResponse<McpTokenRecord[]>
> {
  try {
    return await readJson(await fetch(API_ENDPOINTS.MCP_TOKENS))
  } catch (error) {
    return { success: false, error: unexpected(error) }
  }
}

/** ⚠ 回包里的明文 `token` 只此一次，调用方要当场给用户看。 */
export async function createMcpTokenAPI(
  body: CreateMcpTokenRequest,
): Promise<McpApiResponse<CreatedMcpToken>> {
  try {
    return await readJson(
      await fetch(API_ENDPOINTS.MCP_TOKENS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    )
  } catch (error) {
    return { success: false, error: unexpected(error) }
  }
}

export async function revokeMcpTokenAPI(
  tokenId: string,
): Promise<McpApiResponse<null>> {
  try {
    return await readJson(
      await fetch(
        `${API_ENDPOINTS.MCP_TOKENS}/${encodeURIComponent(tokenId)}`,
        { method: 'DELETE' },
      ),
    )
  } catch (error) {
    return { success: false, error: unexpected(error) }
  }
}
