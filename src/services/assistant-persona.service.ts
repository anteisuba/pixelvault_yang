import 'server-only'

import { db } from '@/lib/db'
import {
  ASSISTANT_AVATAR_CHOICE_IDS,
  ASSISTANT_PERSONA_DEFAULTS,
  ASSISTANT_PERSONA_LIMITS,
  ASSISTANT_PERSONA_TONE_IDS,
  ASSISTANT_REASONING_EFFORTS,
  ASSISTANT_ROUTE_MODEL_AUTO,
  type AssistantReasoningEffort,
  isAvatarPresetChoice,
  matchAssistantPersonaArchetype,
  normalizeAvatarPreset,
  normalizeRouteModel,
  type AssistantAvatarChoice,
} from '@/constants/assistant-persona'
import { CHARACTER_PERSONA_LIMITS } from '@/constants/cards/character-card'
import { slotsCoverUrl } from '@/lib/card-bus'
import { ApiRequestError } from '@/lib/errors'
import { readTavernWorldBook } from '@/lib/tavern-card'
import { readChatUserRole } from '@/services/cards/character-card.mapper'
import { sanitizePrompt } from '@/services/kernel/prompt-guard'
import { ensureUser } from '@/services/user.service'
import {
  CharacterPersonaSchema,
  CharacterReferenceSlotsSchema,
  type CharacterPersona,
} from '@/types'
import {
  AssistantPersonaSchema,
  type AssistantPersona,
  type AssistantPersonaCharacter,
  type AssistantPromptCharacter,
  type AssistantPromptPersona,
  type AssistantPromptRoleplay,
  type AssistantPromptWorldEntry,
  type UpdateAssistantPersonaRequest,
} from '@/types/assistant-persona'

/**
 * 助手人设（persona）的**读写**——`docs/references/pages/assistant-shell.md` §8。
 *
 * ── 这个文件为什么不碰 R2 ────────────────────────────────────────
 * 自定义头像那条腿住在 `assistant-persona-avatar.service.ts`，⛔ 有意分开。
 * 判据只有一条：**这个文件在工具环的 import 白名单里**
 * （`assistant-operator.money-gate.test.ts`），而那份名单的价值全在于它够窄。
 * 把一条会写 R2 的路混进来，下一个人就得在「它到底能不能上传」这个问题上重新
 * 论证一遍 —— 分成两个文件之后，答案写在 import 表上，不用论证。
 *
 * ── 缺行 = 默认值，⛔ 不自动建行（§8.4 第 4 条）─────────────────
 * 从没打开过设置的用户在库里一行都没有，读回来的是
 * `ASSISTANT_PERSONA_DEFAULTS`。首次访问自动建行的代价是每一次读都可能变成一次
 * 写，而换来的只是「行在不在」这个没人关心的事实。
 */

interface PersonaCharacterRow {
  id: string
  name: string
  /** 只取默认造型（头像 = 它的封面）。 */
  looks: { referenceSlots: unknown }[]
  persona: unknown
  isDeleted: boolean
}

interface PersonaRow {
  name: string | null
  avatarPreset: string | null
  avatarUrl: string | null
  avatarChoice: string | null
  characterCardId: string | null
  nameFromCharacter: boolean
  toneFromCharacter: boolean
  characterCard: PersonaCharacterRow | null
  tone: string
  toneCustom: string | null
  verbosity: string
  planMode: string
  language: string
  routeModel: string | null
  reasoningEffort: string
  nextStepHint: boolean
  useMyWords: boolean
  memoryCapture: boolean
  archetype: string | null
  addressUserAs: string | null
}

/**
 * 角色卡上的设定；卡删了（软删）/ 读不出来是 `null`。
 * ⚠ 走角色卡自己的 schema，⛔ 不 `as`：`persona` 在库里是一格 Json。
 */
function readCharacterProfile(
  card: PersonaCharacterRow | null,
): CharacterPersona | null {
  if (!card || card.isDeleted) return null
  const parsed = CharacterPersonaSchema.safeParse(card.persona ?? {})
  return parsed.success ? parsed.data : null
}

/** 角色设定里那段「说话方式」（去掉首尾空白）；没写 / 读不出来是空串。 */
function readCharacterSpeech(card: PersonaCharacterRow | null): string {
  return readCharacterProfile(card)?.speech.trim() ?? ''
}

/**
 * 角色设定 → 进系统提示的那几格（附录J ①）。一格都没写就是 `null`（只剩名字的角色
 * 不值得一整段）。`speech` 由调用方按「语气跟不跟角色走」决定给不给。
 */
function toPromptCharacter(
  name: string,
  profile: CharacterPersona,
  speech: string,
): AssistantPromptCharacter | null {
  const character = {
    name,
    identity: profile.identity.trim(),
    behavior: profile.behavior.trim(),
    speech,
    catchphrases: profile.catchphrases
      .map((phrase) => phrase.trim())
      .filter(Boolean),
    backstory: profile.backstory.trim(),
    boundaries: profile.boundaries.trim(),
    moods: profile.moods.map((mood) => mood.trim()).filter(Boolean),
    learnedPhrases: profile.learnedPhrases
      .map((phrase) => phrase.trim())
      .filter(Boolean),
  }
  const empty =
    !character.identity &&
    !character.behavior &&
    !character.speech &&
    character.catchphrases.length === 0 &&
    !character.backstory &&
    !character.boundaries
  return empty ? null : character
}

function readSlots(card: PersonaCharacterRow) {
  const parsed = CharacterReferenceSlotsSchema.safeParse(
    card.looks[0]?.referenceSlots,
  )
  return parsed.success ? parsed.data : []
}

/** 正在用的角色（界面要的四样）。卡删了（软删）就当没用。 */
function toCharacter(
  card: PersonaCharacterRow | null,
): AssistantPersonaCharacter | null {
  if (!card || card.isDeleted) return null
  return {
    id: card.id,
    /** ⚠ 与助手名字同一档上限 —— 角色名更长时截断，⛔ 不让整份 persona 读不出来。 */
    name: card.name.slice(0, ASSISTANT_PERSONA_LIMITS.maxNameChars),
    faceUrl: slotsCoverUrl(readSlots(card)),
    hasSpeech: readCharacterSpeech(card).length > 0,
  }
}

/**
 * 头像单选表**实际**选中的那一项（助手设置 B）。
 *
 * ⚠ 库里那一格可能是 NULL（老行）或指向一件已经不在的东西（角色卡删了 / 上传的
 * 那张没了）—— 一律按老规矩回推：传过图用图，否则用预设。⛔ 不出空圈。
 */
function resolveAvatarChoice(
  row: PersonaRow,
  character: AssistantPersonaCharacter | null,
): AssistantAvatarChoice {
  const stored = row.avatarChoice
  if (stored === ASSISTANT_AVATAR_CHOICE_IDS.character && character) {
    return stored
  }
  if (stored === ASSISTANT_AVATAR_CHOICE_IDS.upload && row.avatarUrl) {
    return stored
  }
  if (
    stored &&
    stored !== ASSISTANT_AVATAR_CHOICE_IDS.character &&
    stored !== ASSISTANT_AVATAR_CHOICE_IDS.upload
  ) {
    return normalizeAvatarPreset(stored)
  }
  return row.avatarUrl
    ? ASSISTANT_AVATAR_CHOICE_IDS.upload
    : normalizeAvatarPreset(row.avatarPreset)
}

/** 库里那一行（部分列）→ 协议形状。缺行时整份走默认值。 */
function toPersona(row: PersonaRow | null): AssistantPersona {
  if (!row) return { ...ASSISTANT_PERSONA_DEFAULTS }

  const character = toCharacter(row.characterCard)
  const avatarChoice = resolveAvatarChoice(row, character)
  /**
   * ⭐ 显示用的那两格在这里一次算好（`avatarUrl` + `avatarPreset`）：顶栏头像、
   * 时间线、空态都只读它们，⛔ 不让每个显示头像的地方各自判一遍单选表。
   */
  const displayUrl =
    avatarChoice === ASSISTANT_AVATAR_CHOICE_IDS.upload
      ? row.avatarUrl
      : avatarChoice === ASSISTANT_AVATAR_CHOICE_IDS.character
        ? (character?.faceUrl ?? null)
        : null
  const nameFromCharacter = row.nameFromCharacter && character !== null

  /**
   * ⚠ 用 schema 而不是 `as`：这几列在库里是 `String`（域词表住 constants，
   * ⛔ 不做成第二份 Prisma 枚举），所以「库里的值还在词表里」这件事只能在这里问。
   * 词表改过而存量行没跟上时，退回默认值而不是把一个词表外的值塞进系统提示。
   *
   * ⚠ `avatarPreset` **单独先回落**（`normalizeAvatarPreset`）：库里还留着
   * 已删除的预设 id。交给下面那一发 safeParse
   * 会连累整份 persona 一起退回默认值 —— 用户只是头像那一格过时了，语气和长度
   * 不该跟着一起丢。⛔ 不写迁移去改存量行。`null`（从没选过）照旧是 `null`。
   */
  const parsed = AssistantPersonaSchema.safeParse({
    name: nameFromCharacter && character ? character.name : row.name,
    avatarUrl: displayUrl,
    avatarChoice,
    uploadedAvatarUrl: row.avatarUrl,
    characterCardId: character?.id ?? null,
    character,
    nameFromCharacter,
    toneFromCharacter: row.toneFromCharacter && character !== null,
    tone: row.tone,
    toneCustom: row.toneCustom,
    verbosity: row.verbosity,
    planMode: row.planMode,
    language: row.language,
    nextStepHint: row.nextStepHint,
    useMyWords: row.useMyWords,
    memoryCapture: row.memoryCapture,
    addressUserAs: row.addressUserAs,
    /**
     * 预设字形：选的是预设就是那一款；选的是图时它是图加载不出来时的回落。
     */
    avatarPreset: isAvatarPresetChoice(avatarChoice)
      ? avatarChoice
      : row.avatarPreset === null
        ? null
        : normalizeAvatarPreset(row.avatarPreset),
    /**
     * ⚠ `routeModel` 与头像同理**先单独回落**：`null`（从没选过）是「自动」，
     * 而模型表退役过的 id 只该让这一格回到「自动」，⛔ 不该连累整份 persona
     * 一起退回默认值（用户的语气和长度不该因为换了模型表就丢）。
     */
    routeModel: normalizeRouteModel(row.routeModel),
    // 词表外的值（将来删掉一档）只让这一格回到默认，⛔ 不连累整份 persona。
    reasoningEffort: (
      ASSISTANT_REASONING_EFFORTS as readonly string[]
    ).includes(row.reasoningEffort)
      ? (row.reasoningEffort as AssistantReasoningEffort)
      : ASSISTANT_PERSONA_DEFAULTS.reasoningEffort,
    /**
     * ⚠ 人设那一档**按值回推，⛔ 不信库里那个名字**（§11.1）：
     *  · 存量行里它是 NULL（列是后加的），回推让老用户一打开就看到自己那张卡；
     *  · 映射表将来改一格时，库里那个名字会指向一份已经不是它的设置 ——
     *    回推让「卡上写的三行」永远是这份设置真正的行为。
     * 对不上任何一档就是 `null` = 自定义，这正是那一档真正的值。
     */
    archetype: matchAssistantPersonaArchetype(row),
  })
  return parsed.success ? parsed.data : { ...ASSISTANT_PERSONA_DEFAULTS }
}

const PERSONA_SELECT = {
  name: true,
  avatarPreset: true,
  avatarUrl: true,
  avatarChoice: true,
  characterCardId: true,
  nameFromCharacter: true,
  toneFromCharacter: true,
  characterCard: {
    select: {
      id: true,
      name: true,
      looks: { where: { isDefault: true }, select: { referenceSlots: true } },
      persona: true,
      isDeleted: true,
    },
  },
  tone: true,
  toneCustom: true,
  verbosity: true,
  planMode: true,
  language: true,
  routeModel: true,
  reasoningEffort: true,
  nextStepHint: true,
  useMyWords: true,
  memoryCapture: true,
  archetype: true,
  addressUserAs: true,
} as const

async function findPersonaRow(userId: string): Promise<PersonaRow | null> {
  return db.assistantPersona.findUnique({
    where: { userId },
    select: PERSONA_SELECT,
  })
}

/** 设置里读的那一份（`GET /api/assistant/persona`）：语气是创作者自己那一份。 */
export async function getAssistantPersona(
  clerkId: string,
): Promise<AssistantPersona> {
  const user = await ensureUser(clerkId)
  return toPersona(await findPersonaRow(user.id))
}

/**
 * **助手这一轮按谁说话** —— 吃的是库里的 user.id（工具环那一侧已经 `ensureUser`
 * 过一次了，`prepareOperatorTurn` 开头），⛔ 别为了统一签名再查一次用户。
 *
 * ⭐ 与设置里读的那一份差两件事：
 *  ① **语气跟着角色走、而角色写了说话方式**时，把那段说话方式换进
 *     `tone = custom` / `toneCustom`（上限见 `sanitizeToneCustom`）；
 *  ② **正在用角色**时带上 `promptCharacter`（身份 / 性格 / 说话方式 / 口头禅 /
 *     经历），系统提示据此写「你就是她」那一段（附录J ①，2026-10-14 之前模型只拿到
 *     名字和那句说话方式）。
 * 名字不用换 —— `toPersona` 读出来的已经是显示的那个名字。
 */
export async function getAssistantPersonaByUserId(
  userId: string,
  chatCharacterId?: string | null,
): Promise<AssistantPromptPersona> {
  const row = await findPersonaRow(userId)
  const persona = toPersona(row)
  if (chatCharacterId) {
    const chatCard = await db.characterCard.findFirst({
      where: { id: chatCharacterId, userId, isDeleted: false },
      // 聊天多读卡上原样存的那份（世界书在里面）。
      select: { ...PERSONA_SELECT.characterCard.select, extensions: true },
    })
    const chat = chatCard ? toChatPersona(persona, chatCard) : null
    if (chat) return chat
  }
  const card = row?.characterCard ?? null
  const profile = readCharacterProfile(card)
  const speech =
    persona.toneFromCharacter && profile ? profile.speech.trim() : ''
  const promptCharacter =
    card && profile ? toPromptCharacter(card.name, profile, speech) : null
  return {
    ...persona,
    ...(speech
      ? { tone: ASSISTANT_PERSONA_TONE_IDS.custom, toneCustom: speech }
      : {}),
    ...(promptCharacter ? { promptCharacter } : {}),
  }
}

/**
 * **聊天模式**这一轮按谁说话（附录L）：会话绑的那张卡，⛔ 不看设置里「用哪个角色」。
 * 名字、口吻都跟这张卡走（聊天里她就是她）；多带场景 / 开场白 / 示例对白三样。
 * 卡里一格设定都没写 → `null`，调用方照工作模式答（只剩名字的角色演不出来）。
 */
function toChatPersona(
  persona: AssistantPersona,
  card: PersonaCharacterRow & { extensions: unknown },
): AssistantPromptPersona | null {
  const profile = readCharacterProfile(card)
  if (!profile) return null
  const speech = profile.speech.trim()
  const promptCharacter = toPromptCharacter(card.name, profile, speech)
  if (!promptCharacter) return null
  const roleplay: AssistantPromptRoleplay = {
    scenario: profile.scenario.trim(),
    opening: profile.opening.trim(),
    examples: profile.examples.filter(
      (example) => example.user.trim() || example.reply.trim(),
    ),
    world: readTavernWorldBook(card.extensions),
    /** 你在她的故事里是谁 —— 按角色记在卡上（owner 2026-10-16），每段聊天都带。 */
    userRole: readChatUserRole(card.extensions),
  }
  return {
    ...persona,
    name: card.name.slice(0, ASSISTANT_PERSONA_LIMITS.maxNameChars),
    characterCardId: card.id,
    ...(speech
      ? { tone: ASSISTANT_PERSONA_TONE_IDS.custom, toneCustom: speech }
      : {}),
    promptCharacter,
    roleplay,
  }
}

/**
 * 只读助手选的那个模型（`auto` 或路由表里的一个 modelId）—— 助手以外那几样小功能
 * （标签台翻译、「满意」评估、试读……）跟着助手走时用（`resolveAssistantRoute`，
 * owner 2026-10-15「全跟助手」）。⛔ 不为一个模型 id 读整份 persona 连角色卡。
 */
export async function getAssistantRouteModelByUserId(
  userId: string,
): Promise<AssistantPersona['routeModel']> {
  const row = await db.assistantPersona.findUnique({
    where: { userId },
    select: { routeModel: true },
  })
  return normalizeRouteModel(row?.routeModel)
}

/**
 * 语气自定义那一句 —— **拼进系统提示之前先过 `prompt-guard`**（§8.5）。
 *
 * ⚠ 它是这份 persona 里唯一一段自由文本，而它直连系统提示。清洗放在服务端读的
 * 这一跳、⛔ 不放在写入时：写入时清洗会把用户设置界面里看到的那句话悄悄改掉，
 * 而他并不知道自己被改了什么。
 */
export function sanitizeToneCustom(persona: AssistantPersona): string | null {
  if (persona.tone !== ASSISTANT_PERSONA_TONE_IDS.custom) return null
  if (!persona.toneCustom) return null
  const cleaned = sanitizePrompt(persona.toneCustom).trim()
  if (!cleaned) return null
  /**
   * 跟着角色走时这一句是角色设定里的「说话方式」（`getAssistantPersonaByUserId`
   * 换进来的），上限比自己写的那一句宽一档。
   */
  return cleaned.slice(
    0,
    persona.toneFromCharacter
      ? ASSISTANT_PERSONA_LIMITS.maxCharacterSpeechChars
      : ASSISTANT_PERSONA_LIMITS.maxToneCustomChars,
  )
}

/**
 * 「怎么称呼你」那一格（§11.3）—— 与 `sanitizeToneCustom` 逐字同一条判据：
 * 它是 persona 里第二段直连系统提示的自由文本，所以**读的这一跳过
 * `prompt-guard`**，⛔ 不在写入时清洗（用户会看不见自己被改了什么）。
 */
export function sanitizeAddressUserAs(
  persona: AssistantPersona,
): string | null {
  if (!persona.addressUserAs) return null
  const cleaned = sanitizePrompt(persona.addressUserAs).trim()
  if (!cleaned) return null
  return cleaned.slice(0, ASSISTANT_PERSONA_LIMITS.maxAddressUserAsChars)
}

/** 截断并在截处留一个省略号（让模型知道后面还有）。 */
function clipText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text
}

/**
 * 酒馆卡里的宏（`{{char}}` / `{{user}}`，老卡写 `<BOT>` / `<USER>`）换成名字。
 * 导入时原样存，⛔ 不在导入时换：称呼会改，卡不该跟着被改写。
 */
function fillCardMacros(text: string, char: string, user: string): string {
  return text
    .replace(/\{\{char\}\}|<BOT>/gi, char)
    .replace(/\{\{user\}\}|<USER>/gi, user)
}

/**
 * 角色设定进系统提示之前（附录J ①）：每一格过 `prompt-guard`、填宏、按格截断；
 * 洗完一格都不剩就是 `null`。
 *
 * ⚠ 这张卡可能是从酒馆导入的**别人写的卡**，与 `sanitizeToneCustom` 同理在读的这一跳
 * 清洗，⛔ 不在写入时改用户看得见的原文。
 */
export function sanitizePromptCharacter(
  persona: AssistantPromptPersona,
): AssistantPromptCharacter | null {
  const character = persona.promptCharacter
  if (!character) return null
  const name =
    sanitizePrompt(character.name)
      .trim()
      .slice(0, ASSISTANT_PERSONA_LIMITS.maxNameChars) ||
    persona.name ||
    ''
  if (!name) return null
  const user = sanitizeAddressUserAs(persona) ?? 'the creator'
  const clean = (text: string, max: number) =>
    clipText(sanitizePrompt(fillCardMacros(text, name, user)).trim(), max)
  return toPromptCharacter(
    name,
    {
      identity: clean(
        character.identity,
        ASSISTANT_PERSONA_LIMITS.maxCharacterIdentityChars,
      ),
      behavior: clean(
        character.behavior,
        ASSISTANT_PERSONA_LIMITS.maxCharacterBehaviorChars,
      ),
      speech: '',
      catchphrases: character.catchphrases
        .slice(0, ASSISTANT_PERSONA_LIMITS.maxCharacterCatchphrases)
        .map((phrase) => clean(phrase, 120)),
      moods: (character.moods ?? [])
        .map((mood) => clean(mood, CHARACTER_PERSONA_LIMITS.moodChars))
        .filter(Boolean)
        .slice(0, CHARACTER_PERSONA_LIMITS.moods),
      learnedPhrases: (character.learnedPhrases ?? [])
        .map((phrase) =>
          clean(phrase, CHARACTER_PERSONA_LIMITS.learnedPhraseChars),
        )
        .filter(Boolean)
        .slice(-CHARACTER_PERSONA_LIMITS.learnedPhrases),
      scenario: '',
      opening: '',
      examples: [],
      backstory: clean(
        character.backstory,
        ASSISTANT_PERSONA_LIMITS.maxCharacterBackstoryChars,
      ),
      boundaries: clean(
        character.boundaries,
        ASSISTANT_PERSONA_LIMITS.maxCharacterBoundariesChars,
      ),
    },
    clean(
      character.speech,
      ASSISTANT_PERSONA_LIMITS.maxCharacterProfileSpeechChars,
    ),
  )
}

/**
 * 聊天模式那三样进系统提示前的清洗（同 `sanitizePromptCharacter`：清洗 / 填宏 / 截断）。
 * 没在聊天 → `null`（三样都空也照样是聊天模式）。
 */
export function sanitizePromptRoleplay(
  persona: AssistantPromptPersona,
): AssistantPromptRoleplay | null {
  const roleplay = persona.roleplay
  const character = sanitizePromptCharacter(persona)
  if (!roleplay || !character) return null
  const user = sanitizeAddressUserAs(persona) ?? 'the creator'
  const clean = (text: string, max: number) =>
    clipText(
      sanitizePrompt(fillCardMacros(text, character.name, user)).trim(),
      max,
    )
  const cleaned = {
    scenario: clean(
      roleplay.scenario,
      ASSISTANT_PERSONA_LIMITS.maxRoleplayScenarioChars,
    ),
    opening: clean(
      roleplay.opening,
      ASSISTANT_PERSONA_LIMITS.maxRoleplayOpeningChars,
    ),
    examples: roleplay.examples
      .slice(0, ASSISTANT_PERSONA_LIMITS.maxRoleplayExamples)
      .map((example) => ({
        user: clean(
          example.user,
          ASSISTANT_PERSONA_LIMITS.maxRoleplayExampleChars,
        ),
        reply: clean(
          example.reply,
          ASSISTANT_PERSONA_LIMITS.maxRoleplayExampleChars,
        ),
      }))
      .filter((example) => example.reply),
    world: sanitizeWorldNotes(roleplay.world ?? [], clean),
    userRole: clean(
      roleplay.userRole ?? '',
      ASSISTANT_PERSONA_LIMITS.maxChatUserRoleChars,
    ),
  }
  return cleaned
}

/**
 * 进提示的那几条世界书：清洗、填宏、单条截断，条数与总长封顶（前面的优先，内核已按命中挑过）。
 * ⚠ 关键词不进提示，只留正文。
 */
function sanitizeWorldNotes(
  world: readonly AssistantPromptWorldEntry[],
  clean: (text: string, max: number) => string,
): AssistantPromptWorldEntry[] {
  const notes: AssistantPromptWorldEntry[] = []
  let total = 0
  for (const entry of world) {
    if (notes.length >= ASSISTANT_PERSONA_LIMITS.maxWorldNotes) break
    const content = clean(
      entry.content,
      ASSISTANT_PERSONA_LIMITS.maxWorldNoteChars,
    )
    if (!content) continue
    if (
      total + content.length >
      ASSISTANT_PERSONA_LIMITS.maxWorldNotesTotalChars
    )
      break
    total += content.length
    notes.push({ keys: [], content, constant: entry.constant })
  }
  return notes
}

/**
 * 用的角色必须是这个用户自己的、还没删的那张。⛔ 不信客户端递来的 id。
 */
async function assertOwnCharacterCard(
  userId: string,
  characterCardId: string,
): Promise<void> {
  const card = await db.characterCard.findFirst({
    where: { id: characterCardId, userId, isDeleted: false },
    select: { id: true },
  })
  if (!card) {
    throw new ApiRequestError(
      'ASSISTANT_CHARACTER_NOT_FOUND',
      404,
      'errors.assistantPersona.characterNotFound',
      'Character card not found',
    )
  }
}

/**
 * 写一份 persona（改了就存，助手设置 B）。
 *
 * ⚠ 两张图的地址**不在这条路上**：上传的那张由上传那条腿写（客户端递一条 URL
 * 进来就等于绕开 R2 的生命周期），角色主图住角色卡。
 * ⚠ **名字跟着角色走时不动库里那一格**：客户端递上来的是显示的那个名字（角色名），
 * 落库就会把创作者自己的名字盖掉 —— 选回「不用角色」时它得还在（那一下同样不写）。
 */
export async function upsertAssistantPersona(
  clerkId: string,
  input: UpdateAssistantPersonaRequest,
): Promise<AssistantPersona> {
  const user = await ensureUser(clerkId)
  if (input.characterCardId) {
    await assertOwnCharacterCard(user.id, input.characterCardId)
  }
  const usesCharacter = input.characterCardId !== null
  const nameFromCharacter = usesCharacter && input.nameFromCharacter
  /**
   * 「不用角色」那一下，客户端手里只有显示的那个名字（角色名）。库里那一格此刻
   * 还是创作者自己的名字（跟着角色时从没被写过）—— 留着它，选回来就是自己那一份。
   */
  const stored = await db.assistantPersona.findUnique({
    where: { userId: user.id },
    select: { nameFromCharacter: true, characterCardId: true },
  })
  const leavingCharacterName =
    !usesCharacter &&
    Boolean(stored?.nameFromCharacter && stored.characterCardId)
  const keepStoredName = nameFromCharacter || leavingCharacterName

  const data = {
    ...(keepStoredName ? {} : { name: input.name }),
    /** 选的是预设就把它记成字形回落；选的是图时保留原来那一款。 */
    avatarPreset: isAvatarPresetChoice(input.avatarChoice)
      ? input.avatarChoice
      : input.avatarPreset,
    /** 没用角色却选了「角色的头像」= 没有这一项，落 NULL 让读的那一跳回推。 */
    avatarChoice:
      input.avatarChoice === ASSISTANT_AVATAR_CHOICE_IDS.character &&
      !usesCharacter
        ? null
        : input.avatarChoice,
    characterCardId: input.characterCardId,
    nameFromCharacter,
    toneFromCharacter: usesCharacter && input.toneFromCharacter,
    tone: input.tone,
    /** 换回非 custom 档时那句话就该消失 —— 留着它下次选回 custom 会诈尸。 */
    toneCustom:
      input.tone === ASSISTANT_PERSONA_TONE_IDS.custom
        ? input.toneCustom
        : null,
    verbosity: input.verbosity,
    planMode: input.planMode,
    language: input.language,
    /**
     * 「自动」在库里就是 **null**（§4.5）——⛔ 不存字符串 `'auto'`：那样
     * 「没选过」和「选了自动」会变成两个值，而它们是同一件事。
     */
    routeModel:
      input.routeModel === ASSISTANT_ROUTE_MODEL_AUTO ? null : input.routeModel,
    ...(input.reasoningEffort
      ? { reasoningEffort: input.reasoningEffort }
      : {}),
    /** v2 §11.3 的三项 —— 两个开关照原样落，称呼留空即 null（= 用账号名）。 */
    nextStepHint: input.nextStepHint,
    useMyWords: input.useMyWords,
    memoryCapture: input.memoryCapture,
    /**
     * 三档人设（§11.1）——⚠ **服务端自己算，⛔ 不落客户端递来的那个名字**。
     * 递上来的 `archetype` 只是界面上亮着哪一档，而库里这一列要为「那一档的三行
     * 副文案」背书：只有四格逐格对得上时它才是那一档，对不上就落 `null`
     * （= 自定义）。这样客户端漏清一次也不会让用户看到一句假承诺。
     */
    archetype: matchAssistantPersonaArchetype(input),
    addressUserAs: input.addressUserAs,
  }

  const row = await db.assistantPersona.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
    select: PERSONA_SELECT,
  })

  return toPersona(row)
}
