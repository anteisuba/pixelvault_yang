import 'server-only'

import {
  ASSISTANT_ASSET_WRITE_LIMITS as LIMITS,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS as REJECT,
  ASSISTANT_OPERATOR_TOOL_IDS as TOOL,
} from '@/constants/assistant-operator'
import { ASSISTANT_OPERATOR_TOOL_ARGS_SCHEMAS } from '@/types/assistant-operator'
import { ASSISTANT_NEXT_EDIT_OP_IDS as OP } from '@/features/assistant/constants'
import { findOwnFolder } from '@/features/assistant/services/assistant-library-write.service'
import {
  reject,
  type ToolPlan,
} from '@/features/assistant/services/assistant-operator-run.service'
import {
  planAddToFolder,
  planCreateFolder,
  planFavoriteAsset,
  planTagAsset,
} from '@/features/assistant/services/assistant-operator-assets.service'

/**
 * 改库里**图片那几类**（打标签 / 收藏 / 放进文件夹 / 新建文件夹）的唯一一条路：站内助手的 edit
 * （`library.ts`）与 MCP 的 edit（`services/mcp/mcp-edit.service.ts`）都走这里。
 *
 * ⭐ 两步：`pictureWriteArgs` 把一条改动换成工具参数（必填、上限、图号认成图、文件夹按名字认），
 *   `writePictures` 按工具表的 schema 校验后交给执行器那四个规划函数写库。
 * ⚠ 认图由调用方传进来：站内还认这一轮 @ 进来的那几张，MCP 只认图号。
 * 11-10 合一：之前两边各写一遍必填与上限，MCP 那边还另写了一套回执 —— 一张都没动也回 ok，
 * 带一个什么都撤不了的撤销码。
 */

export type PictureWriteTool =
  | typeof TOOL.tagAsset
  | typeof TOOL.favoriteAsset
  | typeof TOOL.addToFolder
  | typeof TOOL.createFolder

export interface PictureWriteChange {
  readonly op: string
  readonly pictures?: readonly string[] | null
  readonly tags?: readonly string[] | null
  /** 收藏：只有明写 `false` 才是取消收藏，别的一律当收藏（站内这一格还装别的改法的值）。 */
  readonly value?: unknown
  readonly folder?: string | null
  readonly name?: string | null
}

export type PictureIds =
  | { ok: true; ids: string[] }
  | { ok: false; error: string }

export type PictureWriteArgs =
  | {
      ok: true
      tool: PictureWriteTool
      args: Record<string, unknown>
      /** 过程行标题后面接的那一截：标签 / 文件夹名。 */
      subject?: string
    }
  | { ok: false; tool: PictureWriteTool; error: string }

const TOOL_OF: Readonly<Record<string, PictureWriteTool>> = {
  [OP.tagPictures]: TOOL.tagAsset,
  [OP.favoritePictures]: TOOL.favoriteAsset,
  [OP.putInFolder]: TOOL.addToFolder,
  [OP.newFolder]: TOOL.createFolder,
}

const need = (op: string, field: string) => `${op} needs ${field}.`

/** 一条图片改动 → 工具参数。认不出的图、找不到的文件夹、缺的那一格，都在这里回一句。 */
export async function pictureWriteArgs(
  userId: string,
  change: PictureWriteChange,
  pictureIds: (names: readonly string[]) => Promise<PictureIds>,
): Promise<PictureWriteArgs> {
  const { op } = change
  const tool = TOOL_OF[op]
  if (!tool) throw new Error(`${op} is not a picture write`)
  const fail = (error: string): PictureWriteArgs => ({ ok: false, tool, error })

  if (tool === TOOL.createFolder) {
    if (!change.name) return fail(need(op, 'name'))
    const parent = change.folder
      ? await findOwnFolder(userId, change.folder)
      : null
    if (parent && !parent.ok) return fail(parent.error)
    return {
      ok: true,
      tool,
      args: {
        name: change.name,
        ...(parent?.ok ? { parentId: parent.id } : {}),
      },
      subject: change.name,
    }
  }

  if (!change.pictures?.length) return fail(need(op, 'pictures'))
  if (change.pictures.length > LIMITS.maxAssetsPerWrite)
    return fail(`At most ${LIMITS.maxAssetsPerWrite} pictures at a time.`)
  const tags = change.tags ?? []
  if (tool === TOOL.tagAsset) {
    if (!tags.length) return fail(need(op, 'tags'))
    /**
     * 超过上限照实拒（11-10），⛔ 悄悄只留前几个 —— 那样回执说「打上了」，后面几个却没打，
     * 调用方不会知道。
     */
    if (tags.length > LIMITS.maxTagsPerWrite)
      return fail(`At most ${LIMITS.maxTagsPerWrite} tags at a time.`)
  }
  if (tool === TOOL.addToFolder && !change.folder)
    return fail(need(op, 'folder'))

  const resolved = await pictureIds(change.pictures)
  if (!resolved.ok) return fail(resolved.error)
  const assetIds = resolved.ids

  if (tool === TOOL.tagAsset)
    return {
      ok: true,
      tool,
      args: { assetIds, tags: [...tags] },
      subject: tags.join(' '),
    }
  if (tool === TOOL.favoriteAsset)
    return { ok: true, tool, args: { assetIds, value: change.value !== false } }
  const folder = await findOwnFolder(userId, change.folder!)
  if (!folder.ok) return fail(folder.error)
  return {
    ok: true,
    tool,
    args: { assetIds, targetFolderId: folder.id },
    subject: folder.name,
  }
}

/** 按工具表的 schema 校验参数，再交给那条工具的规划函数（写库就发生在这一步）。 */
export async function writePictures(
  tool: PictureWriteTool,
  rawArgs: unknown,
  userId: string,
): Promise<ToolPlan> {
  const parsed = ASSISTANT_OPERATOR_TOOL_ARGS_SCHEMAS[tool].safeParse(rawArgs)
  if (!parsed.success)
    return reject(
      REJECT.malformedArgs,
      parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
        .join('; '),
    )
  switch (tool) {
    case TOOL.tagAsset:
      return planTagAsset(
        parsed.data as { assetIds: string[]; tags: string[] },
        userId,
      )
    case TOOL.favoriteAsset:
      return planFavoriteAsset(
        parsed.data as { assetIds: string[]; value: boolean },
        userId,
      )
    case TOOL.createFolder:
      return planCreateFolder(
        parsed.data as { name: string; parentId?: string },
        userId,
      )
    case TOOL.addToFolder:
      return planAddToFolder(
        parsed.data as { assetIds: string[]; targetFolderId: string },
        userId,
      )
  }
}
