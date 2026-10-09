import 'server-only'

import { Prisma, type OutputType } from '@/lib/generated/prisma/client'
import { db } from '@/lib/db'
import { PROJECT } from '@/constants/config'

/**
 * 素材文件夹归属的底层原语 —— 页面接口（`project.service`）与助手
 * （`asset-library-write.service` / 文件夹视觉）共用这一份判据。
 *
 * ⛔ 这里没有删夹、删图的路：助手的工具环会 import 它（钱闸见
 * `kernel/assistant-operator.money-gate.test.ts`）。
 * ⚠ 归属只在 `ProjectItem`（一张图可以同时在好几个夹里），⛔ 不读写
 * `Generation.projectId`（旧的单值归属，分两次删）。
 */

/**
 * 一个夹连同它**所有层**的活子孙（含它自己）的 id。夹不在 / 已删 / 不是他的 → 空。
 *
 * 一条递归 SQL 走完；层数没有上限，但一个用户最多 `PROJECT.MAX_PROJECTS_PER_USER`
 * 个夹，递归深度按它截断（服务端不让成环，这一道只是兜底）。
 */
export async function listFolderSubtreeIds(
  userId: string,
  folderId: string,
): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE tree AS (
      SELECT f."id", 0 AS "depth"
      FROM "Project" AS f
      WHERE f."id" = ${folderId}
        AND f."userId" = ${userId}
        AND f."isDeleted" = false
      UNION ALL
      SELECT c."id", t."depth" + 1
      FROM "Project" AS c
      JOIN tree AS t ON c."parentId" = t."id"
      WHERE c."userId" = ${userId}
        AND c."isDeleted" = false
        AND t."depth" < ${PROJECT.MAX_PROJECTS_PER_USER}
    )
    SELECT DISTINCT tree."id" FROM tree
  `
  return rows.map((row) => row.id)
}

/**
 * 素材属于哪个范围。
 *
 * - `null` = 未归档：一个活夹都不在。
 * - 夹 id = 这个夹**连同所有层的子孙夹**（层数不限，见 `listFolderSubtreeIds`）。
 */
export async function folderScopeWhere(
  userId: string,
  folderId: string | null,
): Promise<Prisma.GenerationWhereInput> {
  if (folderId === null) {
    return { folders: { none: { project: { isDeleted: false } } } }
  }
  const ids = await listFolderSubtreeIds(userId, folderId)
  return {
    folders: {
      some: { project: { isDeleted: false, id: { in: ids } } },
    },
  }
}

/** 这一层最前面的位置（这一层还没有夹时是 0）—— 新建 / 新挪进来的都排最前。 */
export async function topSortOrder(
  userId: string,
  parentId: string | null,
): Promise<number> {
  const { _min } = await db.project.aggregate({
    where: { userId, parentId, isDeleted: false },
    _min: { sortOrder: true },
  })
  return (_min.sortOrder ?? 1) - 1
}

/**
 * 放进夹：只认这个用户自己的活夹与自己的图；已经在里面的不算。
 * 返回**真的新放进去的那几张**（撤销只该把它们拿出来）。夹不在 → `null`。
 */
export async function addGenerationsToFolder(
  userId: string,
  folderId: string,
  generationIds: readonly string[],
): Promise<{ folderName: string; added: string[] } | null> {
  const folder = await db.project.findFirst({
    where: { id: folderId, userId, isDeleted: false },
    select: { id: true, name: true },
  })
  if (!folder) return null

  const owned = await db.generation.findMany({
    where: { id: { in: [...new Set(generationIds)] }, userId },
    select: { id: true },
  })
  const existing = await db.projectItem.findMany({
    where: {
      projectId: folder.id,
      generationId: { in: owned.map((row) => row.id) },
    },
    select: { generationId: true },
  })
  const already = new Set(existing.map((row) => row.generationId))
  const added = owned.map((row) => row.id).filter((id) => !already.has(id))

  if (added.length > 0) {
    await db.projectItem.createMany({
      data: added.map((generationId) => ({
        projectId: folder.id,
        generationId,
      })),
      skipDuplicates: true,
    })
  }
  return { folderName: folder.name, added }
}

/** 从夹里拿出（⛔ 不删图）。返回真的拿出来的那几张。夹不在 → `null`。 */
export async function removeGenerationsFromFolder(
  userId: string,
  folderId: string,
  generationIds: readonly string[],
): Promise<{ folderName: string; removed: string[] } | null> {
  const folder = await db.project.findFirst({
    where: { id: folderId, userId, isDeleted: false },
    select: { id: true, name: true },
  })
  if (!folder) return null

  const existing = await db.projectItem.findMany({
    where: {
      projectId: folder.id,
      generationId: { in: [...new Set(generationIds)] },
      generation: { userId },
    },
    select: { generationId: true },
  })
  const removed = existing.map((row) => row.generationId)

  if (removed.length > 0) {
    await db.projectItem.deleteMany({
      where: { projectId: folder.id, generationId: { in: removed } },
    })
  }
  return { folderName: folder.name, removed }
}

/**
 * 每个夹里有几张 —— **连所有层的子孙夹一起、同一张只算一次**（owner 09-28 定
 * 连子夹算；10-09 起层数不限，口径顺延到所有子孙）。
 * 一条 SQL 算完：先递归展开「祖先夹 → 它自己和每个活子孙」，再按祖先去重计数。
 */
export async function countFolderItems(
  userId: string,
  outputTypes: readonly OutputType[] = [],
): Promise<Record<string, number>> {
  const typeFilter = outputTypes.length
    ? Prisma.sql`AND g."outputType" IN (${Prisma.join(
        outputTypes.map((type) => Prisma.sql`${type}::"OutputType"`),
      )})`
    : Prisma.empty
  const rows = await db.$queryRaw<{ folderId: string; n: number }[]>`
    WITH RECURSIVE tree AS (
      SELECT f."id" AS "folderId", f."id" AS "nodeId", 0 AS "depth"
      FROM "Project" AS f
      WHERE f."userId" = ${userId} AND f."isDeleted" = false
      UNION ALL
      SELECT t."folderId", c."id" AS "nodeId", t."depth" + 1
      FROM tree AS t
      JOIN "Project" AS c ON c."parentId" = t."nodeId"
      WHERE c."userId" = ${userId}
        AND c."isDeleted" = false
        AND t."depth" < ${PROJECT.MAX_PROJECTS_PER_USER}
    )
    SELECT tree."folderId", COUNT(DISTINCT pi."generationId")::int AS "n"
    FROM tree
    JOIN "ProjectItem" AS pi ON pi."projectId" = tree."nodeId"
    JOIN "Generation" AS g ON g."id" = pi."generationId"
    WHERE g."userId" = ${userId} ${typeFilter}
    GROUP BY tree."folderId"
  `
  return Object.fromEntries(rows.map((row) => [row.folderId, row.n]))
}
