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
 * 工具（总设计第二节的「查 / 看 / 改 / 问你 / 出图」）。名字就是模型看到的工具名，
 * 也是本轮记录里那一列（与 v3 记录的线格式同一张枚举，接力与过程记录照用）。
 */
export const ASSISTANT_NEXT_TOOL_IDS = {
  find: 'find',
  look: 'look',
  edit: 'edit',
  ask: 'ask',
  generate: 'generate',
} as const

export type AssistantNextTool =
  (typeof ASSISTANT_NEXT_TOOL_IDS)[keyof typeof ASSISTANT_NEXT_TOOL_IDS]

/**
 * 新内核接哪几台（只给 owner）。第 2 步先接图片台、LoRA 台；第 4 步（10-23）接视频台、角色页。
 * 别的台照走 v3。配音台没有助手，第 9 步随外壳一起接（owner 10-23）。
 */
export const ASSISTANT_NEXT_DOMAINS: readonly string[] = [
  'image',
  'lora',
  'video',
  'cards',
]

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
  /** LoRA 台：直接挂一把（owner 10-22「助手可直接挂 LoRA 并挑权重」）。 */
  addLora: 'add_lora',
  /** 视频台：参考声音、原声开关。 */
  addAudio: 'add_audio',
  sound: 'sound',
  /** 角色页：三种提议（出一张卡，创作者勾选）。直接写进库见下面「改库」那几种。 */
  proposeProfile: 'propose_profile',
  proposeImages: 'propose_images',
  handOff: 'hand_off',
  /** 套用某张图的配方（第 4 步，10-23 从第 3 步移来）。 */
  applyRecipe: 'apply_recipe',
  /**
   * 改库（第 4b 步，owner 10-23「库改动直接写，过程行带撤销；删和公开不做」）：任何台上都能用。
   * 素材那五种走旧执行器现成的那几条，角色 / 造型 / LoRA / 提示词库走 `library_write`。
   */
  tagPictures: 'tag_pictures',
  favoritePictures: 'favorite_pictures',
  newFolder: 'new_folder',
  putInFolder: 'put_in_folder',
  verdict: 'verdict',
  characterProfile: 'character_profile',
  newCharacter: 'new_character',
  characterLook: 'character_look',
  newCharacterLook: 'new_character_look',
  loraToCharacter: 'lora_to_character',
  favoriteLora: 'favorite_lora',
  loraCover: 'lora_cover',
  savePrompt: 'save_prompt',
  updatePrompt: 'update_prompt',
  /**
   * 改设置（第 4c 步，owner 10-23）：渠道开关与名字、助手设置一格、搜图来源名单。同样任何台都能用、带撤销。
   * ⛔ key 不读不写；⛔ 浏览器里那几项偏好不做。
   */
  modelChannel: 'model_channel',
  assistantSetting: 'assistant_setting',
  searchSource: 'search_source',
} as const

export const ASSISTANT_NEXT_EDIT_OPS = Object.values(
  ASSISTANT_NEXT_EDIT_OP_IDS,
) as [string, ...string[]]

export type AssistantNextEditOp =
  (typeof ASSISTANT_NEXT_EDIT_OP_IDS)[keyof typeof ASSISTANT_NEXT_EDIT_OP_IDS]

/** `apply_recipe` 能挑着套的几部分（不给 = 能套的都套）。 */
export const ASSISTANT_NEXT_RECIPE_PART_IDS = {
  prompt: 'prompt',
  negative: 'negative',
  model: 'model',
  specs: 'specs',
  options: 'options',
  references: 'references',
  loras: 'loras',
} as const

export const ASSISTANT_NEXT_RECIPE_PARTS = Object.values(
  ASSISTANT_NEXT_RECIPE_PART_IDS,
) as [string, ...string[]]

export type AssistantNextRecipePart =
  (typeof ASSISTANT_NEXT_RECIPE_PART_IDS)[keyof typeof ASSISTANT_NEXT_RECIPE_PART_IDS]

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
    guidancescale: 'cfg',
    seed: 'seed',
    width: 'width',
    height: 'height',
    sampler: 'sampler',
    scheduler: 'scheduler',
  }

/** 过程记录里标「这一轮是新内核跑的」（`AssistantTurnRecord.promptVersion`）。改系统提示时一起换。 */
export const ASSISTANT_NEXT_PROMPT_VERSION = 'next-2026-10-23d'

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

/**
 * 工作区里能查、能按编号打开的几类东西（第 3 步，10-23 用户定）。编号只给模型用，界面上
 * 显示缩略图（第 9 步）。⭐ 每类一个人能读的编号前缀，模型拿编号去 look / edit。
 */
export const ASSISTANT_NEXT_FIND_KIND_IDS = {
  pictures: 'pictures',
  characters: 'characters',
  loras: 'loras',
  prompts: 'prompts',
  conversations: 'conversations',
  memories: 'memories',
} as const

export const ASSISTANT_NEXT_FIND_KINDS = Object.values(
  ASSISTANT_NEXT_FIND_KIND_IDS,
) as [string, ...string[]]

export type AssistantNextFindKind =
  (typeof ASSISTANT_NEXT_FIND_KIND_IDS)[keyof typeof ASSISTANT_NEXT_FIND_KIND_IDS]

/** 编号前缀。图的编号沿用库里的每人递增序号（`图_1624`，与 @ 选择器同一套）。 */
export const ASSISTANT_NEXT_HANDLE_PREFIXES = {
  character: '角色·',
  lora: 'LoRA·',
  prompt: '提示词·',
  conversation: '对话·',
  settings: '设置',
} as const

export const ASSISTANT_NEXT_FIND_LIMITS = {
  /** 每类最多回几条。 */
  perKind: 8,
  /** 查词最长。 */
  maxQueryChars: 120,
  /** 一行摘要里提示词留几个字。 */
  promptPreviewChars: 90,
  /** 对话命中那一句前后各留几个字。 */
  snippetChars: 80,
  /** 打开一段对话时最多读多少字（从最近往前）。 */
  conversationChars: 6_000,
  /** 打开一段对话 / 一个角色时最多读几张代表图。 */
  pictures: 3,
  /** 在内存里筛的列表最多取多少条（角色、LoRA、提示词）。 */
  listScan: 100,
} as const
