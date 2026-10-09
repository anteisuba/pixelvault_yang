import 'server-only'

import { Prisma } from '@/lib/generated/prisma/client'
import { db } from '@/lib/db'
import { PROJECT } from '@/constants/config'
import type {
  CreateProjectRequest,
  UpdateProjectRequest,
  ReorderProjectsRequest,
  ProjectRecord,
  GenerationRecord,
  FolderItemsResult,
} from '@/types'
import {
  addGenerationsToFolder,
  folderScopeWhere,
  removeGenerationsFromFolder,
  topSortOrder,
} from '@/services/asset-folder.service'
import { ensureUser } from '@/services/user.service'

/**
 * 素材文件夹（`Project`）——`docs/references/pages/assets.md` 左栏那一列。
 *
 * - 一张图可以同时在好几个夹里：归属只在 `ProjectItem`。⛔ 不读写
 *   `Generation.projectId`（旧的单值归属，分两次删，见 schema 注释）。
 * - 层数不限（owner 2026-10-09「想要能一层层往下建」）：父夹必须是这个用户的
 *   活夹；一个夹不能挂到自己、也不能挂到自己的子孙下面（成环）。没有深度上限 ——
 *   一个用户最多 `PROJECT.MAX_PROJECTS_PER_USER` 个夹，往上走的链天然有界。
 * - 顺序是用户自己排的：同一层按 `sortOrder`，置顶组按 `pinnedOrder`；
 *   新建 / 新挪进来 / 新置顶的都排在最前面。
 */

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * 左栏那一行的小封面只能用派生图或图片本身。
 *
 * ⚠ 视频/音频/3D 的 `url` 是媒体文件，塞进 `<img>` 什么也画不出来 —— 缺派生图时
 * **直接跳过**，宁可没有封面，也不放一个永远加载失败的地址。
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

const projectSelect = {
  id: true,
  name: true,
  description: true,
  parentId: true,
  sortOrder: true,
  pinnedOrder: true,
  createdAt: true,
  updatedAt: true,
  items: {
    select: {
      generation: {
        select: {
          url: true,
          thumbnailUrl: true,
          previewUrl: true,
          outputType: true,
        },
      },
    },
    orderBy: { addedAt: 'desc' as const },
    // 最近放进来的几张里挑第一张画得出来的（缺派生图的视频会被跳过）。
    take: 4,
  },
} as const

type ProjectRow = Prisma.ProjectGetPayload<{ select: typeof projectSelect }>

function toProjectRecord(project: ProjectRow): ProjectRecord {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    parentId: project.parentId,
    sortOrder: project.sortOrder,
    pinnedOrder: project.pinnedOrder,
    coverUrl:
      project.items
        .map((item) => toCoverUrl(item.generation))
        .find((url): url is string => Boolean(url)) ?? null,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
}

async function topPinnedOrder(userId: string): Promise<number> {
  const { _min } = await db.project.aggregate({
    where: { userId, isDeleted: false, pinnedOrder: { not: null } },
    _min: { pinnedOrder: true },
  })
  return (_min.pinnedOrder ?? 1) - 1
}

/**
 * 父夹校验（层数不限）。
 *
 * ⚠ 父夹必须是这个用户的活夹；挪动一个夹时，它不能挂到自己下面，也不能挂到自己的
 * 任何一层子孙下面 —— 从新父夹沿 `parentId` 往上走，碰到它自己就是成环，拒。
 * 一次读出这个用户全部活夹（最多 `MAX_PROJECTS_PER_USER` 个）在内存里走链。
 */
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

  const folders = await db.project.findMany({
    where: { userId, isDeleted: false },
    select: { id: true, parentId: true },
  })
  const parentOf = new Map(folders.map((row) => [row.id, row.parentId]))
  if (!parentOf.has(parentId)) {
    throw new Error('Parent folder not found')
  }

  if (projectId) {
    const seen = new Set<string>()
    let current: string | null | undefined = parentId
    while (current && !seen.has(current)) {
      if (current === projectId) {
        throw new Error('A folder cannot be moved into its own subfolder')
      }
      seen.add(current)
      current = parentOf.get(current)
    }
  }

  return parentId
}

/**
 * 按给定顺序整层重排（从 0 起）。一条语句写完 —— 开发机到库一次往返两百多毫秒，
 * 逐条 update 排二十个夹就是好几秒。
 */
async function writeOrder(
  userId: string,
  column: 'sortOrder' | 'pinnedOrder',
  ids: readonly string[],
  client: Pick<typeof db, '$executeRaw'> = db,
): Promise<void> {
  if (ids.length === 0) return
  const values = Prisma.join(
    ids.map((id, index) => Prisma.sql`(${id}::text, ${index}::int)`),
  )
  await client.$executeRaw`
    UPDATE "Project" AS p
    SET ${Prisma.raw(`"${column}"`)} = v."ord"
    FROM (VALUES ${values}) AS v("id", "ord")
    WHERE p."id" = v."id" AND p."userId" = ${userId}
  `
}

/** 客户端给的顺序在前（只认真的兄弟），它没提到的兄弟按原顺序接在后面。 */
function mergeOrder(
  requested: readonly string[],
  current: readonly string[],
): string[] {
  const known = new Set(current)
  const head = [...new Set(requested)].filter((id) => known.has(id))
  const seen = new Set(head)
  return [...head, ...current.filter((id) => !seen.has(id))]
}

// ─── CRUD ────────────────────────────────────────────────────────

export async function listProjects(clerkId: string): Promise<ProjectRecord[]> {
  const dbUser = await ensureUser(clerkId)
  const projects = await db.project.findMany({
    where: { userId: dbUser.id, isDeleted: false },
    select: projectSelect,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
  const records = projects.map(toProjectRecord)

  // 夹自己没放图时借子孙夹的封面（它的数字本来就连所有子孙一起算）：
  // 一层一层往下找，近的先；同一层按手动顺序（`records` 已按它排好）。
  const childrenOf = new Map<string, ProjectRecord[]>()
  for (const record of records) {
    if (!record.parentId) continue
    const siblings = childrenOf.get(record.parentId) ?? []
    siblings.push(record)
    childrenOf.set(record.parentId, siblings)
  }
  const borrowCover = (rootId: string): string | null => {
    const seen = new Set([rootId])
    let level = childrenOf.get(rootId) ?? []
    while (level.length > 0) {
      const hit = level.find((child) => child.coverUrl)
      if (hit) return hit.coverUrl
      const next: ProjectRecord[] = []
      for (const child of level) {
        if (seen.has(child.id)) continue
        seen.add(child.id)
        next.push(...(childrenOf.get(child.id) ?? []))
      }
      level = next
    }
    return null
  }
  return records.map((record) =>
    record.coverUrl ? record : { ...record, coverUrl: borrowCover(record.id) },
  )
}

export async function createProject(
  clerkId: string,
  data: CreateProjectRequest,
): Promise<ProjectRecord> {
  const dbUser = await ensureUser(clerkId)

  const count = await db.project.count({
    where: { userId: dbUser.id, isDeleted: false },
  })
  if (count >= PROJECT.MAX_PROJECTS_PER_USER) {
    throw new Error(`Maximum ${PROJECT.MAX_PROJECTS_PER_USER} projects allowed`)
  }

  const parentId =
    (await resolveProjectParentId(dbUser.id, data.parentId)) ?? null
  const project = await db.project.create({
    data: {
      userId: dbUser.id,
      name: data.name,
      description: data.description,
      parentId,
      sortOrder: await topSortOrder(dbUser.id, parentId),
    },
    select: projectSelect,
  })
  return toProjectRecord(project)
}

/** 改名 / 挪层级 / 置顶。夹不在（或不是他的）→ `null`，路由回 404。 */
export async function updateProject(
  clerkId: string,
  projectId: string,
  data: UpdateProjectRequest,
): Promise<ProjectRecord | null> {
  const dbUser = await ensureUser(clerkId)
  const current = await db.project.findFirst({
    where: { id: projectId, userId: dbUser.id, isDeleted: false },
    select: { parentId: true, pinnedOrder: true },
  })
  if (!current) return null

  const parentId = await resolveProjectParentId(
    dbUser.id,
    data.parentId,
    projectId,
  )
  const moving = parentId !== undefined && parentId !== current.parentId
  const pinnedOrder =
    data.pinned === undefined
      ? undefined
      : data.pinned
        ? (current.pinnedOrder ?? (await topPinnedOrder(dbUser.id)))
        : null

  const project = await db.project.update({
    where: { id: projectId, userId: dbUser.id, isDeleted: false },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(moving && {
        parentId,
        sortOrder: await topSortOrder(dbUser.id, parentId ?? null),
      }),
      ...(pinnedOrder !== undefined && { pinnedOrder }),
    },
    select: projectSelect,
  })
  return toProjectRecord(project)
}

/** 拖动排序：同一层（`tree`）或置顶组（`pins`）整组重写顺序。 */
export async function reorderProjects(
  clerkId: string,
  input: ReorderProjectsRequest,
): Promise<void> {
  const dbUser = await ensureUser(clerkId)

  if (input.kind === 'pins') {
    const pinned = await db.project.findMany({
      where: {
        userId: dbUser.id,
        isDeleted: false,
        pinnedOrder: { not: null },
      },
      select: { id: true },
      orderBy: [{ pinnedOrder: 'asc' }, { createdAt: 'asc' }],
    })
    await writeOrder(
      dbUser.id,
      'pinnedOrder',
      mergeOrder(
        input.ids,
        pinned.map((row) => row.id),
      ),
    )
    return
  }

  const siblings = await db.project.findMany({
    where: { userId: dbUser.id, isDeleted: false, parentId: input.parentId },
    select: { id: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
  await writeOrder(
    dbUser.id,
    'sortOrder',
    mergeOrder(
      input.ids,
      siblings.map((row) => row.id),
    ),
  )
}

/**
 * 删夹（软删）—— ⛔ 不删图：只清掉这个夹的归属行；只在这个夹里的图自然回到
 * 「未归档」（或仍在别的夹里）。它的直接子夹**往上挪一层**（挂到它的父夹下，
 * 删的是最外层夹时就是最外层），按原顺序接在它原来的位置上；更深的子孙跟着
 * 各自的父夹走，层级关系不变。
 */
export async function deleteProject(
  clerkId: string,
  projectId: string,
): Promise<boolean> {
  const dbUser = await ensureUser(clerkId)
  const folder = await db.project.findFirst({
    where: { id: projectId, userId: dbUser.id, isDeleted: false },
    select: { id: true, parentId: true },
  })
  if (!folder) return false

  const children = await db.project.findMany({
    where: { parentId: folder.id, userId: dbUser.id, isDeleted: false },
    select: { id: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
  const siblings =
    children.length > 0
      ? await db.project.findMany({
          where: {
            parentId: folder.parentId,
            userId: dbUser.id,
            isDeleted: false,
          },
          select: { id: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        })
      : []
  const levelOrder = siblings.flatMap((sibling) =>
    sibling.id === folder.id ? children.map((child) => child.id) : [sibling.id],
  )

  await db.$transaction(async (tx) => {
    await tx.projectItem.deleteMany({ where: { projectId: folder.id } })
    await tx.project.updateMany({
      where: { parentId: folder.id, userId: dbUser.id, isDeleted: false },
      data: { parentId: folder.parentId },
    })
    await tx.project.update({
      where: { id: folder.id, userId: dbUser.id },
      data: { isDeleted: true, pinnedOrder: null },
    })
    await writeOrder(dbUser.id, 'sortOrder', levelOrder, tx)
  })
  return true
}

// ─── Folder items (membership) ───────────────────────────────────

/** `PATCH /api/projects/[id]/items`：一次既能放进也能拿出。 */
export async function updateFolderItems(
  clerkId: string,
  folderId: string,
  input: { add?: string[]; remove?: string[] },
): Promise<FolderItemsResult | null> {
  const dbUser = await ensureUser(clerkId)
  const added = input.add?.length
    ? await addGenerationsToFolder(dbUser.id, folderId, input.add)
    : null
  const removed = input.remove?.length
    ? await removeGenerationsFromFolder(dbUser.id, folderId, input.remove)
    : null
  if ((input.add?.length && !added) || (input.remove?.length && !removed)) {
    return null
  }
  return { added: added?.added ?? [], removed: removed?.removed ?? [] }
}

/** 这几张各自在哪些活夹里（加入文件夹面板的勾 / 半勾要用）。 */
export async function getFolderMemberships(
  clerkId: string,
  generationIds: readonly string[],
): Promise<Record<string, string[]>> {
  const dbUser = await ensureUser(clerkId)
  const ids = [...new Set(generationIds)]
  const rows = await db.projectItem.findMany({
    where: {
      generationId: { in: ids },
      generation: { userId: dbUser.id },
      project: { userId: dbUser.id, isDeleted: false },
    },
    select: { generationId: true, projectId: true },
  })
  const memberships: Record<string, string[]> = Object.fromEntries(
    ids.map((id) => [id, [] as string[]]),
  )
  for (const row of rows) memberships[row.generationId]?.push(row.projectId)
  return memberships
}

// ─── Project History (Studio) ────────────────────────────────────

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
  const where: Prisma.GenerationWhereInput = {
    userId: dbUser.id,
    ...(await folderScopeWhere(dbUser.id, projectId)),
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
