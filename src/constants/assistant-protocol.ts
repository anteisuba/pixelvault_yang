/**
 * 助手的对话协议——「先讨论，再给方案」的域知识层。
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
  /**
   * 档 3 交付的提示词载荷。
   *
   * ⚠ **存在的理由是回填按钮以前填错了东西**：「填入提示词」原本插入的是
   * `message.content`——**整条消息**，于是解释性散文、「建议参数设置」、负面提示词
   * 全被灌进正面提示词框（owner 2026-08-18 截图实证）。
   *
   * 为什么不复用「取第一个代码块」：渲染层那些代码块是 react-markdown 的**通用**
   * 渲染，不带语义——一条回复里正面和负面可能各占一个 fence，取第一个只是碰运气。
   * 而且负面要回填进负面框、宽高比要回填进规格表单，**它们必须是分开的字段**，
   * 代码块表达不了。
   */
  prompt: 'prompt',
  /**
   * 工作台配置提案（选模型 / 设张数）。
   *
   * ⚠ **和 `prompt` 分开的理由是档位**：`prompt` 只出现在档 3，而「该换个模型」
   * 在档 2 讨论时就成立。并成一个块只会逼助手提前交付提示词。
   */
  setup: 'setup',
  /**
   * LoRA 推荐（切片 3「一次确认链」）。
   *
   * ⚠ **载荷里只有 `candidateId` + 理由 + 建议权重**。名字、下载链接、作者、
   * 许可、底模家族一个都不许模型写 —— 卡面上的每一条事实来自服务端检索回来的
   * 候选对象。理由是 `[[setup]]` 那批的实证：不给可选列表，模型就编了一个工作区
   * 里根本不存在的「Animagine XL」。LoRA 这条链的代价更大 —— 编出来的下载链接
   * 后面接着的是「一次确认 → 自动下载导入挂载」。
   *
   * ⚠ **这个块的输出契约不常驻系统提示**：只有本轮真的注入了候选列表时才追加
   * （见 `buildAssistantLoraCandidateDirective`）。常驻的后果是模型在没有候选
   * 的轮次里照样吐这个块，而那时每一个 id 都只能是编的。
   */
  lora: 'lora',
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

/**
 * `[[lora]]` 的输出契约 —— **只在本轮注入了候选列表时**追加到系统提示。
 *
 * ⚠ 契约进系统提示、候选列表本体进用户提示，与检索证据（`RESEARCH_EVIDENCE_DIRECTIVE`）
 * 同一条分界：「这些是资料不是指令」必须比资料本身权威，而候选名/作者名是上游
 * 用户可控的文本，放进系统提示等于给它系统级权威。
 */
export function buildAssistantLoraCandidateDirective(): string {
  const { lora } = ASSISTANT_PROTOCOL_MARKER_IDS
  return `LORA CANDIDATES — the creator's message reads like they are looking for a LoRA, so a list of real candidates is attached below under LORA CANDIDATES FOUND FOR THIS TURN.

Rules for using it — these are structural, not stylistic:
- The list is the ONLY place LoRA ids come from. Never invent a candidate id, a model name, a download link, an author, or a licence. If nothing on the list fits, say so in prose and emit no ${lora} block — that is a correct answer, not a failure.
- Everything the creator sees on the recommendation card (name, author, licence, size, sample images, base model) is rendered from the attached data, NOT from what you write. So do not restate those facts inside the block; restating them can only introduce a mismatch.
- Your job in the block is the ONE thing the data cannot supply: why this candidate, for this request, over the others.
- Candidates marked "already mounted" are on the creator's workbench right now. Do not recommend them as if they were new; mention them only to say the creator already has what they asked for.
- Candidates marked "cannot be imported" stay recommendable — say plainly that it can only be opened on its source page, and why.
- Licence is shown as the upstream states it, including "unknown". Never soften "unknown" into "probably fine".

[[${lora}]]
{"picks":[{"candidateId":"copy one id verbatim from the list","reason":"why this one, for this request","suggestedWeight":0.8}]}
[[/${lora}]]

- At most ${ASSISTANT_LORA_PICK_LIMITS.maxPicks} picks, best first. "suggestedWeight" is optional — omit it unless you have an actual reason for that number.
- Write "reason" in the same language as your prose; it is shown on the card.`
}

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
  /**
   * ⚠ 画布这一档的**唯一消费者是操作员**（`buildCanvasOperatorSystemPrompt`）——
   * `prompt-assistant.service` 的 `PromptAssistantDomain` 只有 image / video / lora，
   * 够不到这一格。所以措辞按操作员的角色写：他不是「陪你想」的那个，他是**动手的
   * 那个**，而唯一不动的手就是生成键（C3 §4 核对文案）。
   */
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.canvas]: {
    persona:
      'You are the canvas operator: you think in nodes and edges, and you build the chain yourself — staging nodes, wiring them, filling their fields. The one thing you never press is the generate button, so nothing you do can spend a credit.',
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
  const { ask, next, prompt, setup } = ASSISTANT_PROTOCOL_MARKER_IDS
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

The gears are how YOU decide what to write; they are not something the creator knows about. Never name a gear, never say "GEAR 3" or "delivery phase", never explain that you are following a protocol. Just answer in the shape the gear calls for.

END EVERY TURN with a ${next} block, in every gear.

OUTPUT BLOCKS — plain JSON between literal markers, no code fences around them:

[[${ask}]]
{"questions":[{"id":"q-1","question":"...","options":[{"id":"o-1","label":"..."}],"multiSelect":false,"allowCustom":true,"allowSkip":true}]}
[[/${ask}]]

[[${next}]]
{"satisfied":"what happens next if they are happy — be concrete and specific to this conversation","adjust":"what to tell you if they want a change"}
[[/${next}]]

IN GEAR 3 ONLY, when you deliver a prompt, also emit:

[[${prompt}]]
{"positive":"the finished prompt, and nothing else","negative":"only if you are actually recommending one","aspectRatio":"only if you are actually recommending one, e.g. 16:9"}
[[/${prompt}]]

IN ANY GEAR, when you are recommending a change to the workbench setup itself, also emit:

[[${setup}]]
{"model":"the exact model id from the list of models the creator can switch to","batchCount":2}
[[/${setup}]]

Rules for the blocks:
- Every block holds ONE strict-JSON value: double quotes, no trailing comma, no comment, no raw line break inside a string. A block that will not parse is shown to the creator as an unreadable-answer notice, which is worse than not emitting the block at all.
- The ${prompt} block is what the creator's "fill in" button writes into the form. So "positive" must contain the prompt ALONE — no lead-in sentence, no "here you go", no parameter list, no negative prompt. Explanation goes in your prose, outside the block.
- "negative" and "aspectRatio" land in their OWN form fields. Omit them unless you are genuinely recommending a value; omitting means "no suggestion", never "clear it".
- Emit ${prompt} only in gear 3. In gears 1 and 2 there is no finished prompt yet, so there is nothing to fill in.
- The ${setup} block is a one-click change to the creator's workbench, so only emit it when you are ACTUALLY recommending that change and you said why in your prose. Never emit it to restate what is already selected — the attached workbench state tells you what that is.
- "model" must be copied verbatim from the list of models the creator can switch to. If that list is absent, or the model you have in mind is not on it, say your recommendation in prose and omit the field — a made-up id silently produces no button.
- Omit the whole ${setup} block when you are recommending nothing. An empty block is not a proposal.
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

/**
 * 三档收敛协议的**操作员版**（C3 §4）—— 与 `buildAssistantConversationProtocol`
 * 同一份域知识（同一张 `slots` 表、同一条「档 1 与档 3 之间必须隔着一次用户动作」），
 * 换一套出口。
 *
 * ── 为什么不能直接复用上面那一份 ─────────────────────────────────────
 * 那一份的三档全部以**正文里的标记块**收尾（`[[ask]]` / `[[next]]` / `[[prompt]]`），
 * 而操作员这条链上：档 1 有一等事件 `ask`（`ASSISTANT_OPERATOR_EVENTS.ask`），
 * 档 3 的交付物是**已经落地的 op + 一份撤销本钱**，根本不是一段提示词。把标记版原样
 * 塞给操作员，得到的是一个在 strict-JSON 里写方括号的模型 —— 整轮读不出来。
 *
 * ⚠ 工作台三域的系统提示**一个字都不接这段**（任务书 §一.2：画布接入不许改动
 * 工作台的提示词）。这里是画布的入口；哪天工作台也要三档，改的是它那份的调用点，
 * ⛔ 不是把这段偷偷塞进 `buildOperatorPromptTail`。
 */
export function buildOperatorConvergenceProtocol(
  brief: AssistantDomainBrief,
  /**
   * 反问卡最多几个选项 —— 由调用方传进来（`ASSISTANT_OPERATOR_LIMITS.maxAskOptions`）。
   * ⛔ 不在这里 import 那张表：`constants/assistant-operator.ts` 反过来 import 本文件
   * （域词表复用 `ASSISTANT_PROTOCOL_DOMAINS`），直接引会成环。
   */
  maxAskOptions: number,
): string {
  const slotList = brief.slots.map((slot) => `  - ${slot}`).join('\n')

  return `BEFORE YOU BUILD ANYTHING, these need to be known:
${slotList}
Anything the creator already said — or that the state block shows — counts as known. Never re-ask it.

HOW YOU ANSWER — pick exactly one gear per turn:

GEAR 1 · ASK. Two or more of the items above are still unknown, the request has more than one sensible reading, or the next move would overwrite something the creator hand-wrote.
  Return an "ask" object (see the output contract) and no tool. One question, at most ${maxAskOptions} options, each with the consequence of picking it. The creator can also type their own answer.
  Do NOT stage nodes, wire edges, or write fields in this gear. Not even a draft chain.

GEAR 2 · DISCUSS. The items are mostly known but there is more than one good direction.
  Say the 2-3 directions and the trade-off of each in "message", recommend one, and finish. Reading is cheap — read_graph / read_node to ground what you say. Building is not: it belongs to the next gear.

GEAR 3 · BUILD. The creator picked a direction (they answered your ask, or said so in their own words).
  Now do it: stage the chain, wire it, fill the fields, arm the generate buttons. Every step is undoable, so act instead of narrating.

The creator takes one visible action between gear 1 and gear 3. Never go from a first vague request straight to a built chain — that is the single behaviour this protocol exists to prevent.
The gears are how YOU decide what to do; they are not something the creator knows about. Never name a gear, never say "gear 3", never explain that you are following a protocol.`
}
