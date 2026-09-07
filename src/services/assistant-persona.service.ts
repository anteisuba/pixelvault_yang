import 'server-only'

import { db } from '@/lib/db'
import {
  ASSISTANT_PERSONA_DEFAULTS,
  ASSISTANT_PERSONA_LIMITS,
  ASSISTANT_PERSONA_TONE_IDS,
  normalizeAvatarPreset,
} from '@/constants/assistant-persona'
import { sanitizePrompt } from '@/services/kernel/prompt-guard'
import { ensureUser } from '@/services/user.service'
import {
  AssistantPersonaSchema,
  type AssistantPersona,
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

/** 库里那一行（部分列）→ 协议形状。缺行时整份走默认值。 */
function toPersona(
  row: {
    name: string | null
    avatarPreset: string | null
    avatarUrl: string | null
    tone: string
    toneCustom: string | null
    verbosity: string
    planMode: string
    language: string
  } | null,
): AssistantPersona {
  if (!row) {
    return {
      ...ASSISTANT_PERSONA_DEFAULTS,
      avatarUrl: null,
    }
  }

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
    ...row,
    avatarPreset:
      row.avatarPreset === null
        ? null
        : normalizeAvatarPreset(row.avatarPreset),
  })
  return parsed.success
    ? parsed.data
    : { ...ASSISTANT_PERSONA_DEFAULTS, avatarUrl: null }
}

const PERSONA_SELECT = {
  name: true,
  avatarPreset: true,
  avatarUrl: true,
  tone: true,
  toneCustom: true,
  verbosity: true,
  planMode: true,
  language: true,
} as const

export async function getAssistantPersona(
  clerkId: string,
): Promise<AssistantPersona> {
  const user = await ensureUser(clerkId)
  return getAssistantPersonaByUserId(user.id)
}

/**
 * 同上，但吃的是**库里的 user.id** —— 工具环那一侧已经 `ensureUser` 过一次了
 * （`runAssistantOperator` 的第一行），⛔ 别为了统一签名再查一次用户。
 */
export async function getAssistantPersonaByUserId(
  userId: string,
): Promise<AssistantPersona> {
  const row = await db.assistantPersona.findUnique({
    where: { userId },
    select: PERSONA_SELECT,
  })
  return toPersona(row)
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
  return cleaned.slice(0, ASSISTANT_PERSONA_LIMITS.maxToneCustomChars)
}

/**
 * 写一份 persona（保存即写，§8.1）。
 *
 * ⚠ 头像那两列**不在这条路上**：它们由上传/移除那条腿写，客户端递一条 URL
 * 进来就等于绕开 R2 的生命周期（旧对象再也没人删）。
 */
export async function upsertAssistantPersona(
  clerkId: string,
  input: UpdateAssistantPersonaRequest,
): Promise<AssistantPersona> {
  const user = await ensureUser(clerkId)

  const data = {
    name: input.name,
    avatarPreset: input.avatarPreset,
    tone: input.tone,
    /** 换回非 custom 档时那句话就该消失 —— 留着它下次选回 custom 会诈尸。 */
    toneCustom:
      input.tone === ASSISTANT_PERSONA_TONE_IDS.custom
        ? input.toneCustom
        : null,
    verbosity: input.verbosity,
    planMode: input.planMode,
    language: input.language,
  }

  const row = await db.assistantPersona.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
    select: PERSONA_SELECT,
  })

  return toPersona(row)
}
