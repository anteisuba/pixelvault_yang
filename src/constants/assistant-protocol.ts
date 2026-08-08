/**
 * 助手的对话协议（A2，`docs/plans/assistant-ab-design-2026-08-08.md` §1）。
 *
 * ── 这个文件为什么存在 ─────────────────────────────────────────────
 * owner：「回复的内容应该更有对话的感觉，需要和 AI 讨论然后再出方案和结果，
 * **不应该直接出提示词的结果**。」
 *
 * 改之前 `buildAssistantSystemPrompt` 三个域的差别**只有一个名词短语**，其余规则
 * 逐字相同；而且规则里只写了「被要求时怎么给提示词」，**没有任何一条写「什么时候
 * 不该给」**。模型的默认行为因此就是每轮都给一版。
 *
 * 所以这里装两样东西，都是「域知识」而不是「措辞」：
 *   ① `ASSISTANT_DOMAIN_BRIEFS` —— 每个域**收敛前必须问清什么**。泛泛一句
 *      「Ask focused questions when intent is unclear」对图片助手和视频助手是
 *      完全不同的清单，模型没有理由自己猜对。
 *   ② `ASSISTANT_CONVERSATION_PROTOCOL` —— 三档行为写成规则，不靠模型自觉。
 *
 * ⚠ **档 1 与档 3 之间必须隔着一次用户动作**。这不是「少出一点提示词」，是结构上
 * 不允许在第一轮出 —— 那句诉求的可执行形态就是这一条。
 */

/**
 * 正文里的标记名（不含方括号）。抽取引擎见 `lib/assistant-marker-block.ts`，
 * 它与 `[[canvas-ops]]` 共用同一套流式安全规则。
 */
export const ASSISTANT_PROTOCOL_MARKER_IDS = {
  /** 结构化反问：助手需要方向时，给选项而不是一段追问散文。 */
  ask: 'ask',
  /** 收敛选项：每轮结尾的「✅ 满意 → 下一步 / 🔄 需要调整」。 */
  next: 'next',
} as const

/**
 * 反问卡的形状上限。
 *
 * ⚠ 这四个数**不是新拍的** —— 逐个等于 `SCRIPT_DOC_LIMITS` 里画布剧本线用了一个
 * 多月的同名上限（`maxClarifyQuestions` 4 / `maxClarifyOptions` 6 /
 * `idMaxLength` 80 / `fieldMaxLength` 700）。上收到这里是因为反问卡从「只有
 * ScriptDoc 起草时才有」变成了四个域共用，**不是因为要重新定义它们**。
 * 改这里等于同时改画布那条路，两边故意共命运。
 */
export const ASSISTANT_CLARIFY_LIMITS = {
  maxQuestions: 4,
  maxOptions: 6,
  idMaxLength: 80,
  textMaxLength: 700,
} as const

export const ASSISTANT_PROTOCOL_DOMAIN_IDS = {
  image: 'image',
  video: 'video',
  lora: 'lora',
  canvas: 'canvas',
} as const

export const ASSISTANT_PROTOCOL_DOMAINS = [
  ASSISTANT_PROTOCOL_DOMAIN_IDS.image,
  ASSISTANT_PROTOCOL_DOMAIN_IDS.video,
  ASSISTANT_PROTOCOL_DOMAIN_IDS.lora,
  ASSISTANT_PROTOCOL_DOMAIN_IDS.canvas,
] as const

export type AssistantProtocolDomain =
  (typeof ASSISTANT_PROTOCOL_DOMAINS)[number]

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
}

/**
 * 第 ④ 段 —— 三档行为 + 输出契约。四个域共用一份。
 *
 * ⚠ 档位判定**故意用「槽位空了几个」这种可数的东西**，不用「意图是否清晰」这种
 * 模型自评。自评的结果就是改前那个行为：每轮都觉得够清晰了，每轮都直接出成品。
 */
export function buildAssistantConversationProtocol(
  brief: AssistantDomainBrief,
): string {
  const { ask, next } = ASSISTANT_PROTOCOL_MARKER_IDS
  const slotList = brief.slots.map((slot) => `  - ${slot}`).join('\n')

  return `BEFORE YOU CAN PROPOSE ANYTHING, these need to be known:
${slotList}
Anything the creator already said — or that is visible in the attached context — counts as known. Never re-ask it.

HOW TO ANSWER — pick exactly one gear per turn:

GEAR 1 · ASK. Two or more of the items above are still unknown.
  Write one or two short sentences of orientation, then emit an ${ask} block.
  Do NOT write a generation prompt, tag list, parameter set, or node plan in this gear. Not even a draft one.

GEAR 2 · DISCUSS. The items are mostly known but there is more than one good direction.
  Lay out 2-3 named directions with the trade-off of each, in prose. Recommend one and say why.
  Still no finished prompt — a direction is not a deliverable.

GEAR 3 · DELIVER. The creator confirmed a direction (they picked the satisfied option, or said so in their own words).
  Now produce the real thing: the prompt in a code block, the parameters, the node plan.

The creator must take one visible action between gear 1 and gear 3. Never move from a first vague request straight to a finished prompt — that is the single behaviour this protocol exists to prevent.

END EVERY TURN with a ${next} block, in every gear.

OUTPUT BLOCKS — plain JSON between literal markers, no code fences around them:

[[${ask}]]
{"questions":[{"id":"q-1","question":"...","options":[{"id":"o-1","label":"..."}],"multiSelect":false,"allowCustom":true,"allowSkip":true}]}
[[/${ask}]]

[[${next}]]
{"satisfied":"what happens next if they are happy — be concrete and specific to this conversation","adjust":"what to tell you if they want a change"}
[[/${next}]]

Rules for the blocks:
- At most ${ASSISTANT_CLARIFY_LIMITS.maxQuestions} questions, at most ${ASSISTANT_CLARIFY_LIMITS.maxOptions} options each. Ask only what changes the direction.
- Options must be concrete and specific to this conversation. "Realistic / Anime / Other" is useless; name the actual looks on the table.
- "satisfied" is never a bare "go ahead" — it names the next concrete step, e.g. "write the final prompt for the neon-alley version" or "generate the three character sheets".
- Write the block contents in the same language as your prose. They are shown to the creator as buttons.`
}

/**
 * LoRA 域附加的一句 —— 结构化转换引擎（`mode:'lora'` + `loraContext`）已经把
 * 「LoRA 拥有身份、别写脸和发型」写成了硬规则，但**那条路只在结构化输出模式下走**，
 * 普通对话态读不到。这里把同一条知识补进普通对话。
 *
 * ⚠ 别把两处合并：结构化那条是 tag 数组的产出契约，这里是对话时的判断依据，
 * 形态不同。合并的代价是普通对话也被迫吐 JSON —— 恰好是 A2 要消灭的东西。
 */
export const ASSISTANT_LORA_IDENTITY_NOTE = `A mounted LoRA already owns the character's face, hairstyle, hair colour, eye colour and body type. Treat those as decided. When the creator asks to change one of them, say plainly that it may fight the mounted LoRA before you help write it. Tag vocabulary stays English (danbooru-style) even when the conversation is in another language: the tag library is English-normalised, so a translated tag stops matching it.`
