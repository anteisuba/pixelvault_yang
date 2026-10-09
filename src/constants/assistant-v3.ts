/**
 * 助手新内核（v3）的词表：八个原生工具、句柄、开关与上限。
 *
 * ── 与旧内核的关系 ─────────────────────────────────────────────
 * 旧内核是自造 JSON 协议（五个入口挤 54 个动作），模型记不住形状、抄错 36 位
 * UUID（2026-10-09 回放 25 题：8 次草稿步）。v3 走 AI SDK 原生工具调用：每个工具
 * 一个 schema，卡用短句柄，同一批里新卡用临时名。工具真正执行时仍交给旧内核里
 * 那些磨好的执行函数（`planTool`），S6 再删旧协议那半边。
 *
 * ── 开关 ─────────────────────────────────────────────────────
 * 只开画布、只开管理员账号、且要前端在本地开关里选了 v3 才走 —— 线上默认不动。
 */

/** 八个工具。名字就是模型看到的工具名，⛔ 别改成旧内核那套动作名。 */
export const ASSISTANT_V3_TOOL_IDS = {
  read: 'read',
  look: 'look',
  edit: 'edit',
  write: 'write',
  generate: 'generate',
  searchWeb: 'search_web',
  searchLibrary: 'search_library',
  ask: 'ask',
} as const

export const ASSISTANT_V3_TOOLS = [
  ASSISTANT_V3_TOOL_IDS.read,
  ASSISTANT_V3_TOOL_IDS.look,
  ASSISTANT_V3_TOOL_IDS.edit,
  ASSISTANT_V3_TOOL_IDS.write,
  ASSISTANT_V3_TOOL_IDS.generate,
  ASSISTANT_V3_TOOL_IDS.searchWeb,
  ASSISTANT_V3_TOOL_IDS.searchLibrary,
  ASSISTANT_V3_TOOL_IDS.ask,
] as const

export type AssistantV3Tool = (typeof ASSISTANT_V3_TOOLS)[number]

/** `edit` 一批里能做的事。⛔ 没有坐标：卡由画布自己放到空位（T18 卡叠在一起）。 */
export const ASSISTANT_V3_EDIT_OP_IDS = {
  add: 'add',
  set: 'set',
  connect: 'connect',
  disconnect: 'disconnect',
  delete: 'delete',
  moveToShot: 'move_to_shot',
  reorderShot: 'reorder_shot',
  projectScript: 'project_script',
} as const

export const ASSISTANT_V3_EDIT_OPS = [
  ASSISTANT_V3_EDIT_OP_IDS.add,
  ASSISTANT_V3_EDIT_OP_IDS.set,
  ASSISTANT_V3_EDIT_OP_IDS.connect,
  ASSISTANT_V3_EDIT_OP_IDS.disconnect,
  ASSISTANT_V3_EDIT_OP_IDS.delete,
  ASSISTANT_V3_EDIT_OP_IDS.moveToShot,
  ASSISTANT_V3_EDIT_OP_IDS.reorderShot,
  ASSISTANT_V3_EDIT_OP_IDS.projectScript,
] as const

/**
 * `write` 的三种写法。`edit` = 找句换句：服务端拿卡上全文逐条替换后整段落下，
 * 剧本改一句时镜头提示词不会被整段覆盖（T08）。
 */
export const ASSISTANT_V3_WRITE_MODE_IDS = {
  replace: 'replace',
  append: 'append',
  edit: 'edit',
} as const

export const ASSISTANT_V3_WRITE_MODES = [
  ASSISTANT_V3_WRITE_MODE_IDS.replace,
  ASSISTANT_V3_WRITE_MODE_IDS.append,
  ASSISTANT_V3_WRITE_MODE_IDS.edit,
] as const

export const ASSISTANT_V3_WRITE_FIELD_IDS = {
  prompt: 'prompt',
  text: 'text',
} as const

export const ASSISTANT_V3_WRITE_FIELDS = [
  ASSISTANT_V3_WRITE_FIELD_IDS.prompt,
  ASSISTANT_V3_WRITE_FIELD_IDS.text,
] as const

/**
 * 句柄 = 类型三字母 + 节点 id 里 uuid 的前几位（`img-6db120`）。
 * 撞了就逐位加长，⛔ 不按序号编：序号随卡增删漂移，上一轮说的 c3 下一轮就不是它了。
 */
export const ASSISTANT_V3_HANDLE = {
  minHexChars: 6,
  kindPrefixes: {
    image: 'img',
    video: 'vid',
    text: 'txt',
    audio: 'aud',
  },
  fallbackPrefix: 'card',
} as const

/** 本轮记录（前端原样带回、服务端还原成消息）的条目类型。 */
export const ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS = {
  board: 'board',
  assistant: 'assistant',
  result: 'result',
} as const

export const ASSISTANT_V3_LIMITS = {
  /** 一轮最多几次模型往返（含接力之后的）。 */
  maxSteps: 16,
  maxTranscriptEntries: 96,
  maxTranscriptChars: 400_000,
  maxBoardChars: 160_000,
  maxEntryChars: 60_000,
  maxCallsPerMessage: 8,
  maxCallIdChars: 96,
  maxReadCards: 12,
  maxLookCards: 6,
  /**
   * ⚠ 一条 v3 op 会展开成好几条 v4 op（建卡 + 模型 + 参数 + 提示词），而画布一批
   * 最多 `ASSISTANT_OPERATOR_CANVAS_LIMITS.maxBatchOps` 条 —— 这里限的是 v3 这一侧。
   */
  maxEditOps: 12,
  maxWrites: 8,
  maxWriteEdits: 20,
  maxGenerateCards: 1,
  maxRefChars: 24,
  maxNameChars: 80,
  maxTextChars: 20_000,
  maxQuestionChars: 400,
  maxQuestions: 4,
  maxOptions: 4,
  /** 同一个工具连着被拒几次就收尾（与旧内核同一条：撞墙不再撞第三次）。 */
  maxSameRejections: 2,
  /** 卡片全文在工具结果里最多展开几字，再长让模型用 read。 */
  maxResultCardTextChars: 1_200,
} as const

/** 前端本地开关：`localStorage[key] === 'v3'` 时画布助手请求带上 `kernel: 'v3'`。 */
export const ASSISTANT_V3_KERNEL_STORAGE_KEY = 'antei:assistant-kernel'
export const ASSISTANT_V3_KERNEL_ID = 'v3'
