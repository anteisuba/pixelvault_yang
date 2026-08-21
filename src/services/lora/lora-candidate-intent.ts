import 'server-only'

/**
 * 「这一轮要不要去搜 LoRA 候选」的确定性判定（切片 3，任务包 §D）。
 *
 * ── 为什么不是每轮都搜 ─────────────────────────────────────────────
 * 每轮都打两个外部源，代价是钱、是延迟、也是噪音：用户在讨论光影的时候塞六条
 * LoRA 候选进上下文，只会稀释他正在说的事。检索线已经用同一条思路解决过一次
 * （`lib/research-intent.ts`：生态常识类问题**根本不打源**），这里照抄那条路数。
 *
 * ⚠ **判不出意图就不注入候选，于是模型自然不会出 `[[lora]]` 块** —— 输出契约
 * 本身也是条件注入的（`buildAssistantLoraCandidateDirective`）。这是「不给列表
 * 就别让它开口」的结构保证，不是靠提示词里写一句「没有候选时别推荐」。
 *
 * 纯函数、无 IO。误判的代价不对称：**漏判**只是这一轮没有推荐卡（用户再说一句
 * 「有没有这种 LoRA」就能触发）；**误判**是白花一次检索。所以门槛定得偏严 ——
 * 要同时看到「LoRA 这个东西」和「想找一个」两件事。
 */

import { LORA_CANDIDATE_LIMITS } from '@/constants/lora-candidate'

/**
 * 「LoRA 这个东西」的名词面。
 *
 * ⛔ **裸的「模型」不在里面**：在这个工作台里「模型」压倒性地指生成模型
 * （Flux / SDXL），那是 `[[setup]]` 的地盘。把它算进来，「有没有别的模型可以
 * 试试」会去搜 LoRA —— 答非所问，还花钱。复合词（画风模型 / 角色模型）才收。
 */
const LORA_NOUN_TERMS = [
  'lora',
  'loras',
  'lycoris',
  '画风模型',
  '风格模型',
  '角色模型',
  '人物模型',
  'style model',
  'character model',
]

/** 「想找一个」的动词面。 */
const SEEK_TERMS = [
  '找',
  '搜',
  '推荐',
  '有没有',
  '求',
  '哪里下',
  '哪里能下',
  '下载',
  '装一个',
  '挂一个',
  '来一个',
  '导入',
  'find',
  'search for',
  'looking for',
  'recommend',
  'suggest',
  'any good',
  'is there a',
  'are there any',
  'where can i get',
  'download',
]

/**
 * 名词面缺席也算数的整句式 —— 「给我推荐个 lora」这类已经被上面两条覆盖，
 * 这里收的是**指名道姓要 LoRA 库**的说法。
 */
const EXPLICIT_LORA_DISCOVERY_TERMS = ['civitai', 'c 站', 'huggingface 上']

function includesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(needle))
}

/**
 * 检索词里没必要留的脚手架。
 *
 * ⚠ **`lora` 自己也剥掉**：两个源的检索本来就已经按 LoRA 过滤（Civitai
 * `type=LORA`，HF 的 discovery filter），把 "lora" 留在词里只会在 HF 那边
 * 把命中拉向仓库名里带 "lora" 的那批，与用户要的画风/角色无关。
 */
const QUERY_NOISE_PATTERN =
  /(请问|麻烦|帮我|你好|请|给我|我想|我要|想找|找一个|找个|搜一下|推荐一下|推荐个|推荐一个|有没有|哪里下载|下载|looking for|can you find|please|find me|recommend( me)?|suggest( me)?|is there an?|are there any|a good|some good)/gi

const LORA_TOKEN_PATTERN = /\b(loras?|lycoris)\b/gi

export interface LoraCandidateIntent {
  /** 这一轮该不该打 Civitai / HF。 */
  shouldSearch: boolean
  /** 打源时用的检索词（已剥脚手架并截断）。`shouldSearch:false` 时为空串。 */
  query: string
  /** 判定理由 —— 进日志和回执，「本轮没搜·原因」要说得出口。 */
  reason: string
}

const NOT_SEARCHING = (reason: string): LoraCandidateIntent => ({
  shouldSearch: false,
  query: '',
  reason,
})

function toCandidateQuery(text: string): string {
  return text
    .replace(LORA_TOKEN_PATTERN, ' ')
    .replace(QUERY_NOISE_PATTERN, ' ')
    .replace(/[？?。！!,，、]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LORA_CANDIDATE_LIMITS.maxQueryLength)
}

/**
 * 判这一轮要不要搜 LoRA 候选。返回值永远合法，调用方不需要判空。
 */
export function planLoraCandidateSearch(text: string): LoraCandidateIntent {
  const raw = text.trim()
  if (!raw) return NOT_SEARCHING('empty message')

  const lowered = raw.toLowerCase()
  const hasLoraNoun = includesAny(lowered, LORA_NOUN_TERMS)
  const hasSeek = includesAny(lowered, SEEK_TERMS)
  const namesLoraSource = includesAny(lowered, EXPLICIT_LORA_DISCOVERY_TERMS)

  if (!hasLoraNoun && !namesLoraSource) {
    return NOT_SEARCHING('no lora discovery signal')
  }
  if (!hasSeek) {
    // 「我挂了两个 LoRA 你能看到吗」「这个 LoRA 的触发词是什么」—— 提到了
    // LoRA，但要的不是**另一把**。给他一堆候选是打断，不是帮忙。
    return NOT_SEARCHING('lora mentioned, but not as a request to find one')
  }

  const query = toCandidateQuery(raw)
  if (!query) {
    // 剥完脚手架什么都不剩（「推荐个 lora」）—— 没有主语可搜。搜空词换回来的
    // 是热门榜，与这轮对话无关；宁可不注入，让助手照协议先反问要什么风格。
    return NOT_SEARCHING('lora request has no searchable subject yet')
  }

  return { shouldSearch: true, query, reason: 'lora discovery intent' }
}
