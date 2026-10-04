import type { AssistantProtocolDomain } from '@/constants/assistant-protocol'
import {
  ASSISTANT_SURFACE_BY_DOMAIN,
  type AssistantSurfaceId,
} from '@/types/assistant-conversation'
import {
  AssistantWorkspaceKeySchema,
  AssistantWorkspaceSchema,
  type AssistantWorkspace,
} from '@/types/assistant-workspace'

export function assistantWorkspaceKey(
  workspace: AssistantWorkspace,
  projectId?: string,
): string | null {
  if (workspace === 'canvas') return projectId ? `canvas:${projectId}` : null
  return workspace
}

export function assistantWorkspaceScope(
  userId: string | null,
  workspace: AssistantWorkspace,
  projectId?: string,
): string | null {
  const key = assistantWorkspaceKey(workspace, projectId)
  return userId && key ? `${encodeURIComponent(userId)}:${key}` : null
}

export function assistantWorkspaceFromKey(key: string): {
  workspace: AssistantWorkspace
  projectId?: string
} | null {
  if (!AssistantWorkspaceKeySchema.safeParse(key).success) return null
  if (key.startsWith('canvas:')) {
    return { workspace: 'canvas', projectId: key.slice(7) }
  }
  const parsed = AssistantWorkspaceSchema.safeParse(key)
  return parsed.success ? { workspace: parsed.data } : null
}

export function assistantWorkspaceDomain(
  workspace: AssistantWorkspace,
): AssistantProtocolDomain {
  return workspace === 'image-natural' || workspace === 'image-tags'
    ? 'image'
    : workspace
}

export function assistantWorkspaceSurface(
  workspace: AssistantWorkspace,
): AssistantSurfaceId {
  return ASSISTANT_SURFACE_BY_DOMAIN[assistantWorkspaceDomain(workspace)]
}

/**
 * **库里一行会话属于哪个工作区**（不靠任何专门的列）。
 *
 * ⭐ 视频 / LoRA / 角色页 / 画布都能从 `surface` + `projectId` 直接推出来；只有图片
 * 工作台分两台而库里只有一个 `IMAGE_STUDIO`，那一台靠首条消息上的戳（`stamp`，见
 * `AssistantConversationMessageSchema.workspaceKey`）。⚠ 没有戳的图片会话（两台分开
 * 之前的历史）一律归**自然语言台**（owner 2026-10-04）：标签台是后来才分出去的。
 * `null` 只剩没有项目号的画布会话 —— 它们归不到任何一块画布上。
 */
export function assistantWorkspaceKeyOfRow(row: {
  surface: AssistantSurfaceId
  projectId: string | null
  stamp?: unknown
}): string | null {
  switch (row.surface) {
    case 'VIDEO_STUDIO':
      return 'video'
    case 'LORA':
      return 'lora'
    case 'CARDS':
      return 'cards'
    case 'NODE_CANVAS':
      return row.projectId ? `canvas:${row.projectId}` : null
    case 'IMAGE_STUDIO':
      return row.stamp === 'image-tags' ? 'image-tags' : 'image-natural'
  }
}
