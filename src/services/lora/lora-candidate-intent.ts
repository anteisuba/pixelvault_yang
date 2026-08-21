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
 * 「这句话是在找一把 LoRA」的严格判据 —— 名词面与动词面**都要有**。
 *
 * 单独抽出来是因为它要被用两次：判**这一句**，也判**上一句**（见下面的续问态）。
 * ⚠ 它永远只看一句话、永远不递归 —— 续问态的传染性必须止于一轮。
 */
function hasLoraDiscoveryIntent(text: string): boolean {
  const lowered = text.trim().toLowerCase()
  if (!lowered) return false
  if (
    !includesAny(lowered, LORA_NOUN_TERMS) &&
    !includesAny(lowered, EXPLICIT_LORA_DISCOVERY_TERMS)
  ) {
    return false
  }
  return includesAny(lowered, SEEK_TERMS)
}

/**
 * 判这一轮要不要搜 LoRA 候选。返回值永远合法，调用方不需要判空。
 *
 * `previousUserText` = 上一条**用户**消息。给了它才有续问态，见下。
 */
export function planLoraCandidateSearch(
  text: string,
  options?: { previousUserText?: string },
): LoraCandidateIntent {
  const raw = text.trim()
  if (!raw) return NOT_SEARCHING('empty message')

  if (hasLoraDiscoveryIntent(raw)) {
    const query = toCandidateQuery(raw)
    if (!query) {
      // 剥完脚手架什么都不剩（「推荐个 lora」）—— 没有主语可搜。搜空词换回来的
      // 是热门榜，与这轮对话无关；宁可不注入，让助手照协议先反问要什么风格。
      // ⚠ 这条**不是死路**：下一轮用户答上来的关键词由续问态接住。
      return NOT_SEARCHING('lora request has no searchable subject yet')
    }
    return { shouldSearch: true, query, reason: 'lora discovery intent' }
  }

  const lowered = raw.toLowerCase()
  const hasLoraNoun = includesAny(lowered, LORA_NOUN_TERMS)
  const namesLoraSource = includesAny(lowered, EXPLICIT_LORA_DISCOVERY_TERMS)

  // ── 续问态（2026-08-22 真机补）───────────────────────────────────────
  // 修的是一条**自相矛盾**的路径：助手自己反问「重新搜索 LoRA，请告诉我关键词」，
  // 用户照做答「illustrious style」，而这句话里既没有 LoRA 名词面也没有寻找动词
  // —— 严格闸判「no lora discovery signal」，于是助手空手作答。**提示语本身就是
  // 让他只打关键词的**，闸却听不见他照做。
  //
  // ⚠ 接管条件是「这句话**完全没有** LoRA 信号」，不是「不满足严格闸」：
  //   带名词却没有动词的那类（「这个 LoRA 的触发词是什么」）要**留给**下面那条
  //   原判据 —— 它要的不是另一把，塞一堆候选是打断。续问态只接**光给关键词**的。
  //
  // ⚠ 只看**上一句**，且上一句只过严格闸（`hasLoraDiscoveryIntent` 不递归）——
  //   所以续问态最多续一轮，不会在长对话里自我传染成「每轮都打源」。
  //   已知代价（记名接受）：
  //   ① 上一轮已经给出推荐卡、这一轮用户是**在用**卡（「第一个不错，看看触发词」）
  //      会白搜一次 —— 一次检索，约 1s，不花钱；
  //   ② 连续两轮都没搜到东西时，第三轮要用户重新说一次「LoRA」。
  //   两条都是「漏判/误判都便宜」的成本模型下可接受的，⛔ 别为它们去翻对话历史
  //   猜意图，那会把这条闸从确定性函数变成第二个会幻觉的地方。
  if (
    !hasLoraNoun &&
    !namesLoraSource &&
    options?.previousUserText &&
    hasLoraDiscoveryIntent(options.previousUserText)
  ) {
    const query = toCandidateQuery(raw)
    if (query) {
      return { shouldSearch: true, query, reason: 'lora discovery follow-up' }
    }
    return NOT_SEARCHING('lora follow-up has no searchable subject')
  }

  if (!hasLoraNoun && !namesLoraSource) {
    return NOT_SEARCHING('no lora discovery signal')
  }
  // 「我挂了两个 LoRA 你能看到吗」「这个 LoRA 的触发词是什么」—— 提到了
  // LoRA，但要的不是**另一把**。给他一堆候选是打断，不是帮忙。
  return NOT_SEARCHING('lora mentioned, but not as a request to find one')
}
