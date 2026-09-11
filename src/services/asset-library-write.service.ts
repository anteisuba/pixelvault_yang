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

/**
 * 打标签 —— 返回**这一步真的新加上去的那几个**（逐件）。
 *
 * ⚠ 并集在 **Postgres 里一条语句内**算完（`applyTagUnion`），⛔ 不是「读出来、
 * 在 Node 里算、再整组写回去」：后者两次并发打标签会互相抹掉 —— 后写的那次
 * 带着的是它读到的旧数组，覆盖上去就把前一次刚加的标签丢了。
 * ⚠ 已经有的标签**不算**：它不是这一步的后果，撤销时不该被摘掉 —— 所以那条
 * 语句把**更新前**的数组一并 `RETURNING` 出来，`added` 由前后差集得出。
 * ⚠ 撞到单件标签上限的那几件跳过（`skipped`），⛔ 不挤掉最老的那个。
 */
export async function tagAssets(
  userId: string,
  assetIds: readonly string[],
  tags: readonly string[],
): Promise<{ entries: AssistantOperatorAssetTagEntry[]; skipped: number }> {
  const wanted = dedupe(tags.map((tag) => tag.trim()).filter(Boolean))

  const entries: AssistantOperatorAssetTagEntry[] = []
  let skipped = 0

  // 一个标签都没给 → 这一步什么都不该落（⛔ 尤其不该凭空写出一个 `tags: []`）。
  if (wanted.length === 0) return { entries, skipped }

  for (const assetId of dedupe(assetIds)) {
    const result = await applyTagUnion(userId, assetId, wanted)
    // 不是他的（或者根本没这一行）、快照不是对象、撞上限 → 静默跳过，见文件头注。
    if (!result) {
      skipped += 1
      continue
    }
    const added = result.next.filter((tag) => !result.prev.includes(tag))
    if (added.length === 0) continue
    entries.push({ assetId, tags: added })
  }

  return { entries, skipped }
}

/**
 * 撤销打标签 —— **只摘掉 entries 里那几个**（那是正操作真的加上去的）。
 *
 * ⛔ 不按「入参里那几个标签」摘：那会连用户自己早就打过的一起摘掉。
 * ⚠ 同样一条语句内过滤重建（`applyTagRemoval`），⛔ 不读回来再整组写：撤销与
 * 并发的打标签交错时，整组写回会把别人刚加上的那几个一起抹掉。
 */
export async function untagAssets(
  userId: string,
  entries: readonly AssistantOperatorAssetTagEntry[],
): Promise<{ revertedCount: number; skipped: number }> {
  let revertedCount = 0
  let skipped = 0
  for (const entry of entries) {
    const removed = await applyTagRemoval(userId, entry.assetId, entry.tags)
    if (removed) revertedCount += 1
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
 * 并集写入：**一条语句**里锁行、算并集、判上限、写回，并把更新前后的标签一起
 * 带出来。返回 `null` = 这一件没动（够不着 / 快照不是对象 / 撞上限）。
 *
 * ⚠ `FOR UPDATE` 那个 CTE 是这条语句抗并发的全部理由：READ COMMITTED 下它会
 * 等住并发事务、然后读到**最新**那版行，随后的 UPDATE 因为锁已在手，中间不可能
 * 再被塞进一次写。⛔ 不能把并集挪到 Node 里算 —— 那就又回到「读—算—覆盖」。
 * ⚠ `jsonb_typeof = 'object'` 那道守卫与 `setGenerationReviewState` 逐字同源：
 * 历史上有调用方往 snapshot 里塞过数组，改不动的行返回 `null`，⛔ 不悄悄把它
 * 重写成对象（那是在改别人的数据结构）。
 * ⚠ 并集**保序**：原有的在前、这次新加的按给定顺序接在后面，⛔ 不用
 * `jsonb_agg(DISTINCT …)`（那会按字典序重排，撤销读起来像换了一份数据）。
 * ⚠ `m.next = m.prev` 那条或分支：一件已经满员的素材被打上它早就有的标签时
 * 不算跳过 —— 这一步本来就没有后果。
 */
async function applyTagUnion(
  userId: string,
  assetId: string,
  wanted: readonly string[],
): Promise<{ prev: string[]; next: string[] } | null> {
  const rows = await db.$queryRaw<{ prev: unknown; next: unknown }[]>`
    WITH locked AS (
      SELECT "id",
             CASE WHEN jsonb_typeof("snapshot"->'tags') = 'array'
                  THEN "snapshot"->'tags'
                  ELSE '[]'::jsonb END AS raw
        FROM "Generation"
       WHERE "id" = ${assetId}
         AND "userId" = ${userId}
         AND jsonb_typeof(COALESCE("snapshot", '{}'::jsonb)) = 'object'
         FOR UPDATE
    ),
    merged AS (
      SELECT l."id",
             (SELECT COALESCE(jsonb_agg(d.v ORDER BY d.ord), '[]'::jsonb)
                FROM (SELECT DISTINCT ON (e.v) e.v, e.ord
                        FROM jsonb_array_elements(l.raw)
                             WITH ORDINALITY AS e(v, ord)
                       WHERE jsonb_typeof(e.v) = 'string'
                       ORDER BY e.v, e.ord) AS d) AS prev,
             (SELECT COALESCE(jsonb_agg(d.v ORDER BY d.ord), '[]'::jsonb)
                FROM (SELECT DISTINCT ON (e.v) e.v, e.ord
                        FROM jsonb_array_elements(
                               l.raw || ${JSON.stringify(wanted)}::jsonb)
                             WITH ORDINALITY AS e(v, ord)
                       WHERE jsonb_typeof(e.v) = 'string'
                       ORDER BY e.v, e.ord) AS d) AS next
        FROM locked l
    )
    UPDATE "Generation" g
       SET "snapshot" =
             jsonb_set(COALESCE(g."snapshot", '{}'::jsonb), '{tags}', m.next, true)
      FROM merged m
     WHERE g."id" = m."id"
       AND (jsonb_array_length(m.next)
              <= ${ASSISTANT_ASSET_WRITE_LIMITS.maxTagsPerAsset}
            OR m.next = m.prev)
    RETURNING m.prev AS "prev", m.next AS "next"`

  const row = rows[0]
  if (!row) return null
  return { prev: normalizeTags(row.prev), next: normalizeTags(row.next) }
}

/**
 * 摘标签：同样一条语句里锁行、过滤重建、写回。返回真的摘掉了没有。
 *
 * ⚠ 摘空之后**把整个键删掉**（`- 'tags'`），⛔ 不写一个 `"tags": []`：撤销的判据
 * 是「回到原状」，而一件从没打过标签的素材的原状是**没有这个键**。留一个空数组
 * 在快照里，下一个读 snapshot 的人就会看到一件「标签被清空过」的素材 ——
 * 那是这一步捏造出来的历史。
 * ⚠ `m.next <> m.prev` 决定了「真的摘掉了」：一个都没命中就不写、按 `skipped` 回报。
 */
async function applyTagRemoval(
  userId: string,
  assetId: string,
  tags: readonly string[],
): Promise<boolean> {
  const rows = await db.$queryRaw<{ next: unknown }[]>`
    WITH locked AS (
      SELECT "id",
             CASE WHEN jsonb_typeof("snapshot"->'tags') = 'array'
                  THEN "snapshot"->'tags'
                  ELSE '[]'::jsonb END AS raw
        FROM "Generation"
       WHERE "id" = ${assetId}
         AND "userId" = ${userId}
         AND jsonb_typeof(COALESCE("snapshot", '{}'::jsonb)) = 'object'
         FOR UPDATE
    ),
    merged AS (
      SELECT l."id",
             (SELECT COALESCE(jsonb_agg(d.v ORDER BY d.ord), '[]'::jsonb)
                FROM (SELECT DISTINCT ON (e.v) e.v, e.ord
                        FROM jsonb_array_elements(l.raw)
                             WITH ORDINALITY AS e(v, ord)
                       WHERE jsonb_typeof(e.v) = 'string'
                       ORDER BY e.v, e.ord) AS d) AS prev,
             (SELECT COALESCE(jsonb_agg(d.v ORDER BY d.ord), '[]'::jsonb)
                FROM (SELECT DISTINCT ON (e.v) e.v, e.ord
                        FROM jsonb_array_elements(l.raw)
                             WITH ORDINALITY AS e(v, ord)
                       WHERE jsonb_typeof(e.v) = 'string'
                         AND NOT ((e.v #>> '{}') = ANY(${[...tags]}::text[]))
                       ORDER BY e.v, e.ord) AS d) AS next
        FROM locked l
    )
    UPDATE "Generation" g
       SET "snapshot" =
             CASE WHEN jsonb_array_length(m.next) = 0
                  THEN COALESCE(g."snapshot", '{}'::jsonb) - 'tags'
                  ELSE jsonb_set(
                         COALESCE(g."snapshot", '{}'::jsonb), '{tags}', m.next, true)
             END
      FROM merged m
     WHERE g."id" = m."id"
       AND m.next <> m.prev
    RETURNING m.next AS "next"`

  return rows.length > 0
}
