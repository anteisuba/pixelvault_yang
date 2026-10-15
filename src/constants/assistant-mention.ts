/**
 * 助手输入框 `@` 的**统一引用模型**词表（设计方案 §10b · 附录 G §9）。
 *
 * ── 一条引用长什么样 ──────────────────────────────────────────────
 * `{ kind, id, label, thumb, scope, nodeId?, generationId? }`。正文里只存
 * `<@kind:id>`（`ASSISTANT_MENTION_TOKEN`），**显示名只是快照** —— 改名、同名都
 * 不影响解析；指的东西没了，胶囊变成灰色「已删除」并拦住发送。
 *
 * ── 为什么不再存 `@名字` ─────────────────────────────────────────
 * 从前正文里是 `@Image2` / `@Attachment[hash]` / `@TextNode[id]` 三套写法，发送前
 * 再按名字编译回去：三张同名「镜头1」只能认第一张，参考位一删序号全挪（附录 G §2）。
 * 按 id 存之后，名字只负责给人看。
 */

/** 能被 `@` 的东西是什么。 */
export const ASSISTANT_MENTION_KIND_IDS = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  model3d: 'model3d',
  text: 'text',
  character: 'character',
  lora: 'lora',
} as const

export const ASSISTANT_MENTION_KINDS = [
  ASSISTANT_MENTION_KIND_IDS.image,
  ASSISTANT_MENTION_KIND_IDS.video,
  ASSISTANT_MENTION_KIND_IDS.audio,
  ASSISTANT_MENTION_KIND_IDS.model3d,
  ASSISTANT_MENTION_KIND_IDS.text,
  ASSISTANT_MENTION_KIND_IDS.character,
  ASSISTANT_MENTION_KIND_IDS.lora,
] as const

/**
 * 引用**从哪来**——服务端据此决定按什么解析（画布按 `nodeId`，素材按 `generationId`）。
 *
 * ⚠ 与菜单分组（`ASSISTANT_MENTION_GROUP_IDS`）是两回事：分组是给人看的，scope
 * 是给解析看的。「选中的卡」与「画布上的卡」两组的 scope 都是 `canvas`。
 */
export const ASSISTANT_MENTION_SCOPE_IDS = {
  canvas: 'canvas',
  reference: 'reference',
  result: 'result',
  library: 'library',
  attachment: 'attachment',
  character: 'character',
  lora: 'lora',
} as const

export const ASSISTANT_MENTION_SCOPES = [
  ASSISTANT_MENTION_SCOPE_IDS.canvas,
  ASSISTANT_MENTION_SCOPE_IDS.reference,
  ASSISTANT_MENTION_SCOPE_IDS.result,
  ASSISTANT_MENTION_SCOPE_IDS.library,
  ASSISTANT_MENTION_SCOPE_IDS.attachment,
  ASSISTANT_MENTION_SCOPE_IDS.character,
  ASSISTANT_MENTION_SCOPE_IDS.lora,
] as const

/**
 * 一条引用**当哪种参考用**（胶囊小卡片上那一排）。只在宿主说它收这个（`mentions.roles`）
 * 时出现；缺省就是「看看这张」，⛔ 不默认替用户定一个用途。
 */
export const ASSISTANT_MENTION_ROLE_IDS = {
  subject: 'subject',
  style: 'style',
  composition: 'composition',
  firstFrame: 'first_frame',
  lastFrame: 'last_frame',
} as const

export const ASSISTANT_MENTION_ROLES = [
  ASSISTANT_MENTION_ROLE_IDS.subject,
  ASSISTANT_MENTION_ROLE_IDS.style,
  ASSISTANT_MENTION_ROLE_IDS.composition,
  ASSISTANT_MENTION_ROLE_IDS.firstFrame,
  ASSISTANT_MENTION_ROLE_IDS.lastFrame,
] as const

/** 图片台 / 画布能定的用途；首尾帧只有视频台收。 */
export const ASSISTANT_MENTION_IMAGE_ROLES = [
  ASSISTANT_MENTION_ROLE_IDS.subject,
  ASSISTANT_MENTION_ROLE_IDS.style,
  ASSISTANT_MENTION_ROLE_IDS.composition,
] as const
export const ASSISTANT_MENTION_VIDEO_ROLES = [
  ASSISTANT_MENTION_ROLE_IDS.subject,
  ASSISTANT_MENTION_ROLE_IDS.style,
  ASSISTANT_MENTION_ROLE_IDS.firstFrame,
  ASSISTANT_MENTION_ROLE_IDS.lastFrame,
] as const

/**
 * `@` 菜单里的分组（§10b 那张表的行）。顺序就是空查询时的显示顺序。
 */
export const ASSISTANT_MENTION_GROUP_IDS = {
  recent: 'recent',
  selected: 'selected',
  canvas: 'canvas',
  references: 'references',
  attachments: 'attachments',
  results: 'results',
  characters: 'characters',
  loras: 'loras',
  library: 'library',
} as const

export const ASSISTANT_MENTION_GROUPS = [
  ASSISTANT_MENTION_GROUP_IDS.recent,
  ASSISTANT_MENTION_GROUP_IDS.selected,
  ASSISTANT_MENTION_GROUP_IDS.canvas,
  ASSISTANT_MENTION_GROUP_IDS.references,
  ASSISTANT_MENTION_GROUP_IDS.attachments,
  ASSISTANT_MENTION_GROUP_IDS.results,
  ASSISTANT_MENTION_GROUP_IDS.characters,
  ASSISTANT_MENTION_GROUP_IDS.loras,
  ASSISTANT_MENTION_GROUP_IDS.library,
] as const

/**
 * 正文里的引用记号 `<@kind:id>`。
 *
 * ⚠ id 里不许出现 `>` 与空白（下面的正则据此断开）；画布节点 id、generation id、
 * 参考位 `reference-<hash>`、角色卡 id 都满足。
 */
export const ASSISTANT_MENTION_TOKEN = {
  open: '<@',
  separator: ':',
  close: '>',
} as const

/**
 * 上限 —— **看图上限只有这一个数**（§10b「UI、提示、模型一致」）。
 *
 * ⭐ `lookImages`：助手这一轮**细看**的图最多几张。UI 的「将看 N 张」、发给模型的
 * 「IMAGES THE CREATOR POINTED AT」、`look` 工具三处都读它。从前 UI 写 8、模型只看
 * 6，界面说看了 8 张而实际看了 6 张（附录 G §3）。超过时**不拦**（owner 2026-09-06
 * 「不设硬上限」）——计数转 warning、明说「只细看前 N 张」，模型那边也收到同一句。
 * 取 6：就是 v3 一直以来真正在看的张数，统一口径不涨图像 token。
 */
export const ASSISTANT_MENTION_LIMITS = {
  lookImages: 6,
  /** 一条消息最多带几条引用（再多就是在拿 `@` 当批处理）。 */
  maxPerMessage: 20,
  /** 搜索时最多列几条（§10b「最多 20 条」）。 */
  searchResults: 20,
  /** 空查询时每组先露几条，其余收在「查看全部」后面。 */
  perGroup: 4,
  /** 「最近使用」记几条（本机）。 */
  recent: 5,
  /** 素材库那一组的请求防抖（毫秒）。 */
  libraryDebounceMs: 150,
  /** 素材库一次取几条。 */
  libraryPageSize: 20,
  /** 一个词最长几个字（服务端也按它截）。 */
  maxQueryChars: 80,
  /** 一次搜索最多几个词（多词 = 每个词都要命中）。 */
  maxQueryTerms: 6,
  /** 胶囊 / 候选行上的名字最多几个字。 */
  maxLabelChars: 80,
  /** 文本节点悬停预览的前几个字。 */
  previewChars: 200,
  /** 登记表（名字 / 缩略图快照）最多记几条 —— 只是元数据，旧的挤掉就是了。 */
  registry: 200,
} as const

/** 「最近使用」存在本机的那一格（按工作台作用域再分）。 */
export const ASSISTANT_MENTION_RECENT_STORAGE_PREFIX =
  'pv:assistant-mention-recent:'
