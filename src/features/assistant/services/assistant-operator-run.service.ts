import 'server-only'

import type {
  AssistantOperatorSnapshotCapability,
  AssistantOperatorSnapshot,
  AssistantLoraParameters,
  AssistantOperatorCanvasSnapshot,
  AssistantOperatorCardsSnapshot,
  AssistantOperatorRequest,
  AssistantOperatorSearchResultAsset,
  AssistantOperatorWebImage,
  AssistantOperatorWorkingMemoryArtifact,
  AssistantOperatorPlanQuestion,
  AssistantOperatorGenerationRequest,
  AssistantOperatorContextCardDraft,
  AssistantOperatorCharacterProfileDraft,
  AssistantOperatorCharacterImagesProposal,
  AssistantOperatorLoraSetupConfirm,
} from '@/types/assistant-operator'
import type { ReferenceAnalysis } from '@/types/assistant-reference-analysis'
import {
  type AssistantOperatorConfirmField,
  type AssistantOperatorVerb,
  ASSISTANT_OPERATOR_VERB_IDS as VERB,
  type AssistantOperatorTool,
  type AssistantOperatorRejectReason,
  ASSISTANT_OPERATOR_LIMITS as LIMITS,
} from '@/constants/assistant-operator'
import { ApiKeyError, AuthError, InsufficientCreditsError } from '@/lib/errors'
import type { AdvancedParams } from '@/types'
import type { WebImageVisionItem } from '@/features/assistant/services/assistant-web-image-vision.service'
import type { ResolvedLlmTextRoute } from '@/services/llm-text.service'
import type { SourceRuleFilter } from '@/services/research/research-source-rules.service'
import type { AssistantEvidenceBookEntry } from '@/services/research/assistant-evidence-book.service'
import type { AssistantConversationRoundStored } from '@/types/assistant-conversation'
import type {
  AssistantPromptPersona,
  ProjectRule,
} from '@/types/assistant-persona'
import type { ContextCard } from '@/types/context-cards'
import type { AssistantAssetFolderCandidate } from '@/types/asset-folder-vision'
import type { LoraCandidate } from '@/types/lora-candidate'

/**
 * 助手执行器（旧内核拆出来的那部分）里**一轮的运行态与工具计划**：`OperatorRun` 及台面工作副本、
 * 这一轮的账本，`ToolPlan` 与几个不碰 IO 的小工具。11-10 从 `assistant-operator.service.ts`
 * 原样搬出（M1），行为不变。
 * ⚠ 执行器的文件都叫 `assistant-operator-*.service.ts`：钱闸测试按这个前缀收源码。
 */

// ─── 运行态（只活在一轮之内）────────────────────────────────────

/**
 * 工作台快照的**工作副本**。
 *
 * ⚠ 必须是可变副本，不能一直读请求里那份原始快照：第二条 `set_prompt` 的
 * `inverse` 要能撤回到**第一条写完之后**的值，而不是这一轮开始时的值。用原始快照
 * 算逆操作，连改两次再撤一次就会把中间那次的结果一起吞掉。
 */
export interface OperatorWorkingState {
  prompt: string
  negativePrompt: string | undefined
  hasNegativeControl: boolean
  modelId: string | null
  modelLabel: string | null
  hasModelControl: boolean
  /**
   * 当前跑在**哪条渠道**上（进度表 10 + 21）。`null` = 还没定 / 这个型号没有
   * 渠道之分。⚠ 可变：同一轮换两次模型，第二条的 `inverse` 要撤回第一条之后。
   */
  modelChannelId: string | null
  /**
   * 这一轮**和主模型一起跑**的其余模型（快照 `extraModels` 的可变副本）。
   * ⚠ 可变：`set_model` 之后只留与新主模型同系列的那几个（`useStudioRunModels`
   * 的同系列闸），专属 chip 行按「新主模型 + 这几个」重算。
   */
  extraModels: { id: string; label: string }[]
  /**
   * 现在**能切**到哪些模型（快照那一份的可变副本）。
   *
   * ⚠ 可变是判据的一部分（2026-09-12 真机 bug）：LoRA 域里这份列表是「与当前挂载栈
   * 兼容的底模」，同一轮 `unmount_lora` / `mount_lora` 之后它就过期了 —— 卸掉最后
   * 一把 pony LoRA，助手却还照着开跑那份快照说「只有 Pony Diffusion V6 可选」。
   */
  availableModels: {
    id: string
    label: string
    /** 这个型号底下的几条渠道（进度表 10 + 21）；⚠ 缺席 = 只有一条，没得选。 */
    channels?: { id: string; label: string }[]
    /** 目录 id（视频档的 `id` 是选项 id）—— 换模型时按它查写法规则。 */
    catalogId?: string
  }[]
  aspectRatio: string | null
  resolution: string | null
  quality: AdvancedParams['quality']
  preview: boolean | undefined
  background: AdvancedParams['background']
  complexity: AdvancedParams['complexity']
  hasSpecsControl: boolean
  count: number | null
  hasCountControl: boolean
  /**
   * **当前模型专属的那一行 chip**（进度表 21）。
   *
   * ⚠ 可变副本（同 `prompt` / `loras` 那条）：同一轮里改两次同一颗 chip，第二条
   * 的 `inverse` 要撤回到**第一条写完之后**的值。
   * ⚠ 空数组 + `hasCapabilityControl=false` = 这个工作台没有专属区；空数组 +
   * `true` 在今天不会发生（派生层一颗都没有时整节缺席）。
   */
  capabilities: AssistantOperatorSnapshotCapability[]
  hasCapabilityControl: boolean
  /** NovelAI 角色构图（可变副本，`set_tag_characters` 之后跟着变）；缺席 = 没有这一块。 */
  novelAiCharacters: AssistantOperatorSnapshot['novelAiCharacters']
  /** NovelAI 画面文字与字数上限（可变副本，`set_scene_texts` 之后跟着变）；缺席 = 画不了字。 */
  novelAiSceneTexts: AssistantOperatorSnapshot['novelAiSceneTexts']
  referenceCount: number
  referenceUrls: (string | null)[]
  referenceLimit: number
  hasReferenceControl: boolean
  // ── 视频档专属（P4-A）───────────────────────────────────────────
  /** ⚠ 与图片的 `aspectRatio` / `resolution` **分开存**：两个域不会同时在场，
   *  但共用变量会让「这一格现在归谁管」变成一个要靠 domain 去猜的问题。 */
  videoDurationSeconds: number | null
  videoAspectRatio: string | null
  videoResolution: string | null
  hasVideoSpecsControl: boolean
  /**
   * 带图时上游钉死的比例（第二期）。`null` = 这条线路不钉。
   * ⚠ 它**只是能力声明**：真锁上还要加一条「首帧槽里有图」，见 `isAspectLocked`。
   */
  videoAspectRatioLock: string | null
  // ── 具名帧槽（第二期 · 视频域）──────────────────────────────────
  /** ⚠ 缺席（`hasFrameSlotControl=false`）= 这个档没有首尾帧那两个格子。 */
  hasFrameSlotControl: boolean
  /** 这个模型认几个具名帧槽：1 = 只有首帧，2 = 首帧 + 尾帧。 */
  frameSlotCount: 1 | 2
  frameFirstUrl: string | null
  frameLastUrl: string | null
  /** 参考视频位。⚠ 缺席 = 这个宿主上没有那个控件（工作台今天就是）。 */
  hasVideoReferenceControl: boolean
  videoReferenceCount: number
  videoReferenceLimit: number
  audioReferenceCount: number
  audioReferenceLimit: number
  hasAudioReferenceControl: boolean
  /** 挂了音频却一张图/一段视频都没有时，这条线路会不会 400（按线路不按模型）。 */
  audioRequiresVisual: boolean
  /** 三态：`null` = 用户没设过。⛔ 别 `?? false`，见词表 `setSound` 的头注。 */
  soundValue: boolean | null
  soundEffective: boolean
  hasSoundControl: boolean
  // ── LoRA 装配台专属（P4-C）─────────────────────────────────────
  /**
   * 装配台上挂着的那些。**可变**：同一轮里挂一把、再调一次权重，第二步的 `inverse`
   * 要能撤回到第一步之后的值（与 `prompt` 那条同一个理由）。
   * ⛔ **没有 `loraLimit`**：三个后端全不限挂载数（服务端不读 maxLoras 是故意的）。
   */
  loras: {
    id: string
    name: string
    weight: number
    enabled: boolean
    family: string | null
    compatible: boolean
    triggerWord: string | null
    triggerEnabled: boolean
    /** 作者推荐提示词（快照来的那一格）—— `set_prompt` 的取材阶梯第一档。 */
    recommendedPrompt: string | null
    /** 来源图提示词（快照来的那一格）—— 取材阶梯第二档唯一喂得动的料。 */
    sourcePrompts: string[]
  }[]
  hasLoraControl: boolean
  loraParameters: AssistantLoraParameters | undefined
  loraBaseFamily: string | null
  loraMinWeight: number
  loraMaxWeight: number
  /** 库页现在的筛选（快照来的）—— `search_loras` 照它搜（lora-assistant §13.1）。 */
  loraLibraryFilters: NonNullable<
    AssistantOperatorSnapshot['loras']
  >['libraryFilters']
  /** ⚠ 缺席 = 这个宿主不是画布（进度表 22）。 */
  canvas: AssistantOperatorCanvasSnapshot | undefined
  /** ⚠ 缺席 = 这个宿主不是角色页（卡片助手 · 第五张脸）。 */
  cards: AssistantOperatorCardsSnapshot | undefined
}

/**
 * 画布快照里**所有**节点的 id —— 展开的镜逐个列，折叠的镜一个都没有。
 *
 * ⚠ 这就是画布域那道准入闸的名单，判据与 `searchIndex` 逐字同源：模型写得出
 * 一个 id ⛔ 不等于画布上有这个节点。折叠的镜里的节点**不在名单里**是有意的 ——
 * 模型没看见它们，也就不该去改它们；要改先把焦点挪过去再读一次。
 */
export function canvasNodeIds(
  canvas: AssistantOperatorCanvasSnapshot,
): Set<string> {
  const ids = new Set<string>()
  for (const shot of canvas.shots) {
    if (!shot.expanded) continue
    for (const node of shot.nodes) ids.add(node.id)
  }
  return ids
}

export function toWorkingState(
  snapshot: AssistantOperatorSnapshot,
): OperatorWorkingState {
  return {
    prompt: snapshot.prompt,
    negativePrompt: snapshot.negativePrompt,
    // ⚠ 字段缺席 = 没有这个控件，不是「有但空着」（2026-08-22 真机实证）。
    hasNegativeControl: snapshot.negativePrompt !== undefined,
    modelId: snapshot.model?.id ?? null,
    modelLabel: snapshot.model?.label ?? null,
    hasModelControl: snapshot.model !== undefined,
    modelChannelId: snapshot.model?.channelId ?? null,
    extraModels: (snapshot.extraModels ?? []).map((model) => ({ ...model })),
    // ⚠ 拷一份可变副本（同 `loras` 那条）：LoRA 域会在挂载栈变动后重算它。
    availableModels: snapshot.availableModels.map((model) => ({ ...model })),
    aspectRatio: snapshot.specs?.aspectRatio ?? null,
    resolution: snapshot.specs?.resolution ?? null,
    quality: snapshot.specs?.quality ?? undefined,
    preview: snapshot.specs?.preview ?? undefined,
    background: snapshot.specs?.background ?? undefined,
    complexity: snapshot.specs?.complexity ?? undefined,
    hasSpecsControl: snapshot.specs !== undefined,
    count: snapshot.count?.value ?? null,
    hasCountControl: snapshot.count !== undefined,
    // ⚠ 拷一份可变副本，⛔ 别把快照那个只读数组存进来（`apply()` 要改它）。
    capabilities: (snapshot.capabilities ?? []).map((item) => ({ ...item })),
    hasCapabilityControl: snapshot.capabilities !== undefined,
    novelAiCharacters: snapshot.novelAiCharacters
      ? structuredClone(snapshot.novelAiCharacters)
      : undefined,
    novelAiSceneTexts: snapshot.novelAiSceneTexts
      ? structuredClone(snapshot.novelAiSceneTexts)
      : undefined,
    referenceCount: snapshot.references?.items.length ?? 0,
    referenceUrls: (snapshot.references?.items ?? []).map((item) => item.url),
    referenceLimit: snapshot.references?.limit ?? 0,
    hasReferenceControl: snapshot.references !== undefined,
    videoDurationSeconds: snapshot.videoSpecs?.durationSeconds ?? null,
    videoAspectRatio: snapshot.videoSpecs?.aspectRatio ?? null,
    videoResolution: snapshot.videoSpecs?.resolution ?? null,
    hasVideoSpecsControl: snapshot.videoSpecs !== undefined,
    videoAspectRatioLock: snapshot.videoSpecs?.aspectRatioLock ?? null,
    hasFrameSlotControl: snapshot.frameReferences !== undefined,
    frameSlotCount: snapshot.frameReferences?.slots ?? 1,
    frameFirstUrl: snapshot.frameReferences?.first?.url ?? null,
    frameLastUrl: snapshot.frameReferences?.last?.url ?? null,
    hasVideoReferenceControl: snapshot.videoReferences !== undefined,
    videoReferenceCount: snapshot.videoReferences?.items.length ?? 0,
    videoReferenceLimit: snapshot.videoReferences?.limit ?? 0,
    audioReferenceCount: snapshot.audioReferences?.items.length ?? 0,
    audioReferenceLimit: snapshot.audioReferences?.limit ?? 0,
    hasAudioReferenceControl: snapshot.audioReferences !== undefined,
    audioRequiresVisual: snapshot.audioReferences?.requiresVisual ?? false,
    soundValue: snapshot.sound?.value ?? null,
    soundEffective: snapshot.sound?.effective ?? false,
    hasSoundControl: snapshot.sound !== undefined,
    // ⚠ 拷一份可变副本，⛔ 别把快照那个只读数组存进来（`apply()` 要往里推）。
    loras: (snapshot.loras?.items ?? []).map((item) => ({ ...item })),
    hasLoraControl: snapshot.loras !== undefined,
    loraParameters: snapshot.loraParameters,
    loraBaseFamily: snapshot.loras?.baseFamily ?? null,
    loraMinWeight: snapshot.loras?.minWeight ?? 0,
    loraMaxWeight: snapshot.loras?.maxWeight ?? 0,
    loraLibraryFilters: snapshot.loras?.libraryFilters,
    /**
     * ⚠ 画布快照**原样带着**（进度表 22）：它已经是分好层的（当前镜 + 相邻两镜
     * 完整，其余一行标题），再在这里摊平一次只会得到第二份要同步的形状。
     * 缺席 = 这个宿主不是画布。
     */
    canvas: snapshot.canvas,
    /** 角色页快照同样原样带着：列表已按张数排好、设定已截断。 */
    cards: snapshot.cards,
  }
}

export interface OperatorRun {
  signal?: AbortSignal
  /** 这一轮是谁的（内部 `User.id`）。 */
  userId: string
  priorRounds: readonly AssistantConversationRoundStored[]
  referenceAnalysis: ReferenceAnalysis | null
  inspectedCanvasReferences: ReferenceAnalysis | null
  /** 画布这一步刚为哪张卡算出的参考要点 —— 写词时据此补图例。 */
  canvasBrief: {
    target: string
    brief: NonNullable<ReferenceAnalysis['brief']>
  } | null
  referencePromptWritten: boolean
  /**
   * v3（五张脸都设）：写提示词、出图前⛔ 不另起一次看参考图的子调用 —— 图片台的证据简报、
   * LoRA 台的参考图补读、画布的 `checkCanvasReferencePrompt` 都跳过，v3 的模型自己用 look
   * 看图再写（图片台 2026-10-10；全部 owner 2026-10-15「不要求很严的表，让模型自己去看去判断」）。
   */
  skipReferenceReview: boolean
  /**
   * v3（五张脸都设）：⛔ 不另起看图子调用、⛔ 不借别家的 key 去看 —— 主模型自己看（look）。
   * 角色页联网找图因此不再先跑 `inspectWebImageCandidates`：v3 把缩略图当一次 look 交给主模型，
   * 也就没有藏起来的判定去筛 `propose_character_images`（owner 2026-10-15）。缺席 = 旧内核。
   */
  mainModelLooks?: boolean
  /** NAI 标签核对查不到的已经退回给模型改写过一次（拆分与反推 B3）。 */
  tagCheckRetried: boolean
  /**
   * 新内核（`features/assistant/`，只给 owner）借这里的执行器时设。它在旧闸上的差别
   * （owner 2026-10-23「只修不拒」、10-22「花钱格子不设硬规矩」）：
   *  · NAI 标签核对不退回：能换的换、查不到的照写，过程行上说；
   *  · NAI 写进中文 / 整句 / @ 图号 / 过重权重：仍退回，但只要求改那一处，⛔ 不要求整段重写；
   *  · 视频清晰度不看创作者说没说过；
   *  · LoRA 台能直接挂 LoRA（`mount_lora`），不必走搭配卡。
   * 缺席 = 旧内核 / v3，行为不变。第 8 步删旧内核时随执行器一起搬走。
   */
  nextKernel?: boolean
  /**
   * 这一轮有一条 set_negative 因为视频模型**没有负面栏**被退回、改写进了正文
   * （owner 09-24 视频画板 W6）。下一次 set_prompt 随步带上 `negativeFolded`，
   * 界面由系统追加那句灰字 —— ⛔ 不靠模型自己说。
   */
  negativeFolded: boolean
  request: AssistantOperatorRequest
  state: OperatorWorkingState
  /**
   * 这一轮说话用的那条路（`resolveAssistantRoute`，owner 2026-10-15「全跟助手」）。
   *
   * ⚠ 这一轮的每一次调用都走它：看图前先问「这条路、这个型号看得见图吗」，看不见就
   * 直说，⛔ 不借别家（`findVisionCapableRoute` 已删）。
   */
  route: ResolvedLlmTextRoute
  /**
   * 这条路用的那把 key 的 id —— 「自动」也有（自动挑的那一家的那一把）。看图那几条腿
   * （`inspect_asset_folder` 等）把同一把、同一个型号递下去。
   */
  apiKeyId: string
  /** 这一轮的型号（选定的，或「自动」挑的那一家的默认档）。 */
  modelId: string
  /**
   * 本轮 `search_assets` 真的返回过的素材。
   *
   * ⛔ `mount_reference` 只认这张表里的 id —— 模型给不出 URL，也不许它给。
   * 论据与画布 `attach_asset` 同源：让模型写地址就是让它编一个不存在的地址。
   */
  searchIndex: Map<string, AssistantOperatorSearchResultAsset>
  /** 本轮 `list_asset_folders` 真实返回过的文件夹；视觉检查只认这张准入表。 */
  folderIndex: Map<string, AssistantAssetFolderCandidate>
  /**
   * 本轮 `search_loras` 真的返回过的候选（P4-C）。
   *
   * ⛔ 与 `searchIndex` **分开一张表**：那张表是 `mount_reference` 的准入名单
   * （里面的东西已经是用户的素材），这张表里的候选**还不在本仓里** —— 挂它要先
   * 导入。合成一张的表现是模型拿一个 LoRA 的 candidateId 去挂参考图。
   * ⚠ 存的是完整的 `LoraCandidate`：搭配卡新挂那几行要从里面取 `importPayload`
   * （那份对象模型碰不到，与 `mount_reference` 的 URL 同一条论据）。
   */
  loraIndex: Map<string, LoraCandidate>
  /** 本轮最近一次 `search_loras` 的词 —— `show_lora_picks` 的载荷要带上它（日志与库页小标）。 */
  loraSearchQuery: string | null
  /**
   * 本轮 `search_web_images` **真的展示给用户看过**的那些候选（2026-09-06）。
   *
   * ⭐ 它是 `import_user_url` 的**第二张准入名单**（第一张是「逐字出现在用户
   * 消息里」，拍板 22）。加它的判据：用户说「都挂上」时，那几张地址他**看见了**，
   * 只是没有一条一条按 —— 而助手手里唯一能表达「就是屏幕上那几张」的东西就是
   * 这份服务端自己算出来的表。
   * ⛔ 它仍然**不放宽任何一道实体闸**：`blocked` 的照旧拒（站方声明不是用户能
   * 替它同意的事），参考位上限照旧、逐字比对那条路照旧。模型编一条没搜到过的
   * 地址仍然按 `urlNotFromUser` 拒。
   * ⚠ 键是**原图直链**（候选行认自己那一格用的也是它）。
   */
  webImageIndex: Map<string, AssistantOperatorWebImage>
  /**
   * 卡片域里**真看过**的联网候选（C3「搜完先看一眼」）：原图直链 → 看图模型的判断。
   * `propose_character_images` 据此挡掉「看过、不是她」的那几张。
   */
  webImageVision: Map<string, WebImageVisionItem>
  /**
   * 本轮已经发过几次 `research`（2026-09-06）。
   *
   * ⚠ 它**不能**靠 `executedStepKeys` 代替：那张表按「工具名 + 参数」比对，
   * 而多轮检索的正当形态恰恰是**换一个目标再来一次** —— 参数不同就绕过去了。
   * 轮次上限管的是「一共能打几次外部源」，与「别原地打转」是两件事。
   */
  researchRounds: number
  /**
   * 工具完成时已经落库的证据编号，结账只引用这些编号。
   */
  evidenceRefs: string[]
  /**
   * **本轮正文角标的号段**（56b 切片 1）—— 下一条证据该拿 `[n]` 里的哪个 n。
   *
   * ⭐ 与 `evidenceRefs` 是两件事：那一个是**会话内**的证据本编号（`#e12`，
   * 跨轮指认、要落库），这一个是**本轮内**的阅读编号（`[3]`，只活在这一段正文
   * 与它底下那排来源卡之间）。合成一个的表现是第五轮的第一条证据在正文里写着
   * `[47]` —— 一个没有人数得清的号。
   * ⚠ 从 1 起，按**过完来源名单之后**剩下的条数顺延：被名单挡掉的那几条不占号，
   * ⛔ 否则来源卡上会缺号，而缺号在读者眼里就是「有一条我点不开」。
   */
  evidenceCiteSeq: number
  /**
   * **下一条找到的东西拿哪个 `#n`**（搜索期第三片，附录 I §3.3）—— 找图与找视频共用一条连号，
   * 按找到的先后发。⭐ 与 `evidenceCiteSeq`（`[n]`）是两套号：那一套是证据角标，这一套是
   * 面板上的图与视频卡。v3 每一跳开头按本轮记录（含上一轮带来的那几条）续上
   * （`seedV3WebFinds`），所以接力之后、下一轮里新找到的都不和已有的撞号。
   */
  webFindSeq: number
  /**
   * **本轮查到过的每一页的搜索摘要**（地址 → 标题 + 摘要，2026-10-15）：`read_url` 读不到那一页
   * （站点挡了 / 读不出）时的最后一条退路 —— 只交这段摘要，并明说全文没读到。
   * ⚠ 记的是读全文**之前**的那段摘要（快搜读到的正文会顶掉证据的 `snippet`）。v3 每一跳开头
   *   按本轮记录的 `sources` 续上（`seedV3WebFinds`）。
   */
  researchSnippets: Map<string, { title: string; snippet: string }>
  /** 讲给模型听的「刚才发生了什么」。 */
  observations: string[]
  /** 本轮里助手自己写过的字段 —— 覆写自己的东西不需要再问用户一次。 */
  assistantWrittenFields: Set<AssistantOperatorConfirmField>
  /**
   * 本轮**真的执行过**的步（`工具名 + 规范化 args`，见 `operatorStepKey`）。
   *
   * ⭐ 卡死护栏的全部本钱（P3-D）：命中即按 `repeatedStep` 拒。
   * ⚠ 只记执行过的，⛔ 不记被拒的 —— 理由写在 `REJECT.repeatedStep` 的头注里
   * （被拒之后条件可能已经变了，堵住重试等于堵住那条唯一的出路）。
   */
  executedStepKeys: Set<string>
  stepSeq: number
  /**
   * 这个用户的助手人设（§8.5）。**服务端自己按 clerkId 读**，⛔ 不从客户端收 ——
   * 它直连系统提示。缺行时是 `ASSISTANT_PERSONA_DEFAULTS`，不是 null。
   */
  persona: AssistantPromptPersona
  /**
   * 本轮**读到过**的项目规则，按 id 索引（§10）。
   *
   * ⛔ `rule_hit` 只认这张表里的 id：让模型转述规则，转述出来的那句话就不再是
   * 用户写下的那句 —— 而规则薄卡的价值恰恰在于「这是你当时写的原话」。
   * ⚠ 开跑前就把进系统提示的那几条塞进来（模型引用它们时不必先调工具）。
   * ⚠ 规矩住在记忆表里（助手设置 B：规矩并进记忆），这里放的是它们的**协议形状**
   * （`memoryAsRule`）—— `rule_hit` 与两条规则工具的载荷认的仍是「一条规则」。
   */
  ruleIndex: Map<string, ProjectRule>
  /**
   * **这一轮只能打谁**（v2 §9.3）—— 库里的来源白 / 黑名单，并上「+」菜单这一轮
   * 临时指的那几个（临时优先）。
   *
   * ⚠ 开跑前算一次就定死：名单是用户的决定，⛔ 不该在一轮里跟着模型改主意。
   * 绝大多数用户这里是空闸（名单一条都没有），每一条过滤都短路。
   */
  sourceRules: SourceRuleFilter
  /**
   * 本轮见过的上下文卡（K1）。⚠ 与 `ruleIndex` 同一个用途：常挂那几张一开始就在
   * 索引里，模型引用它们不必先调一次工具。
   */
  contextCardIndex: Map<string, ContextCard>
  /**
   * **可指认产物的准入索引**（切片 X；v2 §7.6 改为服务端派生）—— 键是产物 id
   * **与**它的地址（两样都进表），值是那件产物。
   *
   * ⭐ 它是 `import_user_url` / `mount_reference` / `critique_result` 的**第三张
   * 准入名单**（前两张：本轮检索结果、用户 `@` 上来的那些）。
   * ⚠ **来源全在服务端**（§7.6）：开跑时装的是用户这一轮递上来的附件与助手刚
   * 回来的那一枪，跑起来之后每一步 `done` 把自己的产物加进来（`collectStepArtifacts`）。
   * ⛔ 客户端不再镜像一份传回来 —— 那是为「省一次查库」多养的一套会分叉的事实。
   * ⛔ 它仍然**不放宽任何实体闸**：blocked 照旧拒、站点判定照旧、参考位上限照旧。
   * ⚠ 读完就丢 —— ⛔ 服务端不存。
   */
  workingMemoryIndex: Map<string, AssistantOperatorWorkingMemoryArtifact>
  /**
   * 这一轮**翻过几次证据本**（§7.3，commit #12）。
   *
   * ⚠ 与 `researchRounds` 分开数：那条护的是钱（每一轮都真打外部源），这条护的是
   * 这一轮剩下的步数 —— 翻旧账不花钱，但照样一步一次 LLM 往返。
   */
  evidenceRecalls: number
  /**
   * **本轮结账的原料**（v2 §7.2 / §7.5 ①）—— 这一轮做完之后要压成一条结论记录
   * 的那几摞原话。
   *
   * ⚠ 它**不是第二份 `observations`**：观察是讲给模型听的（英文、带下一步指令、
   * 每一步都重发），这几摞是**给人读的原料**，只在收尾那一刻被读一次。
   * ⚠ 分桶规则按**动词**（§7.5 ①）：看 / 查 → 事实，问 → 决定，请求生成 → 待办。
   * `apply` 一栏都不进 —— 表单被改成什么样，下一轮的快照自己会说。
   */
  roundLedger: RoundLedger
  /**
   * 本轮**真的跑成了几步**（`recordLedgerStep` 的调用次数，⛔ 不含被拒的）。
   *
   * ⭐ 它是「以确认卡 / 问题卡结束的轮次要不要结账」那一道闸：一步没跑的轮次
   * （纯问句）没有结论可结 —— ⛔ 别按 `roundLedger` 非空判，那几摞开跑时就被
   * `seedLedgerDecisions` 填过（用户点的那几下），于是纯问句轮也会写出一条
   * 只有「决定」栏的空记录。
   */
  ledgerSteps: number
  /** 本轮已经结过账了 —— ⛔ 一次运行只写一条记录（同一 roundIndex 不重复写）。 */
  roundClosed: boolean
}

/** 见 `OperatorRun.roundLedger`。每摞都有硬上限，⛔ 别让一轮八步撑爆收尾那一跳。 */
export interface RoundLedger {
  facts: string[]
  decisions: string[]
  todos: string[]
  /** 本轮每次 `research` 的原件 —— 结账时一次性写进证据本并换回编号（§7.3）。 */
  evidence: AssistantEvidenceBookEntry[]
}

/** 一摞原料最多留几条 / 每条多长。 */
export const LEDGER_LIMITS = {
  maxLines: 12,
  maxLineChars: 400,
} as const

export function pushLedgerLine(lines: string[], line: string): void {
  const text = clamp(line.trim(), LEDGER_LIMITS.maxLineChars)
  if (!text || lines.length >= LEDGER_LIMITS.maxLines) return
  lines.push(text)
}

/**
 * 一步跑完之后往结账原料里记一笔（§7.5 ①）。
 *
 * ⚠ 只记**真的跑成了**的步：被拒的那些进不了结论 —— 一条「你不能这么干」不是
 * 本轮得出的事实，它已经在观察里对模型说过一次了。
 */
export function recordLedgerStep(
  run: OperatorRun,
  verb: AssistantOperatorVerb,
  title: string,
  digest: string,
): void {
  run.ledgerSteps += 1
  const line = `${title}: ${digest}`
  if (verb === VERB.look || verb === VERB.research) {
    pushLedgerLine(run.roundLedger.facts, line)
    return
  }
  if (verb === VERB.requestGeneration) {
    pushLedgerLine(run.roundLedger.todos, line)
  }
}

/**
 * 一步的**身份**：工具名 + 规范化过的参数。
 *
 * ⚠ 规范化必须做两件事，少一件护栏就形同虚设：
 *   · **键排序** —— `{a,b}` 与 `{b,a}` 是同一次调用，JSON.stringify 说不是；
 *   · **字符串 trim + 转小写** —— 模型重试时最爱换的就是大小写和首尾空格
 *     （"cat poster" / "Cat Poster" 打的是同一次检索）。
 * ⛔ 别改成「只比工具名」：同一轮里对不同字段连下两条 `set_prompt` 是正常的。
 */
export function stableArgs(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableArgs).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${key}:${stableArgs(entry)}`)
      .join(',')}}`
  }
  return typeof value === 'string'
    ? value.trim().toLowerCase()
    : String(value as string | number | boolean | null)
}

export function operatorStepKey(
  tool: AssistantOperatorTool,
  args: unknown,
): string {
  return `${tool}:${stableArgs(args)}`
}

// ─── 工具计划（纯函数，不碰 IO）──────────────────────────────────

export type ToolPlan =
  | {
      kind: 'rejected'
      reason: AssistantOperatorRejectReason
      detail?: string
      /**
       * 退回重写的草稿：进时间线但标成 `draft`（不算失败），也进下一次请求的
       * priorSteps —— 接力 / 插话之后模型才知道上次为什么没写成（2026-10-08）。
       */
      quiet?: true
    }
  | {
      kind: 'confirm'
      field: AssistantOperatorConfirmField
      have: string
      proposed: string
      /** LoRA 域的取材标注与负面增量（§7.2）—— 别的域一格都不带。 */
      sourceNotes?: string[]
      negativeDiff?: string[]
    }
  | {
      kind: 'read'
      payload: unknown
      /**
       * `compact`：再往后几步给模型的短版（查证，搜索期第三片）—— 紧跟着这一步的那一次调用读
       * `observation`，之后只读它。缺席 = 一直读 `observation`。
       */
      run(): Promise<{ result: unknown; observation: string; compact?: string }>
    }
  | {
      kind: 'mutate'
      payload: unknown
      inverse: unknown
      observation: string
      apply(): void
    }
  /**
   * **规划期就问一句**（进度表 23：反问替代报错）—— 与 `confirm` 逐字同构：吐一帧
   * 问题卡、停流，客户端答完带 `planAnswers` 重发。
   *
   * ⚠ 它与 `rejected` 的分界是**这一步的失败用户答得上来**：分工用途没说清是
   * 创作者一句话就能定的事，而报错只会让模型换个同义词再撞一次（真机上那是
   * 两条红步 + 零改动）。⛔ 不新增卡类型：题的形状仍是 `ask` 帧那一张。
   */
  | {
      kind: 'ask'
      question: AssistantOperatorPlanQuestion
      /** 结账时挂进「待办」的那一句 —— ⚠ 写原始事由，不是问句的客套话。 */
      todo: string
    }
  /**
   * 生成要先问一句（v2 §3.3 第二种来源）—— 流停在生成确认卡上，与 `confirm`
   * 同一条机制。⛔ 服务端在这一步一分钱都花不掉：它只是把一份载荷交出去，
   * 扳机由客户端扣。
   */
  | {
      kind: 'confirmGenerate'
      request: AssistantOperatorGenerationRequest
    }
  /**
   * **提议记一张上下文卡**（v2 §8.1）—— 与 `confirmGenerate` 逐字同构：吐一帧
   * 确认、停流，⛔ 服务端一行库都不写。
   *
   * ⚠ 为什么它不是 `mutate`：改动型那一档的判据是「撤得掉」，而这一步根本没有
   * 后果可撤 —— 卡是用户点下去才存的。写成 `mutate` 的表现是日志条上多一颗
   * 点了什么都不会发生的撤销钮（判据与花钱档那条头注逐字同源）。
   */
  | {
      kind: 'confirmContextCard'
      card: AssistantOperatorContextCardDraft
    }
  /**
   * 卡片助手提议一份角色设定（C2）—— 形态与 `confirmContextCard` 逐字同构：吐一帧、
   * 停流，⛔ 服务端一行库都没写。
   */
  | {
      kind: 'confirmCharacterProfile'
      profile: AssistantOperatorCharacterProfileDraft
    }
  /** 卡片助手提议几张角色图（C3）—— 同上：吐一帧、停流，一行库都不写。 */
  | {
      kind: 'confirmCharacterImages'
      proposal: AssistantOperatorCharacterImagesProposal
    }
  /**
   * **把助手自己搭好的一套摆给创作者**（lora-assistant §12）—— 同上：吐一帧确认、
   * 停流，⛔ 服务端一把都没挂、一格都没改。应用那几行由客户端在创作者点下去时做，
   * 每一行一条带 `inverse` 的 step，撤销撤在它们身上。
   */
  | {
      kind: 'confirmLoraSetup'
      setup: AssistantOperatorLoraSetupConfirm
    }
  /**
   * **歧义反问**（§3.3 第 5 行 / §7，切片 3a）—— 「你说的是哪一张？」
   *
   * ⚠ 与 `confirm` / `confirmGenerate` 同一条机制（吐一帧、停流、客户端带上下文
   * 重发），但它既不覆盖什么也不花钱：它只是在问路 —— v2 里它与覆盖三选一起
   * 并进 `ask` 帧（§3.1）。
   */
  | {
      kind: 'choice'
      question: string
      options: { id: string; label: string; assetUrl: string }[]
    }

/**
 * ⚠ `detail` **在这里截**（`LIMITS.maxReasonChars`）：它下游要过 `step` 帧那道
 * schema，超一个字就是 `toStepEvent` 当场抛 —— 整轮以一句笼统的「run failed
 * midway」结束（判据与 `clamp` 头注记下的那次真机事故逐字同源）。
 */
export function reject(
  reason: AssistantOperatorRejectReason,
  detail?: string,
): ToolPlan {
  return {
    kind: 'rejected',
    reason,
    ...(detail ? { detail: clamp(detail, LIMITS.maxReasonChars) } : {}),
  }
}

/**
 * 工具自己抛出来的错里，哪些**必须整轮上抛**（要用户动手：缺 key / 未登录 / 额度不足）。
 *
 * ⭐ 其余一律是「这一步的技术故障」：做成一条被拒的步（`toolFailed`）而不是让整轮以
 * 一句笼统的「出错了」结束 —— 用户要的东西多半不依赖这一步。
 */
export function isFatalOperatorToolError(error: unknown): boolean {
  return (
    error instanceof ApiKeyError ||
    error instanceof AuthError ||
    error instanceof InsufficientCreditsError
  )
}

export const TOOL_FAILED_DETAIL =
  "This tool hit a temporary technical problem — not the creator's doing and not a bad argument. Carry on with whatever does not depend on it, or tell the creator plainly that this step could not run and offer to try again. Never claim it succeeded."

/**
 * 截断到**至多 `max` 个字符 —— 省略号也算在里面**。
 *
 * ⚠ 2026-08-30 真机实证：原来的写法 `value.slice(0, max) + '…'` 会产出 `max + 1`
 * 个字符，而这些值紧接着就要过 schema 的 `.max(max)` —— 于是
 *   · `search_assets` 命中任何一条提示词超过 200 字的素材 → `toStepEvent` 当场抛，
 *     整轮以一句笼统的「run failed midway」结束（日志停在 `running` 那一半）；
 *   · 覆盖三选那一帧遇到超过 200 字的手写提示词 → 客户端 `safeParse` 丢帧，
 *     表现是「流停了但确认条从没出现」。
 * 两处都是「用户内容越长越容易炸」，而短内容一路绿灯 —— 最难自查的一类。
 * ⛔ 别改 schema 的上限去将就它：上限是协议，截断是实现。
 */
export function clamp(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1))}…` : value
}

/**
 * 一条地址的主机名。
 *
 * ⚠ **现算，⛔ 不让模型写**：模型写的域名与地址不符是常态（它按印象填），而这个
 * 值下游要拿去做「能不能当输入」的判定与界面上那行可点的小字。取不到就是取不到，
 * ⛔ 不猜一个。
 */
export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname || null
  } catch {
    return null
  }
}

/**
 * 规格档位**此刻真的能选吗**。
 *
 * ⚠ 判据是「两张表都非空」，不是「specs 这一节在不在」：本仓的比例表是常量
 * （永远非空），而清晰度表由**已选模型的能力**算出来（`use-assistant-operator.ts`
 * 的 `resolutionOptions`：没选模型就是 `[]`）。于是「控件在、但一个值都选不了」
 * 是真机上的常态，而 `set_specs` 的两个字段都是必填 —— 空表时它无解。
 */
export function hasUsableSpecOptions(
  snapshot: AssistantOperatorSnapshot,
): boolean {
  const specs = snapshot.specs
  return (
    specs !== undefined &&
    specs.aspectRatioOptions.length > 0 &&
    (specs.resolutionOptions.length > 0 || hasNoResolutionTiers(snapshot))
  )
}

/**
 * 选了模型、但这个模型**本来就没有清晰度档**（NovelAI 按比例出固定像素）——
 * 比例照样能改，清晰度写表单那一格的默认档 `auto`（与确认卡上改比例同一口径）。
 * ⚠ 没选模型时清晰度表也是空的，那一支照旧走「先 set_model」（拆分与反推实跑
 * 09-24：NAI 上照搬三视图，比例改不动，横幅被出成 3:4）。
 */
export function hasNoResolutionTiers(
  snapshot: AssistantOperatorSnapshot,
): boolean {
  return (
    snapshot.model !== null &&
    snapshot.model !== undefined &&
    (snapshot.specs?.resolutionOptions.length ?? 0) === 0
  )
}

/**
 * 视频规格**此刻真的能设吗**（P4-A）。
 *
 * ⚠ 判据与图片那条**不同，是有意的**：图片要求两张表都非空（比例与清晰度必须
 * 同时给，台账 AE/BG/BS）；视频只要求**任意一张非空** —— 三个参数在
 * `buildVideoInput` 里是三个独立字段，而且逐型号有无（Kling V3 Pro 没有分辨率、
 * HappyHorse 没有时长）。照搬「两张都要非空」会让这些型号上的时长永远设不了。
 */
export function hasUsableVideoSpecOptions(
  snapshot: AssistantOperatorSnapshot,
): boolean {
  const specs = snapshot.videoSpecs
  return (
    specs !== undefined &&
    (specs.durationOptions.length > 0 ||
      specs.aspectRatioOptions.length > 0 ||
      specs.resolutionOptions.length > 0)
  )
}
