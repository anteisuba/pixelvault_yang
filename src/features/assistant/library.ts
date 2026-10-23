import 'server-only'

import {
  ASSISTANT_ASSET_WRITE_LIMITS,
  ASSISTANT_OPERATOR_TOOL_IDS as TOOL,
} from '@/constants/assistant-operator'
import type { PromptAssistantResponseLanguage } from '@/types'
import type { AssistantOperatorEvent } from '@/types/assistant-operator'
import {
  createCharacter,
  createLook,
  favoriteLora,
  findOwnFolder,
  linkLoraToCharacter,
  savePrompt,
  setLoraCover,
  updatePrompt,
  writeCharacterProfile,
  writeLook,
  type LibraryWriteOutcome,
  type LibraryWriteOwner,
} from '@/services/assistant-library-write.service'
import {
  refused,
  runOldTool,
} from '@/services/kernel/assistant-v3-bench.service'
import {
  settlePlan,
  type V3Context,
  type V3Outcome,
} from '@/services/kernel/assistant-v3-steps.service'
import {
  ASSISTANT_NEXT_EDIT_OP_IDS as OP,
  type AssistantNextEditOp,
} from '@/features/assistant/constants'
import type { EditChange } from '@/features/assistant/tools'
import {
  parseWorkspaceHandle,
  resolvePicture,
} from '@/features/assistant/workspace.service'

/**
 * 改库（第 4b 步，owner 10-23）：任何台上都能用的那几种改法。
 *
 * ⭐ 直接写进库，过程行带撤销；删和公开不做（owner 10-23）。
 * ⭐ 素材那五种（标签 / 收藏 / 建夹 / 放进夹 / 标好坏）交给旧执行器现成的那几条（撤销通道现成）；
 *   角色、造型、LoRA、提示词库走 `library_write`（`services/assistant-library-write`）。
 * ⭐ 编号照第 3 步：图 `图_N`、`角色·名/造型`、`LoRA·名`、`提示词·名`。
 */

export const LIBRARY_OPS: readonly AssistantNextEditOp[] = [
  OP.tagPictures,
  OP.favoritePictures,
  OP.newFolder,
  OP.putInFolder,
  OP.verdict,
  OP.characterProfile,
  OP.newCharacter,
  OP.characterLook,
  OP.newCharacterLook,
  OP.loraToCharacter,
  OP.favoriteLora,
  OP.loraCover,
  OP.savePrompt,
  OP.updatePrompt,
]

export function isLibraryOp(op: string): boolean {
  return LIBRARY_OPS.includes(op as AssistantNextEditOp)
}

const TITLES: Record<
  PromptAssistantResponseLanguage,
  Record<string, string>
> = {
  chinese: {
    [OP.tagPictures]: '打标签',
    [OP.favoritePictures]: '收藏',
    [OP.newFolder]: '建文件夹',
    [OP.putInFolder]: '放进文件夹',
    [OP.verdict]: '标记',
    [OP.characterProfile]: '改角色',
    [OP.newCharacter]: '新建角色',
    [OP.characterLook]: '改造型',
    [OP.newCharacterLook]: '新建造型',
    [OP.loraToCharacter]: 'LoRA 加到角色',
    [OP.favoriteLora]: '收藏 LoRA',
    [OP.loraCover]: '换 LoRA 封面',
    [OP.savePrompt]: '存提示词',
    [OP.updatePrompt]: '改提示词库',
  },
  japanese: {
    [OP.tagPictures]: 'タグ付け',
    [OP.favoritePictures]: 'お気に入り',
    [OP.newFolder]: 'フォルダ作成',
    [OP.putInFolder]: 'フォルダへ移動',
    [OP.verdict]: '判定',
    [OP.characterProfile]: 'キャラ編集',
    [OP.newCharacter]: 'キャラ作成',
    [OP.characterLook]: '衣装編集',
    [OP.newCharacterLook]: '衣装作成',
    [OP.loraToCharacter]: 'LoRA をキャラへ',
    [OP.favoriteLora]: 'LoRA お気に入り',
    [OP.loraCover]: 'LoRA カバー変更',
    [OP.savePrompt]: 'プロンプト保存',
    [OP.updatePrompt]: 'プロンプト編集',
  },
  english: {
    [OP.tagPictures]: 'Tag',
    [OP.favoritePictures]: 'Favourite',
    [OP.newFolder]: 'New folder',
    [OP.putInFolder]: 'Put in folder',
    [OP.verdict]: 'Mark',
    [OP.characterProfile]: 'Edit character',
    [OP.newCharacter]: 'New character',
    [OP.characterLook]: 'Edit look',
    [OP.newCharacterLook]: 'New look',
    [OP.loraToCharacter]: 'LoRA to character',
    [OP.favoriteLora]: 'Favourite LoRA',
    [OP.loraCover]: 'LoRA cover',
    [OP.savePrompt]: 'Save prompt',
    [OP.updatePrompt]: 'Edit saved prompt',
  },
}

function ownerOf(context: V3Context): LibraryWriteOwner {
  return { userId: context.prepared.user.id, clerkId: context.clerkId }
}

/** `LoRA·malfoid` / `提示词·雨夜` / `角色·马尔福/冬装` → 名字本身。 */
function nameOf(raw: string): string {
  const handle = parseWorkspaceHandle(raw)
  if (handle?.kind === 'lora' || handle?.kind === 'prompt') return handle.name
  if (handle?.kind === 'character') return handle.name
  return raw.trim()
}

function characterAndLook(raw: string): { name: string; look: string | null } {
  const handle = parseWorkspaceHandle(raw)
  if (handle?.kind === 'character')
    return { name: handle.name, look: handle.look }
  const [name, ...look] = raw.split('/')
  return { name: name!.trim(), look: look.join('/').trim() || null }
}

type ResolvedPicture = { generationId: string; url: string; label: string }

/** 图按编号认（`图_N`），附在消息上的图按名字认；认不出的一张一张列出来。 */
async function picturesOf(
  context: V3Context,
  names: readonly string[],
): Promise<
  { ok: true; pictures: ResolvedPicture[] } | { ok: false; error: string }
> {
  const pictures: ResolvedPicture[] = []
  const unknown: string[] = []
  const owner = {
    ...ownerOf(context),
    incognito: context.request.incognito === true,
  }
  for (const name of names) {
    const key = name.trim().toLowerCase()
    const attached = (context.request.mentionedAssets ?? []).find(
      (asset) => asset.label?.trim().toLowerCase() === key,
    )
    if (attached) {
      pictures.push({
        generationId: attached.id,
        url: attached.url,
        label: attached.label ?? name,
      })
      continue
    }
    const picture = await resolvePicture(owner, name).catch(() => null)
    if (picture) pictures.push(picture)
    else unknown.push(name)
  }
  if (unknown.length)
    return {
      ok: false,
      error: `${unknown.join(', ')}: not pictures of theirs. Use picture numbers (图_1624); find can look them up.`,
    }
  return { ok: true, pictures }
}

/** 旧执行器的话里提到的旧工具名，换成新内核的说法。 */
function inNextWords(outcome: V3Outcome): V3Outcome {
  if (outcome.kind !== 'result') return outcome
  return {
    ...outcome,
    output: outcome.output
      .replace(/search_assets|search_library/g, 'find')
      .replace(/list_asset_folders/g, 'find'),
  }
}

/** 改库那一条的结果 → 一步（`library_write`，带撤销）或一条红行。 */
async function* settleWrite(
  context: V3Context,
  title: string,
  outcome: LibraryWriteOutcome,
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  if (!outcome.ok)
    return yield* refused(context, TOOL.libraryWrite, title, outcome.error)
  return yield* settlePlan(context, TOOL.libraryWrite, title, {
    kind: 'mutate',
    payload: outcome.payload,
    inverse: outcome.inverse,
    observation: outcome.observation,
    apply: () => {},
  })
}

const need = (op: string, field: string) => `${op} needs ${field}.`

/** 一条改库改动。不在单子上的回 `null`（交回台上那一套）。 */
export async function* runLibraryChange(
  context: V3Context,
  change: EditChange,
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  const title = TITLES[context.language][change.op] ?? change.op
  const owner = ownerOf(context)
  const fail = (tool: (typeof TOOL)[keyof typeof TOOL], error: string) =>
    refused(context, tool, title, error)

  switch (change.op) {
    case OP.tagPictures:
    case OP.favoritePictures:
    case OP.putInFolder: {
      const tool =
        change.op === OP.tagPictures
          ? TOOL.tagAsset
          : change.op === OP.favoritePictures
            ? TOOL.favoriteAsset
            : TOOL.addToFolder
      if (!change.pictures?.length)
        return yield* fail(tool, need(change.op, 'pictures'))
      if (
        change.pictures.length > ASSISTANT_ASSET_WRITE_LIMITS.maxAssetsPerWrite
      )
        return yield* fail(
          tool,
          `At most ${ASSISTANT_ASSET_WRITE_LIMITS.maxAssetsPerWrite} pictures at a time.`,
        )
      const resolved = await picturesOf(context, change.pictures)
      if (!resolved.ok) return yield* fail(tool, resolved.error)
      const assetIds = resolved.pictures.map((picture) => picture.generationId)
      if (change.op === OP.tagPictures) {
        if (!change.tags?.length)
          return yield* fail(tool, need(change.op, 'tags'))
        return inNextWords(
          yield* runOldTool(
            context,
            tool,
            `${title} ${change.tags.join(' ')}`,
            {
              assetIds,
              tags: change.tags,
            },
          ),
        )
      }
      if (change.op === OP.favoritePictures)
        return inNextWords(
          yield* runOldTool(context, tool, title, {
            assetIds,
            value: change.value !== false,
          }),
        )
      if (!change.folder) return yield* fail(tool, need(change.op, 'folder'))
      const folder = await findOwnFolder(owner.userId, change.folder)
      if (!folder.ok) return yield* fail(tool, folder.error)
      return inNextWords(
        yield* runOldTool(context, tool, `${title}「${folder.name}」`, {
          assetIds,
          targetFolderId: folder.id,
        }),
      )
    }
    case OP.newFolder: {
      const tool = TOOL.createFolder
      if (!change.name) return yield* fail(tool, need(change.op, 'name'))
      const parent = change.folder
        ? await findOwnFolder(owner.userId, change.folder)
        : null
      if (parent && !parent.ok) return yield* fail(tool, parent.error)
      return inNextWords(
        yield* runOldTool(context, tool, `${title}「${change.name}」`, {
          name: change.name,
          ...(parent?.ok ? { parentId: parent.id } : {}),
        }),
      )
    }
    case OP.verdict: {
      const tool = TOOL.setReviewState
      if (!change.picture) return yield* fail(tool, need(change.op, 'picture'))
      if (!change.state) return yield* fail(tool, need(change.op, 'state'))
      const resolved = await picturesOf(context, [change.picture])
      if (!resolved.ok) return yield* fail(tool, resolved.error)
      return inNextWords(
        yield* runOldTool(context, tool, `${title} ${change.picture}`, {
          assetId: resolved.pictures[0]!.generationId,
          state: change.state,
          ...(change.reason ? { reason: change.reason } : {}),
        }),
      )
    }
    case OP.characterProfile:
      if (!change.character)
        return yield* fail(TOOL.libraryWrite, need(change.op, 'character'))
      return yield* settleWrite(
        context,
        title,
        await writeCharacterProfile(owner, {
          character: nameOf(change.character),
          name: change.name ?? null,
          tags: change.tags ?? null,
          fields: change.fields ?? null,
        }),
      )
    case OP.newCharacter:
      if (!change.name)
        return yield* fail(TOOL.libraryWrite, need(change.op, 'name'))
      return yield* settleWrite(
        context,
        title,
        await createCharacter(owner, {
          name: change.name,
          tags: change.tags ?? null,
          fields: change.fields ?? null,
        }),
      )
    case OP.characterLook:
    case OP.newCharacterLook: {
      if (!change.character)
        return yield* fail(TOOL.libraryWrite, need(change.op, 'character'))
      const target = characterAndLook(change.character)
      const resolved = change.pictures?.length
        ? await picturesOf(context, change.pictures)
        : null
      if (resolved && !resolved.ok)
        return yield* fail(TOOL.libraryWrite, resolved.error)
      const input = {
        character: target.name,
        look: target.look,
        label: change.label ?? null,
        text: change.text ?? null,
        tags: change.tags ?? null,
        pictures: resolved?.ok ? resolved.pictures : null,
      }
      return yield* settleWrite(
        context,
        title,
        change.op === OP.characterLook
          ? await writeLook(owner, {
              ...input,
              label: change.label ?? undefined,
              text: change.text ?? undefined,
            })
          : await createLook(owner, input),
      )
    }
    case OP.loraToCharacter: {
      if (!change.lora)
        return yield* fail(TOOL.libraryWrite, need(change.op, 'lora'))
      if (!change.character)
        return yield* fail(TOOL.libraryWrite, need(change.op, 'character'))
      const target = characterAndLook(change.character)
      return yield* settleWrite(
        context,
        title,
        await linkLoraToCharacter(owner, {
          lora: nameOf(change.lora),
          character: target.name,
          look: target.look,
        }),
      )
    }
    case OP.favoriteLora:
      if (!change.lora)
        return yield* fail(TOOL.libraryWrite, need(change.op, 'lora'))
      return yield* settleWrite(
        context,
        title,
        await favoriteLora(owner, {
          lora: nameOf(change.lora),
          value: change.value !== false,
        }),
      )
    case OP.loraCover: {
      if (!change.lora)
        return yield* fail(TOOL.libraryWrite, need(change.op, 'lora'))
      if (!change.picture)
        return yield* fail(TOOL.libraryWrite, need(change.op, 'picture'))
      const resolved = await picturesOf(context, [change.picture])
      if (!resolved.ok) return yield* fail(TOOL.libraryWrite, resolved.error)
      return yield* settleWrite(
        context,
        title,
        await setLoraCover(owner, {
          lora: nameOf(change.lora),
          url: resolved.pictures[0]!.url,
        }),
      )
    }
    case OP.savePrompt: {
      if (!change.name)
        return yield* fail(TOOL.libraryWrite, need(change.op, 'name'))
      const snapshot = context.request.snapshot
      return yield* settleWrite(
        context,
        title,
        await savePrompt(owner, {
          name: change.name,
          prompt: change.text ?? snapshot.prompt ?? '',
          negative:
            change.negativeText ?? snapshot.negativePrompt?.trim() ?? null,
          modelId: snapshot.model?.catalogId ?? snapshot.model?.id ?? null,
        }),
      )
    }
    case OP.updatePrompt:
      if (!change.saved)
        return yield* fail(TOOL.libraryWrite, need(change.op, 'saved'))
      return yield* settleWrite(
        context,
        title,
        await updatePrompt(owner, {
          prompt: nameOf(change.saved),
          name: change.name ?? null,
          text: change.text ?? null,
          negative: change.negativeText ?? null,
        }),
      )
    default:
      return yield* fail(
        TOOL.libraryWrite,
        `There is no library op "${change.op}".`,
      )
  }
}
