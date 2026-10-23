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
 * 画布默认走 v3（S6）；本地开关写 `v2` 照走旧内核。别的工作台还在旧内核上。
 */

import { ASSISTANT_MEDIA_LIMITS } from '@/constants/assistant'
import { ASSISTANT_MENTION_LIMITS } from '@/constants/assistant-mention'
import {
  LLM_TEXT_DEFAULT_MAX_TOKENS,
  LLM_TEXT_MODEL_IDS,
} from '@/constants/config'

/** v3 已经接上的那几张脸（S6 逐个迁：LoRA → 图片 → 卡片 → 视频）。 */
export const ASSISTANT_V3_FACE_IDS = {
  canvas: 'canvas',
  lora: 'lora',
  image: 'image',
  cards: 'cards',
  video: 'video',
} as const

export type AssistantV3Face =
  (typeof ASSISTANT_V3_FACE_IDS)[keyof typeof ASSISTANT_V3_FACE_IDS]

/** 改动随步落、当场就有结果的那几张脸（一张表单）；画布要前端落完再接力。 */
export const ASSISTANT_V3_BENCH_FACES: readonly string[] = [
  ASSISTANT_V3_FACE_IDS.lora,
  ASSISTANT_V3_FACE_IDS.image,
  ASSISTANT_V3_FACE_IDS.video,
]

/**
 * 本轮记录里的工具名（线格式）。名字就是模型看到的工具名，⛔ 别改成旧内核那套动作名。
 * `upscale` 只在画布那张脸上（P6「修到 4K」走放大，⛔ 不是改分辨率再出一张）。
 * `open` = 开台（第 9e 步）。
 */
export const ASSISTANT_V3_TOOL_IDS = {
  read: 'read',
  look: 'look',
  edit: 'edit',
  write: 'write',
  generate: 'generate',
  upscale: 'upscale',
  open: 'open',
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
  ASSISTANT_V3_TOOL_IDS.upscale,
  ASSISTANT_V3_TOOL_IDS.open,
  ASSISTANT_V3_TOOL_IDS.searchWeb,
  ASSISTANT_V3_TOOL_IDS.searchLibrary,
  ASSISTANT_V3_TOOL_IDS.ask,
] as const

export type AssistantV3Tool = (typeof ASSISTANT_V3_TOOLS)[number]

import { NODE_V4_SUBTYPES_BY_KIND } from '@/constants/node-types'

/**
 * 建卡的「类型」= `kind/subtype`，与板子上印的写法逐字相同（`image/character`）。
 * ⚠ 一个枚举卡死：10-09 回放 GPT 写了 `image/image`，前端整批拒收（旧内核也不校验）。
 */
export const ASSISTANT_V3_CARD_TYPES = Object.entries(
  NODE_V4_SUBTYPES_BY_KIND,
).flatMap(([kind, subtypes]) =>
  subtypes.map((subtype) => `${kind}/${subtype}`),
) as [string, ...string[]]

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
 * LoRA 台（S6 第一张脸）的 `edit`：动的是一张表单，⛔ 没有建卡 / 连线。
 * ⚠ 新挂一把 LoRA 只能摆搭配卡（`propose_setup`）或在库页圈出来（`show_picks`），
 *   挂载由创作者在卡上点（owner 2026-09-29，lora-assistant §13）。
 */
export const ASSISTANT_V3_LORA_EDIT_OP_IDS = {
  setModel: 'set_model',
  setParams: 'set_params',
  setWeight: 'set_weight',
  unmount: 'unmount',
  unmountReference: 'unmount_reference',
  proposeSetup: 'propose_setup',
  showPicks: 'show_picks',
} as const

export const ASSISTANT_V3_LORA_EDIT_OPS = [
  ASSISTANT_V3_LORA_EDIT_OP_IDS.setModel,
  ASSISTANT_V3_LORA_EDIT_OP_IDS.setParams,
  ASSISTANT_V3_LORA_EDIT_OP_IDS.setWeight,
  ASSISTANT_V3_LORA_EDIT_OP_IDS.unmount,
  ASSISTANT_V3_LORA_EDIT_OP_IDS.unmountReference,
  ASSISTANT_V3_LORA_EDIT_OP_IDS.proposeSetup,
  ASSISTANT_V3_LORA_EDIT_OP_IDS.showPicks,
] as const

/** LoRA 台 `write` 写哪一格。 */
export const ASSISTANT_V3_LORA_WRITE_FIELD_IDS = {
  prompt: 'prompt',
  negative: 'negative',
} as const

export const ASSISTANT_V3_LORA_WRITE_FIELDS = [
  ASSISTANT_V3_LORA_WRITE_FIELD_IDS.prompt,
  ASSISTANT_V3_LORA_WRITE_FIELD_IDS.negative,
] as const

/** LoRA 台板子上不随 id 变的那几个名字（`read` / `look` 用）。 */
export const ASSISTANT_V3_LORA_ITEM_IDS = {
  prompt: 'prompt',
  negative: 'negative',
  sample: 'sample',
  referencePrefix: 'ref-',
  loraPrefix: 'lora',
} as const

/** 工作台舞台上最新一批结果的名字前缀（`result-1`，`look` 用）。 */
export const ASSISTANT_V3_RESULT_PREFIX = 'result-'

/** `search_library` 在 LoRA 台多一种：找 LoRA。 */
export const ASSISTANT_V3_LORA_SEARCH_KIND = 'lora'

/** 图片台 `edit` 的几种改法（S6 第二张脸）。 */
export const ASSISTANT_V3_IMAGE_EDIT_OP_IDS = {
  setModel: 'set_model',
  setSpecs: 'set_specs',
  setCount: 'set_count',
  setOption: 'set_option',
  mountReference: 'mount_reference',
  unmountReference: 'unmount_reference',
  importUrl: 'import_url',
  setPeople: 'set_people',
  setSceneTexts: 'set_scene_texts',
  /** 视频台：参考声音（挂给某个角色）、原声开关。 */
  mountAudio: 'mount_audio',
  setSound: 'set_sound',
} as const

/** 视频台 `mount_reference` 落到哪一格（与旧执行器的槽位同名）。 */
export const ASSISTANT_V3_VIDEO_REFERENCE_SLOTS = [
  'reference',
  'first',
  'last',
] as const

/** 卡片台 `edit` 的两种提议（S6 第三张脸）：都出一张卡、停下等创作者勾选，服务端不写库。 */
export const ASSISTANT_V3_CARDS_EDIT_OP_IDS = {
  proposeProfile: 'propose_profile',
  proposeImages: 'propose_images',
} as const

/** 角色设定的五格（与旧内核 `ASSISTANT_OPERATOR_CHARACTER_PROFILE_FIELDS` 同序同名）。 */
export const ASSISTANT_V3_CARDS_PROFILE_PARTS = [
  'look',
  'identity',
  'behavior',
  'speech',
  'backstory',
] as const

/** 卡片台板子上的叫法：角色句柄前缀、打开那位的图。 */
export const ASSISTANT_V3_CARDS_ITEM_IDS = {
  characterPrefix: 'char',
  card: 'card',
} as const

/** `search_library` 联网找图（结果摆在面板上，创作者点「选用」）。每张脸都有。 */
export const ASSISTANT_V3_WEB_IMAGES_SEARCH_KIND = 'web_images'

/**
 * `search_library` 联网找视频（搜索期第二片，附录 I §3.1）：平台的 Google 视频搜索
 * （Serper）+ 中文 / 点名 B站时再问 B站连接器。结果卡摆在回答底下、点开在面板里播，
 * 模型只拿每条一行。每张脸都有。⛔ 不走模型自带联网，⛔ 不花别家的 key。
 */
export const ASSISTANT_V3_WEB_VIDEOS_SEARCH_KIND = 'web_videos'

/**
 * `search_library` 翻记忆（P3 读取）：每轮只有最近记下 / 改过的那几条在系统提示里，剩下的靠它翻。
 * 每张脸都有，工具描述里同一句（⛔ 四份各写一份）。
 */
export const ASSISTANT_V3_MEMORIES_SEARCH_KIND = 'memories'

/**
 * 画布 `read` 的一项 `"guide:<型号 id>"`：那个型号的整份提示词写法（P2 第二片「提示词瘦身」）。
 * 系统提示里每个型号只剩一行提示，长的那几段（视频写法、镜头语法、Seedance 控制规则、标签写法）
 * 用它现取 —— 见 `assistant-v3-guides.service.ts`。
 */
export const ASSISTANT_V3_GUIDE_ITEM_PREFIX = 'guide:'

/**
 * 画布 `read` 的一项 `"lane:<n>"`：那条镜头带上的卡（P2 第二片「板子分级」，设计方案 §2.4）。
 * 大画布上不在眼前的镜头带只印一行（几张卡、叫什么），卡的句柄要用它现取 —— 见
 * `renderAssistantV3Board` 的 `viewLaneNumbers`。
 * - `offscreenNames`：那一行最多列几张卡的名字（再多只写「+k more」）。名字是我加的（P2）：设计
 *   方案只说给计数；列名字是为了让模型把创作者说的「S09」「塔楼」对上是哪一条带（T23：镜头带的
 *   位置号不等于剧本镜号），每张卡只多十来个字。
 */
export const ASSISTANT_V3_LANE_ITEM_PREFIX = 'lane:'
export const ASSISTANT_V3_BOARD_TIERS = {
  offscreenNames: 6,
} as const

/**
 * 整份写法开头那一行的前缀（后接型号 id 与换行）：本轮记录里有它 = 那份写法这一轮已经摆到模型
 * 眼前（写词闸认它），瘦身时也按它留着不瘦（`planAssistantV3TranscriptView`）。
 */
export const ASSISTANT_V3_GUIDE_HEADING = 'PROMPT GUIDE FOR '

/** 联网那两种（每张脸的 `search_library` 都收）。 */
export const ASSISTANT_V3_WEB_SEARCH_KINDS = [
  ASSISTANT_V3_WEB_IMAGES_SEARCH_KIND,
  ASSISTANT_V3_WEB_VIDEOS_SEARCH_KIND,
] as const

export type AssistantV3WebSearchKind =
  (typeof ASSISTANT_V3_WEB_SEARCH_KINDS)[number]

/** `search_library` 的这一种是不是联网那两种之一。 */
export function isAssistantV3WebSearchKind(
  kind: string | null,
): kind is AssistantV3WebSearchKind {
  return (ASSISTANT_V3_WEB_SEARCH_KINDS as readonly (string | null)[]).includes(
    kind,
  )
}

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

/**
 * 系统提示的版本（记进 `AssistantTurnRecord.promptVersion`）：回放一行旧记录时，先看它跑的
 * 是不是现在这一版提示。⚠ 改了 `assistant-v3-prompt.service.ts` 里不变的那几段（规矩、看图、
 * 看片、各张脸的方言段）就把它拨到改的那天（同一天再改一次就加字母：`2026-10-15b`）；人设 /
 * 规矩 / 记忆这些每人不同的段落不算，它们只进 `systemPromptHash`。
 */
export const ASSISTANT_V3_PROMPT_VERSION = '2026-10-16c'

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
  /**
   * 一次调用里本轮记录（除板子以外：模型的话、调用入参、工具结果）最多发多少字；超了按
   * `ASSISTANT_V3_TRANSCRIPT_SLIM` 的次序一级一级瘦下去（`planAssistantV3TranscriptView`）。
   */
  maxTranscriptChars: 400_000,
  maxBoardChars: 160_000,
  maxEntryChars: 60_000,
  maxCallsPerMessage: 8,
  maxCallIdChars: 96,
  /**
   * Gemini 3 每次工具调用附带的思考签名（base64）。⚠ 回放时缺了它，SDK 塞一个占位
   * 签名糊过去，模型就丢了上一步的思考（2026-10-10 五家实测：Gemini 慢且说做不一）。
   */
  maxSignatureChars: 32_000,
  maxReadCards: 12,
  /** ⚠ 看图上限只有一个数（UI / 提示 / 模型一致），住在 `ASSISTANT_MENTION_LIMITS.lookImages`。 */
  maxLookCards: ASSISTANT_MENTION_LIMITS.lookImages,
  /**
   * ⚠ 一条 v3 op 会展开成好几条 v4 op（建卡 + 模型 + 参数 + 提示词），而画布一批
   * 最多 `ASSISTANT_OPERATOR_CANVAS_LIMITS.maxBatchOps` 条 —— 这里限的是 v3 这一侧。
   */
  maxEditOps: 12,
  maxWrites: 8,
  maxWriteEdits: 20,
  maxRefChars: 24,
  maxNameChars: 80,
  maxTextChars: 20_000,
  maxQuestionChars: 400,
  maxQuestions: 4,
  maxOptions: 6,
  /** 同一个工具连着被拒几次就收尾（与旧内核同一条：撞墙不再撞第三次）。 */
  maxSameRejections: 2,
  /** 卡片全文在工具结果里最多展开几字，再长让模型用 read。 */
  maxResultCardTextChars: 1_200,
  /** 英文台词每秒大约说得完几个词（出片前核对台词塞不塞得进这一段）。 */
  dialogueWordsPerSecond: 2.5,
} as const

/**
 * 模型看得见的对白（P2 第三片，设计方案 §2.2「历史压缩」）：创作者这一句之前的对话按「轮」分组
 * （一条 user 起一轮），只发最后几轮 —— **按字数封顶，按块滑**，滑出去的那几轮由后台写成一段
 * 结构化摘要接在系统提示里（`assistant-v3-history.ts` / `assistant-v3-history.service.ts`）。
 *
 * - `maxChars` / `maxMessages`：窗口里对白的总字数与条数上限（条数上限只防一长串一两个字的来回，
 *   也是本轮记录 `ASSISTANT_TURN_RECORD_LIMITS.maxMessages` 的来源）。
 * - `blockTurns`：窗口的起点只落在第 0、8、16…… 轮上（从请求里第一轮数起）：两次滑动之间起点不动，
 *   对白那一段逐字是上一轮的再接两条，缓存吃得到；每轮滑一条的话，历史那一段每轮都整段重算。
 *   最后一块自己就超了上限（几条很长的）才退到逐轮挪；最近那一轮无论多长都留着。
 * - 挪过去的那几轮还没有摘要时（后台那一跳还没回来），**多留一轮**：窗口照上一轮的起点、只多出
 *   新的那一轮；再下一轮摘要还没有就照样滑（那几轮这一轮看不见，后台接着补）。
 * ⚠ 数是我定的（P2），⛔ 不是 owner 定的；`maxChars` 的取法见 `docs/references/assistant-v3.md`。
 */
export const ASSISTANT_V3_HISTORY = {
  maxChars: 20_000,
  maxMessages: 48,
  blockTurns: 8,
  /**
   * 摘要（后台那一跳，这一轮的那一家、那个型号、`low` 档，⛔ 不借别家）：
   * - 四栏（决定 / 偏好 / 没做完的 / 名字与 id）每栏最多 `maxItems` 条、每条 `maxItemChars` 字；
   * - 原料 = 上一份摘要 + 滑出去的那几轮，每条截到 `sourceMessageChars`；整份还超 `sourceChars` 就把
   *   每条平分着再截短（⛔ 整轮丢）。厂商报上下文超了，同一家同一型号重发一次，原料截到
   *   `compactedSourceChars`；
   * - 每段会话存最近 `keep` 份（最新那份管得比窗口起点还远时 —— 两个标签页各聊各的 —— 退回前一份）；
   * - 自己的时限 `timeoutMs`，⛔ 不挂这一轮的 signal。
   */
  summary: {
    maxItems: 8,
    maxItemChars: 240,
    sourceMessageChars: 4_000,
    sourceChars: 40_000,
    compactedSourceChars: 16_000,
    keep: 3,
    timeoutMs: 20_000,
  },
} as const

/**
 * v3 主步一次最多输出多少 token（P2 第二片，设计方案 §2.3「加 `maxOutputTokens`」）。⚠ 这是兜底的
 * 上限，不是花费：只为拦住失控的长输出（模型绕圈），⛔ 不许低到切掉正常的一步 —— 最长的正常输出是
 * 一次 write 写满几段长提示词（`maxTextChars` 2 万字一段）外加思考；回放里最大的一批调用入参才 433
 * 字（T24）。数（64k）是我定的（P2），不是 owner 定的。
 *
 * **只发查得到出处的**（协调者的决定 C，2026-10-15，⛔ 不是 owner 定的：⛔ 拿创作者的主模型冒 400
 * 的险）：`documentedMax` 里登记了官方上限、且上限 ≥ `cap` 的型号，在官方端点上才发；没登记的型号、
 * 代理 / 自建兼容口子 ⛔ 不发（上限各不相同，vLLM 一类「提示 + 上限」超了上下文就 400；与旧内核的
 * `providerManagedOutput` 同一条），由模型自己的上限兜着。Claude 例外：`max_tokens` 必填（代理也一样），
 * 不给时 SDK 自己填，所以 Claude 一律发 `anthropic`（旧内核流式那一档，2026-10-07 生产从 16k 抬上来）。
 * 各家字段：Claude `max_tokens`（思考与正文共用）；OpenAI 官方 Responses `max_output_tokens`（含推理）；
 * Gemini `maxOutputTokens`（含思考，`VIDEO_ANALYSIS_MIN_OUTPUT_TOKENS` 那条坑）；DeepSeek `max_tokens`
 * （含思维链）；Grok ⛔ 不发已弃用的 `max_tokens`，走 `max_completion_tokens`（只管看得见的输出）。
 */
export const ASSISTANT_V3_MAX_OUTPUT_TOKENS = {
  cap: 64_000,
  anthropic: LLM_TEXT_DEFAULT_MAX_TOKENS.ANTHROPIC_STREAM,
  /** 官方文档写的单次输出上限（2026-10-15 读取；出处逐条见下）。改型号表时一并核对这里。 */
  documentedMax: {
    // https://platform.claude.com/docs/en/about-claude/models/overview —「Max output 128K tokens」（四个都是）
    [LLM_TEXT_MODEL_IDS.CLAUDE_OPUS_5_5]: 128_000,
    [LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5]: 128_000,
    [LLM_TEXT_MODEL_IDS.CLAUDE_FABLE_5_1]: 128_000,
    [LLM_TEXT_MODEL_IDS.CLAUDE_HAIKU_5_5]: 128_000,
    // https://developers.openai.com/api/docs/models/gpt-6.1-sol（/gpt-6-astra、/gpt-6-luna）—「128,000 max output tokens」
    [LLM_TEXT_MODEL_IDS.OPENAI_GPT_6_1_SOL]: 128_000,
    [LLM_TEXT_MODEL_IDS.OPENAI_GPT_6_ASTRA]: 128_000,
    [LLM_TEXT_MODEL_IDS.OPENAI_GPT_6_LUNA]: 128_000,
    // https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash —「Output token limit 65,536」
    [LLM_TEXT_MODEL_IDS.GEMINI_3_8_FLASH]: 65_536,
    // https://api-docs.deepseek.com/quick_start/pricing —「MAX OUTPUT MAXIMUM: 384K」（两个型号同一栏；
    // deepseek-flash 的 384K 仓库里也有：`LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH` 注释、providers.md）
    [LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH]: 384_000,
    [LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO]: 384_000,
    // https://docs.x.ai/developers/rest-api-reference/inference/chat-completions —
    //「max_completion_tokens … Defaults to 128,000 when unset; set a larger value to allow longer
    // generations」；https://docs.x.ai/developers/grok-4-7 —「No text output limit」
    [LLM_TEXT_MODEL_IDS.XAI_GROK_4_7]: 128_000,
  } satisfies Readonly<Record<string, number>>,
} as const

/**
 * 这个型号在官方端点上发不发输出上限：官方上限登记过、且 ≥ `cap` → `cap`；否则 `undefined`（不发）。
 * ⚠ 只管「官方端点」这一半：是不是官方端点由调用方判（`assistant-v3-model.service.ts`）。
 */
export function assistantV3VerifiedOutputCap(
  modelId: string,
): number | undefined {
  const table: Readonly<Record<string, number>> =
    ASSISTANT_V3_MAX_OUTPUT_TOKENS.documentedMax
  const documented = Object.hasOwn(table, modelId) ? table[modelId] : undefined
  return documented !== undefined &&
    documented >= ASSISTANT_V3_MAX_OUTPUT_TOKENS.cap
    ? ASSISTANT_V3_MAX_OUTPUT_TOKENS.cap
    : undefined
}

/**
 * 摆到模型眼前的图（看图、看片的帧）只收这三种 —— 五家都收。⚠ GIF 不收：Gemini 只认
 * PNG / JPEG / WEBP / HEIC，附一张 GIF 整步 400。⛔ SVG 不收（能带脚本）。格式按文件头判。
 */
export const ASSISTANT_V3_PICTURE_FORMATS: ReadonlySet<string> = new Set([
  'jpeg',
  'png',
  'webp',
])

/**
 * 图自带的配方（「反推读原配方」小期，owner 2026-10-16 选瘦身版）：代码只把文件里的文字取出来、
 * 压小，怎么读交给模型。几个数管的是 token：
 * - `maxPictureChars`：一张图的配方最多几个字（A1111 / NovelAI 一段一两千字，压过的 ComfyUI
 *   工作流三四千字）。
 * - `maxTurnChars`：板子上那几张（最多 `maxLookCards` 张）合起来最多几个字 —— 板子每一跳都发。
 * - `maxValueChars`：一格文字（一段提示词、一个参数）最多几个字。
 * - `maxInflatedBytes`：一个压缩文本块最多解压出多少字节（防解压炸弹）。
 */
export const ASSISTANT_V3_RECIPE_LIMITS = {
  maxPictureChars: 6_000,
  maxTurnChars: 15_000,
  maxValueChars: 2_000,
  maxInflatedBytes: 2_000_000,
} as const

/**
 * Denia 自己看片（看图期第二段，owner 2026-10-15）的几个数。帧数规则本身住在
 * `VIDEO_CLIP_FRAME_PLAN`（`constants/video-analysis.ts`），客户端与服务端共用。
 *
 * - `maxClips: 2`：一轮最多看几段**被指着**的片子（@ / 📎，按这个顺序取前两段），这几段
 *   整轮摆在模型眼前。每段最多 8 帧，两段 = 16 张图，已经是 `lookImages`（6）的两倍多；
 *   再多就该让创作者挑了。超出的那几段**不静默丢**：浏览器留一条系统行说没看。
 * - `maxMountedClips: 3`：视频台上**只是挂着**的参考视频（`video-N`）随请求带几段帧。它们
 *   ⛔ 不在模型眼前（不花 token，只占请求体），模型 `look` 它时才摆上去、只给下一步 ——
 *   与挂着的参考图同一个待遇（owner 2026-10-15「挂着不等于每轮都看」）。3 = 视频台上多数
 *   型号收参考视频的格数。
 * - `carriedFramesMaxChars`：一个请求里所有片子的帧（`dataUrl` 字数之和）最多带多少。被指着的
 *   两段先占、⛔ 不为它让位；挂着的那几段按顺序往里填，放不下的那段整段不带（`look` 它时别家
 *   如实说看不了）。⚠ Vercel 函数请求体上限 4.5MB：帧占到 2.5MB 为止，给对话、快照与本轮
 *   记录留 2MB。实际一帧（768px webp 0.8）约 30–60KB、base64 后 40–80KB，一段 8 帧约
 *   0.3–0.65MB，所以通常两段被指着的 + 两三段挂着的都放得下。
 * - `frameMaxEdgePixels: 768`：抽帧长边。⚠ 帧随请求体上来，而 Vercel 函数请求体
 *   上限 4.5MB —— 16 帧 × 约 100KB webp × base64 1.33 ≈ 2.1MB，留出余量给对话与
 *   本轮记录。比视频分析面板的 1024 小，是这条上限逼的，不是画质取舍。
 * - `inlineMaxBytes`：Gemini 直接收片子本体（`native` 档）的单段上限，复用
 *   `ASSISTANT_MEDIA_LIMITS.geminiInlineMaxBytes`（20MB）。两段 base64 后约 53MB，
 *   仍在 Gemini 单次请求 100MB 的内联上限里。超出就改用帧；没有帧（没被指着）
 *   就如实说「片子太大，请 @ 它」。
 */
export const ASSISTANT_V3_CLIP_LIMITS = {
  maxClips: 2,
  maxMountedClips: 3,
  carriedFramesMaxChars: 2_500_000,
  frameMaxEdgePixels: 768,
  inlineMaxBytes: ASSISTANT_MEDIA_LIMITS.geminiInlineMaxBytes,
} as const
