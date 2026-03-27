import 'server-only'

import { db } from '@/lib/db'
import { PROJECT } from '@/constants/config'
import type {
  CreateProjectRequest,
  UpdateProjectRequest,
  ProjectRecord,
  GenerationRecord,
} from '@/types'

// ─── Helpers ─────────────────────────────────────────────────────

function toProjectRecord(project: {
  id: string
  name: string
  description: string | null
  createdAt: Date
  updatedAt: Date
  _count: { generations: number }
  generations: { url: string }[]
}): ProjectRecord {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    generationCount: project._count.generations,
    latestGenerationUrl: project.generations[0]?.url ?? null,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
}

const projectSelect = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { generations: true } },
  generations: {
    select: { url: true },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
  },
} as const

// ─── CRUD ────────────────────────────────────────────────────────

export async function listProjects(userId: string): Promise<ProjectRecord[]> {
  const projects = await db.project.findMany({
    where: { userId, isDeleted: false },
    select: projectSelect,
    orderBy: { updatedAt: 'desc' },
  })
  return projects.map(toProjectRecord)
}

export async function createProject(
  userId: string,
  data: CreateProjectRequest,
): Promise<ProjectRecord> {
  // Enforce max projects limit
  const count = await db.project.count({
    where: { userId, isDeleted: false },
  })
  if (count >= PROJECT.MAX_PROJECTS_PER_USER) {
    throw new Error(`Maximum ${PROJECT.MAX_PROJECTS_PER_USER} projects allowed`)
  }

  const project = await db.project.create({
    data: {
      userId,
      name: data.name,
      description: data.description,
    },
    select: projectSelect,
  })
  return toProjectRecord(project)
}

export async function updateProject(
  userId: string,
  projectId: string,
  data: UpdateProjectRequest,
): Promise<ProjectRecord> {
  const project = await db.project.update({
    where: { id: projectId, userId, isDeleted: false },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
    },
    select: projectSelect,
  })
  return toProjectRecord(project)
}

export async function deleteProject(
  userId: string,
  projectId: string,
): Promise<void> {
  // Soft delete — generations are moved back to "no project" (null)
  await db.$transaction([
    db.generation.updateMany({
      where: { projectId, userId },
      data: { projectId: null },
    }),
    db.project.update({
      where: { id: projectId, userId, isDeleted: false },
      data: { isDeleted: true },
    }),
  ])
}

// ─── Project History (generations in a project) ──────────────────

export async function getProjectHistory(
  userId: string,
  projectId: string | null,
  cursor?: string,
  limit: number = PROJECT.HISTORY_PAGE_SIZE,
): Promise<{
  generations: GenerationRecord[]
  total: number
  hasMore: boolean
}> {
  const where = {
    userId,
    projectId: projectId,
  }

  const [generations, total] = await Promise.all([
    db.generation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    }),
    db.generation.count({ where }),
  ])

  const hasMore = generations.length > limit
  const items = hasMore ? generations.slice(0, limit) : generations

  return {
    generations: items.map((g) => ({
      id: g.id,
      createdAt: g.createdAt,
      outputType: g.outputType,
      status: g.status,
      url: g.url,
      storageKey: g.storageKey,
      mimeType: g.mimeType,
      width: g.width,
      height: g.height,
      duration: g.duration,
      referenceImageUrl: g.referenceImageUrl,
      prompt: g.prompt,
      negativePrompt: g.negativePrompt,
      model: g.model,
      provider: g.provider,
      requestCount: g.requestCount,
      isPublic: g.isPublic,
      isPromptPublic: g.isPromptPublic,
      userId: g.userId,
    })),
    total,
    hasMore,
  }
}

// ─── Assign generation to project ────────────────────────────────

export async function assignGenerationToProject(
  userId: string,
  generationId: string,
  projectId: string | null,
): Promise<void> {
  await db.generation.update({
    where: { id: generationId, userId },
    data: { projectId },
  })
}
