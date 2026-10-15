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

export const ASSISTANT_V3_FACES: readonly string[] = [
  ASSISTANT_V3_FACE_IDS.canvas,
  ASSISTANT_V3_FACE_IDS.lora,
  ASSISTANT_V3_FACE_IDS.image,
  ASSISTANT_V3_FACE_IDS.cards,
  ASSISTANT_V3_FACE_IDS.video,
]

/** 改动随步落、当场就有结果的那几张脸（一张表单）；画布要前端落完再接力。 */
export const ASSISTANT_V3_BENCH_FACES: readonly string[] = [
  ASSISTANT_V3_FACE_IDS.lora,
  ASSISTANT_V3_FACE_IDS.image,
  ASSISTANT_V3_FACE_IDS.video,
]

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

/**
 * `ask` 的工具描述 —— 五张脸**同一句**（2026-10-14 反问卡多选）。
 * ⚠ 从前四份工具表各抄一句，且一字没提多选：OpenAI 严格模式下 `multiSelect` 必填，
 *   模型只能猜，于是永远填 `false`。何时多选的细则在系统提示的 ASKING 段。
 */
export const ASSISTANT_V3_ASK_TOOL_DESCRIPTION =
  'Ask the creator when you cannot go on without their choice. Every option needs a one-line description of what it means. Set multiSelect when several options can apply together; give image a picture handle when the choice is between pictures.'

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

/** 卡片台 `edit` 的三种提议（S6 第三张脸）：都出一张卡、停下等创作者勾选，服务端不写库。 */
export const ASSISTANT_V3_CARDS_EDIT_OP_IDS = {
  proposeProfile: 'propose_profile',
  proposeImages: 'propose_images',
  handOff: 'hand_off',
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

/** `search_library` 在图片台多一种：联网找图（结果摆在面板上，创作者点「选用」）。 */
export const ASSISTANT_V3_WEB_IMAGES_SEARCH_KIND = 'web_images'

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
 * 看片、各张脸的方言段）就把它拨到改的那天；人设 / 规矩 / 记忆这些每人不同的段落不算，它们只
 * 进 `systemPromptHash`。
 */
export const ASSISTANT_V3_PROMPT_VERSION = '2026-10-15'

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
 * 摆到模型眼前的图（看图、看片的帧）只收这三种 —— 五家都收。⚠ GIF 不收：Gemini 只认
 * PNG / JPEG / WEBP / HEIC，附一张 GIF 整步 400。⛔ SVG 不收（能带脚本）。格式按文件头判。
 */
export const ASSISTANT_V3_PICTURE_FORMATS: ReadonlySet<string> = new Set([
  'jpeg',
  'png',
  'webp',
])

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

/**
 * 新内核单次模型调用的超时（`assistant-v3.service.ts`）。
 *
 * ⭐ 从前主调用只有 270 秒硬线：模型卡住时用户干等约 4.5 分钟才看到「提供商超时」。
 * - `firstChunkMs`：发出请求后多久一个分片都没回（含思考分片）就放弃这一次；
 * - `chunkMs`：两个分片之间最长的静默；
 * - `stepMs`：这一次调用的总时长。
 * 超时会原样重试一次（`retries`），第二次还超时才报错。⚠ 两次加起来要留在硬线内。
 */
export const ASSISTANT_V3_CALL_TIMEOUT = {
  firstChunkMs: 60_000,
  chunkMs: 60_000,
  stepMs: 120_000,
  retries: 1,
} as const

/**
 * 五张脸默认走 v3（S6，owner 2026-10-09）。前端本地开关写 `v2` 时照走旧内核 ——
 * 只为对比，删旧内核时一起删。⚠ **只有 owner 认**（服务端 `isAdmin`，owner 2026-10-15）：
 * 别人的浏览器里写了 `v2`，服务端照走 v3。
 * ⚠ `v3` 还收着：开关切换前打开的页面仍会发它。
 */
export const ASSISTANT_KERNEL_STORAGE_KEY = 'antei:assistant-kernel'
export const ASSISTANT_KERNEL_IDS = {
  v2: 'v2',
  v3: 'v3',
} as const
export const ASSISTANT_KERNELS = [
  ASSISTANT_KERNEL_IDS.v2,
  ASSISTANT_KERNEL_IDS.v3,
] as const
