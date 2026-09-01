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
 * 个写者；图片的比例与清晰度真正住在 `use-generate-composer.ts` 的 React state
 * 里（`useState<AspectRatio>` / `useState<ImageResolutionTier>`，注释写明是
 * 「session-sticky, not reset per host」的**设计**），随 `runGenerateComposer` 的
 * 入参直传。`handleGenerateMediaNode` 里读 `data.aspectRatio` / `data.resolution`
 * 的三处全部带着 `isVideoMediaNode` 守卫 —— 写进图片节点的 data 是一条三绿而毫无
 * 效果的路（编译过、测试过、真机上什么都不变）。
 * 把那条链接通＝把「档位跟着合成条走」改成「档位跟着节点走」，那是产品决定不是
 * 顺手项，且要动 composer 与工作台的发送路径。所以本批只做视频节点，图片节点给
 * `notParameterizable` 明说「这几档不在节点上」。
 *
 * ⚠ 每一项都逐个确认过读侧（`StudioNodeWorkbench.handleGenerateMediaNode`）：
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
  CANVAS_ADD_INTENT_IDS.imageAsset,
  CANVAS_ADD_INTENT_IDS.imageShot,
  CANVAS_ADD_INTENT_IDS.videoGenerate,
  CANVAS_ADD_INTENT_IDS.videoReference,
  CANVAS_ADD_INTENT_IDS.videoShotText,
  CANVAS_ADD_INTENT_IDS.videoMerge,
  CANVAS_ADD_INTENT_IDS.audioVoiceProfile,
  CANVAS_ADD_INTENT_IDS.organizeCharacter,
  CANVAS_ADD_INTENT_IDS.organizeScene,
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
  [CANVAS_ADD_INTENT_IDS.organizeCharacter]:
    'a CHARACTER identity card — use it for any person / role',
  [CANVAS_ADD_INTENT_IDS.organizeScene]:
    'a BACKGROUND / scene identity card — use it for places, environments, locations',
  [CANVAS_ADD_INTENT_IDS.imageShot]:
    'a shot still — one frame generated from shot text plus character / background references',
  // ⚠ 没有 keyframe 这一项：造关键帧的入口 2026-08-09 退役（见
  // `CANVAS_ADD_INTENT_IDS` 头注）。助手要铺关键帧就铺 `image.asset`，首/尾用
  // `set_image_category` 标 `frameStart` / `frameEnd`（切片 5 第一批补上了这条
  // op —— 在那之前助手只能建图、标不了首尾，得让用户回详情面板自己下拉）。
  [CANVAS_ADD_INTENT_IDS.imageAsset]:
    'a loose image with no assigned role — only when none of the roles above fits',
  [CANVAS_ADD_INTENT_IDS.videoShotText]:
    'a shot-text node — the written scene / action / camera / composition for one shot, feeding a video node',
  [CANVAS_ADD_INTENT_IDS.videoGenerate]: 'a video generation node',
  [CANVAS_ADD_INTENT_IDS.videoReference]: 'a reference video clip',
  [CANVAS_ADD_INTENT_IDS.videoMerge]:
    'a node that stitches several clips into one sequence',
  [CANVAS_ADD_INTENT_IDS.audioVoiceProfile]:
    'a voice / timbre profile used for a character',
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
