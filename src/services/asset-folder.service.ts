import 'server-only'

import { Prisma, type OutputType } from '@/lib/generated/prisma/client'
import { db } from '@/lib/db'

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
 * 素材属于哪个范围。
 *
 * - `null` = 未归档：一个活夹都不在。
 * - 夹 id = 这个夹**连同子夹**（只有两层，所以子夹就是 `parentId` 等于它的那些）。
 */
export function folderScopeWhere(
  folderId: string | null,
): Prisma.GenerationWhereInput {
  if (folderId === null) {
    return { folders: { none: { project: { isDeleted: false } } } }
  }
  return {
    folders: {
      some: {
        project: {
          isDeleted: false,
          OR: [{ id: folderId }, { parentId: folderId }],
        },
      },
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
 * 每个夹里有几张 —— **连子夹一起、同一张只算一次**（owner 09-28）。
 * 一条 SQL 算完：直接放在夹里的算给它自己，放在子夹里的再算给父夹一次。
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
    SELECT hit."folderId", COUNT(DISTINCT hit."generationId")::int AS "n"
    FROM (
      SELECT f."id" AS "folderId", pi."generationId"
      FROM "ProjectItem" AS pi
      JOIN "Project" AS f ON f."id" = pi."projectId"
      WHERE f."userId" = ${userId} AND f."isDeleted" = false
      UNION ALL
      SELECT parent."id" AS "folderId", pi."generationId"
      FROM "ProjectItem" AS pi
      JOIN "Project" AS f ON f."id" = pi."projectId"
      JOIN "Project" AS parent ON parent."id" = f."parentId"
      WHERE f."userId" = ${userId}
        AND f."isDeleted" = false
        AND parent."isDeleted" = false
    ) AS hit
    JOIN "Generation" AS g ON g."id" = hit."generationId"
    WHERE g."userId" = ${userId} ${typeFilter}
    GROUP BY hit."folderId"
  `
  return Object.fromEntries(rows.map((row) => [row.folderId, row.n]))
}
