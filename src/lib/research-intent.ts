/**
 * 确定性意图启发 —— 检索管线的第一道规划（§3.2）。
 *
 * **为什么先跑启发再跑 LLM**：切片 0 实测 LoRA 生态题两臂 **5/5 全对**，错的全集中
 * 在 IP 角色与时效两组。所以规划器的价值一半在「该打哪些源」，另一半在
 * 「**这题根本不用打源**」—— 省钱、省延迟，且少一次「半懂就敢说」的机会。
 *
 * 纯函数、无 IO：LLM 规划器拿不到路由 / 输出不合法时，直接用这里的结果，
 * **绝不硬失败**（一个规划器挂了不该让整条检索线挂）。
 */

import {
  RESEARCH_FRESHNESS,
  RESEARCH_GOALS,
  RESEARCH_INFO_REQUEST_TERMS,
  RESEARCH_LIMITS,
  RESEARCH_REQUEST_LEAD_PATTERNS,
  RESEARCH_REQUEST_TAIL_PATTERNS,
  RESEARCH_SOURCE_GROUPS,
  RESEARCH_SOURCE_IDS,
  type ResearchFreshness,
} from '@/constants/research'
import { ASSISTANT_PIPELINE_LINES } from '@/constants/video-link'
import { resolveVideoLinkLine } from '@/lib/video-link'
import type { ResearchPlan, ResearchQuery } from '@/types/research'

const URL_PATTERN = /https?:\/\/[^\s<>"')]+/gi

/** 「今天/刚刚」这种要按天收窄；「最新/最近」按周。 */
const FRESHNESS_DAY_TERMS = [
  '今天',
  '今日',
  '刚刚',
  '刚发布',
  '现在几点',
  'today',
  'right now',
  'just released',
]

const FRESHNESS_WEEK_TERMS = [
  '最新',
  '最近',
  '近期',
  '目前',
  '现在',
  '几号',
  '什么时候上线',
  '新出',
  '新发布',
  '本周',
  'latest',
  'recent',
  'recently',
  'this week',
  'newest',
  'just now',
  'current',
]

/** 「多少/几张/几个」这类问量的题 —— 切片 0 的 D2（danbooru 图量）就栽在这。 */
const QUANTITY_TERMS = ['多少', '几张', '几个', '几部', 'how many', 'how much']

/** IP / 角色意图。命中就走 IP 角色组（萌百 + wiki + danbooru + B站）。 */
const IP_CHARACTER_TERMS = [
  '角色',
  '立绘',
  '发色',
  '瞳色',
  '头发',
  '眼睛',
  '人设',
  '设定',
  '同人',
  '官方设定',
  '武器',
  '声优',
  'cv',
  '皮肤',
  '服装',
  '穿搭',
  '外观',
  '造型',
  '游戏里',
  '动画里',
  '登场',
  '上线',
  // 这两个站本身就是「某角色的图」这类问题的现场 —— 提到它们基本等于在问角色，
  // 而且 danbooru 正好是本组里能直接回答「有多少张图」的那个源。
  'danbooru',
  'pixiv',
  'character',
  'waifu',
  'outfit',
  'hair color',
  'eye color',
  'costume',
  'official art',
  'splash art',
]

/**
 * 生态常识 —— 模型自己记得住的那一类（切片 0：5/5 全对）。
 * 命中且**没有**时效词 → 不检索。有时效词时这条不生效（「最近 Civitai 上新出的」
 * 是时效题，不是常识题）。
 */
const KNOWN_ECOSYSTEM_TERMS = [
  'lora',
  'civitai',
  'huggingface',
  'hugging face',
  '底模',
  '触发词',
  'trigger word',
  '许可',
  'license',
  'sdxl',
  'flux',
  'illustrious',
  'pony',
  'checkpoint',
  '权重',
  'safetensors',
]

/** 问句信号 —— 有事实问句才默认走通用检索，创作请求不打源。 */
const QUESTION_TERMS = [
  '是什么',
  '是谁',
  '哪个',
  '哪些',
  '为什么',
  '怎么',
  '如何',
  '什么时候',
  '有没有',
  '？',
  '?',
  'what is',
  'who is',
  'which',
  'when did',
  'where is',
  'why does',
]

/**
 * 「给我个链接 / 官网 / 出处」这一类。**必须打源**：URL 是模型最擅长「按格式
 * 编出来」的一类事实 —— 域名对、路径瞎编，看上去完全可信，点进去 404。
 *
 * 2026-08-22 owner 实拍两条：`static.wikia.nocookie.net/wutheringwaves/images/
 * 7/70/Changli_Portrait.png`（图裂）与 `patchwiki.biligame.com/images/mc/8/8a/
 * <乱码>.png`（404）。那一轮的原话是「给我一个适合作为参考图的网站」——
 * 既没有问号也没有问句词，落到兜底分支判 `no retrieval signal`，于是证据规矩
 * 根本没注入，模型手上一个真 URL 都没有，只能编。
 *
 * ⚠ 名词面与动词面**都要有**：光有「网站」会把「画一个网站界面」这种创作请求
 *   也拖去打源。要的是「问我要一个链接」，不是「提到了网站」。
 */
const LINK_NOUN_TERMS = [
  '网址',
  '链接',
  '网站',
  '官网',
  '出处',
  '来源页',
  '原图',
  'url',
  'link',
  'website',
  'official site',
  'source page',
]

const LINK_SEEK_TERMS = [
  '给我',
  '有没有',
  '哪里',
  '哪儿',
  '推荐',
  '找',
  '发我',
  '来一个',
  'give me',
  'send me',
  'where',
  'recommend',
  'any ',
]

/** 明确的创作指令 —— 这类不该打源（打了也只会稀释用户的意图）。 */
const CREATIVE_TERMS = [
  '帮我写',
  '写一个',
  '生成',
  '润色',
  '改成',
  '优化提示词',
  '转成',
  'write me',
  'rewrite',
  'make it',
  'generate a',
]

function includesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(needle))
}

export function extractUrlsFromText(text: string, max = 3): string[] {
  const matches = text.match(URL_PATTERN) ?? []
  const seen = new Set<string>()
  const urls: string[] = []
  for (const raw of matches) {
    // 正则贪心吞掉的尾部标点要剥掉，否则读出来的是 404。
    const url = raw.replace(/[.,;]+$/, '')
    if (seen.has(url)) continue
    seen.add(url)
    urls.push(url)
  }
  return urls.slice(0, max)
}

export function stripUrls(text: string): string {
  return text.replace(URL_PATTERN, ' ').replace(/\s+/g, ' ').trim()
}

function detectFreshness(lowered: string): ResearchFreshness {
  if (includesAny(lowered, FRESHNESS_DAY_TERMS)) return RESEARCH_FRESHNESS.day
  if (includesAny(lowered, FRESHNESS_WEEK_TERMS)) return RESEARCH_FRESHNESS.week
  return RESEARCH_FRESHNESS.none
}

/** 去掉客套与问句脚手架，让检索词更接近「主语」。 */
function toSearchQuery(text: string): string {
  return text
    .replace(/^(请问|麻烦|帮我|你好|hi|hey|请)[，,、\s]*/i, '')
    .replace(/[？?。！!]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, RESEARCH_LIMITS.maxQueryLength)
}

/** 最多剥几轮前缀脚手架（「请」「帮我」「查一下」可以叠着出现）。 */
const MAX_SCAFFOLD_ROUNDS = 4

/**
 * 剥掉请求脚手架，留下主语：「我想要无限大的资料」→「无限大」，
 * 「长离是谁？」→「长离」，「who is Changli」→「Changli」。
 *
 * ⚠ 为什么必须有这一步（2026-09-01 附录 B 缺口 ④）：MediaWiki `opensearch` 是
 * **前缀匹配**，喂整句必空；danbooru 的别名反查同理。整句只该留给通用网搜。
 * 剥空了就原样返回 —— 宁可查整句也不能查空串。
 */
export function extractResearchEntity(query: string): string {
  let entity = query.trim()
  for (let round = 0; round < MAX_SCAFFOLD_ROUNDS; round += 1) {
    const before = entity
    for (const pattern of RESEARCH_REQUEST_LEAD_PATTERNS) {
      entity = entity.replace(pattern, '')
    }
    for (const pattern of RESEARCH_REQUEST_TAIL_PATTERNS) {
      entity = entity.replace(pattern, '')
    }
    entity = entity.trim()
    if (entity === before) break
  }
  return entity || query.trim()
}

/**
 * 启发式规划的查询清单：主语给所有源；整句（若与主语不同）只给通用网搜。
 * `sourceId` 的语义见 `ResearchQuerySchema` —— 不填 = 喂给源组里的所有源。
 */
function buildHeuristicQueries(query: string): ResearchQuery[] {
  const entity = extractResearchEntity(query)
  const queries: ResearchQuery[] = [{ text: entity, lang: 'zh' }]
  if (entity !== query) {
    queries.push({
      text: query,
      lang: 'zh',
      sourceId: RESEARCH_SOURCE_IDS.webSearch,
    })
  }
  return queries
}

/**
 * 用户把「联网」手动拨到开 —— 保证这个 plan 真的会去打源。
 *
 * ⚠ **不是多此一举**：启发式对「帮我写个提示词」给的是
 * `{shouldSearch:false, sourceGroup:'none', queries:[]}`，而 `none` 组的源列表是
 * 空数组。只把 `shouldSearch` 翻成 true 而不补组和查询，结果是一个请求都不发、
 * 状态却报 `no_evidence` —— 用户明明按了联网，回来的却是「没搜到」。
 * （2026-08-20 单测抓到的真洞。）
 *
 * 已经给了 URL 的情况不动：那本来就该只读 URL 不搜索。
 *
 * ⚠ 这里的「URL」只剩**检索线认领的那些**（视频链接已在规划时被摘走，见
 * `planResearchHeuristically` 的 ①）。所以「只贴了一条 YouTube 链接 + 手动开联网」
 * 走的是下面这条按文本搜索的路 —— 用户明确要求了联网，就照做；视频本体仍然
 * 走视觉线，两条并行不冲突。
 */
export function withForcedSearch(
  plan: ResearchPlan,
  text: string,
): ResearchPlan {
  if (plan.urls.length > 0) return { ...plan, shouldSearch: true }
  if (plan.shouldSearch && plan.queries.length > 0) return plan

  const query = toSearchQuery(stripUrls(text))
  if (!query) return { ...plan, shouldSearch: true }

  return {
    ...plan,
    shouldSearch: true,
    sourceGroup:
      plan.sourceGroup === RESEARCH_SOURCE_GROUPS.none
        ? RESEARCH_SOURCE_GROUPS.general
        : plan.sourceGroup,
    queries:
      plan.queries.length > 0 ? plan.queries : buildHeuristicQueries(query),
    reason: 'forced by the creator',
  }
}

/**
 * 确定性规划。返回值永远合法 —— 上游可以直接用，不需要判空。
 */
export function planResearchHeuristically(text: string): ResearchPlan {
  const raw = text.trim()
  const lowered = raw.toLowerCase()
  const urls = extractUrlsFromText(raw, 3)
  // ⚠ **一条 URL 只能被一条线认领**（表在 `VIDEO_LINK_OWNER_LINE`）：YouTube 与
  //   视频直链归视觉线，检索线**不许**把它们当网页读回来。这不是洁癖 ——
  //   🔬 2026-08-21 受控复现：`url_reader` 把 YouTube 页读成一句
  //   `Warning: Target URL returned error 401`，模型就据此认定「拿不到这个视频」，
  //   背出记忆里的 19:13（真值 18:40）；而同一轮视频本体已经在它上下文里。
  //   平台页（B站/X/抖音）**仍归检索线**：我们不解流，那条线上的产物是元数据卡。
  const readableUrls = urls.filter(
    (url) => resolveVideoLinkLine(url) === ASSISTANT_PIPELINE_LINES.research,
  )
  const routedToVisionLine = readableUrls.length < urls.length
  const withoutUrls = stripUrls(raw)
  const freshness = detectFreshness(lowered)
  const query = toSearchQuery(withoutUrls)

  // ① 用户贴了（检索线能读的）URL —— 读它就是了，**不再打搜索**。用户给了确切
  //    出处还去搜索等于用一堆二手摘要盖过一手原文（切片 0 的 C1：拿摘要标题
  //    编出视频时长）。
  if (readableUrls.length > 0) {
    return {
      shouldSearch: true,
      sourceGroup: RESEARCH_SOURCE_GROUPS.general,
      goal: RESEARCH_GOALS.factLookup,
      queries: [],
      freshness,
      urls: readableUrls,
      reason: 'user supplied url(s); read them instead of searching',
    }
  }

  if (!query) {
    return {
      shouldSearch: false,
      sourceGroup: RESEARCH_SOURCE_GROUPS.none,
      goal: RESEARCH_GOALS.factLookup,
      queries: [],
      freshness: RESEARCH_FRESHNESS.none,
      urls: [],
      reason: 'empty query',
    }
  }

  const isIpCharacter = includesAny(lowered, IP_CHARACTER_TERMS)
  const isQuantity = includesAny(lowered, QUANTITY_TERMS)
  const isEcosystem = includesAny(lowered, KNOWN_ECOSYSTEM_TERMS)
  const hasFreshness = freshness !== RESEARCH_FRESHNESS.none

  // ①b 这一轮的链接全被视觉线接走了 —— 剩下的话通常只剩指示代词（「这个视频有
  //     多长」），**没有主语可搜**。把它送去 Serper 换回来的是一堆无关页面，而在
  //     「具体数字只能来自证据」那条规矩下，无关证据比没有证据更危险（正是本轮
  //     复现出来的失败形状）。除非剩下的话自己点名了外部主语（IP 角色 / 生态词），
  //     那才是检索线真正帮得上忙的题（「这视频里的是长离吗，她发色是什么」）。
  if (routedToVisionLine && !isIpCharacter && !isEcosystem) {
    return {
      shouldSearch: false,
      sourceGroup: RESEARCH_SOURCE_GROUPS.none,
      goal: RESEARCH_GOALS.factLookup,
      queries: [],
      freshness: RESEARCH_FRESHNESS.none,
      urls: [],
      reason: 'video link belongs to the vision line — nothing left to search',
    }
  }

  // ② 时效题 —— 一定打源，并且带时间窗（🔬 Serper `tbs=qdr:w` 实测生效）。
  //    问量的题（「多少张」）同样归这里：切片 0 的 D2 就是靠对冲语气编了个数字。
  if (hasFreshness || isQuantity) {
    return {
      shouldSearch: true,
      sourceGroup: isIpCharacter
        ? RESEARCH_SOURCE_GROUPS.ipCharacter
        : isEcosystem
          ? RESEARCH_SOURCE_GROUPS.aiEcosystem
          : RESEARCH_SOURCE_GROUPS.general,
      goal: isIpCharacter
        ? RESEARCH_GOALS.analyzeCharacter
        : RESEARCH_GOALS.factLookup,
      queries: buildHeuristicQueries(query),
      freshness: hasFreshness ? freshness : RESEARCH_FRESHNESS.week,
      urls: [],
      reason: hasFreshness
        ? 'time-sensitive wording'
        : 'quantitative question — model tends to invent numbers',
    }
  }

  // ③ IP / 角色题 —— 幻觉高发区，专用源组。
  if (isIpCharacter) {
    return {
      shouldSearch: true,
      sourceGroup: RESEARCH_SOURCE_GROUPS.ipCharacter,
      goal: RESEARCH_GOALS.analyzeCharacter,
      queries: buildHeuristicQueries(query),
      freshness: RESEARCH_FRESHNESS.none,
      urls: [],
      reason: 'ip/character intent',
    }
  }

  // ④ 生态常识 —— 模型记得住，别打源（切片 0：这一组两臂 5/5 全对）。
  if (isEcosystem) {
    return {
      shouldSearch: false,
      sourceGroup: RESEARCH_SOURCE_GROUPS.none,
      goal: RESEARCH_GOALS.findLora,
      queries: [],
      freshness: RESEARCH_FRESHNESS.none,
      urls: [],
      reason: 'well-known ecosystem fact — model knowledge is reliable here',
    }
  }

  // ④a 「我想要 X 的资料 / 设定 / 世界观」—— 百科类泛请求，打 IP / 百科源组。
  //     🔬 2026-09-01 附录 B：「我想要无限大的资料」既无问号也无 IP 词，落到兜底
  //     判 no signal → 0 个请求，模型凭记忆答「找不到」。放在生态常识之后：
  //     「介绍一下 LoRA」仍归模型自己答。
  if (includesAny(lowered, RESEARCH_INFO_REQUEST_TERMS)) {
    return {
      shouldSearch: true,
      sourceGroup: RESEARCH_SOURCE_GROUPS.ipCharacter,
      goal: RESEARCH_GOALS.factLookup,
      queries: buildHeuristicQueries(query),
      freshness: RESEARCH_FRESHNESS.none,
      urls: [],
      reason: 'information request',
    }
  }

  // ④b 要链接 —— 打源。放在创作请求之前：「给我一个参考图网站」里没有创作动词，
  //     但万一将来词表相交，「要链接」的优先级更高（编 URL 的代价远大于多搜一次）。
  if (
    includesAny(lowered, LINK_NOUN_TERMS) &&
    includesAny(lowered, LINK_SEEK_TERMS)
  ) {
    return {
      shouldSearch: true,
      sourceGroup: isIpCharacter
        ? RESEARCH_SOURCE_GROUPS.ipCharacter
        : RESEARCH_SOURCE_GROUPS.general,
      goal: RESEARCH_GOALS.factLookup,
      queries: buildHeuristicQueries(query),
      freshness: RESEARCH_FRESHNESS.none,
      urls: [],
      reason: 'asked for a link — the model would otherwise invent one',
    }
  }

  // ⑤ 创作请求不打源；剩下的事实问句走通用组。
  if (includesAny(lowered, CREATIVE_TERMS)) {
    return {
      shouldSearch: false,
      sourceGroup: RESEARCH_SOURCE_GROUPS.none,
      goal: RESEARCH_GOALS.studyStyle,
      queries: [],
      freshness: RESEARCH_FRESHNESS.none,
      urls: [],
      reason: 'creative request — retrieval would dilute intent',
    }
  }

  const isQuestion = includesAny(lowered, QUESTION_TERMS)
  return {
    shouldSearch: isQuestion,
    sourceGroup: isQuestion
      ? RESEARCH_SOURCE_GROUPS.general
      : RESEARCH_SOURCE_GROUPS.none,
    goal: RESEARCH_GOALS.factLookup,
    queries: isQuestion ? buildHeuristicQueries(query) : [],
    freshness: RESEARCH_FRESHNESS.none,
    urls: [],
    reason: isQuestion ? 'factual question' : 'no retrieval signal',
  }
}
