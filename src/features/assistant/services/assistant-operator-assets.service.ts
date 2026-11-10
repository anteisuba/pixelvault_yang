import 'server-only'

import type {
  AssistantOperatorCharacterProfileDraft,
  AssistantOperatorCharacterImagesDraft,
  AssistantOperatorCharacterImageCandidate,
} from '@/types/assistant-operator'
import {
  type GenerationReviewState,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS as REJECT,
  ASSISTANT_OPERATOR_LIMITS as LIMITS,
  GENERATION_REVIEW_STATE_IDS as REVIEW,
  ASSISTANT_ASSET_WRITE_LIMITS as ASSET_WRITE_LIMITS,
  ASSISTANT_OPERATOR_TOOL_IDS as TOOL,
} from '@/constants/assistant-operator'
import { USER_UPLOAD_PROVIDER } from '@/constants/uploads'
import { setGenerationReviewState } from '@/services/generation.service'
import {
  tagAssets,
  setAssetFavorites,
  createAssetFolder,
  AssetFolderLimitError,
  addAssetsToFolder,
} from '@/features/assets/server'
import {
  type OperatorRun,
  type ToolPlan,
  reject,
  clamp,
} from '@/features/assistant/services/assistant-operator-run.service'
import { workingMemoryAsset } from '@/features/assistant/services/assistant-operator-planning.service'

/**
 * 助手执行器里**后果落在库里**的那几条：审核态、素材库四条写操作、角色设定与配图提案。
 * 11-10 从 `assistant-operator.service.ts` 原样搬出（M4），行为不变。
 * ⚠ 执行器的文件都叫 `assistant-operator-*.service.ts`：钱闸测试按这个前缀收源码。
 */

// ─── 审核态（切片 X）────────────────────────────────────────────

/**
 * 标一张产物的**审核态**（切片 X）—— owner「禁止用失败的旧图」的落点。
 *
 * ⚠ 它是全表**第二条后果落在服务端**的改动型工具（第一条是 `add_project_rule`），
 * 判据逐字同源：写的是**用户自己对自己产物的一句判断**——不建 generation、
 * 不扣 credit、不调 provider、不碰 R2。钱闸的允许名单因此一条都不用松。
 * ⚠ `inverse` 里放的是服务端读到的**旧值**，撤销 = 写回去。⛔ 不像 `mount_lora`
 * 那样放一个客户端要反查的候选 id：这里没有「落地值在客户端才产生」那回事。
 * ⚠ 准入是**库**（按 userId 查这一行在不在），不是本轮检索名单 —— 与挂载那条闸
 * 的方向相反是有意的：挂载怕的是「模型编一个 id 把陌生图挂上表单」，而标记连
 * 一个字都改不了别人的东西（不是他的行 → 服务返回 null → 这里按 `unknownAsset` 拒）。
 * ⭐ 于是「上一轮那张不行」也标得动 —— 那正是这条工具存在的场景。
 */
export async function planSetReviewState(
  run: OperatorRun,
  args: { assetId: string; state: GenerationReviewState; reason?: string },
  userId: string,
): Promise<ToolPlan> {
  const known =
    run.searchIndex.get(args.assetId) ??
    workingMemoryAsset(run, args.assetId) ??
    undefined

  const result = await setGenerationReviewState(
    userId,
    args.assetId,
    args.state,
    args.reason,
  )
  if (!result) {
    return reject(
      REJECT.unknownAsset,
      "No asset of the creator's has that id. Use an id that came back from search_assets, or one of the things you produced earlier in this session.",
    )
  }

  const name = known?.displayName ?? args.assetId
  const reason = args.reason?.trim()

  return {
    kind: 'mutate',
    payload: {
      assetId: args.assetId,
      state: args.state,
      ...(reason ? { reason: clamp(reason, LIMITS.maxReviewReasonChars) } : {}),
      ...(known?.displayName ? { displayName: known.displayName } : {}),
      ...(known?.url ? { url: known.url } : {}),
    },
    inverse: { assetId: args.assetId, state: result.previous },
    observation:
      args.state === REVIEW.blocked
        ? `Marked ${name} as failed${reason ? ` (${reason})` : ''}. It stays in the library and you can still review it, but it can no longer be a first or last frame — stop offering it.`
        : `Marked ${name} as ${args.state}${reason ? ` (${reason})` : ''}.`,
    // 后果已经落在库里了（这是服务端档），这里没有本地状态要动。
    apply: () => {},
  }
}

// ─── 素材库四条写操作（v2 §10）──────────────────────────────────

/**
 * 这四条**为什么长得和其余改动型工具不一样**（v2 §10）。
 *
 * ⚠ 后果落在**服务端**（库里），与 `add_project_rule` / `set_review_state` 同一档：
 * 所以写发生在**规划期**（`payload` 里那几个 id 必须在第一个 `running` 帧里就是真的），
 * `apply()` 是空操作，撤销那一跳要打一次网络（客户端走
 * `revertAssistantAssetWriteAPI`，见 `lib/studio-operator-apply.ts`）。
 * ⚠ `inverse` 一律是**逐条记下的原值**，⛔ 不是「取反」：一批 20 张里本来就
 * 收藏着的那几张，取反会把它们误清（§10 那条 ⚠）。
 * ⚠ 准入是**库**（按 userId），⛔ 不是本轮检索名单 —— 与 `set_review_state` 同源：
 * 这四条一个字都改不了别人的东西，而「上一轮那几张收一下」恰恰是最常见的用法。
 * 一件都够不着时按 `unknownAsset` 拒；够得着一部分就动那一部分并**如实说出来**。
 * ⭐ 11-10 起只经 `assistant-picture-write.service.ts`（站内 edit 与 MCP 共用一条），⛔ 不再经 `planTool`；
 *   回执因此两边都读得懂：说图、说 find / put_in_folder / new_folder，⛔ 不提旧工具名。
 */
export async function planTagAsset(
  args: { assetIds: string[]; tags: string[] },
  userId: string,
): Promise<ToolPlan> {
  const { entries, skipped } = await tagAssets(userId, args.assetIds, args.tags)

  if (entries.length === 0) {
    return reject(
      REJECT.unknownAsset,
      skipped > 0
        ? "None of those pictures could be tagged: they are not the creator's, already at the tag limit, or already carry those tags. Say which instead of tagging again."
        : 'They already carry those tags — say so instead of tagging again.',
    )
  }

  const tags = dedupeStrings(args.tags.map((tag) => tag.trim()).filter(Boolean))
  return {
    kind: 'mutate',
    payload: {
      tags,
      assetIds: entries.map((entry) => entry.assetId),
    },
    inverse: { entries },
    observation: `Tagged ${entries.length} picture(s) with ${tags.map((tag) => `"${tag}"`).join(', ')}${
      skipped > 0
        ? `; ${skipped} were skipped (not the creator's, or already at the tag limit) — say so`
        : ''
    }. Do not tag them again.`,
    // 后果已经落在库里了 —— 客户端这一步没有任何表单字段要改。
    apply: () => {},
  }
}

export async function planFavoriteAsset(
  args: { assetIds: string[]; value: boolean },
  userId: string,
): Promise<ToolPlan> {
  const { entries } = await setAssetFavorites(userId, args.assetIds, args.value)

  if (entries.length === 0) {
    return reject(
      REJECT.unknownAsset,
      "None of those pictures are the creator's. Use picture numbers from find.",
    )
  }

  const changed = entries.filter((entry) => entry.value !== args.value).length
  return {
    kind: 'mutate',
    payload: {
      value: args.value,
      assetIds: entries.map((entry) => entry.assetId),
    },
    // ⚠ 原值**逐条**在这里，⛔ 不是一个「取反」的开关（§10）。
    inverse: { entries },
    observation: `${args.value ? 'Favourited' : 'Unfavourited'} ${changed} picture(s)${
      changed < entries.length
        ? `; ${entries.length - changed} were already that way`
        : ''
    }. Do not set them again.`,
    apply: () => {},
  }
}

/**
 * 建一个素材文件夹（§10）。
 *
 * ⚠ 它建的是一个**空夹子** —— 往里放东西是 `add_to_folder` 的事。合成一条工具的
 * 代价是撤销没有粒度：撤一次到底该删夹子还是把素材拿出来？
 */
export async function planCreateFolder(
  args: { name: string; parentId?: string },
  userId: string,
): Promise<ToolPlan> {
  const name = args.name.trim()
  if (!name) {
    return reject(REJECT.emptyValue, 'A folder needs a name.')
  }

  let folder: Awaited<ReturnType<typeof createAssetFolder>>
  try {
    folder = await createAssetFolder(userId, {
      name: clamp(name, ASSET_WRITE_LIMITS.maxFolderNameChars),
      parentId: args.parentId ?? null,
    })
  } catch (error) {
    if (error instanceof AssetFolderLimitError) {
      return reject(
        REJECT.folderLimitReached,
        `The creator already has ${error.limit} folders — the most this app keeps. Tell them plainly that an old one has to go before a new one fits; do not pick which.`,
      )
    }
    throw error
  }

  return {
    kind: 'mutate',
    payload: {
      folderId: folder.folderId,
      name: folder.name,
      parentId: folder.parentId,
    },
    inverse: { folderId: folder.folderId },
    observation: `Made an EMPTY folder "${folder.name}"${
      args.parentId && !folder.parentId
        ? ' at the top level — the parent folder you gave is not one of theirs'
        : ''
    }. Put pictures into it with put_in_folder.`,
    apply: () => {},
  }
}

export async function planAddToFolder(
  args: { assetIds: string[]; targetFolderId: string },
  userId: string,
): Promise<ToolPlan> {
  const filed = await addAssetsToFolder(
    userId,
    args.assetIds,
    args.targetFolderId,
  )
  if (!filed) {
    return reject(
      REJECT.unknownFolder,
      'No folder of theirs is called that. Use find to see their folders, or make one with new_folder first.',
    )
  }

  if (filed.added.length === 0) {
    return reject(
      REJECT.unknownAsset,
      `None of those pictures were added: they are not the creator's, or already in "${filed.folderName}". Say which instead of adding again.`,
    )
  }

  return {
    kind: 'mutate',
    payload: {
      targetFolderId: args.targetFolderId,
      targetFolderName: filed.folderName,
      assetIds: filed.added,
    },
    // ⚠ 只记**这一步新放进去**的那几张：撤销 = 从这个夹里拿出它们（§10）。
    inverse: { folderId: args.targetFolderId, assetIds: filed.added },
    observation: `Put ${filed.added.length} picture(s) into "${filed.folderName}"${
      filed.added.length < args.assetIds.length
        ? `; ${args.assetIds.length - filed.added.length} were skipped (not this creator's, or already there) — say so`
        : ''
    }. They stay in any other folders they were in; their tags and stars are untouched.`,
    apply: () => {},
  }
}

function dedupeStrings(values: readonly string[]): string[] {
  return [...new Set(values)]
}

/**
 * **提议一份角色设定**（卡片助手 C2，owner 09-27）—— ⛔ 一行库都不写。
 *
 * ⭐ 与 `planProposeContextCard` 同一条原则：把草稿交出去吐成一帧
 * `confirm(characterProfile)`；写进角色由用户在卡上点「收下勾选的」时经角色页的
 * 更新完成（带着用户自己的会话）。
 * ⚠ 角色必须是**这一页上的**（快照里有）：模型写得出一个 id ⛔ 不等于有这个角色。
 * ⚠ 同一格只留第一份；`added` 里对不上正文的那几句丢掉（它们本来就该逐字出现在
 *   `text` 里，对不上的浅底标不出来，留着只会让「只留我写的」删错东西）。
 */
export function planProposeCharacterProfile(
  run: OperatorRun,
  draft: AssistantOperatorCharacterProfileDraft,
): ToolPlan {
  const cards = run.state.cards
  const known =
    cards?.open?.id === draft.characterId ||
    Boolean(cards?.characters.some((item) => item.id === draft.characterId))
  if (!known) {
    return {
      kind: 'read',
      payload: draft,
      run: async () => ({
        result: { offered: false },
        observation: `propose_character_profile did NOT offer anything: there is no character with id=${draft.characterId} on this page. Use an id from the page snapshot (read_state) — never invent one.`,
      }),
    }
  }
  const seen = new Set<string>()
  const fields = draft.fields
    .filter((item) => {
      if (seen.has(item.field)) return false
      seen.add(item.field)
      return true
    })
    .map((item) => {
      const added = item.added?.filter((span) => item.text.includes(span))
      return {
        field: item.field,
        text: item.text,
        source: item.source,
        ...(item.sourceUrl ? { sourceUrl: item.sourceUrl } : {}),
        ...(added?.length ? { added } : {}),
      }
    })
  return {
    kind: 'confirmCharacterProfile',
    profile: { characterId: draft.characterId, fields },
  }
}

/** 这个 id 是不是这一页上的角色（快照里有）。 */
function isCharacterOnPage(run: OperatorRun, characterId: string): boolean {
  const cards = run.state.cards
  return (
    cards?.open?.id === characterId ||
    Boolean(cards?.characters.some((item) => item.id === characterId))
  )
}

function notOffered(
  payload: unknown,
  tool: string,
  why: string,
): Extract<ToolPlan, { kind: 'read' }> {
  return {
    kind: 'read',
    payload,
    run: async () => ({
      result: { offered: false },
      observation: `${tool} did NOT offer anything: ${why}`,
    }),
  }
}

/**
 * **提议几张角色图**（卡片助手 C3，owner 09-27 选「候选卡」）。
 *
 * ⭐ 同 `planProposeCharacterProfile`：吐一帧 `confirm(characterImages)`，挂上由用户在
 *   卡上点「挂上勾选的」时经角色页完成；网上那几张那时才存进素材库。
 * ⚠ 只认本轮真返回过的图：素材库的查 `searchIndex`、网上的查 `webImageIndex`（同
 *   `mount_reference` / `import_user_url` 的准入表）；标了「仅参考」的网图不收。
 *   对不上的那几张丢掉并在观察里点名，一张都对不上就不出卡。
 */
export function planProposeCharacterImages(
  run: OperatorRun,
  draft: AssistantOperatorCharacterImagesDraft,
): ToolPlan {
  const tool = TOOL.proposeCharacterImages
  if (!isCharacterOnPage(run, draft.characterId)) {
    return notOffered(
      draft,
      tool,
      `there is no character with id=${draft.characterId} on this page. Use an id from the page snapshot (read_state) — never invent one.`,
    )
  }
  const images: AssistantOperatorCharacterImageCandidate[] = []
  const dropped: string[] = []
  const seen = new Set<string>()
  for (const pick of draft.images) {
    if ('assetId' in pick) {
      const asset = run.searchIndex.get(pick.assetId)
      if (!asset) {
        dropped.push(
          `assetId ${pick.assetId} (not returned by search_assets this turn)`,
        )
        continue
      }
      if (asset.kind !== 'image') {
        dropped.push(`assetId ${pick.assetId} (not an image)`)
        continue
      }
      if (seen.has(asset.url)) continue
      seen.add(asset.url)
      images.push({
        key: `asset:${asset.assetId}`,
        source: 'library',
        url: asset.url,
        ...(asset.thumbnailUrl ? { thumbnailUrl: asset.thumbnailUrl } : {}),
        reason: pick.reason,
        assetId: asset.assetId,
        origin: asset.model === USER_UPLOAD_PROVIDER ? 'upload' : 'generation',
        ...(asset.displayName ? { displayName: asset.displayName } : {}),
      })
      continue
    }
    const image = run.webImageIndex.get(pick.imageUrl)
    if (!image) {
      dropped.push(
        `${pick.imageUrl} (not returned by search_web_images this turn)`,
      )
      continue
    }
    // 说回给模型时用它看到的那个号（`#n`，搜索期第三片）：v3 按号交，⛔ 把地址说出去。
    const label = image.n !== undefined ? `#${image.n}` : pick.imageUrl
    if (!image.usableAsInput) {
      dropped.push(
        `${label} (marked view only — that site cannot be used as an input)`,
      )
      continue
    }
    if (run.webImageVision.get(pick.imageUrl)?.isCharacter === 'no') {
      dropped.push(`${label} (you looked at it and it is NOT this character)`)
      continue
    }
    if (seen.has(image.imageUrl)) continue
    seen.add(image.imageUrl)
    images.push({
      key: `web:${image.imageUrl}`,
      source: 'web',
      url: image.imageUrl,
      ...(image.thumbnailUrl ? { thumbnailUrl: image.thumbnailUrl } : {}),
      reason: pick.reason,
      ...(image.pageUrl ? { pageUrl: image.pageUrl } : {}),
      ...(image.domain ? { domain: image.domain } : {}),
      ...(image.publisher ? { publisher: image.publisher } : {}),
      ...(image.title ? { title: image.title } : {}),
    })
  }
  if (images.length === 0) {
    return notOffered(
      draft,
      tool,
      `none of the picks can be offered — ${dropped.join('; ')}. ${
        run.mainModelLooks === true
          ? 'Offer only asset ids your library search returned and web find numbers ("#3") from this turn or last turn.'
          : 'Offer only ids and URLs your own searches returned this turn (search again if they came from an earlier turn).'
      }`,
    )
  }
  return {
    kind: 'confirmCharacterImages',
    proposal: { characterId: draft.characterId, images },
  }
}
