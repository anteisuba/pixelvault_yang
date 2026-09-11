/**
 * **上下文卡**的词表与上限（第三期 K1）。
 *
 * 一张上下文卡 = 一段**账号级、跨会话、跨工作台**的持久上下文：一个角色的外貌与
 * 服饰、一套画风规则、一份品牌规范。用户可以在对话里 `@` 点名它，也可以把它
 * **常挂**在某个工作台上 —— 常挂之后它每一轮都进系统提示，不必再点一次名。
 *
 * ── 名字为什么不叫「角色卡」───────────────────────────────────────
 * 仓里已经有 `CharacterCard`（生成管线的产物：源图必填、挂着 LoRA 训练任务与配方）。
 * 这里的一行是**用户写下来的一段设定**，没有源图也成立，而且同一套列还要装风格与
 * 品牌。⛔ 两个概念共用一个名字是本仓最贵的那种错。
 *
 * 竞品参照：Lovart 的「品牌套件 / 角色 / 产品」、即梦的「主体」—— 都是账号级对象。
 */

/** 卡的三档。⚠ 与 `ContextCardKind` 枚举一一对应，⛔ 别在别处写字面量。 */
export const CONTEXT_CARD_KIND_IDS = {
  character: 'character',
  style: 'style',
  brand: 'brand',
} as const

export const CONTEXT_CARD_KINDS = [
  CONTEXT_CARD_KIND_IDS.character,
  CONTEXT_CARD_KIND_IDS.style,
  CONTEXT_CARD_KIND_IDS.brand,
] as const

export type ContextCardKindId = (typeof CONTEXT_CARD_KINDS)[number]

/**
 * 一张卡**进没进用户的长期记忆**（v2 §8.1 / §8.2）。
 *
 * ⭐ 两态，默认 `confirmed`：用户自己在设置里建的卡、以及这一列出现之前的存量行，
 * 全是它。
 * ⚠ `proposed` = 助手提议、用户还没点头的草稿。它**不进系统提示、也不进
 * `list_context_cards` 的名单** —— 让模型读到自己刚提议的草稿，等于给它一条
 * 「自己说了算」的自引用回路。
 * ⛔ 这一档不是助手的写入后门：服务端提议那一跳一行库都不写（§8.1），写下这一行
 * 的是**客户端**——面板收到提议帧时替用户留一份草稿（owner 2026-09-11：当场没点
 * 的，要能在设置里补点）。用户点头才翻成 `confirmed`，点「不用」当场删掉。
 */
export const CONTEXT_CARD_STATUS_IDS = {
  proposed: 'proposed',
  confirmed: 'confirmed',
} as const

export const CONTEXT_CARD_STATUSES = [
  CONTEXT_CARD_STATUS_IDS.proposed,
  CONTEXT_CARD_STATUS_IDS.confirmed,
] as const

export type ContextCardStatusId = (typeof CONTEXT_CARD_STATUSES)[number]

/**
 * 一张参考图在这张卡里**干什么用**（owner 的 S4：「风格校准图 / 官方实机图 /
 * 参考片段三者分工不混权重」）。
 *
 * ⭐ 这三档不是装饰：助手挂参考图时要知道哪一张是「身份证据」、哪一张只是
 * 「风格口味」。少了它，模型会把三张图一视同仁地全挂上，而那正是 owner 在
 * `VIDEO-LESSONS` 里记下的那次失败。
 */
export const CONTEXT_CARD_IMAGE_ROLE_IDS = {
  /** 一般参考：气质、色调、构图口味。 */
  reference: 'reference',
  /** 设定图 / 三视图：**身份证据**，长相以它为准。 */
  sheet: 'sheet',
  /** 特写：某个部件的细节（手套结构、瞳色、纹章）。 */
  closeup: 'closeup',
} as const

export const CONTEXT_CARD_IMAGE_ROLES = [
  CONTEXT_CARD_IMAGE_ROLE_IDS.reference,
  CONTEXT_CARD_IMAGE_ROLE_IDS.sheet,
  CONTEXT_CARD_IMAGE_ROLE_IDS.closeup,
] as const

export type ContextCardImageRoleId = (typeof CONTEXT_CARD_IMAGE_ROLES)[number]

/**
 * 上限。
 *
 * ⚠ `maxPerUser` 是一条**真的会拒**的闸（`context-cards.service.ts`），
 * 与项目规则那条同源：卡会拼进系统提示，没有上限的卡表等于一条会无限长的提示。
 * ⚠ `maxInPrompt` 与它分开：库里可以存 `maxPerUser` 张，每一轮只有命中当前域的
 * 前 `maxInPrompt` 张进系统提示，剩下的靠 `list_context_cards` 翻。
 * ⚠ `maxSummaryChars` 与 `maxBodyChars` 差一个数量级**是有意的**：进提示的是摘要，
 * 正文只在模型主动 `read_context_card` 时才付那份 token。
 */
export const CONTEXT_CARD_LIMITS = {
  /** 每用户最多几张卡。撞上限时创建按 `CONTEXT_CARD_LIMIT_REACHED` 拒。 */
  maxPerUser: 60,
  maxNameChars: 60,
  /** 一句话摘要 —— 它是唯一每轮都进系统提示的那段文本。 */
  maxSummaryChars: 200,
  /** Markdown 正文。 */
  maxBodyChars: 4000,
  /** 硬否定串（逗号分隔的一行）。 */
  maxNegativeChars: 400,
  /** 一张卡最多挂几张参考图。 */
  maxImages: 8,
  /** 一张图的来源标注（URL / 出处 / 时间码）。 */
  maxSourceRefChars: 200,
  /** 一张卡最多常挂到几个域 / 工作台。 */
  maxPinnedScopes: 8,
  /** 一个常挂目标 id 的长度（域 id 或工作台 id）。 */
  maxScopeChars: 64,
  /** 每一轮最多几张常挂卡进系统提示。 */
  maxInPrompt: 6,
  /** 一次 `list_context_cards` 最多返回几张。 */
  maxReadResults: 60,
  /** `read_context_card` 截给模型看的正文长度。 */
  maxBodyInToolChars: 2000,
  /**
   * 一张参考图的上限。
   *
   * ⚠ 比头像那条（5 MB）宽一倍**是有意的**：设定图与三视图是这张卡的身份证据，
   * 按头像的尺度砍会把 owner 从官方页截下来的那种大图挡在门外。
   */
  maxImageBytes: 10 * 1024 * 1024,
} as const

/**
 * 参考图在 R2 上的 key 前缀（`context-cards/<userId>/…`）。
 * ⚠ 与 persona 头像同一个形状：上传那条腿住在**另一个文件**，见
 * `services/context-cards-avatar.service.ts` 的头注。
 */
export const CONTEXT_CARD_STORAGE_TYPE = 'context-cards'
