import type { AssistantProtocolDomain } from '@/constants/assistant-protocol'
import {
  CANVAS_NEW_PROJECT_QUERY_VALUE,
  cardManagementPath,
  ROUTES,
} from '@/constants/routes'
import type { AssistantOperatorBenchOpen } from '@/types/assistant-operator'
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

/**
 * 助手线程的作用域：**一个人一段**（第 9d 步，owner 10-23：对话不按台分，换台不断）。
 * 这一轮在哪个台由请求里的 `workspaceKey` 说，⛔ 不再进作用域。
 */
export function assistantThreadScope(userId: string | null): string | null {
  return userId ? `${encodeURIComponent(userId)}:assistant` : null
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

const BENCH_ROUTE: Record<
  Exclude<AssistantWorkspace, 'canvas' | 'cards'>,
  string
> = {
  'image-natural': ROUTES.STUDIO_IMAGE,
  'image-tags': ROUTES.STUDIO_IMAGE_TAGS,
  video: ROUTES.STUDIO_VIDEO,
  lora: ROUTES.STUDIO_LORA,
}

/** 开台（第 9e 步）去哪一页：画布带 `?project=<id|new>`，角色页带打开哪一位。 */
export function assistantBenchPath(target: AssistantOperatorBenchOpen): string {
  if (target.workspace === 'canvas')
    return target.projectId
      ? `${ROUTES.STUDIO_NODE}?${new URLSearchParams({ project: target.projectId }).toString()}`
      : ROUTES.STUDIO_NODE
  if (target.workspace === 'cards')
    return cardManagementPath(
      target.characterId ? { character: target.characterId } : {},
    )
  return BENCH_ROUTE[target.workspace]
}

/**
 * 换过来的这一页是不是要开的那个台（角色页不看开着谁）。
 * ⚠ 画布要等那块真打开：`new` 在画布建好、把项目号补回 `target` 之前一律不算到（不然会拿着
 *   换页前那块画布的画面接着跑）。
 */
export function assistantBenchReached(
  target: AssistantOperatorBenchOpen,
  workspace: AssistantWorkspace,
  projectId: string | undefined,
): boolean {
  if (workspace !== target.workspace) return false
  if (workspace !== 'canvas') return true
  return Boolean(
    projectId &&
    target.projectId !== CANVAS_NEW_PROJECT_QUERY_VALUE &&
    (!target.projectId || target.projectId === projectId),
  )
}
