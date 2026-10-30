import 'server-only'

import {
  findInWorkspace,
  openWorkspaceHandle,
  parseWorkspaceHandle,
  type WorkspaceOwner,
  type WorkspacePicture,
} from '@/features/assistant/workspace.service'
import { getImagePreviewUrl } from '@/lib/video-poster'
import type { McpTokenOwner } from '@/services/mcp/mcp-token.service'
import {
  fetchEdgeFrame,
  type EdgeFrame,
} from '@/services/video-frames/edge-frame.service'
import { LOOK_FRAME_WIDTH } from '@/constants/media-transformations'
import { MCP_FIND_DEFAULT_KINDS, MCP_LOOK_MAX_PICTURES } from '@/constants/mcp'
import type { McpFindInput, McpLookInput } from '@/types/mcp'

/**
 * 全站的查与看（`docs/references/mcp.md` §4.3）：直接用站内助手 find / look 的工作区那一层，
 * ⛔ 不另写一套查库。外部 AI 没有「台」，所以台上的名字（ref-1、result-1、屏幕）这里认不出。
 */

function workspaceOwner(owner: McpTokenOwner): WorkspaceOwner {
  return { userId: owner.userId, clerkId: owner.clerkId, incognito: false }
}

export async function findForMcp(
  owner: McpTokenOwner,
  input: McpFindInput,
): Promise<string> {
  const found = await findInWorkspace(
    workspaceOwner(owner),
    input.query ?? '',
    input.kinds ?? MCP_FIND_DEFAULT_KINDS,
  )
  return `${found.text}\n\nOpen any of these with look (by its number or name).`
}

export interface McpLookPart {
  readonly text: string
  readonly frames: readonly EdgeFrame[]
}

/** 每一样各自成败，⛔ 一样打不开不连累同批其它的。图按缩略宽度经 CDN 取，最多回几张。 */
export async function lookForMcp(
  owner: McpTokenOwner,
  input: McpLookInput,
): Promise<McpLookPart[]> {
  const parts: McpLookPart[] = []
  let picturesLeft = MCP_LOOK_MAX_PICTURES
  for (const name of input.names) {
    const handle = parseWorkspaceHandle(name)
    const opened = handle
      ? await openWorkspaceHandle(workspaceOwner(owner), handle).catch(
          () => null,
        )
      : null
    if (!opened) {
      parts.push({
        text: `${name}: not found. Use find to look it up (numbers look like 图_1624; names like 角色·Name, LoRA·name).`,
        frames: [],
      })
      continue
    }
    const pictures = opened.pictures.slice(0, Math.max(0, picturesLeft))
    picturesLeft -= pictures.length
    parts.push({
      text: opened.text,
      frames: await Promise.all(pictures.map(fetchPicture)),
    })
  }
  return parts
}

function fetchPicture(picture: WorkspacePicture): Promise<EdgeFrame> {
  return fetchEdgeFrame({
    label: picture.label,
    url: getImagePreviewUrl(picture.url, LOOK_FRAME_WIDTH),
  })
}
