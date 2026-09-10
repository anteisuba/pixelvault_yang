/**
 * 助手写画布的 op 词表。
 *
 * ── 为什么是 marker + JSON，而不是 tool-calling ──────────────────────
 * 助手今天有两条路由：gateway 走 `streamText` 纯文本流，BYOK 走缓冲文本补全，
 * **两条都没有 tools**。要让写能力在两条路上行为一致，唯一不加第二套基建的办法
 * 就是沿用已经在跑的那条链 —— `[[capability:upscale:node-id]]` 正是这么做的：
 * 模型在正文里留标记 → 客户端剥掉并渲染成可点的东西 → **用户点了才发生**。
 *
 * 区别只在载荷大小：能力标记只需要一个 node id，写画布要带族/名字/连线两端，
 * 所以 op 走 JSON 块，并且有**闭合标记** —— 流式回复里「这段 JSON 还没写完」和
 * 「写完了」必须能分清，否则半截载荷会被当成提案。
 *
 * ── 词表为什么直接借 `canvas-add-catalog` ────────────────────────────
 * 「角色节点是什么」在 ＋添加 菜单里已经定义过一次（nodeType + role）。助手若
 * 自带一份族表，那就是第二处定义，迟早分叉。所以 `add_node` 说的是**意图 id**
 * （`organize.character`），落地时走 workbench 同一个 `createCanvasObject`。
 * 代价是：菜单加不了的东西助手也加不了。这是有意的 —— 助手不该比人手多一条
 * 建节点的暗路。
 * ⚠ 2026-08-02：`shotText` 原本是这条代价的举例（「只由剧本投影产出」），
 * owner 拍板「助手自动生成与用户手动输入是同一种东西」后菜单已经放开它，
 * 这里也随之对齐。助手因此有两条产出镜头文本的路：剧本笺投影（节点带
 * `scriptRef`，与 ScriptDoc 双向同步）和 `add_node`（手工节点，字段存自己
 * 身上）—— 与人手的两条路一一对应，不是暗路。
 */

import {
  CANVAS_ADD_INTENT_IDS,
  type CanvasAddIntentId,
} from '@/constants/canvas-add-catalog'
import {
  NODE_STUDIO_ASSISTANT_LIMITS,
  type NodeStudioReferenceRole,
} from '@/constants/node-studio'

export const NODE_ASSISTANT_OP_IDS = {
  addNode: 'add_node',
  connect: 'connect',
  rename: 'rename',
  /**
   * 改**已有**节点的提示词（切片 5 第一批）。此前只有 `add_node` 能带 prompt ——
   * 也就是说助手能在建节点的那一瞬间写字，建完之后一个字也改不了。用户说「把第
   * 二镜改成黄昏」，助手唯一能做的是再建一个节点，而不是改那一个。
   */
  setPrompt: 'set_prompt',
  /**
   * 标图片分类（切片 5 第一批）。值域是 `NODE_STUDIO_REFERENCE_ROLES`，其中
   * `frameStart` / `frameEnd` **就是关键帧首尾** —— 造关键帧的入口 2026-08-09
   * 退役后，首尾语义的唯一载体就是这个分类，而在这条 op 之前助手写不了它。
   */
  setImageCategory: 'set_image_category',
  /**
   * 换节点上选的模型（切片 5 第二批）。⛔ 模型**只能从可选列表里挑**，不许自己
   * 写一个 id —— 工作台那边不给列表时它编了个工作区里不存在的「Animagine XL」。
   * 值域走 `useWorkflowModelOptions` 的同一份选项，收窄在规划器。
   */
  setModel: 'set_model',
  /**
   * 改生成档位（切片 5 第二批）。**只对视频节点成立** —— 图片那几档
   * （比例 / 清晰度）根本不住在节点上，见下方 `imageResolution` 那段实证。
   */
  setParams: 'set_params',
  /**
   * 把画布上**另一个节点的主媒体**挂进目标节点的参考图（切片 5 第二批）。
   *
   * ⛔ 载荷里没有 URL，只有节点引用 —— 与 LoRA 那批同源的一条：让模型写 URL
   * 等于让它编一个不存在的地址；写节点 id 则天然被规划器的 `resolve()` 校验。
   */
  attachAsset: 'attach_asset',
  setReviewState: 'set_review_state',
  /** ⚠ 唯一会扣 credit 的 op —— 审批上与其余几个分开走。 */
  generate: 'generate',
} as const

export const NODE_ASSISTANT_OPS = [
  NODE_ASSISTANT_OP_IDS.addNode,
  NODE_ASSISTANT_OP_IDS.connect,
  NODE_ASSISTANT_OP_IDS.rename,
  NODE_ASSISTANT_OP_IDS.setPrompt,
  NODE_ASSISTANT_OP_IDS.setImageCategory,
  NODE_ASSISTANT_OP_IDS.setModel,
  NODE_ASSISTANT_OP_IDS.setParams,
  NODE_ASSISTANT_OP_IDS.attachAsset,
  NODE_ASSISTANT_OP_IDS.setReviewState,
  NODE_ASSISTANT_OP_IDS.generate,
] as const

export type NodeAssistantOpId = (typeof NODE_ASSISTANT_OPS)[number]

/**
 * `set_params` 能写的档位 —— **只有视频节点上真的有人读的那几个**。
 *
 * ── 为什么图片的比例 / 清晰度不在这里（切片 5 第二批查证结论）──────────
 * `NodeWorkflowNodeDataSchema.imageResolution` 是**死字段**：schema 里有、全仓零
 * 个写者；图片的比例与清晰度真正住在图片卡自己的「画面」chip 参数里，随生成
 * 入参直传。`handleGenerateMediaNode` 里读 `data.aspectRatio` / `data.resolution`
 * 的三处全部带着 `isVideoMediaNode` 守卫 —— 写进图片节点的 data 是一条三绿而毫无
 * 效果的路（编译过、测试过、真机上什么都不变）。
 * 把那条链接通＝把「档位跟着合成条走」改成「档位跟着节点走」，那是产品决定不是
 * 顺手项，且要动 composer 与工作台的发送路径。所以本批只做视频节点，图片节点给
 * `notParameterizable` 明说「这几档不在节点上」。
 *
 * ⚠ 每一项都逐个确认过读侧（画布的生成路径）：
 * duration/resolution/aspectRatio/generateAudio/seed 五个都会进 `nodeMediaGeneration
 * .generate(...)` 的载荷，且 `VideoComposer` 有对应控件读同一个字段。
 * ⛔ `negativePrompt` 有读侧但**没放进来**：它是自由文字不是档位，覆盖用户手写内容
 * 的这类字段与 `set_prompt` 同族，要放也该放在那条线上一起想。
 */
export const NODE_ASSISTANT_PARAM_IDS = {
  aspectRatio: 'aspectRatio',
  resolution: 'resolution',
  duration: 'duration',
  generateAudio: 'generateAudio',
  seed: 'seed',
} as const

export const NODE_ASSISTANT_PARAMS = [
  NODE_ASSISTANT_PARAM_IDS.aspectRatio,
  NODE_ASSISTANT_PARAM_IDS.resolution,
  NODE_ASSISTANT_PARAM_IDS.duration,
  NODE_ASSISTANT_PARAM_IDS.generateAudio,
  NODE_ASSISTANT_PARAM_IDS.seed,
] as const

export type NodeAssistantParamId = (typeof NODE_ASSISTANT_PARAMS)[number]

/** 时长的「交给模型自己定」档 —— 与 `VideoComposer` 的自动开关写进同一个值。 */
export const NODE_ASSISTANT_DURATION_AUTO = 'auto' as const

/**
 * B3：**不用点就落画布**的那一档（owner 2026-08-08 拍板「自动落」）。
 *
 * 分档依据是「错了要付多大代价」，不是「改动大不大」：
 *   · 这几个是**纯结构/文字、免费、一次撤销能全退**（B2.5 之后）。空节点删掉就是，
 *     不留半成品像素，撤销栈也不脏。
 *   · `set_review_state` **不在**这里 —— 审核态是**用户对产出的判断**，不是结构。
 *     代码里已经钉死助手不得自批（`NODE_ASSISTANT_OP_REJECT_REASON_IDS.approvalForbidden`，
 *     owner 无开关），既然自批被禁，降级成「自动」也违背同一个意图。
 *   · `generate` **不在**这里 —— 唯一扣 credit 的 op。
 *
 * ⚠ `set_prompt` / `set_image_category` 归自动落的完整论据（切片 5 第一批）：
 *   两条都免费、都只写节点自己的一个字段、都在同一个撤销步里。判据上与
 *   `rename` 同类 —— rename 早就在自动落里，而它同样是**覆盖用户手打的文字**。
 *   唯一的不对称是「覆盖掉的东西有多大」：rename 丢的是一个名字，set_prompt 丢的
 *   可能是一整段手写提示词。这条不对称不足以改分档（撤销一次全退，回执卡上就有
 *   「撤销」按钮），但**它是本档里唯一有实质损失的一条**，将来若要给自动落加
 *   「先备份再写」之类的保险，从它开始。
 */
export const NODE_ASSISTANT_AUTO_APPLY_OPS = [
  NODE_ASSISTANT_OP_IDS.addNode,
  NODE_ASSISTANT_OP_IDS.connect,
  NODE_ASSISTANT_OP_IDS.rename,
  NODE_ASSISTANT_OP_IDS.setPrompt,
  NODE_ASSISTANT_OP_IDS.setImageCategory,
  // 切片 5 第二批：三条都符合上面那套判据 —— 免费、只写节点自己的字段、整批一个
  // 撤销步。逐条找过反例：
  //   · `set_model` 改的是**将来**那次生成的价钱，本身一分不花，而花钱的
  //     `generate` 仍旧单独确认；选不动的模型（缺 key）在规划器就被拒了。
  //   · `set_params` 是离散档位，撤销即回。
  //   · `attach_asset` 是结构，与早就自动落的 `connect` 同类（都只是把画布上已有
  //     的东西接起来，不产生新像素）。
  NODE_ASSISTANT_OP_IDS.setModel,
  NODE_ASSISTANT_OP_IDS.setParams,
  NODE_ASSISTANT_OP_IDS.attachAsset,
] as const

export function isAutoApplyAssistantOp(op: NodeAssistantOpId): boolean {
  return (NODE_ASSISTANT_AUTO_APPLY_OPS as readonly string[]).includes(op)
}

/**
 * `add_node` 能用的意图，逐条对齐 ＋添加 菜单。有测试锁住「菜单里新增的意图
 * 必须同步进这张表」—— 漏了的话助手会安静地少一种能建的节点，而不是报错。
 */
export const NODE_ASSISTANT_ADD_INTENTS = [
  CANVAS_ADD_INTENT_IDS.textScript,
  CANVAS_ADD_INTENT_IDS.textRule,
  CANVAS_ADD_INTENT_IDS.textNote,
  CANVAS_ADD_INTENT_IDS.imageShot,
  CANVAS_ADD_INTENT_IDS.imageCharacter,
  CANVAS_ADD_INTENT_IDS.imageBackground,
  CANVAS_ADD_INTENT_IDS.imageResult,
  CANVAS_ADD_INTENT_IDS.audioVoice,
  CANVAS_ADD_INTENT_IDS.audioTimbre,
  CANVAS_ADD_INTENT_IDS.videoShot,
  CANVAS_ADD_INTENT_IDS.videoClip,
] as const satisfies readonly CanvasAddIntentId[]

/**
 * 每个意图**是什么**，给模型看的一句话。
 *
 * ⚠ 真机上抓到的：只把 id 列给模型时，「加一个背景节点」它选了 `image.asset`
 * （散图）而不是 `organize.scene`（场景身份卡）—— id 里的 organize/image 分组是
 * 我们的内部分类法，模型没有理由猜对。写成 `Record<CanvasAddIntentId, …>`：菜单
 * 新增一族而这里没跟上，编译期就红。
 */
export const NODE_ASSISTANT_ADD_INTENT_HINTS: Record<
  CanvasAddIntentId,
  string
> = {
  [CANVAS_ADD_INTENT_IDS.textScript]:
    'a SCRIPT text node — the written scene / action / camera / dialogue, feeds shots and images',
  [CANVAS_ADD_INTENT_IDS.textRule]:
    'a RULE text node — a style or production constraint that applies to whatever it is wired into',
  [CANVAS_ADD_INTENT_IDS.textNote]:
    'a NOTE text node — free remarks that are not sent to any model as a constraint',
  [CANVAS_ADD_INTENT_IDS.imageShot]:
    'a shot still — one frame generated from shot text plus character / background references',
  [CANVAS_ADD_INTENT_IDS.imageCharacter]:
    'a CHARACTER image — use it for any person / role',
  [CANVAS_ADD_INTENT_IDS.imageBackground]:
    'a BACKGROUND / scene image — use it for places, environments, locations',
  [CANVAS_ADD_INTENT_IDS.imageResult]:
    'a loose generated image with no assigned role — only when none of the roles above fits',
  [CANVAS_ADD_INTENT_IDS.audioVoice]:
    'a spoken line / voice clip for a character',
  [CANVAS_ADD_INTENT_IDS.audioTimbre]:
    'a voice timbre profile — wire it into a shot or character to fix how they sound',
  [CANVAS_ADD_INTENT_IDS.videoShot]:
    'a SHOT — one video generation with its own first/last frame, references, voice and text slots',
  [CANVAS_ADD_INTENT_IDS.videoClip]: 'a reference video clip',
}

/**
 * 每个图片分类**是什么**，给模型看的半句话（`set_image_category` 用）。
 *
 * 与 `NODE_ASSISTANT_ADD_INTENT_HINTS` 同一条论据：只把 id 列给模型，它就会按
 * 英文词的字面意思猜，而 `identity`（这是谁）/`style`（画风）/`composition`（构图）
 * 这几个词在通用语义里全都过于宽。写成 `Record<NodeStudioReferenceRole, …>`：
 * 分类表加一个值而这里没跟上，编译期就红。
 *
 * ⚠ 只补**容易猜错的那几个**，其余留空串 —— 给 `pose` 写一句「the pose」是纯
 * token 消耗。空串在渲染时就是「只有 id 一行」。
 */
export const NODE_ASSISTANT_CATEGORY_HINTS: Record<
  NodeStudioReferenceRole,
  string
> = {
  identity: ' — who this character IS (the face / identity reference)',
  pose: '',
  style: ' — art style / rendering look, not the subject',
  composition: ' — framing and layout only',
  background: ' — the place / environment',
  faceCloseup: '',
  costume: '',
  prop: '',
  frameStart: ' — FIRST frame of a video shot (keyframe)',
  frameEnd: ' — LAST frame of a video shot (keyframe)',
  custom: ' — only when none of the above fits; you MUST also send "label"',
}

/**
 * 正文里包住 op 载荷的一对标记。闭合标记不是装饰：流式回复每来一个 chunk 都会
 * 重跑一次抽取，没有闭合标记就无法判断 JSON 是否完整。
 */
export const NODE_ASSISTANT_OP_MARKERS = {
  open: '[[canvas-ops]]',
  close: '[[/canvas-ops]]',
} as const

export const NODE_ASSISTANT_OP_LIMITS = {
  /** 一次提案最多几条。上限存在的理由是「一张卡要看得完」，不是性能。 */
  maxOps: 24,
  /** 批内别名（`ref`）的长度 —— 只在这一次提案里有意义，不进任何持久化。 */
  maxRefLength: 40,
  /** 节点 id 与别名共用的引用长度上限，与助手 payload 里的 id 上限一致。 */
  maxTargetLength: 160,
  /**
   * 名字长度直接借助手 payload 的标签上限 —— 助手读到的名字有多长，它能写回的
   * 名字就有多长，两边用同一个数。
   */
  maxNameLength: NODE_STUDIO_ASSISTANT_LIMITS.maxNodeLabelLength,
  /**
   * 提示词长度，同一条对称论据：助手读一个节点时，它的 prompt 按
   * `maxNodeSummaryLength` 截断后进 payload；那它能写回的也就是这么长。
   *
   * ⚠ 这**不是**节点提示词的产品上限 —— `NodeWorkflowNodeDataSchema.prompt` 是
   * 无界的 `z.string()`，人手输入不受限。这里限的是「一条 op 载荷能有多大」，
   * 和 `maxOps`「一张卡要看得完」同性质。别把它当成能力承诺往 UI 上印。
   */
  maxPromptLength: NODE_STUDIO_ASSISTANT_LIMITS.maxNodeSummaryLength,
  /** 打回理由。与 `NodeMediaReview.reason` 同一个量级。 */
  maxReasonLength: 300,
  /**
   * 「改词再来」的增补长度。
   *
   * ⚠ 这个 2000 必须与 `NodeMediaReviewSchema.promptPatch` 的 `.max(2000)` 一致 ——
   * 超了不是显示被截断，是**整份 project state 落不了库**。⛔ 不与
   * `maxReasonLength` 合并：理由是给人读的一句话，增补是要进下一次生成提示词的
   * 一段字，两者的量级本来就不同。
   */
  maxPromptPatchLength: 2000,
  /**
   * `set_image_category` 的自定义分类名。
   *
   * ⚠ 这个 80 必须与 `NodeWorkflowNodeDataSchema.imageCategoryLabel` 的 `.max(80)`
   * 一致 —— 超了不是「显示被截断」，是**整份 project state 落不了库**（节点 schema
   * 在持久化路径上校验）。那个 80 写死在 types 里、不是常量，所以这里只能对齐并
   * 留下这句话；改那边记得改这边。
   */
  maxCategoryLabelLength: 80,
  /**
   * `set_model` 载荷里那个 model id 的长度上限 —— 与
   * `NodeWorkflowModelSelectionSchema.modelId` 的 `.max(200)` 对齐。
   */
  maxModelIdLength: 200,
  /** 档位值（`16:9` / `720p` 这类）的长度上限 —— 纯 DoS 护栏，值域校验在规划器。 */
  maxParamValueLength: 40,
  /**
   * seed 的上限，与 `NodeWorkflowNodeDataSchema.seed` 的 `.max(2147483647)`
   * 一致。⚠ 这里**不写进 schema**（写了就是一条坏 seed 带崩整批），规划器按它拒
   * `unknownParamValue`。
   */
  maxSeed: 2_147_483_647,
} as const

/**
 * op 被规划器拒绝的理由 —— **只放连线之外的那些**。
 *
 * 连线的三条（类型不符 / 重复边 / 参考位已满）复用
 * `NODE_STUDIO_INGEST_REJECT_REASON_IDS`：那是 `evaluateCastIngest` 本来就返回
 * 的词表，且 `StudioNode.ingest.reasons.*` 三语文案已经存在。再造一套同义词，
 * 用户就会在两个地方看到两种说法。
 */
export const NODE_ASSISTANT_OP_REJECT_REASON_IDS = {
  /** 引用的节点既不在画布上，也不是本批 `add_node` 声明过的别名。 */
  unknownNode: 'unknownNode',
  /** 同一个别名声明了两次 —— 后面的引用会指向哪个说不清，整条拒掉。 */
  duplicateRef: 'duplicateRef',
  /** 助手不得自批（§4.2 Q4，owner 钉死无开关）。 */
  approvalForbidden: 'approvalForbidden',
  /** 审核态按 URL 键控，节点身上没有媒体就无从标起。 */
  noMedia: 'noMedia',
  /** 文本类节点没有可生成的媒体。 */
  notGeneratable: 'notGeneratable',
  /** 没选模型 —— 与人手点「生成」时的拦法一致。 */
  noModel: 'noModel',
  /**
   * 这个节点身上根本没有「图片分类」这个字段 —— 与人手的入口一致：分类只长在
   * 图片节点上（`type === image` 且不是身份卡），视频/音色/镜头文本都没有。
   */
  notCategorizable: 'notCategorizable',
  /**
   * 分类值不在 `NODE_STUDIO_REFERENCE_ROLES` 的 11 个里。
   *
   * ⚠ 这条**有意留在规划器**而不是收进 schema 的 `z.enum`：schema 拒 = 整个
   * `[[canvas-ops]]` 块解析失败，同一批里其它好好的 op 一起陪葬，用户只看到一句
   * 「读不出来」。留到这里拒，坏的那条显示「不认识这个分类」，其余照常执行。
   * 与 `approved` 走规划层同一条论据（见 `NodeAssistantSetReviewStateOpSchema`）。
   */
  unknownCategory: 'unknownCategory',
  /**
   * 选了 `custom` 却没给名字。数据层的 `custom` 与 `imageCategoryLabel` 是**成对**
   * 的（见 `NODE_STUDIO_REFERENCE_ROLES` 头注），只写一半会让卡上显示一个没有名字
   * 的自定义分类。
   */
  missingCategoryLabel: 'missingCategoryLabel',
  /**
   * 这个节点根本不选模型（身份卡 / 镜头文本 / 参考视频 / 合并节点）—— 与
   * `generate` 拒身份卡同一条判据，别让助手往档案夹上挂模型。
   */
  notModelTargetable: 'notModelTargetable',
  /** 写的 id 不在这个节点能选的那张表里 —— 十有八九是它自己编的。 */
  unknownModel: 'unknownModel',
  /**
   * id 是真的，但这条渠道**现在跑不了**（没绑 key、也没有 provider 级覆盖）。
   * 与 `unknownModel` 分开：前者是「不存在」，后者是「去配一个 key 就能用」——
   * 两句话对用户的下一步完全不同。
   */
  modelNeedsKey: 'modelNeedsKey',
  /** 这类节点的生成档位不长在节点上（图片那几档住在合成条里，见 `NODE_ASSISTANT_PARAM_IDS`）。 */
  notParameterizable: 'notParameterizable',
  /** 一条 `set_params` 一个档位都没带 —— 什么都不会发生，与其静默不如说出来。 */
  emptyParams: 'emptyParams',
  /** 当前模型不吃这个档位（契约里写死 false，渲染时那颗控件根本不出现）。 */
  unsupportedParam: 'unsupportedParam',
  /** 档位值不在当前模型给的那张表里 —— ⛔ 不做就近匹配。 */
  unknownParamValue: 'unknownParamValue',
  /**
   * 目标节点没有「参考图集」这回事。人手把素材挂进 `referenceAssets` 的入口只有
   * 收集器卡（角色卡 / 背景卡）三处，其余节点的参考图走的是**连线**（阶段 3：
   * 参考图落散图节点 + 自动连线）—— 那条路助手已经有 `connect` 了，不另开第二条。
   */
  notAttachable: 'notAttachable',
} as const

export type NodeAssistantOpRejectReason =
  (typeof NODE_ASSISTANT_OP_REJECT_REASON_IDS)[keyof typeof NODE_ASSISTANT_OP_REJECT_REASON_IDS]

/* ═════════════════════════════════════════════════════════════════════════
 * v4 op 集（第三期 · 画布 C1，spec §5）
 *
 * 现状 10 条**没有 delete / disconnect / move**——助手能建不能拆、能连不能断。
 * 目标表补齐结构类，并把三件事写进常量而不是散在规划器里：
 *   ① **确认三档**（免费直做 / 需确认 / 花钱硬确认）
 *   ② **inverse 形状**（每条 op 必须能算出逆操作，否则不进自动落集合）
 *   ③ **能不能自动落**
 *
 * 三条纪律（§5）：
 *   1. `attach_asset` / `connect` / `disconnect` 载荷里**只有节点引用没有 URL**
 *      ——让模型写 URL 等于让它编地址。
 *   2. 算不出 inverse 的不自动落：`delete` 的 inverse 要整份 data 快照 + 边列表 +
 *      各槽 `versions`/`cur`，够贵，所以它不自动落。
 *   3. `generate` 依旧是**唯一扣 credit** 的 op，服务端只吐 op、执行在客户端。
 *      这道结构性钱闸不能动。
 *
 * ⛔ 本片只定词表与形状，**不接执行器**（C2）。⛔ 没有 `collapse_lane`：镜头带不
 * 折叠（§1.3）。
 * ═════════════════════════════════════════════════════════════════════════ */

export const NODE_ASSISTANT_OP_V4_IDS = {
  /** 读画布现值。scope 四档：viewport / shot / selection / all。 */
  readCanvas: 'read_canvas',
  findNode: 'find_node',
  /**
   * **只重跑下游**的只读规划（第三期，owner 2026-09-07 定）。
   *
   * ⭐ 它**只列名单，一个字都不改、一分钱都不花**：改了一个节点之后，沿具名槽边
   * 从它出发的后继闭包里有哪些节点要重跑、大概几档积分。真正的重跑是紧随其后的
   * 一串 `generate` —— 那条照旧是唯一扣 credit 的 op、照旧硬确认。
   * ⛔ 别把它做成「顺便把那几个也跑了」：那等于在钱闸上开一条只读工具的后门。
   */
  planRerunDownstream: 'plan_rerun_downstream',
  addNode: 'add_node',
  /** ⚠ `slot` 必填——没有槽的连线在 v4 里不存在（§3.4）。 */
  connect: 'connect',
  disconnect: 'disconnect',
  /** ⚠ 唯一的「需确认档」结构 op（owner 拍板「画-2」）：就地卡，可勾「本会话不再问」。 */
  delete: 'delete',
  moveToShot: 'move_to_shot',
  reorderShot: 'reorder_shot',
  setText: 'set_text',
  setPrompt: 'set_prompt',
  setField: 'set_field',
  /**
   * 改**图片子型**（普通图 / 角色卡 / 场景卡……，S3b，spec §3「设为角色卡」）。
   *
   * ⚠ 不并进 `set_field`：子型换了之后这张卡的槽位与工具条跟着换一套，是结构性
   * 改动而不是「改一个字段的值」；单开一条 op 才能让撤销回到**原来的子型**而不是
   * 一个恰好同名的字段值。
   */
  setSubtype: 'set_subtype',
  attachAsset: 'attach_asset',
  /** 槽内版本轮播：把某个版本设为当前（§1.4）。指向 blocked 版本时拒绝并给理由。 */
  setSlotVersion: 'set_slot_version',
  /**
   * **产出**版本轮播：把这张卡的第 N 版设为当前（S3b，spec §1.8）。
   *
   * ⚠ 与 `set_slot_version` 是两条 op，别合：那条切的是「这个**入口槽**当前用哪条
   * 边」（认 versionId，因为绑定要能从边表幂等重算），这条切的是「这张卡自己交付
   * 的第几版」（认**下标**，因为它就是卡下那一排小点的第几颗）。合成一条就要给
   * 载荷加一个「到底切哪种版本」的开关，那正是模型最容易选错的那类字段。
   */
  setOutputVersion: 'set_output_version',
  /**
   * 把当前产出版本**拆成一张独立同类卡**（spec §3 的 ⋯「拆出当前版本」）。
   *
   * ⚠ **非破坏**：原卡的版本表一个字不动，只是把那一版复制成新节点 —— 所以
   * inverse 就是一条 `delete`（删掉刚拆出来的那张）。⛔ 不做成「移出去」：那要
   * 同时改两张卡，inverse 得存整份版本表快照，代价与 `delete` 一样贵。
   */
  splitOutputVersion: 'split_output_version',
  markVersionBlocked: 'mark_version_blocked',
  setModel: 'set_model',
  setParams: 'set_params',
  /**
   * 音色档（情绪 / 语速 / 音量 / provider / voiceId）。
   *
   * ⚠ 不并进 `set_field`：那条的词表是**扁平字段**且值域是
   * `string | number | boolean | null`，而 `voiceProfile` 是一个嵌套对象。硬塞进去
   * 要么让 `value` 变成 `unknown`（守卫全丢），要么给六个子字段各加一个词表项
   * （改一次档位要发六条 op，撤销粒度也跟着碎成六步）。
   */
  setVoiceProfile: 'set_voice_profile',
  setReviewState: 'set_review_state',
  /* ── 剪辑台（S8 · spec §6 / §8.5）───────────────────────────────────── */
  /**
   * 整表替换时间线（inverse = 原表）。
   *
   * ⚠ 时间线是**有序数组**，「只改第 3 段」
   * 在一个数组字段上表达不了增删，而 patch 语义会让「删掉一段」和「没提到这一段」
   * 长得一模一样。四条细粒度 op（add / remove / update / move）是给**单次手势**用的
   * ——它们的 inverse 是一条同族 op，撤销一步回到位；这一条是给「一句话排片整批写入」
   * 与「迁移一次落表」用的，那两件事本来就是一整份。
   */
  editSetTimeline: 'edit_set_timeline',
  editAddClip: 'edit_add_clip',
  editRemoveClip: 'edit_remove_clip',
  editUpdateClip: 'edit_update_clip',
  editMoveClip: 'edit_move_clip',
  /**
   * 字幕三条（S8d · spec §6「文字段」）。
   *
   * ⚠ 另开三条而不是让上面五条多认一条轨：T 轨上的段是 `EditTextClip`（自带内容与
   * 绝对起点），`edit_add_clip` 的载荷是 `EditClip`。硬塞成一条要么让 `clip` 变成
   * 联合类型（每个读它的地方先分辨形状），要么给 `EditClip` 加一堆只有字幕用得上的
   * 可选字段 —— 两条都是把「一条轨道是一排 `EditClip`」这句话拆掉。
   * ⛔ 没有 `edit_move_text`：字幕的位置就是 `startSec`，挪它 = 改一个字段。
   */
  editAddText: 'edit_add_text',
  editRemoveText: 'edit_remove_text',
  editUpdateText: 'edit_update_text',
  /** ⚠ 唯一扣 credit 的 op。 */
  generate: 'generate',
} as const

export const NODE_ASSISTANT_OPS_V4 = [
  NODE_ASSISTANT_OP_V4_IDS.readCanvas,
  NODE_ASSISTANT_OP_V4_IDS.findNode,
  NODE_ASSISTANT_OP_V4_IDS.planRerunDownstream,
  NODE_ASSISTANT_OP_V4_IDS.addNode,
  NODE_ASSISTANT_OP_V4_IDS.connect,
  NODE_ASSISTANT_OP_V4_IDS.disconnect,
  NODE_ASSISTANT_OP_V4_IDS.delete,
  NODE_ASSISTANT_OP_V4_IDS.moveToShot,
  NODE_ASSISTANT_OP_V4_IDS.reorderShot,
  NODE_ASSISTANT_OP_V4_IDS.setText,
  NODE_ASSISTANT_OP_V4_IDS.setPrompt,
  NODE_ASSISTANT_OP_V4_IDS.setField,
  NODE_ASSISTANT_OP_V4_IDS.attachAsset,
  NODE_ASSISTANT_OP_V4_IDS.setSlotVersion,
  NODE_ASSISTANT_OP_V4_IDS.markVersionBlocked,
  NODE_ASSISTANT_OP_V4_IDS.setOutputVersion,
  NODE_ASSISTANT_OP_V4_IDS.splitOutputVersion,
  NODE_ASSISTANT_OP_V4_IDS.setSubtype,
  NODE_ASSISTANT_OP_V4_IDS.setModel,
  NODE_ASSISTANT_OP_V4_IDS.setParams,
  NODE_ASSISTANT_OP_V4_IDS.setVoiceProfile,
  NODE_ASSISTANT_OP_V4_IDS.setReviewState,
  NODE_ASSISTANT_OP_V4_IDS.editSetTimeline,
  NODE_ASSISTANT_OP_V4_IDS.editAddClip,
  NODE_ASSISTANT_OP_V4_IDS.editRemoveClip,
  NODE_ASSISTANT_OP_V4_IDS.editUpdateClip,
  NODE_ASSISTANT_OP_V4_IDS.editMoveClip,
  NODE_ASSISTANT_OP_V4_IDS.editAddText,
  NODE_ASSISTANT_OP_V4_IDS.editRemoveText,
  NODE_ASSISTANT_OP_V4_IDS.editUpdateText,
  NODE_ASSISTANT_OP_V4_IDS.generate,
] as const

export type NodeAssistantOpV4Id = (typeof NODE_ASSISTANT_OPS_V4)[number]

export const NODE_ASSISTANT_OP_V4_GROUP_IDS = {
  read: 'read',
  structure: 'structure',
  content: 'content',
  review: 'review',
  paid: 'paid',
} as const

export type NodeAssistantOpV4Group =
  (typeof NODE_ASSISTANT_OP_V4_GROUP_IDS)[keyof typeof NODE_ASSISTANT_OP_V4_GROUP_IDS]

/** 确认三档。`confirm` = 就地卡（可勾本会话不再问）；`hardConfirm` = 花钱卡。 */
export const NODE_ASSISTANT_OP_V4_TIER_IDS = {
  free: 'free',
  confirm: 'confirm',
  hardConfirm: 'hardConfirm',
} as const

export type NodeAssistantOpV4Tier =
  (typeof NODE_ASSISTANT_OP_V4_TIER_IDS)[keyof typeof NODE_ASSISTANT_OP_V4_TIER_IDS]

/**
 * inverse 的**形状**（不是值）：撤销这条 op 要发哪条 op。`null` = 不可逆
 * （读类没有副作用；`generate` 的结果不删，只回参数）。
 */
export interface NodeAssistantOpV4Spec {
  readonly group: NodeAssistantOpV4Group
  readonly tier: NodeAssistantOpV4Tier
  readonly inverse: NodeAssistantOpV4Id | null
  /** 能不能进「自动落」集合（算不出 inverse / 花钱 / 需确认的都不能）。 */
  readonly autoApply: boolean
}

const { free, confirm, hardConfirm } = NODE_ASSISTANT_OP_V4_TIER_IDS
const { read, structure, content, review, paid } =
  NODE_ASSISTANT_OP_V4_GROUP_IDS

export const NODE_ASSISTANT_OP_V4_SPECS = {
  [NODE_ASSISTANT_OP_V4_IDS.readCanvas]: {
    group: read,
    tier: free,
    inverse: null,
    autoApply: true,
  },
  [NODE_ASSISTANT_OP_V4_IDS.findNode]: {
    group: read,
    tier: free,
    inverse: null,
    autoApply: true,
  },
  /** ⚠ 只读组：没有副作用，也就没有 inverse。 */
  [NODE_ASSISTANT_OP_V4_IDS.planRerunDownstream]: {
    group: read,
    tier: free,
    inverse: null,
    autoApply: true,
  },
  [NODE_ASSISTANT_OP_V4_IDS.addNode]: {
    group: structure,
    tier: free,
    inverse: NODE_ASSISTANT_OP_V4_IDS.delete,
    autoApply: true,
  },
  [NODE_ASSISTANT_OP_V4_IDS.connect]: {
    group: structure,
    tier: free,
    // 替换（往已有内容的 0..1 槽再连）时 inverse = 恢复旧边，仍然是一条 disconnect。
    inverse: NODE_ASSISTANT_OP_V4_IDS.disconnect,
    autoApply: true,
  },
  [NODE_ASSISTANT_OP_V4_IDS.disconnect]: {
    group: structure,
    tier: free,
    inverse: NODE_ASSISTANT_OP_V4_IDS.connect,
    autoApply: true,
  },
  [NODE_ASSISTANT_OP_V4_IDS.delete]: {
    group: structure,
    // owner 拍板「画-2」：不降为免费直做（助手一句话能删掉一整镜），也不做弹窗。
    tier: confirm,
    inverse: NODE_ASSISTANT_OP_V4_IDS.addNode,
    autoApply: false,
  },
  [NODE_ASSISTANT_OP_V4_IDS.moveToShot]: {
    group: structure,
    tier: free,
    inverse: NODE_ASSISTANT_OP_V4_IDS.moveToShot,
    autoApply: true,
  },
  [NODE_ASSISTANT_OP_V4_IDS.reorderShot]: {
    group: structure,
    tier: free,
    inverse: NODE_ASSISTANT_OP_V4_IDS.reorderShot,
    autoApply: true,
  },
  [NODE_ASSISTANT_OP_V4_IDS.setSlotVersion]: {
    group: structure,
    tier: free,
    inverse: NODE_ASSISTANT_OP_V4_IDS.setSlotVersion,
    autoApply: true,
  },
  [NODE_ASSISTANT_OP_V4_IDS.markVersionBlocked]: {
    group: structure,
    tier: free,
    inverse: NODE_ASSISTANT_OP_V4_IDS.markVersionBlocked,
    autoApply: true,
  },
  [NODE_ASSISTANT_OP_V4_IDS.setOutputVersion]: {
    group: structure,
    tier: free,
    inverse: NODE_ASSISTANT_OP_V4_IDS.setOutputVersion,
    autoApply: true,
  },
  /** ⚠ 非破坏地多出一张卡 —— 与 `add_node` 同一档，inverse 就是删掉那一张。 */
  [NODE_ASSISTANT_OP_V4_IDS.splitOutputVersion]: {
    group: content,
    tier: free,
    inverse: NODE_ASSISTANT_OP_V4_IDS.delete,
    autoApply: true,
  },
  [NODE_ASSISTANT_OP_V4_IDS.setSubtype]: {
    group: content,
    tier: free,
    inverse: NODE_ASSISTANT_OP_V4_IDS.setSubtype,
    autoApply: true,
  },
  [NODE_ASSISTANT_OP_V4_IDS.setText]: {
    group: content,
    tier: free,
    inverse: NODE_ASSISTANT_OP_V4_IDS.setText,
    autoApply: true,
  },
  [NODE_ASSISTANT_OP_V4_IDS.setPrompt]: {
    group: content,
    tier: free,
    inverse: NODE_ASSISTANT_OP_V4_IDS.setPrompt,
    autoApply: true,
  },
  [NODE_ASSISTANT_OP_V4_IDS.setField]: {
    group: content,
    // ⚠ `blocked` 是这条 op 的例外：它把一个素材判失败，与 delete 同族的破坏性，
    // 收窄在规划器（本片只定形状，不接执行器）。
    tier: free,
    inverse: NODE_ASSISTANT_OP_V4_IDS.setField,
    autoApply: true,
  },
  [NODE_ASSISTANT_OP_V4_IDS.attachAsset]: {
    group: content,
    tier: free,
    inverse: NODE_ASSISTANT_OP_V4_IDS.disconnect,
    autoApply: true,
  },
  [NODE_ASSISTANT_OP_V4_IDS.setModel]: {
    group: content,
    tier: free,
    inverse: NODE_ASSISTANT_OP_V4_IDS.setModel,
    autoApply: true,
  },
  [NODE_ASSISTANT_OP_V4_IDS.setParams]: {
    group: content,
    tier: free,
    inverse: NODE_ASSISTANT_OP_V4_IDS.setParams,
    autoApply: true,
  },
  [NODE_ASSISTANT_OP_V4_IDS.setVoiceProfile]: {
    group: content,
    tier: free,
    inverse: NODE_ASSISTANT_OP_V4_IDS.setVoiceProfile,
    autoApply: true,
  },
  [NODE_ASSISTANT_OP_V4_IDS.setReviewState]: {
    group: review,
    tier: free,
    inverse: NODE_ASSISTANT_OP_V4_IDS.setReviewState,
    autoApply: true,
  },
  /**
   * 剪辑台五条都归 `content` / `free`：它们**只摆时间线**，一帧都不渲染、一分
   * 积分都不花（spec §6「一句话排片：只摆时间线，不花积分」）。真正花钱的是导出，
   * 而导出走渲染层（S9）的自己那条路，⛔ 不混进 op 表。
   */
  [NODE_ASSISTANT_OP_V4_IDS.editSetTimeline]: {
    group: content,
    tier: free,
    inverse: NODE_ASSISTANT_OP_V4_IDS.editSetTimeline,
    autoApply: true,
  },
  [NODE_ASSISTANT_OP_V4_IDS.editAddClip]: {
    group: content,
    tier: free,
    inverse: NODE_ASSISTANT_OP_V4_IDS.editRemoveClip,
    autoApply: true,
  },
  [NODE_ASSISTANT_OP_V4_IDS.editRemoveClip]: {
    group: content,
    tier: free,
    inverse: NODE_ASSISTANT_OP_V4_IDS.editAddClip,
    autoApply: true,
  },
  [NODE_ASSISTANT_OP_V4_IDS.editUpdateClip]: {
    group: content,
    tier: free,
    inverse: NODE_ASSISTANT_OP_V4_IDS.editUpdateClip,
    autoApply: true,
  },
  [NODE_ASSISTANT_OP_V4_IDS.editMoveClip]: {
    group: content,
    tier: free,
    inverse: NODE_ASSISTANT_OP_V4_IDS.editMoveClip,
    autoApply: true,
  },
  [NODE_ASSISTANT_OP_V4_IDS.editAddText]: {
    group: content,
    tier: free,
    inverse: NODE_ASSISTANT_OP_V4_IDS.editRemoveText,
    autoApply: true,
  },
  [NODE_ASSISTANT_OP_V4_IDS.editRemoveText]: {
    group: content,
    tier: free,
    inverse: NODE_ASSISTANT_OP_V4_IDS.editAddText,
    autoApply: true,
  },
  [NODE_ASSISTANT_OP_V4_IDS.editUpdateText]: {
    group: content,
    tier: free,
    inverse: NODE_ASSISTANT_OP_V4_IDS.editUpdateText,
    autoApply: true,
  },
  [NODE_ASSISTANT_OP_V4_IDS.generate]: {
    group: paid,
    tier: hardConfirm,
    // 结果不删，只回参数——所以没有一条能把它抹掉的 op。
    inverse: null,
    autoApply: false,
  },
} as const satisfies Record<NodeAssistantOpV4Id, NodeAssistantOpV4Spec>

/** `read_canvas` 的取值范围。 */
export const NODE_ASSISTANT_READ_CANVAS_SCOPES = [
  'viewport',
  'shot',
  'selection',
  'all',
] as const

export type NodeAssistantReadCanvasScope =
  (typeof NODE_ASSISTANT_READ_CANVAS_SCOPES)[number]

/** `set_text` / `set_prompt` 的覆盖三选（覆盖手写内容时才问）。 */
export const NODE_ASSISTANT_WRITE_MODES = [
  'replace',
  'append',
  'suggest',
] as const

export type NodeAssistantWriteMode = (typeof NODE_ASSISTANT_WRITE_MODES)[number]

/** `set_field` 能写的字段——**封闭词表**，⛔ 不给自由 key。 */
export const NODE_ASSISTANT_SETTABLE_FIELDS = [
  'shotNo',
  /**
   * 稳定名（`@` 提及用它）。⚠ 镜头节点改的是下面的 `label`，不是这一条——
   * `name` 与 `label` 在镜头上写同一个值，改错一个就会让两处显示对不上。
   * 唯一性由 UI 层的 `renameStableNodeName` 先判，op 只负责落值。
   */
  'name',
  /** 镜头标签 = 稳定名（C1 契约修正 1）。改名改的是它，⛔ 不是 `shotNo` 前缀。 */
  'label',
  'characterName',
  /** 角色节点硬链的角色卡 id（C1 契约修正 3）。存在性在服务端校验，不在数据层。 */
  'contextCardId',
  'ownerName',
  /** 文本节点连进 `text` 槽时的**缺省**角色（C1 契约修正 2）。单条边上的角色以边为准。 */
  'defaultRole',
  'sourceRef',
  'blocked',
  'note',
  'title',
] as const

export type NodeAssistantSettableField =
  (typeof NODE_ASSISTANT_SETTABLE_FIELDS)[number]
