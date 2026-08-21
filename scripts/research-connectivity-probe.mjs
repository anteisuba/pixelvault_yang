/**
 * 检索管线连通性实测（AI 导演内核 · 切片 0）
 *
 * docs/plans/ai-director-kernel-2026-08-13.md §2 列的「设计里的不确定项」，
 * 全部做成可重跑探针：每次动检索管线 / 换出口环境（本机 ↔ Vercel）都重跑，
 * 结论有日期、有原始响应，不靠记忆。
 *
 * 零依赖（Node 22 内建 fetch），自己解析 .env.local，所以能从任意目录跑。
 *
 * 用法：
 *   node research-connectivity-probe.mjs
 *   node research-connectivity-probe.mjs --only moegirl,danbooru
 *   node research-connectivity-probe.mjs --skip gemini
 *   node research-connectivity-probe.mjs --json out.json
 *
 * ⚠ 出口环境很重要：本机出口 ≠ Vercel 出口。本机全绿不代表线上能通。
 *   报告里的 egress 字段记的就是这次跑在哪。wiki.gg 那条尤其要在 Vercel 上重跑。
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

// ─── env ────────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(import.meta.dirname, '..')

function loadEnv(path) {
  try {
    const text = readFileSync(path, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line)
      if (!match) continue
      let value = match[2].trim()
      // .env.local 里的值可能带引号 —— 不剥引号会让 key 带着 `"` 发出去，
      // Gemini 回的是 "API key not valid"，很容易误判成 key 失效。
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (!(match[1] in process.env)) process.env[match[1]] = value
    }
  } catch (error) {
    console.error(`读不到 ${path}：${error.message}`)
  }
}

loadEnv(resolve(PROJECT_ROOT, '.env.local'))

// ─── helpers ────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000

/** 桌面浏览器 UA —— 用来测「换个 UA 是不是就通了」，不是长期伪装身份。 */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

/** MediaWiki 官方礼仪要求的联系式 UA（真上线该用这种）。 */
const BOT_UA = 'PixelVaultResearchProbe/0.1 (contact: owner via github)'

const HEADERS_OF_INTEREST = [
  'server',
  'cf-ray',
  'cf-cache-status',
  'x-cache',
  'retry-after',
  'content-type',
  'x-ratelimit-remaining',
]

async function raw(url, init = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, maxBody = 200_000, ...rest } = init
  const startedAt = Date.now()
  const response = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) })
  const body = (await response.text()).slice(0, maxBody)
  const headers = {}
  for (const key of HEADERS_OF_INTEREST) {
    const value = response.headers.get(key)
    if (value) headers[key] = value
  }
  return {
    status: response.status,
    ok: response.ok,
    headers,
    body,
    latencyMs: Date.now() - startedAt,
  }
}

function parseJson(body) {
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

async function guard(name, fn) {
  try {
    return await fn()
  } catch (error) {
    return [{ name, verdict: 'FAIL', finding: `探针抛异常：${error.message}` }]
  }
}

/** MediaWiki 的「拒绝」是 HTTP 200 + body 里的 error.code，不是 4xx。 */
function mwError(json) {
  return json?.error?.code ?? null
}

// ─── P1 · 萌娘百科：API 模块白名单 ──────────────────────────────
// 实测结论（2026-08-18）：萌百不按 UA 拦、不按速率拦，按 **API 模块** 拦。
// 所以探针的重点是「哪些模块可用」，不是「能不能连上」。

const MOEGIRL_API = 'https://zh.moegirl.org.cn/api.php'
const MOEGIRL_SAMPLE = '长离'

/** 连接器可能想用的模块，逐个试 —— 白名单变了要立刻发现。 */
const MOEGIRL_MODULES = [
  { key: 'opensearch', desc: '页名补全（角色名→页名）', q: `action=opensearch&search=${encodeURIComponent(MOEGIRL_SAMPLE)}&limit=5&format=json` },
  { key: 'generator=search', desc: '全文搜索', q: `action=query&generator=search&gsrsearch=${encodeURIComponent(MOEGIRL_SAMPLE)}&format=json` },
  { key: 'list=search', desc: '全文搜索（标准写法）', q: `action=query&list=search&srsearch=${encodeURIComponent(MOEGIRL_SAMPLE)}&format=json` },
  { key: 'prop=extracts', desc: '正文纯文本', q: `action=query&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(MOEGIRL_SAMPLE)}&format=json` },
  { key: 'prop=categories', desc: '分类标签（外观特征金矿）', q: `action=query&prop=categories&cllimit=500&titles=${encodeURIComponent(MOEGIRL_SAMPLE)}&format=json&formatversion=2` },
  { key: 'prop=pageimages', desc: '主图/立绘', q: `action=query&prop=pageimages&piprop=original&titles=${encodeURIComponent(MOEGIRL_SAMPLE)}&format=json&formatversion=2` },
  { key: 'prop=revisions', desc: 'wikitext 原文（模板字段）', q: `action=query&prop=revisions&rvprop=content&rvslots=main&titles=${encodeURIComponent(MOEGIRL_SAMPLE)}&format=json&formatversion=2` },
  { key: 'action=parse', desc: '渲染/wikitext', q: `action=parse&page=${encodeURIComponent(MOEGIRL_SAMPLE)}&prop=wikitext&format=json&formatversion=2` },
  { key: 'list=allpages', desc: '枚举页面', q: `action=query&list=allpages&apprefix=${encodeURIComponent(MOEGIRL_SAMPLE)}&format=json&formatversion=2` },
]

async function probeMoegirl() {
  const checks = []
  const allowed = []
  const blocked = []

  for (const mod of MOEGIRL_MODULES) {
    const response = await raw(`${MOEGIRL_API}?${mod.q}`, {
      headers: { 'User-Agent': BOT_UA },
      maxBody: 400_000,
    })
    const json = parseJson(response.body)
    const err = mwError(json)
    if (err) blocked.push(`${mod.key}(${err})`)
    else allowed.push(mod.key)
  }

  checks.push({
    name: 'moegirl/module-allowlist',
    verdict: allowed.includes('prop=extracts') && allowed.includes('opensearch') ? 'PASS' : 'FAIL',
    finding: `可用模块 ${allowed.length}/${MOEGIRL_MODULES.length}：${allowed.join(', ')}；被拒：${blocked.join(', ') || '无'}`,
    detail: { allowed, blocked },
  })

  // 分类标签 —— 这是萌百相对其他源的独有价值：外观特征已经是结构化标签
  const cats = await raw(
    `${MOEGIRL_API}?action=query&prop=categories&cllimit=500&titles=${encodeURIComponent(MOEGIRL_SAMPLE)}&format=json&formatversion=2`,
    { headers: { 'User-Agent': BOT_UA }, maxBody: 200_000 },
  )
  const catJson = parseJson(cats.body)
  const catList = (catJson?.query?.pages?.[0]?.categories ?? []).map((c) =>
    c.title.replace(/^Category:/, ''),
  )
  checks.push({
    name: 'moegirl/categories',
    verdict: catList.length > 5 ? 'PASS' : 'WARN',
    finding: catList.length
      ? `「${MOEGIRL_SAMPLE}」${catList.length} 个分类，外观特征直接可用：${catList.slice(0, 8).join(' · ')} …`
      : `拿不到分类（HTTP ${cats.status}）`,
    latencyMs: cats.latencyMs,
    detail: { categories: catList },
  })

  // 立绘
  const img = await raw(
    `${MOEGIRL_API}?action=query&prop=pageimages&piprop=original&titles=${encodeURIComponent(MOEGIRL_SAMPLE)}&format=json&formatversion=2`,
    { headers: { 'User-Agent': BOT_UA } },
  )
  const imgJson = parseJson(img.body)
  const original = imgJson?.query?.pages?.[0]?.original
  checks.push({
    name: 'moegirl/pageimages',
    verdict: original?.source ? 'PASS' : 'WARN',
    finding: original?.source
      ? `立绘直出：${original.width}×${original.height} ${original.source}`
      : `无 pageimages（HTTP ${img.status}）`,
    latencyMs: img.latencyMs,
    detail: { original },
  })

  // 正文
  const extract = await raw(
    `${MOEGIRL_API}?action=query&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(MOEGIRL_SAMPLE)}&format=json`,
    { headers: { 'User-Agent': BOT_UA }, maxBody: 400_000 },
  )
  const extractJson = parseJson(extract.body)
  const page = Object.values(extractJson?.query?.pages ?? {})[0]
  const text = page?.extract ?? ''
  checks.push({
    name: 'moegirl/extract',
    verdict: text.length > 500 ? 'PASS' : 'WARN',
    finding: text.length
      ? `「${page?.title}」正文 ${text.length} 字（prop=extracts 可用，无需爬页面）`
      : `拿不到正文（HTTP ${extract.status}）`,
    latencyMs: extract.latencyMs,
    detail: { title: page?.title, chars: text.length, head: text.slice(0, 600) },
  })

  // UA 敏感度
  const uaResults = {}
  for (const variant of [
    { label: 'node-default', ua: undefined },
    { label: 'browser', ua: BROWSER_UA },
    { label: 'bot-contact', ua: BOT_UA },
    { label: 'empty', ua: '' },
  ]) {
    try {
      const response = await raw(`${MOEGIRL_API}?action=query&meta=siteinfo&format=json`, {
        headers: variant.ua != null ? { 'User-Agent': variant.ua } : {},
      })
      uaResults[variant.label] = response.status
    } catch (error) {
      uaResults[variant.label] = `ERR ${error.message}`
    }
  }
  const uaBlocked = Object.entries(uaResults).filter(([, s]) => s !== 200)
  checks.push({
    name: 'moegirl/ua-sensitivity',
    verdict: uaBlocked.length === 0 ? 'PASS' : 'WARN',
    finding:
      uaBlocked.length === 0
        ? '四种 UA（node 默认 / 浏览器 / bot 联系式 / 空）全部 200 —— 不按 UA 拦'
        : `UA 敏感：${uaBlocked.map(([k, s]) => `${k}=${s}`).join(', ')}`,
    detail: uaResults,
  })

  // 突发速率
  const burst = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      raw(`${MOEGIRL_API}?action=query&meta=siteinfo&format=json&_b=${i}`, {
        headers: { 'User-Agent': BOT_UA },
      }).catch((error) => ({ status: -1, ok: false, headers: {}, body: String(error), latencyMs: -1 })),
    ),
  )
  const codes = {}
  for (const r of burst) codes[String(r.status)] = (codes[String(r.status)] ?? 0) + 1
  const throttled = burst.some((r) => r.status === 429 || r.status === 503)
  checks.push({
    name: 'moegirl/burst-12',
    verdict: throttled ? 'WARN' : 'PASS',
    finding: throttled
      ? `12 并发触发限流：${JSON.stringify(codes)}`
      : `12 并发无限流（${JSON.stringify(codes)}），最慢 ${Math.max(...burst.map((r) => r.latencyMs))}ms`,
    detail: { codes, latencies: burst.map((r) => r.latencyMs) },
  })

  return checks
}

// ─── P2 · MediaWiki 家族按站能力 ────────────────────────────────
// §3.3 假设「一个连接器吃全族」。实测：传输层成立（都是 api.php + action=query），
// **能力层不成立** —— 每站可用的 prop 模块不同，连接器必须带按站降级链。

const MEDIAWIKI_FAMILY = [
  { label: 'wikipedia-zh', api: 'https://zh.wikipedia.org/w/api.php', title: '鳴潮' },
  { label: 'fandom-wuwa', api: 'https://wutheringwaves.fandom.com/api.php', title: 'Changli' },
  { label: 'wikigg-wuwa', api: 'https://wutheringwaves.wiki.gg/api.php', title: 'Changli' },
]

/** 连接器取正文的三条路，按优先级排 —— 第一条通就不用后面的。 */
const CONTENT_ROUTES = [
  { key: 'prop=extracts', build: (t) => `action=query&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(t)}&format=json&formatversion=2`, read: (j) => j?.query?.pages?.[0]?.extract },
  { key: 'prop=revisions', build: (t) => `action=query&prop=revisions&rvprop=content&rvslots=main&redirects=1&titles=${encodeURIComponent(t)}&format=json&formatversion=2`, read: (j) => j?.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content },
  { key: 'action=parse', build: (t) => `action=parse&page=${encodeURIComponent(t)}&prop=wikitext&format=json&formatversion=2`, read: (j) => j?.parse?.wikitext },
]

async function probeMediaWikiFamily() {
  const checks = []
  for (const site of MEDIAWIKI_FAMILY) {
    const capability = {}
    let reachable = false
    for (const route of CONTENT_ROUTES) {
      try {
        const response = await raw(`${site.api}?${route.build(site.title)}`, {
          headers: { 'User-Agent': BOT_UA },
          maxBody: 300_000,
        })
        const json = parseJson(response.body)
        if (response.status === 200) reachable = true
        const err = mwError(json)
        const content = route.read(json)
        capability[route.key] = err
          ? `blocked(${err})`
          : content
            ? `ok(${content.length}字)`
            : `HTTP ${response.status}/空`
      } catch (error) {
        capability[route.key] = `ERR ${error.message}`
      }
    }
    const working = Object.entries(capability).filter(([, v]) => v.startsWith('ok'))
    checks.push({
      name: `mediawiki/${site.label}`,
      verdict: working.length > 0 ? 'PASS' : 'FAIL',
      finding: working.length
        ? `可取正文的路：${working.map(([k, v]) => `${k}→${v}`).join(' · ')}；其余：${Object.entries(capability).filter(([, v]) => !v.startsWith('ok')).map(([k, v]) => `${k}=${v}`).join(' · ') || '无'}`
        : reachable
          ? `站点可达但三条取正文的路全不通：${JSON.stringify(capability)}`
          : `整站不可达（本出口）：${JSON.stringify(capability)}`,
      detail: { title: site.title, capability },
    })
  }
  return checks
}

// ─── P3 · Jina Reader 渲染 SPA ──────────────────────────────────
// 判据不是「有没有 200」，是「正文关键词有没有出现」——SPA 空壳也会 200。

const SPA_TARGETS = [
  {
    label: 'volcengine-docs',
    url: 'https://www.volcengine.com/docs/82379/1330310',
    mustContain: ['模型', 'API'],
  },
  {
    label: 'byteplus-docs',
    url: 'https://docs.byteplus.com/en/docs/ModelArk/1099455',
    mustContain: ['model', 'API'],
  },
]

async function probeJina() {
  const checks = []
  const jinaKey = process.env.JINA_API_KEY?.trim()

  for (const target of SPA_TARGETS) {
    // 对照组：裸 fetch。SPA 应该是空壳。
    let bareChars = 0
    let bareHits = 0
    try {
      const bare = await raw(target.url, { headers: { 'User-Agent': BROWSER_UA }, maxBody: 400_000 })
      bareChars = bare.body.length
      bareHits = target.mustContain.filter((k) => bare.body.includes(k)).length
    } catch {
      bareChars = -1
    }

    const headers = { 'X-Return-Format': 'markdown' }
    if (jinaKey) headers.Authorization = `Bearer ${jinaKey}`
    let jina
    try {
      jina = await raw(`https://r.jina.ai/${target.url}`, { headers, maxBody: 400_000, timeoutMs: 90_000 })
    } catch (error) {
      checks.push({
        name: `jina/${target.label}`,
        verdict: 'FAIL',
        finding: `Jina 读取失败：${error.message}`,
        detail: { bareChars, bareHits },
      })
      continue
    }
    const jinaHits = target.mustContain.filter((k) => jina.body.includes(k))
    const usable = jina.ok && jina.body.length > 800 && jinaHits.length > 0
    checks.push({
      name: `jina/${target.label}`,
      verdict: usable ? 'PASS' : jina.ok ? 'WARN' : 'FAIL',
      finding: usable
        ? `Jina 渲染出正文 ${jina.body.length} 字，关键词命中 ${jinaHits.length}/${target.mustContain.length}；裸 fetch ${bareChars} 字 / 命中 ${bareHits}`
        : `Jina 返回 HTTP ${jina.status}、${jina.body.length} 字、关键词命中 ${jinaHits.length}/${target.mustContain.length} —— 不足以当正文用`,
      latencyMs: jina.latencyMs,
      detail: {
        anonymous: !jinaKey,
        jinaChars: jina.body.length,
        jinaHits,
        bareChars,
        bareHits,
        head: jina.body.slice(0, 500),
      },
    })
  }
  return checks
}

// ─── P4 · Danbooru 角色 tag 覆盖 ────────────────────────────────

const DANBOORU = 'https://danbooru.donmai.us'

/** 鸣潮角色，粗按上线时间排（新角色在后）—— 用来看「新角色多久进库」。 */
const WUWA_CHARACTER_TAGS = [
  'changli_(wuthering_waves)',
  'jinhsi_(wuthering_waves)',
  'camellya_(wuthering_waves)',
  'zhezhi_(wuthering_waves)',
  'roccia_(wuthering_waves)',
  'phoebe_(wuthering_waves)',
  'brant_(wuthering_waves)',
  'cantarella_(wuthering_waves)',
  'zani_(wuthering_waves)',
  'cartethyia_(wuthering_waves)',
  'lupa_(wuthering_waves)',
]

async function probeDanbooru() {
  const checks = []

  const tagsResponse = await raw(
    `${DANBOORU}/tags.json?search[name_comma]=${encodeURIComponent(WUWA_CHARACTER_TAGS.join(','))}&limit=200`,
    { headers: { 'User-Agent': BOT_UA } },
  )
  const tags = parseJson(tagsResponse.body) ?? []
  const found = new Map(Array.isArray(tags) ? tags.map((t) => [t.name, t]) : [])
  const missing = WUWA_CHARACTER_TAGS.filter((t) => !found.has(t))
  checks.push({
    name: 'danbooru/character-tags',
    verdict: tagsResponse.ok && found.size > 0 ? 'PASS' : 'FAIL',
    finding: tagsResponse.ok
      ? `鸣潮角色 tag 命中 ${found.size}/${WUWA_CHARACTER_TAGS.length}${missing.length ? `，缺：${missing.join(', ')}` : '（全覆盖）'}`
      : `tags.json 失败（HTTP ${tagsResponse.status}）`,
    latencyMs: tagsResponse.latencyMs,
    detail: {
      counts: Object.fromEntries(
        [...found.values()].map((t) => [t.name, { posts: t.post_count, created: t.created_at }]),
      ),
      missing,
    },
  })

  const recent = await raw(
    `${DANBOORU}/tags.json?search[category]=4&search[order]=created_at&search[hide_empty]=yes&limit=25`,
    { headers: { 'User-Agent': BOT_UA } },
  )
  const recentTags = parseJson(recent.body) ?? []
  const newest = Array.isArray(recentTags) ? recentTags[0] : undefined
  checks.push({
    name: 'danbooru/new-tag-velocity',
    verdict: recent.ok && Array.isArray(recentTags) && recentTags.length > 0 ? 'PASS' : 'WARN',
    finding: newest
      ? `最近新建的 character tag：${newest.name}（建于 ${newest.created_at}，${newest.post_count} 图）`
      : `拿不到最近 tag（HTTP ${recent.status}）`,
    latencyMs: recent.latencyMs,
    detail: {
      recent: Array.isArray(recentTags)
        ? recentTags.map((t) => ({ name: t.name, created: t.created_at, posts: t.post_count }))
        : recent.body.slice(0, 300),
    },
  })

  const sample = WUWA_CHARACTER_TAGS[0]
  const wiki = await raw(`${DANBOORU}/wiki_pages.json?search[title]=${encodeURIComponent(sample)}`, {
    headers: { 'User-Agent': BOT_UA },
  })
  const wikiPages = parseJson(wiki.body) ?? []
  const wikiPage = Array.isArray(wikiPages) ? wikiPages[0] : undefined
  checks.push({
    name: 'danbooru/tag-wiki',
    verdict: wikiPage ? 'PASS' : 'WARN',
    finding: wikiPage
      ? `wiki_pages 可用，「${sample}」other_names=${JSON.stringify(wikiPage.other_names)} —— 中文名↔tag 对齐有现成字段`
      : `「${sample}」无 wiki 页（HTTP ${wiki.status}）`,
    latencyMs: wiki.latencyMs,
    detail: { otherNames: wikiPage?.other_names },
  })

  // 共现 tag = 社区共识外观。这是「角色外观」这类题的第二个独立证据源，
  // 和萌百分类互为交叉验证（§3.4 源优先级 / 证据冲突呈现）。
  const posts = await raw(`${DANBOORU}/posts.json?tags=${encodeURIComponent(sample)}&limit=100`, {
    headers: { 'User-Agent': BOT_UA },
    maxBody: 900_000,
  })
  const postList = parseJson(posts.body) ?? []
  const freq = {}
  if (Array.isArray(postList)) {
    for (const p of postList) {
      for (const t of (p.tag_string_general ?? '').split(' ')) if (t) freq[t] = (freq[t] ?? 0) + 1
    }
  }
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 25)
  checks.push({
    name: 'danbooru/consensus-tags',
    verdict: top.length > 0 ? 'PASS' : 'WARN',
    finding: top.length
      ? `${Array.isArray(postList) ? postList.length : 0} 张样本的共现 top：${top.slice(0, 8).map(([t, c]) => `${t}(${c})`).join(' ')}`
      : `posts.json 匿名不可用（HTTP ${posts.status}）`,
    latencyMs: posts.latencyMs,
    detail: { sampleSize: Array.isArray(postList) ? postList.length : 0, top },
  })

  return checks
}

// ─── P5 · Gemini fileData.fileUri = YouTube ─────────────────────

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'
/** app 里助手路由用的 Gemini 型号（src/constants/node-studio.ts）。 */
const GEMINI_ASSISTANT_MODEL = 'gemini-3.5-flash'

/**
 * ⚠ maxOutputTokens 要给足：gemini-3.5-flash 的 thinking token 从这个预算里扣，
 *   给 800 会出现 thoughts=765 / 正文=31 的静默截断（finishReason=MAX_TOKENS）。
 */
const GEMINI_MAX_OUTPUT = 3000

/** 换视频请同步改试卷的视频题 —— 题面答案跟这个 URL 绑死。 */
const YOUTUBE_TARGET = {
  label: '19min',
  url: 'https://www.youtube.com/watch?v=aircAruvnKk',
  note: '3Blue1Brown 神经网络 EP1，18m41s，长期公开',
}

async function geminiAsk(fileDataPart, prompt, maxOut = GEMINI_MAX_OUTPUT) {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  const response = await raw(
    `${GEMINI_ENDPOINT}/${GEMINI_ASSISTANT_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [fileDataPart, { text: prompt }] }],
        generationConfig: { maxOutputTokens: maxOut },
      }),
      timeoutMs: 600_000,
      maxBody: 60_000,
    },
  )
  const json = parseJson(response.body)
  return {
    http: response.status,
    latencyMs: response.latencyMs,
    videoTokens: json?.usageMetadata?.promptTokensDetails?.find((d) => d.modality === 'VIDEO')
      ?.tokenCount,
    thoughts: json?.usageMetadata?.thoughtsTokenCount,
    finish: json?.candidates?.[0]?.finishReason,
    text: (json?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join(''),
    error: json?.error,
  }
}

async function probeGeminiYouTube() {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    return [
      {
        name: 'gemini/youtube-fileuri',
        verdict: 'SKIP',
        finding: '缺 GEMINI_API_KEY —— 没得测，不是测失败',
      },
    ]
  }

  const checks = []
  const PROMPT =
    '用中文回答：1) 视频总时长 2) 开场 30 秒的景别与运镜 3) 主要视觉元素。只描述实际看到的画面。'

  // 1. 直传可行性 + 视觉 token 单价
  const full = await geminiAsk({ fileData: { fileUri: YOUTUBE_TARGET.url } }, PROMPT)
  const perMinute = full.videoTokens ? Math.round(full.videoTokens / (18 + 41 / 60)) : null
  checks.push({
    name: 'gemini/youtube-native',
    verdict: full.http === 200 && full.text.length > 100 ? 'PASS' : 'FAIL',
    finding:
      full.http === 200
        ? `fileUri 直传成功（${YOUTUBE_TARGET.note}），免下载零存储；VIDEO token=${full.videoTokens}（≈${perMinute}/分钟），${full.latencyMs}ms，finish=${full.finish}`
        : `失败 HTTP ${full.http}：${full.error?.status} ${full.error?.message?.slice(0, 200)}`,
    latencyMs: full.latencyMs,
    detail: { url: YOUTUBE_TARGET.url, ...full, perMinute, answer: full.text.slice(0, 1500) },
  })

  // 2. 成本杠杆：裁剪片段
  const clip = await geminiAsk(
    {
      fileData: { fileUri: YOUTUBE_TARGET.url },
      videoMetadata: { startOffset: '0s', endOffset: '60s' },
    },
    '一句话说这一分钟里画面上有什么。',
    800,
  )
  checks.push({
    name: 'gemini/youtube-clip',
    verdict: clip.http === 200 && clip.videoTokens ? 'PASS' : 'WARN',
    finding:
      clip.http === 200
        ? `videoMetadata.startOffset/endOffset 生效：1 分钟片段仅 ${clip.videoTokens} token（全片的 ${full.videoTokens ? Math.round((clip.videoTokens / full.videoTokens) * 100) : '?'}%）`
        : `裁剪不生效 HTTP ${clip.http}：${clip.error?.message?.slice(0, 200)}`,
    latencyMs: clip.latencyMs,
    detail: clip,
  })

  // 3. 成本杠杆：降帧
  const lowFps = await geminiAsk(
    { fileData: { fileUri: YOUTUBE_TARGET.url }, videoMetadata: { fps: 0.2 } },
    '一句话说这个视频在讲什么。',
    800,
  )
  checks.push({
    name: 'gemini/youtube-fps',
    verdict: lowFps.http === 200 && lowFps.videoTokens ? 'PASS' : 'WARN',
    finding:
      lowFps.http === 200
        ? `videoMetadata.fps 生效：fps=0.2 全片 ${lowFps.videoTokens} token（全片的 ${full.videoTokens ? Math.round((lowFps.videoTokens / full.videoTokens) * 100) : '?'}%）`
        : `降帧不生效 HTTP ${lowFps.http}：${lowFps.error?.message?.slice(0, 200)}`,
    latencyMs: lowFps.latencyMs,
    detail: lowFps,
  })

  // 4. 失败语义 —— 实现层要把它翻成「视频不可访问」，不是「你的 key 没权限」
  const bad = await geminiAsk(
    { fileData: { fileUri: 'https://www.youtube.com/watch?v=zzzzzzzzzzz' } },
    '这是什么？',
    200,
  )
  checks.push({
    name: 'gemini/youtube-unavailable',
    verdict: bad.http !== 200 ? 'PASS' : 'WARN',
    finding: `不可访问的视频回 HTTP ${bad.http} ${bad.error?.status ?? ''} —— ⚠ 不是 404，实现层别把它翻译成「API key 无权限」`,
    detail: { http: bad.http, error: bad.error },
  })

  return checks
}

// ─── P6 · DashScope 视频输入 ────────────────────────────────────

async function probeDashScope() {
  // DashScope 在本仓是 BYO-only（src/lib/platform-keys.ts 无此 case），
  // 所以认一个探针专用环境变量，不假装 app 有平台 key。
  const apiKey = process.env.DASHSCOPE_API_KEY?.trim()
  if (!apiKey) {
    return [
      {
        name: 'dashscope/video-input',
        verdict: 'SKIP',
        finding:
          '缺 DASHSCOPE_API_KEY —— DashScope 在本仓是 BYO-only，平台层没这把 key。要测就往 .env.local 加一把一次性限额测试 key。',
      },
    ]
  }

  const response = await raw(
    'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen3-vl-plus',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'video_url',
                video_url: {
                  url: 'https://cloud.video.taobao.com/play/u/null/p/1/e/6/t/1/281195341326.mp4',
                },
              },
              { type: 'text', text: '这个视频里发生了什么？只描述看到的画面。' },
            ],
          },
        ],
        max_tokens: 400,
      }),
      timeoutMs: 300_000,
      maxBody: 60_000,
    },
  )
  const json = parseJson(response.body)
  const text = json?.choices?.[0]?.message?.content ?? ''
  return [
    {
      name: 'dashscope/video-input',
      verdict: response.ok && text.length > 40 ? 'PASS' : 'FAIL',
      finding: response.ok
        ? `qwen3-vl-plus 收视频 URL 成功，回了 ${text.length} 字；usage=${JSON.stringify(json?.usage)}`
        : `失败 HTTP ${response.status}：${json?.error?.message ?? response.body.slice(0, 400)}`,
      latencyMs: response.latencyMs,
      detail: { usage: json?.usage, answer: text.slice(0, 800), error: json?.error },
    },
  ]
}

// ─── P7 · Serper ────────────────────────────────────────────────

async function probeSerper() {
  const apiKey = process.env.SERPER_API_KEY?.trim()
  if (!apiKey) {
    return [{ name: 'serper/search', verdict: 'SKIP', finding: '缺 SERPER_API_KEY' }]
  }
  const checks = []
  for (const variant of [
    { label: 'plain', payload: { q: '鸣潮 长离 角色 立绘', num: 5 } },
    // §3.4「新鲜度」要的时间过滤：Serper 走 Google 的 tbs 参数。
    { label: 'past-week', payload: { q: 'AI 图像模型 发布', num: 5, tbs: 'qdr:w' } },
    // 萌百自己的 search 被封，站内检索只能靠外部搜索兜 —— 这条是它的可行性判据。
    { label: 'site-moegirl', payload: { q: 'site:zh.moegirl.org.cn 长离 鸣潮', num: 5 } },
  ]) {
    const response = await raw('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(variant.payload),
    })
    const json = parseJson(response.body)
    const organic = json?.organic ?? []
    const dated = organic.filter((o) => o.date).length
    checks.push({
      name: `serper/${variant.label}`,
      verdict: response.ok && organic.length > 0 ? 'PASS' : 'FAIL',
      finding: response.ok
        ? `${organic.length} 条结果，带日期 ${dated} 条${variant.label === 'past-week' ? '（tbs=qdr:w 时间过滤生效判据）' : ''}${variant.label === 'site-moegirl' ? '（萌百站内检索的替代路）' : ''}`
        : `失败 HTTP ${response.status}：${response.body.slice(0, 200)}`,
      latencyMs: response.latencyMs,
      detail: {
        credits: json?.credits,
        top: organic.slice(0, 5).map((o) => ({ title: o.title, date: o.date, link: o.link })),
      },
    })
  }
  return checks
}

// ─── P8 · B站（元数据 only，边界 16）────────────────────────────

async function probeBilibili() {
  const checks = []
  const headers = { 'User-Agent': BROWSER_UA, Referer: 'https://www.bilibili.com/' }

  // 搜索裸调会间歇 412 风控 —— 打 6 次量化成功率，别拿单次结果下结论。
  const attempts = []
  for (let i = 0; i < 6; i++) {
    const response = await raw(
      `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent('鸣潮 长离')}`,
      { headers },
    )
    const json = parseJson(response.body)
    attempts.push({ http: response.status, code: json?.code ?? null, hits: json?.data?.result?.length ?? 0 })
    await new Promise((r) => setTimeout(r, 700))
  }
  const okCount = attempts.filter((a) => a.code === 0).length
  checks.push({
    name: 'bilibili/search',
    verdict: okCount === attempts.length ? 'PASS' : okCount > 0 ? 'WARN' : 'FAIL',
    finding: `裸调 6 次成功 ${okCount} 次${okCount < attempts.length ? `（其余 HTTP 412 风控页）—— 元数据卡必须带重试，或退到 Serper site:bilibili.com` : ''}`,
    detail: { attempts },
  })

  // 单稿件元数据（元数据卡真正需要的四要素）。BV 号取自 Fandom 对该角色的引用。
  const view = await raw('https://api.bilibili.com/x/web-interface/view?bvid=BV1ji421e7nM', {
    headers,
  })
  const viewJson = parseJson(view.body)
  checks.push({
    name: 'bilibili/view',
    verdict: viewJson?.code === 0 ? 'PASS' : 'WARN',
    finding:
      viewJson?.code === 0
        ? `单稿件元数据可取：「${viewJson.data?.title}」/ UP ${viewJson.data?.owner?.name} / ${viewJson.data?.duration}s / 有封面 —— 元数据卡四要素齐`
        : `view 被拦：code=${viewJson?.code} message=${viewJson?.message ?? view.status}`,
    latencyMs: view.latencyMs,
    detail: {
      code: viewJson?.code,
      title: viewJson?.data?.title,
      owner: viewJson?.data?.owner?.name,
      duration: viewJson?.data?.duration,
      hasCover: Boolean(viewJson?.data?.pic),
    },
  })

  return checks
}

// ─── runner ─────────────────────────────────────────────────────

const PROBES = {
  moegirl: probeMoegirl,
  mediawiki: probeMediaWikiFamily,
  jina: probeJina,
  danbooru: probeDanbooru,
  gemini: probeGeminiYouTube,
  dashscope: probeDashScope,
  serper: probeSerper,
  bilibili: probeBilibili,
}

function parseArgs() {
  const argv = process.argv.slice(2)
  const get = (flag) => {
    const index = argv.indexOf(flag)
    return index >= 0 ? argv[index + 1] : undefined
  }
  return {
    only: get('--only')?.split(',').map((s) => s.trim()).filter(Boolean),
    skip: get('--skip')?.split(',').map((s) => s.trim()).filter(Boolean) ?? [],
    json: get('--json'),
  }
}

const VERDICT_MARK = { PASS: '[PASS]', WARN: '[WARN]', FAIL: '[FAIL]', SKIP: '[SKIP]' }

async function main() {
  const { only, skip, json } = parseArgs()
  const selected = Object.keys(PROBES).filter(
    (name) => (!only || only.includes(name)) && !skip.includes(name),
  )

  console.log('检索管线连通性实测 —— AI 导演内核切片 0')
  console.log(`时间：${new Date().toISOString()}`)
  console.log('出口：本机（win32）—— 注意：不等于 Vercel 出口')
  console.log(`探针：${selected.join(', ')}\n`)

  const results = []
  for (const name of selected) {
    console.log(`── ${name} ──`)
    const checks = await guard(name, PROBES[name])
    for (const check of checks) {
      console.log(
        `${VERDICT_MARK[check.verdict]} ${check.name}${check.latencyMs != null ? ` (${check.latencyMs}ms)` : ''}`,
      )
      console.log(`   ${check.finding}`)
    }
    console.log('')
    results.push({ probe: name, checks })
  }

  const all = results.flatMap((r) => r.checks)
  const tally = {}
  for (const c of all) tally[c.verdict] = (tally[c.verdict] ?? 0) + 1
  console.log('─'.repeat(60))
  console.log(
    `合计 ${all.length} 项：PASS ${tally.PASS ?? 0} · WARN ${tally.WARN ?? 0} · FAIL ${tally.FAIL ?? 0} · SKIP ${tally.SKIP ?? 0}`,
  )

  const outPath = json ?? resolve(import.meta.dirname, 'probe-latest.json')
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(
    outPath,
    JSON.stringify({ ranAt: new Date().toISOString(), egress: 'local/win32', tally, results }, null, 2),
    'utf8',
  )
  console.log(`原始响应已写入 ${outPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
