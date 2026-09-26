/**
 * 助手设置（persona）与**项目规则**的 schema 层 ——
 * `docs/references/pages/assistant-shell.md` §8.4 与 §10。
 *
 * 词表住 `constants/assistant-persona.ts` / `constants/assistant-operator.ts`，
 * 分工与 `constants/assistant-operator.ts` ↔ `types/assistant-operator.ts` 同构。
 *
 * ⚠ 规则的 schema 为什么也在这个文件里：它们是**同一个入口的两半**（助手设置对话
 * 框 + 规则卡都是「这个助手按什么规矩替我干活」），而两边都只被 persona 那条路读写。
 * 拆成两个文件只会多一次 import，不会多一条边界。
 */

import { z } from 'zod'

import {
  ASSISTANT_AVATAR_CHOICE_IDS,
  ASSISTANT_AVATAR_CHOICES,
  ASSISTANT_AVATAR_PRESET_IDS,
  ASSISTANT_PERSONA_ARCHETYPES,
  ASSISTANT_PERSONA_LANGUAGES,
  ASSISTANT_PERSONA_LIMITS,
  ASSISTANT_PERSONA_PLAN_MODES,
  ASSISTANT_PERSONA_TONE_IDS,
  ASSISTANT_PERSONA_TONES,
  ASSISTANT_PERSONA_VERBOSITIES,
  ASSISTANT_ROUTE_MODEL_VALUES,
  normalizeAvatarPreset,
} from '@/constants/assistant-persona'
import {
  ASSISTANT_OPERATOR_DOMAINS,
  ASSISTANT_PROJECT_RULE_LIMITS,
  PROJECT_RULE_KIND_IDS,
  PROJECT_RULE_KINDS,
  PROJECT_RULE_SOURCE_KINDS,
  PROJECT_RULE_SOURCE_TOKEN_PATTERN,
  PROJECT_RULE_SOURCES,
} from '@/constants/assistant-operator'

// ─── persona ─────────────────────────────────────────────────────

export const AssistantAvatarPresetSchema = z.enum(ASSISTANT_AVATAR_PRESET_IDS)
/** 头像单选表选中的那一项（助手设置 B）。 */
export const AssistantAvatarChoiceSchema = z.enum(ASSISTANT_AVATAR_CHOICES)
export const AssistantPersonaToneSchema = z.enum(ASSISTANT_PERSONA_TONES)
export const AssistantPersonaVerbositySchema = z.enum(
  ASSISTANT_PERSONA_VERBOSITIES,
)
export const AssistantPersonaPlanModeSchema = z.enum(
  ASSISTANT_PERSONA_PLAN_MODES,
)
export const AssistantPersonaLanguageSchema = z.enum(
  ASSISTANT_PERSONA_LANGUAGES,
)
/**
 * 三档人设（§11.1）。⚠ **可空**：`null` 是「自定义」这一档真正的值 ——
 * 用户改过某个高级项，这一份不再完全对上任何一档。⛔ 不补一个 `custom`
 * 字面量：那样「没存过」「存了 custom」「对不上任何一档」会变成三个值，
 * 而它们是同一件事。
 */
export const AssistantPersonaArchetypeSchema = z.enum(
  ASSISTANT_PERSONA_ARCHETYPES,
)

export type AssistantPersonaArchetype = z.infer<
  typeof AssistantPersonaArchetypeSchema
>
/**
 * 文本模型 chip 选的那一档（§4.5）。词表 = 「自动」+ 路由表的九条 ——
 * ⚠ 名单从 `NODE_STUDIO_ASSISTANT_ROUTE_MODELS` 摊出来，⛔ 不在这里复制一份：
 * 复制的那一刻「界面能选」和「服务端认得」就开始各自漂。
 */
export const AssistantRouteModelSchema = z.enum(ASSISTANT_ROUTE_MODEL_VALUES)

export type AssistantRouteModel = z.infer<typeof AssistantRouteModelSchema>

/**
 * 正在用的那个角色（助手设置 B「用角色」）—— **只读**，服务端从角色卡里取。
 *
 * ⚠ 只带界面要的四样：下拉里那一行、头像单选表里「Denia 的头像」、语气那一排
 * 「Denia 的说话方式」能不能选。⛔ 不把「说话方式」原文带给客户端：它只进系统
 * 提示（`getAssistantPersonaByUserId`），界面只需要知道「写了没有」。
 */
export const AssistantPersonaCharacterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** 角色主图；卡上还没有图时是 `null`（头像退回预设字形）。 */
  faceUrl: z.string().url().nullable(),
  /** 角色设定里写了「说话方式」没有。 */
  hasSpeech: z.boolean(),
})

export type AssistantPersonaCharacter = z.infer<
  typeof AssistantPersonaCharacterSchema
>

/**
 * persona 的**列**本体。两个对外 schema 都从它派生 —— 写两遍字段的表现是
 * 「设置里能存的字段和读回来的字段悄悄不一样」。
 */
const AssistantPersonaShapeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(ASSISTANT_PERSONA_LIMITS.maxNameChars)
    .nullable(),
  avatarPreset: AssistantAvatarPresetSchema.nullable(),
  /**
   * **显示用**的那张图（读回来才有）：选的是上传的那张 → 那张；选的是角色 →
   * 角色主图；选的是预设 → `null`（按 `avatarPreset` 画字形）。显示头像的地方
   * 只读这两格，⛔ 不自己再判一遍单选表。
   */
  avatarUrl: z.string().url().nullable(),
  /** 头像单选表选中的那一项（读回来时已回推好，老行也有值）。 */
  avatarChoice: AssistantAvatarChoiceSchema,
  /**
   * 上传过的那张（读回来才有）—— 单选表里「我上传的」那一项靠它；换成预设它也
   * 还在（owner 2026-09-26：换成预设不丢）。
   */
  uploadedAvatarUrl: z.string().url().nullable(),
  /** 用哪个角色（助手设置 B）。`null` = 不用角色。 */
  characterCardId: z.string().min(1).nullable(),
  /** 正在用的角色（读回来才有；卡删了 / 没用角色就是 `null`）。 */
  character: AssistantPersonaCharacterSchema.nullable(),
  /**
   * 名字跟着角色走。⚠ 读回来的 `name` 已经是**显示的那个名字**（跟着角色时就是
   * 角色名）；写回去时服务端在它开着时不动库里那一格，自己的名字不会被覆盖。
   */
  nameFromCharacter: z.boolean(),
  /**
   * 语气跟着角色设定里的「说话方式」走。⚠ `tone` / `toneCustom` 始终是自己那一份；
   * 角色没写说话方式时这一格开着也不生效。
   */
  toneFromCharacter: z.boolean(),
  tone: AssistantPersonaToneSchema,
  toneCustom: z
    .string()
    .trim()
    .min(1)
    .max(ASSISTANT_PERSONA_LIMITS.maxToneCustomChars)
    .nullable(),
  verbosity: AssistantPersonaVerbositySchema,
  planMode: AssistantPersonaPlanModeSchema,
  language: AssistantPersonaLanguageSchema,
  /** `auto` = 服务端自己挑（库里存 null）。⛔ 不做成可空：读回来永远是个词。 */
  routeModel: AssistantRouteModelSchema,
  /**
   * v2 §11.3 的三项 —— 它们只改**说话方式**，注入点在系统提示的
   * 「关于这位创作者」那一段（§8.3）。
   *
   * ⛔ 两个开关有意**不可空**：`null` 与 `false` 在开关上是同一件事，而多一个
   * 值就要多回答一次「没设过和关掉有什么不同」。缺行时走
   * `ASSISTANT_PERSONA_DEFAULTS`，与库上的 `@default` 逐字一致。
   */
  nextStepHint: z.boolean(),
  useMyWords: z.boolean(),
  /**
   * 「让助手记住」（记忆页右上那颗开关，助手设置 B）。关 = 每轮结账不再自己记新的；
   * 清单里已有的照样注入，你写的照样生效。
   */
  memoryCapture: z.boolean(),
  /**
   * 选的是哪一张人设卡（§11.1）。`null` = 自定义。
   *
   * ⚠ 它**不是**又一个独立偏好：服务端只在它与四格（verbosity / planMode /
   * nextStepHint / useMyWords）逐格对得上时才落库，对不上就落 `null` —— ⛔ 不信
   * 客户端递来的那个名字，否则那一档写的三行副文案随时可能是假话。语气不在判据里
   * （owner 2026-09-26：三档不管语气）。
   */
  archetype: AssistantPersonaArchetypeSchema.nullable(),
  /** null = 用账号名。⚠ 它原样拼进系统提示，所以上限是硬的。 */
  addressUserAs: z
    .string()
    .trim()
    .min(1)
    .max(ASSISTANT_PERSONA_LIMITS.maxAddressUserAsChars)
    .nullable(),
})

/**
 * 选了「自定义语气」却没写那句话 = 一个空的风格段。⛔ 不静默退回
 * `professional`：用户明确选了 custom，悄悄换掉他的选择比报错坏。
 */
function toneCustomPresentWhenCustom(persona: {
  tone: string
  toneCustom: string | null
}): boolean {
  return (
    persona.tone !== ASSISTANT_PERSONA_TONE_IDS.custom ||
    Boolean(persona.toneCustom)
  )
}

const TONE_CUSTOM_REFINEMENT = {
  path: ['toneCustom'],
  message: 'toneCustom is required when tone=custom',
} satisfies { path: PropertyKey[]; message: string }

/**
 * 一份完整的 persona —— **读回来的形状**（缺行时是
 * `ASSISTANT_PERSONA_DEFAULTS` 填出来的那一份，不是 null）。
 *
 * ⚠ `avatarUrl` **不在写入 schema 里**（见 `UpdateAssistantPersonaSchema`）：
 * 它由头像上传/移除那条路自己写，客户端递一条 URL 进来等于绕开 R2 生命周期。
 */
export const AssistantPersonaSchema = AssistantPersonaShapeSchema.refine(
  toneCustomPresentWhenCustom,
  TONE_CUSTOM_REFINEMENT,
)

export type AssistantPersona = z.infer<typeof AssistantPersonaSchema>

/**
 * PUT `/api/assistant/persona` 的载荷 —— persona 减去**只读**的那几格：两张图的
 * 地址（由上传那条路写）与正在用的角色（由服务端从卡里取）。
 */
export const UpdateAssistantPersonaSchema = AssistantPersonaShapeSchema.omit({
  avatarUrl: true,
  uploadedAvatarUrl: true,
  character: true,
}).refine(toneCustomPresentWhenCustom, TONE_CUSTOM_REFINEMENT)

export type UpdateAssistantPersonaRequest = z.infer<
  typeof UpdateAssistantPersonaSchema
>

/**
 * 读回来的一份 → 写回去的一份（去掉只读那几格）。
 *
 * ⚠ `PUT` 收的是**完整形状**：只递一格会把其余几格按默认值覆盖回去，所以任何
 * 「只改一格」的地方（模型 chip、设置里的每一下）都从这里起手再盖上那一格。
 */
export function toAssistantPersonaUpdate(
  persona: AssistantPersona,
): UpdateAssistantPersonaRequest {
  const { avatarUrl, uploadedAvatarUrl, character, ...update } = persona
  void avatarUrl
  void uploadedAvatarUrl
  void character
  return update
}

/**
 * 用一个角色 / 不用角色（助手设置 B「用角色」，角色页「设为助手人设」同一条）。
 *
 * ⭐ 用角色 = 名字、头像、语气**先**跟着角色走，之后每一格都还能单独改
 * （owner 2026-09-26：只当默认值）。⚠ 名字那一格不用在这里改：跟着角色时服务端
 * 不动库里自己的名字，显示的是角色名。
 * ⭐ 不用角色 = 回到自己那一份：语气与名字本来就没被覆盖；头像若正用着角色的脸，
 * 换回上传的那张（没传过就是预设）。
 */
export function withAssistantCharacter(
  persona: AssistantPersona,
  characterCardId: string | null,
): UpdateAssistantPersonaRequest {
  const update = toAssistantPersonaUpdate(persona)
  if (characterCardId) {
    return {
      ...update,
      characterCardId,
      nameFromCharacter: true,
      toneFromCharacter: true,
      avatarChoice: ASSISTANT_AVATAR_CHOICE_IDS.character,
    }
  }
  return {
    ...update,
    characterCardId: null,
    nameFromCharacter: false,
    toneFromCharacter: false,
    avatarChoice:
      update.avatarChoice === ASSISTANT_AVATAR_CHOICE_IDS.character
        ? persona.uploadedAvatarUrl
          ? ASSISTANT_AVATAR_CHOICE_IDS.upload
          : normalizeAvatarPreset(persona.avatarPreset)
        : update.avatarChoice,
  }
}

/** POST `/api/assistant/persona/avatar` —— 与账户头像那条路同形（data URL / http）。 */
export const UploadAssistantAvatarSchema = z.object({
  imageData: z.string().min(1, 'Image data is required'),
})

export type UploadAssistantAvatarRequest = z.infer<
  typeof UploadAssistantAvatarSchema
>

// ─── 项目规则 ────────────────────────────────────────────────────

export const ProjectRuleSourceSchema = z.enum(PROJECT_RULE_SOURCES)
/** null = 全域。非空时是一个工作台域 id。 */
export const ProjectRuleScopeSchema = z.enum(ASSISTANT_OPERATOR_DOMAINS)

/**
 * 普通规则 / 只信这些来源 / 屏蔽这些来源（§9.3）。
 *
 * ⚠ 存量行读回来时**没有 kind** 的可能性不存在（库里带默认），但客户端老缓存
 * 里有 —— 所以读端给默认值 `note`，⛔ 不把一条老规则判成读不出来。
 */
export const ProjectRuleKindSchema = z.enum(PROJECT_RULE_KINDS)

export type ProjectRuleKind = z.infer<typeof ProjectRuleKindSchema>

/**
 * 来源名单一条里装的东西：**来源 id 或域名**（§9.3）。
 *
 * ⚠ 统一小写 + 砍掉协议头与末尾斜杠：用户会原样贴一条 `https://Danbooru.donmai.us/`
 * 进来，而名单是拿来逐字比对域名的。
 */
export const ProjectRuleSourceTokenSchema = z
  .string()
  .trim()
  .min(1)
  .max(ASSISTANT_PROJECT_RULE_LIMITS.maxTextChars)
  .transform((value) =>
    value
      .toLowerCase()
      .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/^www\./, ''),
  )
  .refine((value) => PROJECT_RULE_SOURCE_TOKEN_PATTERN.test(value), {
    message: 'Source rules take a source id or a domain, not a sentence',
  })

export const ProjectRuleSchema = z.object({
  id: z.string().min(1),
  scope: ProjectRuleScopeSchema.nullable(),
  text: z
    .string()
    .trim()
    .min(1)
    .max(ASSISTANT_PROJECT_RULE_LIMITS.maxTextChars),
  kind: ProjectRuleKindSchema.default(PROJECT_RULE_KIND_IDS.note),
  source: ProjectRuleSourceSchema,
  /** ISO 串。规则薄卡上那行「记于 YYYY-MM-DD」取它的日期段。 */
  createdAt: z.string(),
})

export type ProjectRule = z.infer<typeof ProjectRuleSchema>

/** 这一种规则装的是来源名单吗（§9.3）。 */
export function isProjectRuleSourceKind(
  kind: ProjectRuleKind | undefined,
): boolean {
  return PROJECT_RULE_SOURCE_KINDS.some((candidate) => candidate === kind)
}

/**
 * 把用户贴进来的一串收成**一个可比对的来源 token**。
 *
 * ⚠ 与 `ProjectRuleSourceTokenSchema` 的那几刀逐字同源：schema 是闸，这个函数
 * 是同一把刀给 UI 预览用的，⛔ 不许两边长得不一样。
 */
export function normalizeProjectRuleSourceToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '')
}

/**
 * 记一条**来源名单**（§9.3）—— 这张表现在只装这两种。
 *
 * ⭐ 普通规则已并进记忆（助手设置 B：规矩并进记忆，owner 2026-09-26）：用户自己
 * 写的走 `POST /api/assistant-memories`，助手在对话里记的由工具环写进记忆。
 * ⚠ `text` **必须是来源 id 或域名**（过 `ProjectRuleSourceTokenSchema`）：收下一句
 * 「只信官方站」的下场是名单里永远有一条匹配不到任何东西，而助手会照常去打
 * 那些站 —— 用户以为自己设了闸，闸却不在。
 */
export const CreateProjectRuleSchema = z.object({
  text: ProjectRuleSourceTokenSchema,
  scope: ProjectRuleScopeSchema.nullish(),
  kind: z.enum(PROJECT_RULE_SOURCE_KINDS),
  /**
   * 缺省 = `creator`（用户自己在设置里写的）。助手那条路由服务端写死
   * `assistant`，⛔ 不从模型收 —— 让它自己声明来源，来源就不再是证据。
   */
  source: ProjectRuleSourceSchema.optional(),
})

export type CreateProjectRuleRequest = z.infer<typeof CreateProjectRuleSchema>

/** 客户端**递进来**的那一份（`text` 还没收成 token）。 */
export type CreateProjectRuleInput = z.input<typeof CreateProjectRuleSchema>

/** GET `/api/assistant/rules` 的查询串。`scope` 缺省 = 全都要（含全域那些）。 */
export const ListProjectRulesQuerySchema = z.object({
  scope: ProjectRuleScopeSchema.optional(),
})

export type ListProjectRulesQuery = z.infer<typeof ListProjectRulesQuerySchema>
