import 'server-only'

import { resolvePicture } from '@/features/assistant/server'
import { revertAssistantAssetWrite } from '@/features/assets/server'
import {
  createCharacter,
  createLook,
  favoriteLora,
  linkLoraToCharacter,
  pictureWriteArgs,
  savePrompt,
  setLoraCover,
  updatePrompt,
  writeCharacterProfile,
  writeLook,
  writePictures,
  type LibraryWriteOutcome,
  type LibraryWriteOwner,
  type PictureIds,
} from '@/features/assistant/server'
import type { McpTokenOwner } from '@/services/mcp/mcp-token.service'
import { ASSISTANT_OPERATOR_TOOL_IDS as TOOL } from '@/constants/assistant-operator'
import {
  AssistantAssetWriteRevertSchema,
  type AssistantAssetWriteRevert,
} from '@/types/assistant-operator'
import type { McpEditChange, McpEditInput, McpUndoInput } from '@/types/mcp'

/**
 * 改库（`docs/references/mcp.md` §4.3 ②）：站内助手 edit 改库那几种的同一批写函数，
 * ⛔ 不另写一套写库；图片那几类连换算与回执也与站内同一条（`pictureWriteArgs` / `writePictures`）。每条各自成败；做成的那条带一个撤销码（就是站内撤销用的那份 `inverse`，
 * base64url 包一层），`undo` 原样交回 `revertAssistantAssetWrite` —— 撤销按 userId 收敛，
 * 码被改过也只碰得到她自己的东西。
 */

export interface McpEditResult {
  readonly op: string
  readonly ok: boolean
  readonly said: string
  readonly undo?: string
}

type Outcome =
  | { ok: true; said: string; revert: AssistantAssetWriteRevert }
  | { ok: false; said: string }

const need = (op: string, field: string): Outcome => ({
  ok: false,
  said: `${op} needs ${field}.`,
})

function encodeUndo(revert: AssistantAssetWriteRevert): string {
  return Buffer.from(JSON.stringify(revert)).toString('base64url')
}

function fromLibrary(outcome: LibraryWriteOutcome): Outcome {
  return outcome.ok
    ? {
        ok: true,
        said: outcome.observation,
        revert: { tool: TOOL.libraryWrite, inverse: outcome.inverse },
      }
    : { ok: false, said: outcome.error }
}

/** `LoRA·x` / `提示词·x` / `角色·x` → x；`角色·x/造型` → { x, 造型 }。 */
function stripPrefix(raw: string): string {
  const at = raw.indexOf('·')
  return (at >= 0 ? raw.slice(at + 1) : raw).trim()
}

function characterAndLook(raw: string): { name: string; look: string | null } {
  const [name, ...look] = stripPrefix(raw).split('/')
  return { name: name!.trim(), look: look.join('/').trim() || null }
}

async function picturesOf(
  owner: McpTokenOwner,
  names: readonly string[],
): Promise<
  | { ok: true; pictures: { generationId: string; url: string }[] }
  | { ok: false; said: string }
> {
  const pictures: { generationId: string; url: string }[] = []
  const unknown: string[] = []
  for (const name of names) {
    const picture = await resolvePicture(
      { userId: owner.userId, clerkId: owner.clerkId, incognito: false },
      name,
    ).catch(() => null)
    if (picture) pictures.push(picture)
    else unknown.push(name)
  }
  return unknown.length
    ? {
        ok: false,
        said: `${unknown.join(', ')}: not pictures of theirs. Use picture numbers (图_1624); find can look them up.`,
      }
    : { ok: true, pictures }
}

/** 图片那几类只要 id（`pictureWriteArgs` 的认图回调）。 */
async function pictureIdsOf(
  owner: McpTokenOwner,
  names: readonly string[],
): Promise<PictureIds> {
  const resolved = await picturesOf(owner, names)
  return resolved.ok
    ? {
        ok: true,
        ids: resolved.pictures.map((picture) => picture.generationId),
      }
    : { ok: false, error: resolved.said }
}

async function runChange(
  owner: McpTokenOwner,
  change: McpEditChange,
): Promise<Outcome> {
  const writer: LibraryWriteOwner = {
    userId: owner.userId,
    clerkId: owner.clerkId,
  }
  const { op } = change
  switch (op) {
    case 'tag_pictures':
    case 'favorite_pictures':
    case 'put_in_folder':
    case 'new_folder': {
      // 与站内助手同一条路（`assistant-picture-write.service.ts`）：同样的必填、上限与回执。
      const write = await pictureWriteArgs(owner.userId, change, (names) =>
        pictureIdsOf(owner, names),
      )
      if (!write.ok) return { ok: false, said: write.error }
      const plan = await writePictures(write.tool, write.args, owner.userId)
      if (plan.kind !== 'mutate')
        return {
          ok: false,
          said:
            plan.kind === 'rejected' && plan.detail
              ? plan.detail
              : 'Nothing was changed.',
        }
      return {
        ok: true,
        said: plan.observation,
        revert: AssistantAssetWriteRevertSchema.parse({
          tool: write.tool,
          ...(plan.inverse as object),
        }),
      }
    }
    case 'character_profile':
      if (!change.character) return need(op, 'character')
      return fromLibrary(
        await writeCharacterProfile(writer, {
          character: characterAndLook(change.character).name,
          name: change.name ?? null,
          tags: change.tags ?? null,
          fields: change.fields ?? null,
        }),
      )
    case 'new_character':
      if (!change.name) return need(op, 'name')
      return fromLibrary(
        await createCharacter(writer, {
          name: change.name,
          tags: change.tags ?? null,
          fields: change.fields ?? null,
        }),
      )
    case 'character_look':
    case 'new_character_look': {
      if (!change.character) return need(op, 'character')
      const target = characterAndLook(change.character)
      const resolved = change.pictures?.length
        ? await picturesOf(owner, change.pictures)
        : null
      if (resolved && !resolved.ok) return resolved
      const input = {
        character: target.name,
        look: target.look,
        label: change.label ?? null,
        text: change.text ?? null,
        tags: change.tags ?? null,
        pictures: resolved?.ok ? resolved.pictures : null,
      }
      return fromLibrary(
        op === 'character_look'
          ? await writeLook(writer, {
              ...input,
              label: change.label ?? undefined,
              text: change.text ?? undefined,
            })
          : await createLook(writer, input),
      )
    }
    case 'lora_to_character': {
      if (!change.lora) return need(op, 'lora')
      if (!change.character) return need(op, 'character')
      const target = characterAndLook(change.character)
      return fromLibrary(
        await linkLoraToCharacter(writer, {
          lora: stripPrefix(change.lora),
          character: target.name,
          look: target.look,
        }),
      )
    }
    case 'favorite_lora':
      if (!change.lora) return need(op, 'lora')
      return fromLibrary(
        await favoriteLora(writer, {
          lora: stripPrefix(change.lora),
          value: change.value !== false,
        }),
      )
    case 'lora_cover': {
      if (!change.lora) return need(op, 'lora')
      if (!change.picture) return need(op, 'picture')
      const resolved = await picturesOf(owner, [change.picture])
      if (!resolved.ok) return resolved
      return fromLibrary(
        await setLoraCover(writer, {
          lora: stripPrefix(change.lora),
          url: resolved.pictures[0]!.url,
        }),
      )
    }
    case 'save_prompt':
      if (!change.name) return need(op, 'name')
      if (!change.text) return need(op, 'text')
      return fromLibrary(
        await savePrompt(writer, {
          name: change.name,
          prompt: change.text,
          negative: change.negativeText ?? null,
          modelId: change.model ?? null,
        }),
      )
    case 'update_prompt':
      if (!change.saved) return need(op, 'saved')
      return fromLibrary(
        await updatePrompt(writer, {
          prompt: stripPrefix(change.saved),
          name: change.name ?? null,
          text: change.text ?? null,
          negative: change.negativeText ?? null,
        }),
      )
  }
}

/** 一条一条做，各自成败（⛔ 一条失败不回滚前面做成的）。 */
export async function editForMcp(
  owner: McpTokenOwner,
  input: McpEditInput,
): Promise<McpEditResult[]> {
  const results: McpEditResult[] = []
  for (const change of input.changes) {
    const outcome = await runChange(owner, change)
    results.push(
      outcome.ok
        ? {
            op: change.op,
            ok: true,
            said: outcome.said,
            undo: encodeUndo(outcome.revert),
          }
        : { op: change.op, ok: false, said: outcome.said },
    )
  }
  return results
}

export async function undoForMcp(
  owner: McpTokenOwner,
  input: McpUndoInput,
): Promise<string> {
  let raw: unknown = null
  try {
    raw = JSON.parse(Buffer.from(input.undo, 'base64url').toString('utf8'))
  } catch {
    raw = null
  }
  const parsed = AssistantAssetWriteRevertSchema.safeParse(raw)
  if (!parsed.success)
    return 'That is not an undo code edit gave back; nothing was changed.'
  const result = await revertAssistantAssetWrite(owner.userId, parsed.data)
  return result.skipped
    ? `Undid ${result.revertedCount}; ${result.skipped} could not be undone (changed or moved since).`
    : `Undone.`
}
