/**
 * 助手新内核（第 2 步骨架）的词表与上限。
 *
 * ── 和旧内核的关系 ─────────────────────────────────────────────
 * 新内核在旁边从零搭（总设计 /mnt/project-files/assistant-reliability/design.md），只给
 * owner 账号开（请求带 `kernel: next`），别人照走 v3。第 8 步评测全面不差就一次切换，
 * 旧内核（`services/kernel/assistant-v3*`、`assistant-operator*`）整块删。
 * ⚠ 这里沿用的只有「线上协议」：面板认的事件、本轮记录的线格式、过程记录表 —— 面板不用改就能跑。
 */

/**
 * 四个工具（总设计第二节的「看 / 改 / 问你 / 出图」）。名字就是模型看到的工具名，
 * 也是本轮记录里那一列（与 v3 记录的线格式同一张枚举，接力与过程记录照用）。
 */
export const ASSISTANT_NEXT_TOOL_IDS = {
  look: 'look',
  edit: 'edit',
  ask: 'ask',
  generate: 'generate',
} as const

export type AssistantNextTool =
  (typeof ASSISTANT_NEXT_TOOL_IDS)[keyof typeof ASSISTANT_NEXT_TOOL_IDS]

/** 第 2 步先接的两台（10-22 用户定）；别的台照走 v3，第 4 步再接。 */
export const ASSISTANT_NEXT_DOMAINS: readonly string[] = ['image', 'lora']

/** `edit` 一条改动改的是哪一格。一个工具，按台换可用的改法（台上没有的那一格回一句说明）。 */
export const ASSISTANT_NEXT_EDIT_OP_IDS = {
  prompt: 'prompt',
  negative: 'negative',
  model: 'model',
  specs: 'specs',
  count: 'count',
  option: 'option',
  addReference: 'add_reference',
  removeReference: 'remove_reference',
  importUrl: 'import_url',
  people: 'people',
  sceneTexts: 'scene_texts',
  loraWeight: 'lora_weight',
  removeLora: 'remove_lora',
  loraParam: 'lora_param',
} as const

export const ASSISTANT_NEXT_EDIT_OPS = Object.values(
  ASSISTANT_NEXT_EDIT_OP_IDS,
) as [string, ...string[]]

export type AssistantNextEditOp =
  (typeof ASSISTANT_NEXT_EDIT_OP_IDS)[keyof typeof ASSISTANT_NEXT_EDIT_OP_IDS]

/** 写提示词 / 负面词的三种写法：就地换几处、整段写、接在后面。 */
export const ASSISTANT_NEXT_WRITE_MODE_IDS = {
  edit: 'edit',
  replace: 'replace',
  append: 'append',
} as const

export const ASSISTANT_NEXT_WRITE_MODES = Object.values(
  ASSISTANT_NEXT_WRITE_MODE_IDS,
) as [string, ...string[]]

/** LoRA 台参数那几格：`lora_param` 的 key（模型常写的别名也认）→ 执行器那一格。 */
export const ASSISTANT_NEXT_LORA_PARAM_KEYS: Readonly<Record<string, string>> =
  {
    steps: 'steps',
    cfg: 'cfg',
    guidance: 'cfg',
    guidance_scale: 'cfg',
    seed: 'seed',
    width: 'width',
    height: 'height',
    sampler: 'sampler',
    scheduler: 'scheduler',
  }

/** 过程记录里标「这一轮是新内核跑的」（`AssistantTurnRecord.promptVersion`）。改系统提示时一起换。 */
export const ASSISTANT_NEXT_PROMPT_VERSION = 'next-2026-10-22'

export const ASSISTANT_NEXT_LIMITS = {
  /** 带给模型的对话：最近这么多条、这么多字以内（上下文压缩是第 6 步）。 */
  maxHistoryMessages: 40,
  maxHistoryChars: 60_000,
  /** 一次 `look` 最多摆几张；一轮里一共留几张在模型眼前（多出的旧图只剩一行字）。 */
  maxLookPictures: 4,
  maxPicturesInContext: 16,
  /** 一次 `edit` 最多几条改动、一条提示词改动最多几处 find/replace。 */
  maxEditOps: 20,
  maxFindReplace: 30,
  /** 一次模型调用：首个分片前 / 分片间静默多久算卡住（思考分片也算）。卡住原样再问一次。 */
  firstChunkMs: 90_000,
  silenceMs: 90_000,
} as const
