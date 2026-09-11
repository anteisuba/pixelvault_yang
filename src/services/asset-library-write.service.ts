import 'server-only'

import { db } from '@/lib/db'
import { PROJECT } from '@/constants/config'
import {
  ASSISTANT_ASSET_WRITE_LIMITS,
  ASSISTANT_OPERATOR_TOOL_IDS,
} from '@/constants/assistant-operator'
import { batchSetLike, getUserLikes } from '@/services/like.service'
import { ensureUser } from '@/services/user.service'
import type {
  AssistantAssetWriteRevert,
  AssistantAssetWriteRevertResult,
  AssistantOperatorAssetFavoriteEntry,
  AssistantOperatorAssetFolderEntry,
  AssistantOperatorAssetTagEntry,
} from '@/types/assistant-operator'

/**
 * **素材库的四条写操作**（`docs/references/pages/assistant-shell-v2.md` §10）。
 *
 * ── 这个文件为什么存在，以及它**不做**什么 ────────────────────────
 * 助手的工具环不许 import 任何能花钱的东西（钱闸，见
 * `services/kernel/assistant-operator.money-gate.test.ts`）。这四条改的全是
 * **用户自己库里已有的东西**：一个标签、一颗星、一个文件夹、一次归档。
 * ⛔ 不创建 generation、⛔ 不扣 credit、⛔ 不调 provider、⛔ 不碰 R2、
 * ⛔ 不删任何素材。判据与 `project-rule.service` / `context-cards.service`
 * 那两条逐字同源。
 *
 * ── 每个函数都成对出现 ────────────────────────────────────────────
 * 正操作返回的**就是撤销要用的那份原值**（§10：四条都必须带 `inverse`，
 * 而且逐条记原值）。⛔ 别在某处用「取反」省掉这份记录：一批 20 张里有 3 张
 * 本来就收藏着，取反会把那 3 张误清 —— §10 那条 ⚠ 说的就是它。
 *
 * ── 所有权 ───────────────────────────────────────────────────────
 * 每一条都按 `userId` 收敛，⛔ 不信调用方递来的 id 就是这个用户的。够不到的
 * 那些**静默跳过**（返回的 entries 里没有它们），⛔ 不抛 —— 一个陈旧的 id
 * 不该让一次整理整个失败，而「真的动了几件」由返回值如实说出来。
 */

/** 一件素材当下带着的标签。⚠ 读的是 `snapshot->'tags'`，零迁移。 */
export async function readAssetTags(
  userId: string,
  assetIds: readonly string[],
): Promise<Map<string, string[]>> {
  const byAsset = new Map<string, string[]>()
  if (assetIds.length === 0) return byAsset

  const rows = await db.$queryRaw<{ id: string; tags: unknown }[]>`
    SELECT "id", "snapshot"->'tags' AS "tags"
      FROM "Generation"
     WHERE "userId" = ${userId} AND "id" = ANY(${[...assetIds]})`

  for (const row of rows) {
    byAsset.set(row.id, normalizeTags(row.tags))
  }
  return byAsset
}

/**
 * 打标签 —— 返回**这一步真的新加上去的那几个**（逐件）。
 *
 * ⚠ 写法是 `snapshot || patch` 的**浅合并**，⛔ 不是读出来改完写回去：后者要把
 * 整份快照拉进 Node 再推回去，两次并发写还会互相抹掉。判据与
 * `setGenerationReviewState` 逐字同源，连那道 `jsonb_typeof = 'object'` 守卫都是
 * 同一条（历史上有调用方往 snapshot 里塞过数组，`||` 碰上数组是**追加一个元素**）。
 * ⚠ 已经有的标签**不算**：它不是这一步的后果，撤销时不该被摘掉。
 * ⚠ 撞到单件标签上限的那几件跳过（`skipped`），⛔ 不挤掉最老的那个。
 */
export async function tagAssets(
  userId: string,
  assetIds: readonly string[],
  tags: readonly string[],
): Promise<{ entries: AssistantOperatorAssetTagEntry[]; skipped: number }> {
  const wanted = dedupe(tags.map((tag) => tag.trim()).filter(Boolean))
  const existing = await readAssetTags(userId, assetIds)

  const entries: AssistantOperatorAssetTagEntry[] = []
  let skipped = 0

  for (const assetId of dedupe(assetIds)) {
    const current = existing.get(assetId)
    // 不是他的（或者根本没这一行）→ 静默跳过，见文件头注。
    if (!current) {
      skipped += 1
      continue
    }
    const added = wanted.filter((tag) => !current.includes(tag))
    if (added.length === 0) continue
    const next = [...current, ...added]
    if (next.length > ASSISTANT_ASSET_WRITE_LIMITS.maxTagsPerAsset) {
      skipped += 1
      continue
    }
    const written = await writeAssetTags(userId, assetId, next)
    if (!written) {
      skipped += 1
      continue
    }
    entries.push({ assetId, tags: added })
  }

  return { entries, skipped }
}

/**
 * 撤销打标签 —— **只摘掉 entries 里那几个**（那是正操作真的加上去的）。
 *
 * ⛔ 不按「入参里那几个标签」摘：那会连用户自己早就打过的一起摘掉。
 */
export async function untagAssets(
  userId: string,
  entries: readonly AssistantOperatorAssetTagEntry[],
): Promise<{ revertedCount: number; skipped: number }> {
  const current = await readAssetTags(
    userId,
    entries.map((entry) => entry.assetId),
  )

  let revertedCount = 0
  let skipped = 0
  for (const entry of entries) {
    const have = current.get(entry.assetId)
    if (!have) {
      skipped += 1
      continue
    }
    const next = have.filter((tag) => !entry.tags.includes(tag))
    if (next.length === have.length) {
      skipped += 1
      continue
    }
    const written = await writeAssetTags(userId, entry.assetId, next)
    if (written) revertedCount += 1
    else skipped += 1
  }
  return { revertedCount, skipped }
}

/**
 * 收藏 / 取消收藏 —— 返回**每件的原值**。
 *
 * ⚠ 复用既有的 `batchSetLike`（素材库里那颗星走的就是它），⛔ 不在这里另写一套
 * 写入：两套写法漂开的表现是助手收藏的那几张在素材库的「收藏」分面里不出现。
 */
export async function setAssetFavorites(
  userId: string,
  assetIds: readonly string[],
  value: boolean,
): Promise<{ entries: AssistantOperatorAssetFavoriteEntry[] }> {
  const owned = await ownedAssetIds(userId, assetIds)
  if (owned.length === 0) return { entries: [] }

  const liked = await getUserLikes(userId, owned)
  const entries = owned.map((assetId) => ({
    assetId,
    value: liked.has(assetId),
  }))

  // 已经是目标态的那几张不必再写一遍（`batchSetLike` 本身也跳过它们）。
  const toChange = entries
    .filter((entry) => entry.value !== value)
    .map((entry) => entry.assetId)
  if (toChange.length > 0) await batchSetLike(userId, toChange, value)

  return { entries }
}

/**
 * 撤销收藏 —— **逐件写回原值**（§10 那条 ⚠ 的落点）。
 *
 * ⚠ 按原值分成两组各发一次，⛔ 不是「整批取反」。
 */
export async function restoreAssetFavorites(
  userId: string,
  entries: readonly AssistantOperatorAssetFavoriteEntry[],
): Promise<{ revertedCount: number; skipped: number }> {
  const owned = new Set(
    await ownedAssetIds(
      userId,
      entries.map((entry) => entry.assetId),
    ),
  )
  const reachable = entries.filter((entry) => owned.has(entry.assetId))

  for (const value of [true, false]) {
    const ids = reachable
      .filter((entry) => entry.value === value)
      .map((entry) => entry.assetId)
    if (ids.length > 0) await batchSetLike(userId, ids, value)
  }

  return {
    revertedCount: reachable.length,
    skipped: entries.length - reachable.length,
  }
}

export class AssetFolderLimitError extends Error {
  constructor(readonly limit: number) {
    super('ASSET_FOLDER_LIMIT_REACHED')
    this.name = 'AssetFolderLimitError'
  }
}

/**
 * 建一个素材文件夹。
 *
 * ⚠ 落的是 `Project`（素材库右栏那棵树就是它，见 `AssetFolderTree`）——
 * ⛔ 不新造一张表：用户心里「素材库里的文件夹」和工作台的项目本来就是同一个东西。
 * ⚠ `parentId` 按 userId 核一遍；不是他的就当没给（挂到根上），⛔ 不整条失败：
 * 模型偶尔写错一个父夹 id，代价该是「建在外面了」而不是「什么都没建」。
 */
export async function createAssetFolder(
  userId: string,
  input: { name: string; parentId?: string | null },
): Promise<{ folderId: string; name: string; parentId: string | null }> {
  const count = await db.project.count({
    where: { userId, isDeleted: false },
  })
  if (count >= PROJECT.MAX_PROJECTS_PER_USER) {
    throw new AssetFolderLimitError(PROJECT.MAX_PROJECTS_PER_USER)
  }

  const parentId = input.parentId
    ? ((
        await db.project.findFirst({
          where: { id: input.parentId, userId, isDeleted: false },
          select: { id: true },
        })
      )?.id ?? null)
    : null

  const folder = await db.project.create({
    data: { userId, name: input.name.trim(), parentId },
    select: { id: true, name: true, parentId: true },
  })

  return { folderId: folder.id, name: folder.name, parentId: folder.parentId }
}

/**
 * 撤销建文件夹 —— **仅当它还是空的**（§10 那条 ⚠）。
 *
 * ⚠ 「空」= 里面没有素材**也**没有子文件夹。撤销发生在几步、甚至几分钟之后，
 * 中间用户完全可能已经往里丢了东西 —— 那时删掉就不是撤销，是毁数据。
 * ⚠ 非空时返回 `false`（调用方据此报「没删」），⛔ 不抛、⛔ 更不把里面的东西
 * 倒出来再删（`deleteProject` 会那么做，所以这里**有意不复用它**）。
 */
export async function deleteEmptyAssetFolder(
  userId: string,
  folderId: string,
): Promise<boolean> {
  const folder = await db.project.findFirst({
    where: { id: folderId, userId, isDeleted: false },
    select: {
      id: true,
      _count: { select: { generations: true, children: true } },
    },
  })
  if (!folder) return false
  if (folder._count.generations > 0 || folder._count.children > 0) return false

  await db.project.update({
    where: { id: folderId, userId },
    data: { isDeleted: true },
  })
  return true
}

/**
 * 把素材挪进一个文件夹 —— 返回**每件的原文件夹**（`null` = 原来没归档）。
 *
 * ⚠ 目标夹按 userId 核：不是他的 → 返回 `null`，调用方按 `unknownFolder` 拒。
 * ⚠ 逐件更新而不是一条 `updateMany`：`updateMany` 快，但它换不来这份原位记录，
 * 而没有原位记录这条工具就撤不干净（§10 的判据）。20 件是上限，账算得过来。
 */
export async function moveAssetsToFolder(
  userId: string,
  assetIds: readonly string[],
  targetFolderId: string,
): Promise<{
  folderName: string
  entries: AssistantOperatorAssetFolderEntry[]
} | null> {
  const folder = await db.project.findFirst({
    where: { id: targetFolderId, userId, isDeleted: false },
    select: { id: true, name: true },
  })
  if (!folder) return null

  const rows = await db.generation.findMany({
    where: { id: { in: dedupe(assetIds) }, userId },
    select: { id: true, projectId: true },
  })

  const entries: AssistantOperatorAssetFolderEntry[] = []
  for (const row of rows) {
    // 已经在目标夹里的那几件不算这一步的后果 —— 撤销时不该被挪走。
    if (row.projectId === folder.id) continue
    await db.generation.update({
      where: { id: row.id, userId },
      data: { projectId: folder.id },
    })
    entries.push({ assetId: row.id, folderId: row.projectId })
  }

  return { folderName: folder.name, entries }
}

/**
 * 撤销移动 —— **逐件挪回各自的原处**。
 *
 * ⚠ 原文件夹后来被删掉时回落成「未归档」（`null`）：把素材挪回一个已经不存在的
 * 夹子，结果是它在素材库里凭空消失。
 */
export async function restoreAssetFolders(
  userId: string,
  entries: readonly AssistantOperatorAssetFolderEntry[],
): Promise<{ revertedCount: number; skipped: number }> {
  const owned = new Set(
    await ownedAssetIds(
      userId,
      entries.map((entry) => entry.assetId),
    ),
  )

  const folderIds = dedupe(
    entries
      .map((entry) => entry.folderId)
      .filter((folderId): folderId is string => Boolean(folderId)),
  )
  const aliveFolders = new Set(
    (
      await db.project.findMany({
        where: { id: { in: folderIds }, userId, isDeleted: false },
        select: { id: true },
      })
    ).map((folder) => folder.id),
  )

  let revertedCount = 0
  let skipped = 0
  for (const entry of entries) {
    if (!owned.has(entry.assetId)) {
      skipped += 1
      continue
    }
    const target =
      entry.folderId && aliveFolders.has(entry.folderId) ? entry.folderId : null
    await db.generation.update({
      where: { id: entry.assetId, userId },
      data: { projectId: target },
    })
    revertedCount += 1
  }
  return { revertedCount, skipped }
}

/**
 * **撤销一条素材库写操作**（四条共用的那个入口，见
 * `types/assistant-operator.ts` 的 `AssistantAssetWriteRevertSchema` 头注）。
 *
 * ⚠ 它收的就是 step 上那份 `inverse` 原样 —— ⛔ 这一层不重新算任何原值：
 * 算第二遍就会有第二份判据，而撤销与应用必须是同一份判据的两侧。
 */
export async function revertAssistantAssetWrite(
  userId: string,
  input: AssistantAssetWriteRevert,
): Promise<AssistantAssetWriteRevertResult> {
  switch (input.tool) {
    case ASSISTANT_OPERATOR_TOOL_IDS.tagAsset:
      return untagAssets(userId, input.entries)
    case ASSISTANT_OPERATOR_TOOL_IDS.favoriteAsset:
      return restoreAssetFavorites(userId, input.entries)
    case ASSISTANT_OPERATOR_TOOL_IDS.createFolder: {
      const deleted = await deleteEmptyAssetFolder(userId, input.folderId)
      return { revertedCount: deleted ? 1 : 0, skipped: deleted ? 0 : 1 }
    }
    case ASSISTANT_OPERATOR_TOOL_IDS.moveAssets:
      return restoreAssetFolders(userId, input.entries)
  }
}

/** 路由层那一跳：clerkId → 库里的 user.id（同 `project-rule.service` 的成对导出）。 */
export async function revertAssistantAssetWriteForClerkId(
  clerkId: string,
  input: AssistantAssetWriteRevert,
): Promise<AssistantAssetWriteRevertResult> {
  const user = await ensureUser(clerkId)
  return revertAssistantAssetWrite(user.id, input)
}

// ─── Helpers ─────────────────────────────────────────────────────

function dedupe<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

/** `snapshot->'tags'` 读回来可能是任何东西（历史行）—— 只认字符串数组。 */
function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((tag): tag is string => typeof tag === 'string')
}

async function ownedAssetIds(
  userId: string,
  assetIds: readonly string[],
): Promise<string[]> {
  if (assetIds.length === 0) return []
  const rows = await db.generation.findMany({
    where: { id: { in: dedupe(assetIds) }, userId },
    select: { id: true },
  })
  return rows.map((row) => row.id)
}

/**
 * 把一件素材的标签整组写回去。
 *
 * ⚠ `jsonb_typeof = 'object'` 那道守卫见本文件头注的 `tagAssets` 段 —— 改不动的
 * 行返回 `false`，⛔ 不悄悄把它重写成对象（那是在改别人的数据结构）。
 */
async function writeAssetTags(
  userId: string,
  assetId: string,
  tags: readonly string[],
): Promise<boolean> {
  /**
   * ⚠ 空列表**把整个键删掉**（`- 'tags'`），⛔ 不写一个 `"tags": []`：撤销的判据是
   * 「回到原状」，而一件从没打过标签的素材的原状是**没有这个键**。留一个空数组
   * 在快照里，下一个读 snapshot 的人就会看到一件「标签被清空过」的素材 ——
   * 那是这一步捏造出来的历史。
   */
  const updated =
    tags.length === 0
      ? await db.$executeRaw`
    UPDATE "Generation"
       SET "snapshot" = COALESCE("snapshot", '{}'::jsonb) - 'tags'
     WHERE "id" = ${assetId}
       AND "userId" = ${userId}
       AND jsonb_typeof(COALESCE("snapshot", '{}'::jsonb)) = 'object'`
      : await db.$executeRaw`
    UPDATE "Generation"
       SET "snapshot" = COALESCE("snapshot", '{}'::jsonb) || ${JSON.stringify({ tags })}::jsonb
     WHERE "id" = ${assetId}
       AND "userId" = ${userId}
       AND jsonb_typeof(COALESCE("snapshot", '{}'::jsonb)) = 'object'`
  return updated > 0
}
