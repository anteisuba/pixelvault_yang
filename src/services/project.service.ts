import 'server-only'

import { db } from '@/lib/db'
import { PROJECT } from '@/constants/config'
import { PROJECT_COVER_TILE_COUNT } from '@/constants/assets-grid'
import type {
  CreateProjectRequest,
  UpdateProjectRequest,
  ProjectRecord,
  GenerationRecord,
} from '@/types'
import { ensureUser } from '@/services/user.service'

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * 门牌卡要的是**最近 4 张真实素材**拼出 2×2 的贴片
 * （`docs/references/pages/assets.md` §3 段一）。
 *
 * ⚠ 视频/音频/3D 的 `url` 是媒体文件，塞进 `<img>` 什么也画不出来 —— 只有
 * 派生图能当封面。所以非图片类型缺派生图时**直接跳过**，宁可拼贴少一格，
 * 也不放一个永远加载失败的地址。
 */
function toCoverUrl(generation: {
  url: string
  thumbnailUrl: string | null
  previewUrl: string | null
  outputType: string
}): string | null {
  if (generation.thumbnailUrl) return generation.thumbnailUrl
  if (generation.previewUrl) return generation.previewUrl
  return generation.outputType === 'IMAGE' ? generation.url : null
}

function toProjectRecord(project: {
  id: string
  name: string
  description: string | null
  parentId: string | null
  createdAt: Date
  updatedAt: Date
  _count: { generations: number }
  generations: {
    url: string
    thumbnailUrl: string | null
    previewUrl: string | null
    outputType: string
  }[]
}): ProjectRecord {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    parentId: project.parentId,
    generationCount: project._count.generations,
    coverUrls: project.generations
      .map(toCoverUrl)
      .filter((url): url is string => Boolean(url)),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
}

const projectSelect = {
  id: true,
  name: true,
  description: true,
  parentId: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { generations: true } },
  generations: {
    select: {
      url: true,
      thumbnailUrl: true,
      previewUrl: true,
      outputType: true,
    },
    orderBy: { createdAt: 'desc' as const },
    // 门牌卡的 2×2 拼贴要 4 张。
    take: PROJECT_COVER_TILE_COUNT,
  },
} as const

async function resolveProjectParentId(
  userId: string,
  parentId: string | null | undefined,
  projectId?: string,
): Promise<string | null | undefined> {
  if (parentId === undefined) return undefined
  if (parentId === null) return null

  if (parentId === projectId) {
    throw new Error('A folder cannot be moved into itself')
  }

  let cursor = await db.project.findFirst({
    where: { id: parentId, userId, isDeleted: false },
    select: { id: true, parentId: true },
  })

  if (!cursor) {
    throw new Error('Parent folder not found')
  }

  let depth = 0
  while (cursor.parentId) {
    if (cursor.parentId === projectId) {
      throw new Error('A folder cannot be moved into its own child')
    }
    depth += 1
    if (depth > PROJECT.MAX_PROJECTS_PER_USER) {
      throw new Error('Folder hierarchy is invalid')
    }
    cursor = await db.project.findFirst({
      where: { id: cursor.parentId, userId, isDeleted: false },
      select: { id: true, parentId: true },
    })
    if (!cursor) break
  }

  return parentId
}

// ─── CRUD ────────────────────────────────────────────────────────

export async function listProjects(clerkId: string): Promise<ProjectRecord[]> {
  const dbUser = await ensureUser(clerkId)
  const projects = await db.project.findMany({
    where: { userId: dbUser.id, isDeleted: false },
    select: projectSelect,
    orderBy: { updatedAt: 'desc' },
  })
  return projects.map(toProjectRecord)
}

export async function createProject(
  clerkId: string,
  data: CreateProjectRequest,
): Promise<ProjectRecord> {
  const dbUser = await ensureUser(clerkId)

  // Enforce max projects limit
  const count = await db.project.count({
    where: { userId: dbUser.id, isDeleted: false },
  })
  if (count >= PROJECT.MAX_PROJECTS_PER_USER) {
    throw new Error(`Maximum ${PROJECT.MAX_PROJECTS_PER_USER} projects allowed`)
  }

  const parentId = await resolveProjectParentId(dbUser.id, data.parentId)
  const project = await db.project.create({
    data: {
      userId: dbUser.id,
      name: data.name,
      description: data.description,
      parentId: parentId ?? null,
    },
    select: projectSelect,
  })
  return toProjectRecord(project)
}

export async function updateProject(
  clerkId: string,
  projectId: string,
  data: UpdateProjectRequest,
): Promise<ProjectRecord> {
  const dbUser = await ensureUser(clerkId)
  const parentId = await resolveProjectParentId(
    dbUser.id,
    data.parentId,
    projectId,
  )
  const project = await db.project.update({
    where: { id: projectId, userId: dbUser.id, isDeleted: false },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(parentId !== undefined && { parentId }),
    },
    select: projectSelect,
  })
  return toProjectRecord(project)
}

export async function deleteProject(
  clerkId: string,
  projectId: string,
): Promise<void> {
  const dbUser = await ensureUser(clerkId)
  // Soft delete — generations are moved back to "no project" (null)
  await db.$transaction([
    db.generation.updateMany({
      where: { projectId, userId: dbUser.id },
      data: { projectId: null },
    }),
    db.project.updateMany({
      where: { parentId: projectId, userId: dbUser.id, isDeleted: false },
      data: { parentId: null },
    }),
    db.project.update({
      where: { id: projectId, userId: dbUser.id, isDeleted: false },
      data: { isDeleted: true },
    }),
  ])
}

// ─── Project History (generations in a project) ──────────────────

export async function getProjectHistory(
  clerkId: string,
  projectId: string | null,
  cursor?: string,
  limit: number = PROJECT.HISTORY_PAGE_SIZE,
  outputType?: 'IMAGE' | 'VIDEO' | 'AUDIO',
): Promise<{
  generations: GenerationRecord[]
  total: number
  hasMore: boolean
}> {
  const dbUser = await ensureUser(clerkId)
  const where = {
    userId: dbUser.id,
    projectId: projectId,
    ...(outputType && { outputType }),
  }

  const shouldFetchExactTotal = projectId !== null
  const [generations, exactTotal] = await Promise.all([
    db.generation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      // DB-level slim select — previously this function fetched full rows
      // (incl. the 7 MB snapshot/referenceImages blob per row) and then
      // hand-projected them in JS, which still spent the wire time. The
      // 10s `projects/unassigned/history` request came from here.
      select: {
        id: true,
        createdAt: true,
        outputType: true,
        status: true,
        url: true,
        storageKey: true,
        mimeType: true,
        width: true,
        height: true,
        duration: true,
        referenceImageUrl: true,
        prompt: true,
        negativePrompt: true,
        model: true,
        provider: true,
        requestCount: true,
        isPublic: true,
        isPromptPublic: true,
        userId: true,
      },
    }),
    shouldFetchExactTotal ? db.generation.count({ where }) : undefined,
  ])

  const hasMore = generations.length > limit
  const items = hasMore ? generations.slice(0, limit) : generations
  const total = exactTotal ?? items.length + (hasMore ? 1 : 0)

  return {
    generations: items as GenerationRecord[],
    total,
    hasMore,
  }
}

// ─── Assign generation to project ────────────────────────────────

export async function assignGenerationToProject(
  clerkId: string,
  generationId: string,
  projectId: string | null,
): Promise<void> {
  const dbUser = await ensureUser(clerkId)
  await db.generation.update({
    where: { id: generationId, userId: dbUser.id },
    data: { projectId },
  })
}
