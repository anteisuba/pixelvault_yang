/**
 * **助手记忆**的词表、上限与敏感类目（进度表 56a · 最简版）。
 *
 * 一条记忆 = **一行字**。它由助手在**每轮结账**时产出，落进 `AssistantMemory`，
 * 下一轮按域注入系统提示，用户在 `/settings/assistant` 里随时改、随时删。
 *
 * ── 它与上下文卡的分界（⛔ 没有桥）──────────────────────────────
 * 卡 = 用户**亲手经营**的素材（正文 · 图 · 硬否定 · 常挂范围 · `@` 点名）；
 * 记忆 = 助手**观察到**的一行事实或偏好。两者不互相升降级 —— owner 2026-09-19
 * 明确撤掉了「存为卡」那条路（「太复杂，Claude 不会这么设计」）。
 *
 * ⛔ 这一轮**不做**：分组 · 时间线分段 · 容量表 · 负规则 · 导出 · 回执逐条编辑。
 * ⛔ 也不接 Anthropic 原生 memory tool（05b 已拍板）。
 */

import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'

/**
 * 一条记忆挂在哪个域。
 *
 * ⚠ 前四档与 `ASSISTANT_PROTOCOL_DOMAIN_IDS` **逐字同源**（⛔ 不另抄一份字面量）：
 * 注入那一跳要用当前域直接查表，两份词表漂了的表现是「明明记着，就是不注入」。
 * ⚠ `global` 是第五档，**没有对应的域** —— 它是「跟你站在哪台工作台无关的那些」
 * （说话语言、称呼、通用工作习惯），每一轮都跟着当前域一起注入。
 */
export const ASSISTANT_MEMORY_SCOPE_IDS = {
  image: ASSISTANT_PROTOCOL_DOMAIN_IDS.image,
  video: ASSISTANT_PROTOCOL_DOMAIN_IDS.video,
  canvas: ASSISTANT_PROTOCOL_DOMAIN_IDS.canvas,
  lora: ASSISTANT_PROTOCOL_DOMAIN_IDS.lora,
  global: 'global',
} as const

export const ASSISTANT_MEMORY_SCOPES = [
  ASSISTANT_MEMORY_SCOPE_IDS.image,
  ASSISTANT_MEMORY_SCOPE_IDS.video,
  ASSISTANT_MEMORY_SCOPE_IDS.canvas,
  ASSISTANT_MEMORY_SCOPE_IDS.lora,
  ASSISTANT_MEMORY_SCOPE_IDS.global,
] as const

export type AssistantMemoryScopeId = (typeof ASSISTANT_MEMORY_SCOPES)[number]

/**
 * 总览列表顶部那排筛选 chip 的次序：**全部 · 图片 · 视频 · 画布 · LoRA**。
 *
 * ⚠ `global` **不单独出一颗 chip**（画板上没有它）：它跟着「全部」出现。
 * ⛔ 别为了「完整」补上第六颗 —— 用户脑子里没有「全局记忆」这个类目。
 */
export const ASSISTANT_MEMORY_FILTER_SCOPES = [
  ASSISTANT_MEMORY_SCOPE_IDS.image,
  ASSISTANT_MEMORY_SCOPE_IDS.video,
  ASSISTANT_MEMORY_SCOPE_IDS.canvas,
  ASSISTANT_MEMORY_SCOPE_IDS.lora,
] as const

/** 一条记忆是哪一类。⚠ 只影响提示里的措辞，⛔ 不影响注入顺序。 */
export const ASSISTANT_MEMORY_KIND_IDS = {
  preference: 'preference',
  fact: 'fact',
  rule: 'rule',
} as const

export const ASSISTANT_MEMORY_KINDS = [
  ASSISTANT_MEMORY_KIND_IDS.preference,
  ASSISTANT_MEMORY_KIND_IDS.fact,
  ASSISTANT_MEMORY_KIND_IDS.rule,
] as const

export type AssistantMemoryKindId = (typeof ASSISTANT_MEMORY_KINDS)[number]

export const ASSISTANT_MEMORY_LIMITS = {
  /**
   * **每域**最多几条。撞上限时按 `lastUsedAt` 最旧的**静默**删。
   * ⛔ 不画容量表、不变灰、不提示 —— owner 2026-09-20：「容量表撤」。
   */
  maxPerScope: 200,
  /** 一行字的长度。⚠ 它每一轮都进系统提示，⛔ 别放宽成一段话。 */
  maxTextChars: 200,
  /** 一轮结账最多收几条候选 —— 再多就不是「这一轮学到的」而是复述整段对话。 */
  maxPerRound: 6,
  /**
   * **当前域 + global 一共注入几条**（按 `lastUsedAt` 倒序）。
   *
   * ⚠ 它与上下文卡**共用一份预算**，见 `ASSISTANT_CONTEXT_BUDGET`：这个数是
   * 记忆单独能占的上限，真正进提示的条数还要减去这一轮挂着的卡。
   */
  maxInPrompt: 8,
} as const

/**
 * **上下文卡与记忆共用的那一份预算**（owner 2026-09-20：「N 与上下文卡共用一份
 * token 预算、卡优先」）。
 *
 * ⭐ **卡优先**是有理由的：卡是用户亲手挂上去的（「这台工作台上带着它」），
 * 记忆是助手自己观察来的。预算紧张时先让位的该是后者。
 * ⚠ 这个数是**条数**不是 token 数：卡进提示的是一句摘要、记忆进提示的是一行字，
 * 两者量级相同，按条数分配比估 token 更可检查。
 */
export const ASSISTANT_CONTEXT_BUDGET = {
  /** 卡 + 记忆加起来最多几条进系统提示。 */
  maxEntries: 12,
} as const

/**
 * **敏感类目**（owner 2026-09-20）—— 命中的候选**服务端静默跳过**。
 *
 * ⚠ 三条纪律，一条都不能松：
 *  ① 不写库；
 *  ② **不进回执计数**（用户看到的 N 里没有它）；
 *  ③ **不写任何日志明文** —— 记一行「跳过了：身份证号 3301…」等于把它换个地方存了。
 * ⛔ 也不提示「有 N 条被跳过」：那一句本身就在告诉用户「我读到了那个东西」。
 *
 * ⚠ 本轮是**确定性**的关键词 / 模式匹配，⛔ 不调模型判：判空的代价是漏写一条
 * 偏好，判错的代价是把身份证号写进长期记忆 —— 两边不对称，所以宁可宽。
 */
export const ASSISTANT_MEMORY_SENSITIVE_CATEGORIES = [
  'identityDocument',
  'credentials',
  'health',
  'intimateRelations',
  'financialAccount',
  'minors',
] as const

export type AssistantMemorySensitiveCategory =
  (typeof ASSISTANT_MEMORY_SENSITIVE_CATEGORIES)[number]

/**
 * 每个类目的判据。
 *
 * ⚠ 中英日三语的说法都要在场：助手说哪种语言由用户决定，只写英文的表现是
 * 中文那一条一路写进库。
 * ⚠ 正则一律**不带 `g` 标志**：带 `g` 的正则在 `.test()` 之间会记住 `lastIndex`，
 * 同一条模式第二次匹配就会莫名其妙地失手。
 */
export const ASSISTANT_MEMORY_SENSITIVE_PATTERNS: Readonly<
  Record<AssistantMemorySensitiveCategory, readonly RegExp[]>
> = {
  identityDocument: [
    /身份证|护照|驾驶证|社保号|户口本/i,
    /マイナンバー|パスポート|運転免許/i,
    /\b(passport|national id|ssn|social security|driver'?s licen[sc]e|id card number)\b/i,
    /\b\d{6}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dxX]\b/,
    /\b\d{3}-\d{2}-\d{4}\b/,
  ],
  credentials: [
    /密码|口令|密钥|验证码|私钥|助记词/i,
    /パスワード|暗証番号|秘密鍵/i,
    /\b(password|passphrase|api[ _-]?key|secret[ _-]?key|access[ _-]?token|private[ _-]?key|seed phrase|otp|2fa code)\b/i,
    /\b(sk|pk)-[A-Za-z0-9_-]{16,}\b/,
  ],
  health: [
    /病历|诊断|确诊|抑郁症|焦虑症|癌症|怀孕|孕期|用药|处方|残疾|精神病/i,
    /診断|病歴|処方|妊娠/i,
    /\b(diagnos(is|ed)|prescription|medication|pregnan(t|cy)|disabilit(y|ies)|mental illness|depression|cancer|hiv)\b/i,
  ],
  intimateRelations: [
    /性取向|性生活|出轨|婚外|离婚|恋情|前任|性癖/i,
    /性的指向|不倫|離婚/i,
    /\b(sexual orientation|sex life|affair|divorce|dating history|fetish)\b/i,
  ],
  financialAccount: [
    /银行卡|信用卡|银行账[号户]|支付宝|微信支付|余额|工资|薪资|收入|欠款|贷款/i,
    /口座番号|クレジットカード|給与/i,
    /\b(bank account|credit card|iban|routing number|salary|income|debt|loan|card number)\b/i,
    /\b(?:\d[ -]?){13,19}\b/,
  ],
  minors: [
    /未成年|小学生|初中生|幼儿园|孩子今年\s*\d+\s*岁|儿子今年|女儿今年/i,
    /未成年|小学生|幼稚園/i,
    /\b(minor|underage|my (son|daughter|kid|child) is \d+|elementary school|kindergarten)\b/i,
  ],
}

/**
 * 归一化 —— 字面去重比的是它，⛔ 不是原文。
 *
 * 归一三件：大小写、空白（含全角空格）、标点。⚠ 中英标点都收：同一句话
 * 「偏好 16:9，除非我明说」与「偏好16:9, 除非我明说」是同一条，而按原文比
 * 会写成两行。
 */
export function normalizeAssistantMemoryText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s　]+/g, '')
    .replace(
      /[.,!?;:'"`~()[\]{}<>/\\|_\-—–…。，、！？；：「」『』（）《》〈〉·]/g,
      '',
    )
}
