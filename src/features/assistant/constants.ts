import type { AssistantWorkspace } from '@/types/assistant-workspace'

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
  /** 开台（第 9e 步，owner 10-23）：打开别的台，这一轮在那边接着做。 */
  open: 'open',
} as const

export type AssistantNextTool =
  (typeof ASSISTANT_NEXT_TOOL_IDS)[keyof typeof ASSISTANT_NEXT_TOOL_IDS]

/**
 * 开台能开的台（模型看到的名字）→ 工作区（第 9e 步）。⚠ 只有生成与角色那几页；素材 / 提示词页
 * 还没有给助手读的台面，第 9f 步搬进 /library 时再接。
 */
export const ASSISTANT_NEXT_OPEN_BENCH_WORKSPACES = {
  image: 'image-natural',
  tags: 'image-tags',
  video: 'video',
  // ⚠ 没有配音间：配音间单独做、助手不负责（owner 10-23）。
  lora: 'lora',
  canvas: 'canvas',
  // ⚠ 没有角色页（10-26）：角色页进了库，库里的页面不当宿主，开过去永远「没到」；
  //   角色的设定与造型用 edit 的库改法在哪个台都能改。
} as const satisfies Record<string, AssistantWorkspace>

export type AssistantNextOpenBench =
  keyof typeof ASSISTANT_NEXT_OPEN_BENCH_WORKSPACES

/**
 * `open` 的另一支：不换台，在库里翻给创作者看（owner 10-28「就地翻给你看」）。
 * 键是给模型的名字，值是库（`STUDIO_LIBRARY_CATEGORY_IDS`）。
 */
export const ASSISTANT_NEXT_OPEN_LIBRARIES = {
  assets: 'assets',
  characters: 'cards',
  prompts: 'prompts',
  loras: 'lora',
} as const

export type AssistantNextOpenLibrary =
  keyof typeof ASSISTANT_NEXT_OPEN_LIBRARIES

export const ASSISTANT_NEXT_OPEN_LIBRARY_NAMES = Object.keys(
  ASSISTANT_NEXT_OPEN_LIBRARIES,
) as [AssistantNextOpenLibrary, ...AssistantNextOpenLibrary[]]

/** `open` 的 `bench` 填它 = 走库那一支。 */
export const ASSISTANT_NEXT_OPEN_LIBRARY_BENCH = 'library'

export const ASSISTANT_NEXT_OPEN_BENCHES = [
  ...(Object.keys(ASSISTANT_NEXT_OPEN_BENCH_WORKSPACES) as [
    AssistantNextOpenBench,
    ...AssistantNextOpenBench[],
  ]),
  ASSISTANT_NEXT_OPEN_LIBRARY_BENCH,
] as const

/** 开画布开哪一块：默认最近那块，创作者说「新的」才新建（owner 10-23）。 */
export const ASSISTANT_NEXT_OPEN_CANVAS = ['recent', 'new'] as const

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
  /** 角色页：两种提议（出一张卡，创作者勾选）。直接写进库见下面「改库」那几种。 */
  proposeProfile: 'propose_profile',
  proposeImages: 'propose_images',
  /** 套用某张图的配方（第 4 步，10-23 从第 3 步移来）。 */
  applyRecipe: 'apply_recipe',
  /**
   * 画布（第 9a 步）：加卡、改卡、连线、断线、删卡、挪进镜头、调镜头顺序、投剧本。写卡上的提示词用
   * `prompt`（带 card）。这几种合成一批交给浏览器落，落完再接着跑（与 v3 同一条通道）。
   */
  addCard: 'add_card',
  setCard: 'set_card',
  connect: 'connect',
  disconnect: 'disconnect',
  deleteCard: 'delete_card',
  moveToShot: 'move_to_shot',
  reorderShot: 'reorder_shot',
  projectScript: 'project_script',
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
  /**
   * 记忆（第 6 步，owner 10-23）：记下一条新的、按编号改一条、忘掉一条（value false）。
   * 默认进「关于你」（各处都用）；给了角色就进那个角色自己那份。带撤销，任何台都能用。
   */
  remember: 'remember',
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
export const ASSISTANT_NEXT_PROMPT_VERSION = 'next-2026-10-30-screen'

export const ASSISTANT_NEXT_LIMITS = {
  /**
   * 带给模型的之前几轮（第 6 步）：最近这么多条、这么多字以内，起点按 `historyBlockTurns` 轮一块滑
   * （两次滑动之间逐字不变，缓存吃得到）。滑出去的那几轮由后台写成摘要接在系统提示里
   * （v3 那一套，`lib/assistant-v3-history`）—— 平常几轮的对话碰不到这条线，一次都不写。
   */
  maxHistoryMessages: 40,
  maxHistoryChars: 60_000,
  historyBlockTurns: 8,
  /**
   * 一轮里清旧工具结果（第 6 步，先清、不花钱）：还没清过的工具结果加起来超过 `clearToolResultsChars`
   * 字，就把最近 `keepToolSteps` 步之前、长于 `clearableResultChars` 的那些换成一行（要细节再查一次）。
   * 一次清到底，之后前缀不再动，缓存照样吃得到。
   */
  clearToolResultsChars: 80_000,
  keepToolSteps: 3,
  clearableResultChars: 600,
  /** 系统提示里「记得的事」带几条（固定一组，最近记下 / 改过的在前）；其余靠 find 翻。 */
  maxMemoriesInPrompt: 12,
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
  voices: 'voices',
  /** 外面的库（10-25 打通）：Danbooru 标签（含她的标签收藏）、Civitai LoRA 大库。⚠ 要点名才查。 */
  tags: 'tags',
  loraLibrary: 'lora_library',
  /**
   * 联网找图 / 找视频（10-27 owner：「去网上找的图片和视频也无法发给我」）：走旧执行器的
   * `search_web_images` / `search_web_videos`，结果卡摆在回答底下，号 `#n` 进本轮记录。⚠ 点名才查。
   */
  webImages: 'web_images',
  webVideos: 'web_videos',
} as const

export const ASSISTANT_NEXT_FIND_KINDS = Object.values(
  ASSISTANT_NEXT_FIND_KIND_IDS,
) as [string, ...string[]]

/** find 不点名时查的那几类：她自己的东西。外面的库（标签、LoRA 大库）每次都要联网，点名才查。 */
export const ASSISTANT_NEXT_FIND_DEFAULT_KINDS = [
  ASSISTANT_NEXT_FIND_KIND_IDS.pictures,
  ASSISTANT_NEXT_FIND_KIND_IDS.characters,
  ASSISTANT_NEXT_FIND_KIND_IDS.loras,
  ASSISTANT_NEXT_FIND_KIND_IDS.prompts,
  ASSISTANT_NEXT_FIND_KIND_IDS.conversations,
  ASSISTANT_NEXT_FIND_KIND_IDS.memories,
  ASSISTANT_NEXT_FIND_KIND_IDS.voices,
] as const

export type AssistantNextFindKind =
  (typeof ASSISTANT_NEXT_FIND_KIND_IDS)[keyof typeof ASSISTANT_NEXT_FIND_KIND_IDS]

/** 编号前缀。图的编号沿用库里的每人递增序号（`图_1624`，与 @ 选择器同一套）。 */
export const ASSISTANT_NEXT_HANDLE_PREFIXES = {
  character: '角色·',
  lora: 'LoRA·',
  prompt: '提示词·',
  conversation: '对话·',
  memory: '记忆·',
  /** Danbooru 标签（10-25）：`look 标签·watercolor_(medium)` 读帖子数、简介、常一起出现的标签与样图。 */
  tag: '标签·',
  voice: '音色·',
  /** 内置技能（第 7a 步）：`look 技能·名字` 读全文。 */
  skill: '技能·',
  /** 画廊里的公开图（10-30，谁的都算）：`画廊·<generationId>`，看图连同配方。 */
  gallery: '画廊·',
  /** 酒馆库里的 chub 公开卡（10-30）：只认得名字，⛔ look 打不开。 */
  tavern: '酒馆卡·',
  settings: '设置',
  /** 「看屏」（10-30）：`look 屏幕` = 你眼前那一屏拼成的一张带编号小样图。 */
  screen: '屏幕',
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
  /** 在内存里筛的列表最多取多少条（角色、LoRA、提示词）。⚠ 比她库里的多：截掉的那些永远查不到。 */
  listScan: 1_000,
  /** 查词拆成几个词（任意一个命中就算，按命中多少排）。 */
  maxQueryWords: 12,
  /** 标签：一个查词按逗号拆成几段分别查（每段一次联网）。 */
  maxTagPhrases: 3,
} as const
