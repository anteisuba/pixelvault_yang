/**
 * 反问卡的形状上限。
 *
 * ⚠ 这四个数**不是新拍的** —— 逐个等于 `SCRIPT_DOC_LIMITS` 里画布剧本线用了一个
 * 多月的同名上限（`maxClarifyQuestions` 4 / `maxClarifyOptions` 6 /
 * `idMaxLength` 80 / 当时的 `fieldMaxLength` 700）。上收到这里是因为反问卡从
 * 「只有 ScriptDoc 起草时才有」变成了四个域共用，**不是因为要重新定义它们**。
 * 改这里等于同时改画布那条路，两边故意共命运。
 * ⚠ 2026-09-27 剧本正文字段放开（`SCRIPT_DOC_LIMITS.textMaxLength`），反问卡的
 * 700 没跟着放：它限的是助手问题与选项的字，不是创作者写的剧本。
 */
export const ASSISTANT_CLARIFY_LIMITS = {
  maxQuestions: 4,
  maxOptions: 6,
  idMaxLength: 80,
  textMaxLength: 700,
} as const

/**
 * 模型漏写 id 时，反问块按位置补出来的前缀（`q-1` / `o-1`）。
 *
 * ⚠ **id 在这条协议里是纯记账字段**：控件只拿它当 React key 和答案表的键，
 * 不回传给模型、不进任何提示词。所以「模型没写」和「我们按位置编一个」对用户
 * 是同一件事，而「整块反问降级成一行灰字」不是 —— 2026-08-21 真机那轮丢的就是
 * 两个问题六个选项。归一化在 `types/assistant-protocol.ts` 的 `[[ask]]` 块上做，
 * ⛔ 别下沉到 `AssistantClarifyingQuestionSchema`：那张 schema 是和画布 ScriptDoc
 * 共用的，服务端那条路要的是严格校验。
 */
export const ASSISTANT_CLARIFY_FALLBACK_ID_PREFIXES = {
  question: 'q-',
  option: 'o-',
} as const

/**
 * `[[lora]]` 推荐块的形状上限。
 *
 * `maxPicks` 3：推荐卡是要用户**一次确认**的东西，一次给六张卡等于把选择成本
 * 原样退回去。三张已经能覆盖「稳妥/激进/另一种画风」。
 */
export const ASSISTANT_LORA_PICK_LIMITS = {
  maxPicks: 3,
  /** `candidateId` 的长度上限 —— 与 `LoraCandidate.candidateId` 的构造宽度一致。 */
  candidateIdMaxLength: 200,
  reasonMaxLength: 300,
  /** 建议权重的取值范围。收窄在客户端做，这里只挡明显离谱的值。 */
  minWeight: 0.1,
  maxWeight: 2,
} as const

export const ASSISTANT_PROTOCOL_DOMAIN_IDS = {
  image: 'image',
  video: 'video',
  lora: 'lora',
  canvas: 'canvas',
  /** 卡片助手（第五张脸，owner 09-26）：角色页上查设定、写设定、查图；⛔ 自己不出图。 */
  cards: 'cards',
  /** 配音台（第 9b 步，owner 10-23）：只走新内核，旧内核不认。 */
  audio: 'audio',
} as const

/**
 * 学出来的创作偏好（`UserCreativePreference`）**只由图片生成的行为喂**，所以只在出图的
 * 三台注入 —— 视频与角色页不带（owner 2026-10-04）。
 */
export const ASSISTANT_CREATIVE_PREFERENCE_DOMAINS: ReadonlySet<string> =
  new Set([
    ASSISTANT_PROTOCOL_DOMAIN_IDS.image,
    ASSISTANT_PROTOCOL_DOMAIN_IDS.lora,
    ASSISTANT_PROTOCOL_DOMAIN_IDS.canvas,
  ])

export const ASSISTANT_PROTOCOL_DOMAINS = [
  ASSISTANT_PROTOCOL_DOMAIN_IDS.image,
  ASSISTANT_PROTOCOL_DOMAIN_IDS.video,
  ASSISTANT_PROTOCOL_DOMAIN_IDS.lora,
  ASSISTANT_PROTOCOL_DOMAIN_IDS.canvas,
  ASSISTANT_PROTOCOL_DOMAIN_IDS.cards,
  ASSISTANT_PROTOCOL_DOMAIN_IDS.audio,
] as const

export type AssistantProtocolDomain =
  (typeof ASSISTANT_PROTOCOL_DOMAINS)[number]

export const ASSISTANT_WORKSPACES = [
  'image-natural',
  'image-tags',
  'video',
  'lora',
  'canvas',
  'cards',
  'audio',
] as const

interface AssistantDomainBrief {
  /** 这个域的助手是谁 —— 系统提示词第 ② 段。 */
  persona: string
  /**
   * 收敛前必须问清的槽位，**按重要性排** —— 第 ③ 段。
   * 档位判定（见 `ASSISTANT_CONVERSATION_PROTOCOL`）数的就是这张表里还空着几项。
   */
  slots: readonly string[]
}

/**
 * ⚠ 这张表是 2026-08-08 拟的初稿，**不是从任何真机观察来的**，是四个域里最该被
 * owner 和真实使用推翻的东西。改它不需要动任何代码结构。
 */
export const ASSISTANT_DOMAIN_BRIEFS: Record<
  AssistantProtocolDomain,
  AssistantDomainBrief
> = {
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.image]: {
    persona:
      "You are the creator's partner for still-image work: you help decide what the picture IS before helping write how to ask for it.",
    slots: [
      'the subject — who or what is in frame',
      'the style family — photoreal / anime / 3D / illustration / painterly',
      'framing and camera — shot size, angle, lens feel',
      'light and palette — time of day, key light, colour mood',
      'where it will be used — this decides aspect ratio and resolution',
    ],
  },
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.video]: {
    persona:
      "You are the creator's partner for moving image: a clip is a shot with time in it, so pacing and what moves matter more than a pretty still.",
    slots: [
      'one shot or a sequence, and roughly how long',
      'what actually moves — the subject, the camera, or both',
      'where the first frame comes from — a generated still, an upload, or nothing',
      'whether it needs sound (dialogue, ambience, music)',
      'the consistency anchor — which character or place must stay identical across shots',
    ],
  },
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.lora]: {
    persona:
      'You are a LoRA-aware prompt partner. A mounted LoRA already owns part of the image; your job is to help the creator decide which part they are changing.',
    slots: [
      'the base-model family — SDXL / Illustrious / Pony / Anima',
      'what identity the mounted LoRA already owns (face, hair, body) — do not rewrite it',
      'the variable layer being changed this time — outfit, scene, lighting, pose',
      'which trigger words must survive verbatim',
      'what belongs in the negative prompt versus simply being left unsaid',
    ],
  },
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.canvas]: {
    persona:
      'You are the canvas partner: you think in nodes and edges, and you plan a chain before anyone spends a credit on it.',
    slots: [
      'what the chain ultimately produces — stills, a clip, voice, or a cut sequence',
      'how many characters, and whether any already exist on the canvas',
      'how many shots',
      'where the reference material comes from — canvas nodes, the asset library, or an upload',
      'whether it needs voice',
    ],
  },
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.cards]: {
    persona:
      "You are the creator's character partner on the Characters page. A character is used three ways — generating images, writing scripts and storyboards, and speaking as the assistant — so you help pin down who they are (identity, how they behave, how they talk, their history) and which images really show them. You never generate images yourself; when a new image is needed you say so and hand it to the image assistant.",
    slots: [
      'which character — an existing one on this page, or a new one',
      'canon or original — canon is researched with sources, an original starts from two or three directions',
      'what this turn is for — the profile (identity, behaviour, speech, history) or the images',
      'for canon: which version or form of the character, if the series has several',
    ],
  },
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.audio]: {
    persona:
      "You are the creator's voice partner on the audio bench: speech, sound effects and music. You tune the words, the voice and how they are read, then put a confirm card in front of the creator.",
    slots: [
      'speech, a sound effect, or music',
      'the exact words to be read (speech) or what it should sound like (sfx / music)',
      'whose voice — a voice from their library or a character with a voice',
      'how it is read — mood, pace, pauses',
      'how long (sfx / music)',
    ],
  },
}
