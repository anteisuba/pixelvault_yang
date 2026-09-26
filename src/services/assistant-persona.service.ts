import 'server-only'

import { db } from '@/lib/db'
import {
  ASSISTANT_AVATAR_CHOICE_IDS,
  ASSISTANT_AVATAR_CHOICES,
  ASSISTANT_PERSONA_DEFAULTS,
  ASSISTANT_PERSONA_LIMITS,
  ASSISTANT_PERSONA_TONE_IDS,
  ASSISTANT_ROUTE_MODEL_AUTO,
  isAvatarPresetChoice,
  matchAssistantPersonaArchetype,
  normalizeAvatarPreset,
  normalizeRouteModel,
  type AssistantAvatarChoice,
} from '@/constants/assistant-persona'
import { ApiRequestError } from '@/lib/errors'
import { sanitizePrompt } from '@/services/kernel/prompt-guard'
import { ensureUser } from '@/services/user.service'
import { CharacterPersonaSchema } from '@/types'
import {
  AssistantPersonaSchema,
  type AssistantPersona,
  type AssistantPersonaCharacter,
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
  sourceImageUrl: string
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
  nextStepHint: boolean
  useMyWords: boolean
  archetype: string | null
  addressUserAs: string | null
}

/**
 * 角色设定里那段「说话方式」（去掉首尾空白）；没写 / 读不出来是空串。
 * ⚠ 走角色卡自己的 schema，⛔ 不 `as`：`persona` 在库里是一格 Json。
 */
function readCharacterSpeech(card: PersonaCharacterRow | null): string {
  if (!card || card.isDeleted) return ''
  const parsed = CharacterPersonaSchema.safeParse(card.persona ?? {})
  return parsed.success ? parsed.data.speech.trim() : ''
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
    faceUrl: card.sourceImageUrl || null,
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
  const stored = (ASSISTANT_AVATAR_CHOICES as readonly string[]).includes(
    row.avatarChoice ?? '',
  )
    ? (row.avatarChoice as AssistantAvatarChoice)
    : null
  if (stored === ASSISTANT_AVATAR_CHOICE_IDS.character && character) {
    return stored
  }
  if (stored === ASSISTANT_AVATAR_CHOICE_IDS.upload && row.avatarUrl) {
    return stored
  }
  if (stored && isAvatarPresetChoice(stored)) return stored
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
   * ⚠ `avatarPreset` **单独先回落**（`normalizeAvatarPreset`）：预设从六款收成
   * 两款之后，库里还留着 `spark` / `tide` 这类悬空 id。交给下面那一发 safeParse
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
      sourceImageUrl: true,
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
  nextStepHint: true,
  useMyWords: true,
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
 * 过一次了，`runAssistantOperator` 的第一行），⛔ 别为了统一签名再查一次用户。
 *
 * ⭐ 与设置里读的那一份只差一件事：**语气跟着角色走、而角色写了说话方式**时，
 * 把那段说话方式换进 `tone = custom` / `toneCustom`，风格段照常读它（上限见
 * `sanitizeToneCustom`）。名字不用换 —— `toPersona` 读出来的已经是显示的那个名字。
 */
export async function getAssistantPersonaByUserId(
  userId: string,
): Promise<AssistantPersona> {
  const row = await findPersonaRow(userId)
  const persona = toPersona(row)
  const speech = row ? readCharacterSpeech(row.characterCard) : ''
  if (!persona.toneFromCharacter || !speech) return persona
  return {
    ...persona,
    tone: ASSISTANT_PERSONA_TONE_IDS.custom,
    toneCustom: speech,
  }
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
    /** v2 §11.3 的三项 —— 两个开关照原样落，称呼留空即 null（= 用账号名）。 */
    nextStepHint: input.nextStepHint,
    useMyWords: input.useMyWords,
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
