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
